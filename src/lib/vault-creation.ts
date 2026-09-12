/**
 * vault-creation.ts — NATIVE DOCUMENT CREATION (Phase 1.5c): render a tenant
 * template into a real PDF and file it into the tenant's own vault — the
 * owner's "file scanning AND creation" directive. The created document flows
 * through the SAME intake that uploads use (magic-byte sniffing, 25 MiB cap,
 * content-hash dedupe), so file / move / archive / destroy / search /
 * download all apply to it unchanged.
 *
 * CONTROL FLOOR — identical to every vault write (vault-filing.ts):
 *   - `createVaultDocument` passes through the platform Approval Queue
 *     (#164) by default: it returns {pending:true, actionId} and lands in the
 *     portal approvals queue. Only an approve (or an autonomy allow-list
 *     entry with a KNOWN template id + explicit non-glob allow-list) executes
 *     it — the executor in src/integrations/providers/vault/actions.ts is the
 *     ONLY caller allowed to pass bypassApproval, exactly like the other
 *     native vault executors.
 *   - execution is IDEMPOTENT: the intake layer dedupes by content hash, so
 *     re-executing the same approved creation returns the SAME documentId
 *     (duplicate/unchanged) and re-attaching the route is a no-op. Replays
 *     are audited with an "idempotent replay" detail — provable from the
 *     immutable vault audit.
 *   - zero cross-tenant paths: template resolution is tenant-scoped
 *     (unknown id → fail-closed "Template not found"), and the bytes land in
 *     the tenant's own hashed bucket.
 *   - input is validated aggressively (field keys strict slug; values are
 *     strings ≤ 2,000 chars; unknown/undeclared fields rejected; leftover
 *     {{ placeholders rejected — never guessed). The rendered PDF is escaped
 *     (no HTML, no control chars, ASCII-safe) — the vault stores binary PDFs,
 *     there is no markup/script surface.
 */
import { approvalGate } from "./approval-queue";
import { recordAutonomyOutcome } from "./autonomy";
import { appendVaultAudit } from "./vault-audit";
import { VAULT_MAX_UPLOAD_BYTES } from "./vault-types";
import { intakeDocument } from "./vault-intake";
import { getVaultTemplate, type VaultTemplate } from "./vault-template";
import { canonicalizeRoute, ensureRouteFolders } from "./vault-folder";
import { attachRouteToDocument, sha256Of } from "./vault-store";
import { VAULT_PROVIDER_ID, VAULT_ACTIONS } from "./vault-filing";
import type { FilingOutcome, VaultGateDecision } from "./vault-types";

export const CREATION_VALUE_MAX = 2000;
export const CREATION_NAME_MAX = 120;

export interface RenderedDocument {
  pdf: Uint8Array;
  text: string; // plain-text projection (searchable in the vault)
  checksum: string;
  blocks: RenderBlock[];
}

export interface RenderBlock {
  kind: "h1" | "h2" | "p" | "li";
  text: string;
}

/* ── field / value validation (fail-closed) ────────────────────────────── */

export function validateFieldValues(
  template: VaultTemplate,
  values: Record<string, unknown>,
): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return { ok: false, error: "fields must be an object" };
  }
  const declared = new Set(template.fields.map((f) => f.key));
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (!declared.has(key)) return { ok: false, error: `Unknown field "${key}" — not declared by template` };
    if (typeof raw !== "string") return { ok: false, error: `Field "${key}" must be a string` };
    const v = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, CREATION_VALUE_MAX);
    out[key] = v;
  }
  for (const f of template.fields) {
    if (f.required && (!out[f.key] || !out[f.key].trim())) {
      return { ok: false, error: `Required field "${f.key}" is missing` };
    }
  }
  return { ok: true, values: out };
}

/**
 * Interpolate {{fieldKey}} placeholders using ONLY keys declared by the
 * template. Any leftover "{{" after substitution = unresolved/undeclared
 * token → reject (never guess). Values are inserted as plain text (no HTML,
 * no markup interpretation).
 */
export function renderTemplateBody(template: VaultTemplate, values: Record<string, string>): string {
  let body = template.body;
  for (const f of template.fields) {
    const val = values[f.key] ?? "";
    body = body.split(`{{${f.key}}}`).join(val);
  }
  if (body.includes("{{")) {
    throw new Error("Template body contains an unresolved placeholder — fields were not all provided (fail-closed)");
  }
  return body;
}

/* ── minimal markdown-ish block parser (NO HTML — no script surface) ───── */

export function bodyToBlocks(body: string): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/\r/g, "").trimEnd();
    if (!line.trim()) continue;
    const t = line.trim();
    if (t.startsWith("## ")) blocks.push({ kind: "h2", text: t.slice(3).trim() });
    else if (t.startsWith("# ")) blocks.push({ kind: "h1", text: t.slice(2).trim() });
    else if (t.startsWith("- ") || t.startsWith("* ")) blocks.push({ kind: "li", text: t.slice(2).trim() });
    else blocks.push({ kind: "p", text: t });
  }
  return blocks;
}

/* ── minimal dependency-free PDF writer ────────────────────────────────── */

function pdfSanitize(text: string): string {
  // ASCII-safe: Helvetica standard encoding covers WinAnsi, but we only emit
  // printable ASCII — everything else is replaced (no encoding surprises).
  let out = "";
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c === 40 || c === 41 || c === 92) out += "\\" + ch; // ( ) \ escaped
    else if (c >= 32 && c <= 126) out += ch;
    else out += "?";
  }
  return out;
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 56;
const MARGIN_BOTTOM = 56;
const TOP = PAGE_H - 72;

function wrapLine(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    if ((cur + " " + word).trim().length > max) {
      if (cur) lines.push(cur.trim());
      cur = word;
    } else {
      cur = (cur + " " + word).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

interface PdfLine {
  text: string;
  size: number;
  font: "F1" | "F2";
  dy: number;
}

function layoutBlocks(title: string, blocks: RenderBlock[]): PdfLine[][] {
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let y = TOP;
  const push = (line: PdfLine): boolean => {
    if (y - line.dy < MARGIN_BOTTOM) return false;
    page.push(line);
    y -= line.dy;
    return true;
  };
  // Title header (first block, h1).
  for (const t of wrapLine(title, 56)) {
    if (!push({ text: t, size: 18, font: "F2", dy: 22 })) {
      pages.push(page); page = []; y = TOP;
      push({ text: t, size: 18, font: "F2", dy: 22 });
    }
  }
  page.push({ text: "", size: 6, font: "F1", dy: 10 }); // spacer
  y -= 10;
  for (const b of blocks) {
    const size = b.kind === "h1" ? 16 : b.kind === "h2" ? 13 : 11;
    const max = b.kind === "p" ? 88 : 60;
    const dy = b.kind === "h1" ? 20 : b.kind === "h2" ? 17 : 14;
    const font = b.kind === "h1" || b.kind === "h2" ? "F2" : "F1";
    const prefix = b.kind === "li" ? "• " : "";
    for (const t of wrapLine(b.text, max)) {
      if (!push({ text: prefix + t, size, font, dy })) {
        pages.push(page); page = []; y = TOP;
        push({ text: prefix + t, size, font, dy });
      }
    }
    // paragraph gap
    if (b.kind === "p" || b.kind === "li") {
      if (y - 4 < MARGIN_BOTTOM) {
        pages.push(page); page = []; y = TOP;
      } else {
        page.push({ text: "", size: 6, font: "F1", dy: 4 });
        y -= 4;
      }
    }
  }
  pages.push(page);
  return pages;
}

function contentStream(lines: PdfLine[]): string {
  // PDF Td is RELATIVE to the current text position — the first line is an
  // absolute position, every following line is a relative delta.
  const parts: string[] = ["BT"];
  let first = true;
  for (const ln of lines) {
    if (first) {
      parts.push(`${MARGIN_X} ${TOP} Td`);
      first = false;
    } else {
      parts.push(`0 -${ln.dy} Td`);
    }
    if (ln.text) {
      parts.push(`/${ln.font} ${ln.size} Tf`);
      parts.push(`(${pdfSanitize(ln.text)}) Tj`);
    }
  }
  parts.push("ET");
  return parts.join("\n");
}

/** Build a valid minimal PDF (magic %PDF- + correct xref). */
export function renderVaultPdf(title: string, blocks: RenderBlock[]): Uint8Array {
  const pages = layoutBlocks(title || "Document", blocks);
  const contentObjs: string[] = [];
  for (const lines of pages) {
    contentObjs.push(contentStream(lines));
  }

  const objs: string[] = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = contentObjs.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${contentObjs.length} >>`);
  contentObjs.forEach((stream, i) => {
    // Object numbers: catalog=1, pages=2, then per page: page=3+2i, contents=4+2i;
    // after N pages, fonts are objects 2N+3 (Helvetica) and 2N+4 (Helvetica-Bold).
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${3 + contentObjs.length * 2} 0 R /F2 ${3 + contentObjs.length * 2 + 1} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`);
    const len = stream.length;
    objs.push(`<< /Length ${len} >>\nstream\n${stream}\nendstream`);
  });
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  // Build the file with real byte offsets.
  const chunks: string[] = [];
  let offset = 0;
  const xref: number[] = [0];
  const header = "%PDF-1.4\n";
  offset += header.length;
  chunks.push(header);
  objs.forEach((obj, i) => {
    const o = `${i + 1} 0 obj\n${obj}\nendobj\n`;
    xref.push(offset);
    offset += o.length;
    chunks.push(o);
  });
  const xrefStart = offset;
  const xrefTable = `xref\n0 ${xref.length}\n0000000000 65535 f \n` +
    xref.slice(1).map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("");
  const trailer = `trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const out = chunks.join("") + xrefTable + trailer;
  // Guard: the result must LOOK like a PDF (magic bytes) or the vault intake
  // will reject it — this is a hard invariant, not a suggestion.
  if (!out.startsWith("%PDF-")) throw new Error("PDF renderer produced invalid output (fail-closed)");
  return new TextEncoder().encode(out);
}

/** Render a template + values into a vaultable PDF (pure; throws fail-closed). */
export function renderTemplateDocument(template: VaultTemplate, name: string, values: Record<string, string>): RenderedDocument {
  const validated = validateFieldValues(template, values);
  if (!validated.ok) throw new Error(validated.error);
  const body = renderTemplateBody(template, validated.values);
  const blocks = bodyToBlocks(body);
  const pdf = renderVaultPdf(name, blocks);
  if (pdf.byteLength > VAULT_MAX_UPLOAD_BYTES) {
    throw new Error(`Rendered document exceeds the ${Math.round(VAULT_MAX_UPLOAD_BYTES / 1024 / 1024)} MiB vault cap (fail-closed)`);
  }
  const text = [name, ...blocks.map((b) => (b.kind === "li" ? `• ${b.text}` : b.text))].join("\n");
  return { pdf, text, checksum: sha256Of(pdf), blocks };
}

/* ── approval-gated creation (same floor as every vault write) ─────────── */

export interface CreateVaultDocumentInput {
  tenantEmail: string;
  /** KNOWN template id — resolved tenant-scoped; unknown → fail-closed. */
  templateId: string;
  /** File name for the created document (not the template name). */
  name: string;
  /** Values for the template's declared fields (unknown keys rejected). */
  fields: Record<string, unknown>;
  /** Optional canonical route; when provided the doc is filed on creation. */
  route?: string;
  actor: string;
  dataDir: string;
  /** EXECUTOR-ONLY — see VaultWriteOpts.bypassApproval (vault-filing.ts). */
  bypassApproval?: boolean;
  agentId?: string;
  workflowId?: string;
}

export interface CreationOutcome extends FilingOutcome {
  templateId?: string;
  checksum?: string;
  error?: string;
}

function recordAutonomyOutcomeSafe(
  tenantId: string,
  workflowId: string,
  action: string,
  ok: boolean,
  opts: { dataDir?: string; allowListId?: string; error?: string; target?: string },
): void {
  if (!workflowId) return;
  try {
    recordAutonomyOutcome(tenantId, workflowId, action, VAULT_PROVIDER_ID, ok, opts);
  } catch {
    // secondary (durable) log; the vault audit is authoritative
  }
}

function sanitizeCreatedName(raw: string): string {
  let name = (raw || "document").replace(/[\\/]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, CREATION_NAME_MAX);
  name = name.split(" ").map((seg) => seg.replace(/^\.+/, "")).filter((seg) => seg !== "").join(" ");
  return name || "document";
}

/**
 * Create a vault document from a tenant template. Approval queue by default;
 * autonomy only when the action is explicitly allow-listed AND the payload
 * carries a known templateId. Never routes on guessed paths, never writes
 * cross-tenant, never overwrites (intake dedupes by content hash).
 */
export function createVaultDocument(input: CreateVaultDocumentInput): CreationOutcome {
  const { tenantEmail, templateId, dataDir } = input;
  if (!tenantEmail || !templateId) return { ok: false, error: "tenantEmail and templateId are required" };

  const template = getVaultTemplate(tenantEmail, templateId, dataDir);
  if (!template) return { ok: false, error: "Template not found" }; // fail-closed (unknown/other-tenant)

  const name = sanitizeCreatedName(input.name);
  if (!name) return { ok: false, error: "name is required" };
  const values = validateFieldValues(template, input.fields || {});
  if (!values.ok) return { ok: false, error: values.error };

  const route = input.route !== undefined && input.route !== null && String(input.route).trim() !== ""
    ? canonicalizeRoute(String(input.route))
    : "";
  if (input.route !== undefined && String(input.route).trim() !== "" && !route) {
    return { ok: false, error: "Invalid route — never a guessed path" };
  }

  const params: Record<string, any> = { templateId, name, fields: input.fields || {}, route: route || undefined };

  // ── GATE (identical to vault-filing.gateVaultWrite) ──
  let gate: VaultGateDecision = { allowed: true };
  if (!input.bypassApproval) {
    try {
      const g = approvalGate(tenantEmail, VAULT_ACTIONS.create, VAULT_PROVIDER_ID, params, {
        agentId: input.agentId,
        workflowId: input.workflowId,
        dataDir,
      });
      if (g.allowed && g.autonomy && g.allowListId && g.workflowId) {
        gate = { allowed: true, autonomy: true, allowListId: g.allowListId, workflowId: g.workflowId };
      } else if (g.allowed) {
        gate = { allowed: true };
      } else {
        gate = { allowed: false, pending: true, actionId: g.actionId, error: g.error };
      }
    } catch (e: any) {
      return { ok: false, error: `Vault approval store unavailable — creation blocked: ${e?.message || String(e)}` };
    }
  }

  if (!gate.allowed) {
    appendVaultAudit(dataDir, tenantEmail, {
      actor: input.agentId ? `agent:${input.agentId}` : input.actor,
      action: "createVaultDocument",
      documentId: templateId,
      route: route || "",
      sha256: "",
      version: 0,
      outcome: gate.error ? "denied" : "pending",
      detail: gate.error ? gate.error : `Pending approval (${gate.actionId || "?"})`,
    });
    return { ok: false, pending: true, actionId: gate.actionId, templateId, error: gate.error };
  }

  // ── EXECUTE: render → intake (dedupe by content hash) → optional file ──
  let rendered: RenderedDocument;
  try {
    rendered = renderTemplateDocument(template, name, values.values);
  } catch (e: any) {
    recordAutonomyOutcomeSafe(tenantEmail, gate.workflowId || "", VAULT_ACTIONS.create, false, {
      dataDir, allowListId: gate.allowListId, error: `Render failed: ${e?.message || String(e)}`, target: templateId,
    });
    return { ok: false, error: `Template render failed: ${e?.message || String(e)}` };
  }

  const fileName = /\.pdf$/i.test(name) ? name : `${name}.pdf`;
  const intake = intakeDocument({
    tenantEmail, fileName, bytes: rendered.pdf, actor: gate.autonomy ? "system/autonomy" : input.actor,
    text: rendered.text, dataDir,
  });
  if (!intake.ok || !intake.documentId) {
    recordAutonomyOutcomeSafe(tenantEmail, gate.workflowId || "", VAULT_ACTIONS.create, false, {
      dataDir, allowListId: gate.allowListId, error: intake.error || "Intake rejected", target: templateId,
    });
    return { ok: false, error: intake.error || "Intake rejected" };
  }
  const documentId = intake.documentId;
  const replay = intake.duplicate || intake.unchanged ? true : false;

  // Creation audit entry (creation IS the write; intake already audited).
  appendVaultAudit(dataDir, tenantEmail, {
    actor: gate.autonomy ? "system/autonomy" : input.actor,
    action: "vault.document.create",
    documentId,
    route: route || "",
    sha256: rendered.checksum,
    version: 1,
    outcome: "ok",
    detail: replay
      ? `Idempotent replay — document from template ${template.id} already vaulted (intake dedupe)`
      : `Created "${fileName}" from template "${template.name}" (v${template.version})`,
  });
  if (gate.autonomy) {
    recordAutonomyOutcomeSafe(tenantEmail, gate.workflowId || "", VAULT_ACTIONS.create, true, {
      dataDir, allowListId: gate.allowListId, target: documentId,
    });
  }

  // Optional immediate filing (route already canonicalized + approved).
  let filed = "";
  let unchanged = replay;
  if (route) {
    const doc = attachRouteToDocument(dataDir, tenantEmail, documentId, route);
    if (!doc) {
      return { ok: true, documentId, templateId, checksum: rendered.checksum, route: "", error: "Created but filing failed — document already vaulted without route" };
    }
    filed = route;
    unchanged = unchanged || (doc.route === route && doc.status === "active");
    if (!(replay && doc.route === route && doc.status === "active")) {
      ensureRouteFolders(dataDir, tenantEmail, route, input.actor);
    }
    appendVaultAudit(dataDir, tenantEmail, {
      actor: gate.autonomy ? "system/autonomy" : input.actor,
      action: "writeVaultDocument",
      documentId,
      route,
      sha256: rendered.checksum,
      version: doc.version,
      outcome: "ok",
      detail: replay ? "Idempotent replay — document already filed to route on creation" : "Filed on creation",
    });
  }

  return {
    ok: true,
    documentId,
    route: filed || undefined,
    unchanged,
    autonomy: gate.autonomy,
    templateId,
    checksum: rendered.checksum,
  };
}