/**
 * vault-template.ts — per-tenant TEMPLATE CATALOG for native document
 * creation (Phase 1.5c, owner directive 09-10: "all file scanning and
 * creation so we can organize and file anything for the customer").
 *
 * The catalog stores structured templates (name, description, fields, body)
 * keyed by tenant EMAIL — the same per-tenant identity the vault uses for its
 * hashed blob buckets. Zero cross-tenant paths: every read/write resolves the
 * EXACT tenant map first; another tenant's template id resolves to null
 * (fail-closed 404 upstream) and can never be listed, updated, imported
 * into, or deleted from this tenant.
 *
 * CONTROL FLOOR (this module is CATALOG METADATA — the parallel is the
 * folder-rule store, not the vault write floor):
 *   - every mutating op appends an IMMUTABLE vault audit entry
 *     (template create / update / delete / import, actor + id + version),
 *   - versioning is ADD-ONLY: an update pushes the current body/fields onto
 *     `history` before mutating; prior versions are never overwritten
 *     (history is capped at TEMPLATE_MAX_HISTORY, oldest pruned + audited —
 *     the bound keeps the tenant file small while preserving the add-only
 *     rule that no *in-place* overwrite ever happens),
 *   - DELETE accepts exactly ONE known template id (never a glob/wildcard);
 *     re-deleting an already-deleted exact id is an audited success no-op
 *     (idempotent-by-audit); an unknown id fails closed,
 *   - input is validated aggressively (name/label/field-key/body caps, no
 *     control chars, field keys are a strict [A-Za-z0-9_-] slug),
 *   - import/upload rides the same caps + fail-closed sniffing philosophy as
 *     vault-intake (extension + content checks, 1 MiB file cap, 64 KiB body).
 *
 * DOCUMENT CREATION (rendering a template → a vaulted PDF) lives in
 * vault-creation.ts and IS approval-gated like every vault write. This module
 * never touches tenant vault documents.
 */
import { join } from "path";
import { readJSON, writeJSON } from "./data-store";
import { appendVaultAudit } from "./vault-audit";
import type { VaultAuditEntry } from "./vault-types";

export const TEMPLATE_FILE = "tenant_vault_templates.json";
export const TEMPLATE_MAX_NAME = 120;
export const TEMPLATE_MAX_DESCRIPTION = 500;
export const TEMPLATE_MAX_BODY_BYTES = 64 * 1024; // 64 KiB — bounds the produced PDF
export const TEMPLATE_MAX_FIELDS = 50;
export const TEMPLATE_MAX_LABEL = 80;
export const TEMPLATE_MAX_HISTORY = 24;
export const TEMPLATE_MAX_IMPORT_BYTES = 1024 * 1024; // 1 MiB import cap

export type TemplateFieldType = "text" | "textarea" | "date";

export interface VaultTemplateField {
  key: string; // strict slug [A-Za-z0-9_-]{1,40}
  label: string; // display label (≤ TEMPLATE_MAX_LABEL)
  type: TemplateFieldType;
  required?: boolean;
}

export interface VaultTemplateVersion {
  version: number;
  body: string;
  fields: VaultTemplateField[];
  updatedAt: string;
  updatedBy: string;
}

export interface VaultTemplate {
  id: string; // tpl_<random> — never user-supplied
  name: string;
  description: string;
  body: string; // current body with {{fieldKey}} placeholders
  fields: VaultTemplateField[];
  version: number;
  source: "scratch" | "upload";
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  history: VaultTemplateVersion[]; // add-only (capped), prior versions
}

export interface VaultTemplateSummary {
  id: string;
  name: string;
  description: string;
  version: number;
  updatedAt: string;
  fieldCount: number;
  source: VaultTemplate["source"];
}

export type TemplateOutcome =
  | { ok: true; template?: VaultTemplate; summary?: VaultTemplateSummary; unchanged?: boolean }
  | { ok: false; error: string };

export type TemplateListOutcome = { ok: true; templates: VaultTemplateSummary[] };

/* ── id / input validation ─────────────────────────────────────────────── */

function newTemplateId(): string {
  return "tpl_" + Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 4);
}

const FIELD_KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;

function sanitizeText(raw: string, max: number): string {
  // Strip control chars (incl. NUL / newlines are allowed in body only via
  // explicit newline handling — here we normalize all control chars away).
  return (raw || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

/** Validate + normalize a fields array (fail-closed on any violation). */
function normalizeFields(rawFields: unknown): { ok: true; fields: VaultTemplateField[] } | { ok: false; error: string } {
  if (!Array.isArray(rawFields) || rawFields.length > TEMPLATE_MAX_FIELDS) {
    return { ok: false, error: `fields must be an array of at most ${TEMPLATE_MAX_FIELDS} entries` };
  }
  const fields: VaultTemplateField[] = [];
  const seen = new Set<string>();
  for (const f of rawFields) {
    if (!f || typeof f !== "object") return { ok: false, error: "each field must be an object" };
    const rec = f as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key.trim() : "";
    if (!FIELD_KEY_RE.test(key)) {
      return { ok: false, error: `invalid field key "${key}" — expected [A-Za-z0-9_-] up to 40 chars` };
    }
    if (seen.has(key)) return { ok: false, error: `duplicate field key "${key}"` };
    seen.add(key);
    const type = rec.type === "date" ? "date" : rec.type === "textarea" ? "textarea" : "text";
    const label = sanitizeText(typeof rec.label === "string" ? rec.label : key, TEMPLATE_MAX_LABEL) || key;
    fields.push({ key, label, type, required: rec.required === true });
  }
  return { ok: true, fields };
}

/** Validate a template body: cap + control chars (newlines allowed). */
function normalizeBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "body must be a string" };
  const body = (raw || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!body) return { ok: false, error: "body is required" };
  if (Buffer.byteLength(body, "utf8") > TEMPLATE_MAX_BODY_BYTES) {
    return { ok: false, error: `body exceeds the ${TEMPLATE_MAX_BODY_BYTES / 1024} KiB limit` };
  }
  return { ok: true, body };
}

export interface TemplateInput {
  name: string;
  description?: string;
  body: string;
  fields?: VaultTemplateField[];
}

/** Shared strict validation for create / update / import. */
export function validateTemplateInput(input: TemplateInput): { ok: true; name: string; description: string; body: string; fields: VaultTemplateField[] } | { ok: false; error: string } {
  const name = sanitizeText(input.name, TEMPLATE_MAX_NAME);
  if (!name) return { ok: false, error: "name is required" };
  const description = sanitizeText(input.description || "", TEMPLATE_MAX_DESCRIPTION);
  const bodyNorm = normalizeBody(input.body);
  if (!bodyNorm.ok) return bodyNorm;
  const fieldsNorm = normalizeFields(input.fields || []);
  if (!fieldsNorm.ok) return fieldsNorm;
  return { ok: true, name, description, body: bodyNorm.body, fields: fieldsNorm.fields };
}

/* ── storage helpers (tenant-scoped) ───────────────────────────────────── */

type TemplateCatalog = Record<string, Record<string, VaultTemplate>>;

function loadCatalog(dataDir: string): TemplateCatalog {
  const raw = readJSON(join(dataDir, TEMPLATE_FILE));
  return raw && typeof raw === "object" ? (raw as TemplateCatalog) : {};
}

function saveCatalog(dataDir: string, catalog: TemplateCatalog): void {
  writeJSON(join(dataDir, TEMPLATE_FILE), catalog);
}

function tenantMap(catalog: TemplateCatalog, tenantEmail: string): Record<string, VaultTemplate> {
  return catalog[tenantEmail] || {};
}

export interface TemplateWriteOpts {
  tenantEmail: string;
  actor: string;
  dataDir: string;
}

function audit(t: TemplateWriteOpts, action: VaultAuditEntry["action"], templateId: string, detail: string): void {
  try {
    appendVaultAudit(t.dataDir, t.tenantEmail, {
      actor: t.actor,
      action,
      documentId: templateId,
      route: "",
      sha256: "",
      version: 0,
      outcome: "ok",
      detail,
    });
  } catch {
    // Template catalog write itself is durable; the audit is authoritative —
    // a template mutation MUST still be recorded, so a failure here must not
    // be silently swallowed for destructive/update ops. Callers treat audit
    // failure of mutations as fail-closed by throwing (see below).
    throw new Error(`Vault audit unavailable — ${action} blocked (fail-closed)`);
  }
}

/* ── catalog operations (all tenant-scoped, all fail-closed) ──────────── */

export function listVaultTemplates(tenantEmail: string, dataDir: string): TemplateListOutcome {
  const catalog = loadCatalog(dataDir);
  const map = tenantMap(catalog, tenantEmail);
  const templates = Object.values(map)
    .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      version: t.version,
      updatedAt: t.updatedAt,
      fieldCount: t.fields.length,
      source: t.source,
    }));
  return { ok: true, templates };
}

/** Exact id within the caller's tenant map ONLY — other tenants fail null. */
export function getVaultTemplate(tenantEmail: string, templateId: string, dataDir: string): VaultTemplate | null {
  if (!templateId) return null;
  const catalog = loadCatalog(dataDir);
  return tenantMap(catalog, tenantEmail)[templateId] || null;
}

export function createVaultTemplate(input: TemplateInput & TemplateWriteOpts & { source?: VaultTemplate["source"] }): TemplateOutcome {
  const norm = validateTemplateInput(input);
  if (!norm.ok) return { ok: false, error: norm.error };
  const now = new Date().toISOString();
  const template: VaultTemplate = {
    id: newTemplateId(),
    name: norm.name,
    description: norm.description,
    body: norm.body,
    fields: norm.fields,
    version: 1,
    source: input.source || "scratch",
    createdAt: now,
    createdBy: input.actor,
    updatedAt: now,
    updatedBy: input.actor,
    history: [],
  };
  const catalog = loadCatalog(input.dataDir);
  const map = tenantMap(catalog, input.tenantEmail);
  map[template.id] = template;
  catalog[input.tenantEmail] = map;
  saveCatalog(input.dataDir, catalog);
  audit(input, "vaultTemplate.create", template.id, `Created template "${template.name}" v${template.version} (${template.fields.length} fields)`);
  return { ok: true, template };
}

/**
 * Update → NEW VERSION. Add-only: the current body/fields are pushed onto
 * `history` BEFORE the mutation, so no prior version is ever overwritten.
 * The history array is capped at TEMPLATE_MAX_HISTORY (oldest pruned, audited).
 */
export function updateVaultTemplate(
  input: TemplateWriteOpts & { templateId: string; name?: string; description?: string; body?: string; fields?: VaultTemplateField[] },
): TemplateOutcome {
  const catalog = loadCatalog(input.dataDir);
  const map = tenantMap(catalog, input.tenantEmail);
  const current = map[input.templateId];
  if (!current) return { ok: false, error: "Template not found" }; // fail-closed (other-tenant/unknown)

  const name = input.name !== undefined ? sanitizeText(input.name, TEMPLATE_MAX_NAME) : current.name;
  if (!name) return { ok: false, error: "name cannot be empty" };
  const description = input.description !== undefined ? sanitizeText(input.description, TEMPLATE_MAX_DESCRIPTION) : current.description;
  const body = input.body !== undefined ? input.body : current.body;
  const bodyNorm = normalizeBody(body);
  if (!bodyNorm.ok) return bodyNorm;
  const fields = input.fields !== undefined ? input.fields : current.fields;
  const fieldsNorm = normalizeFields(fields);
  if (!fieldsNorm.ok) return fieldsNorm;

  const now = new Date().toISOString();
  const history = [
    ...current.history,
    { version: current.version, body: current.body, fields: current.fields, updatedAt: current.updatedAt, updatedBy: current.updatedBy },
  ];
  let pruned = false;
  if (history.length > TEMPLATE_MAX_HISTORY) {
    history.splice(0, history.length - TEMPLATE_MAX_HISTORY); // drop OLDEST only
    pruned = true;
  }
  const updated: VaultTemplate = {
    ...current,
    name, description, body: bodyNorm.body, fields: fieldsNorm.fields,
    version: current.version + 1,
    updatedAt: now, updatedBy: input.actor,
    history,
  };
  map[input.templateId] = updated;
  catalog[input.tenantEmail] = map;
  saveCatalog(input.dataDir, catalog);
  audit(input, "vaultTemplate.update", current.id,
    `Template "${updated.name}" → v${updated.version}${pruned ? " (oldest history pruned)" : ""}`);
  return { ok: true, template: updated };
}

/**
 * Delete EXACTLY one known template id (never glob). Template deletion NEVER
 * touches documents already created from the template (they are independent
 * vault docs). Re-delete of an already-deleted exact id = audited success
 * no-op (idempotent-by-audit); unknown id fails closed {ok:false}.
 */
export function deleteVaultTemplate(tenantEmail: string, templateId: string, dataDir: string): TemplateOutcome {
  if (!templateId) return { ok: false, error: "templateId required (exact single id)" };
  const catalog = loadCatalog(dataDir);
  const map = tenantMap(catalog, tenantEmail);
  if (!map[templateId]) {
    // Idempotent-by-audit: is there a prior approved delete on record for
    // this exact id from THIS tenant? If yes → audited no-op success.
    const trail = readJSON(join(dataDir, "vault_audit.json")) as Record<string, any[]> | undefined;
    const entries = (trail && trail[tenantEmail]) || [];
    const priorDelete = entries.some(
      (a) => a && a.action === "vaultTemplate.delete" && a.documentId === templateId && a.outcome === "ok",
    );
    if (priorDelete) {
      const opts: TemplateWriteOpts = { tenantEmail, actor: "system/portal", dataDir };
      audit(opts, "vaultTemplate.delete", templateId, "Idempotent replay — template already deleted (prior approved delete on record)");
      return { ok: true, unchanged: true };
    }
    return { ok: false, error: "Template not found" };
  }
  const t = map[templateId];
  delete map[templateId];
  catalog[tenantEmail] = map;
  saveCatalog(dataDir, catalog);
  audit({ tenantEmail, actor: "system/portal", dataDir }, "vaultTemplate.delete", t.id, `Deleted template "${t.name}" (v${t.version}); created documents are untouched`);
  return { ok: true };
}

/* ── import / upload (fail-closed sniffing + caps, mirrors vault-intake) ── */

function looksLikeJson(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
  return head.startsWith("{") || head.startsWith("[");
}

/** Printable-text check (same rule as vault-intake CSV). */
function printableText(bytes: Uint8Array): boolean {
  for (let i = 0; i < Math.min(bytes.byteLength, 1024); i++) {
    const b = bytes[i];
    if (b === 0 || (b < 0x09 || (b > 0x0d && b < 0x20))) return false;
  }
  return true;
}

/**
 * Import a template from an uploaded file (.json = schema-validated template
 * definition, .txt/.md = plain body). Extension AND content checks; 1 MiB cap;
 * body cap enforced after parse. Anything else fails closed.
 */
export function importVaultTemplate(
  input: TemplateWriteOpts & { fileName: string; bytes: Uint8Array },
): TemplateOutcome {
  const nameRaw = sanitizeVaultTemplateFileName(input.fileName);
  const extIdx = nameRaw.lastIndexOf(".");
  const ext = extIdx > 0 ? nameRaw.slice(extIdx + 1).toLowerCase() : "";
  if (input.bytes.byteLength === 0) return { ok: false, error: "Empty file" };
  if (input.bytes.byteLength > TEMPLATE_MAX_IMPORT_BYTES) {
    return { ok: false, error: `Template file exceeds the ${TEMPLATE_MAX_IMPORT_BYTES / 1024 / 1024} MiB limit` };
  }

  if (ext === "json") {
    if (!looksLikeJson(input.bytes)) {
      return { ok: false, error: "File does not look like JSON (content check failed)" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(input.bytes));
    } catch {
      return { ok: false, error: "Invalid JSON template file" };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Template JSON must be an object" };
    }
    const rec = parsed as Record<string, unknown>;
    const norm = validateTemplateInput({
      name: typeof rec.name === "string" ? rec.name : nameRaw.replace(/\.json$/i, "").trim(),
      description: typeof rec.description === "string" ? rec.description : "",
      body: typeof rec.body === "string" ? rec.body : "",
      fields: Array.isArray(rec.fields) ? (rec.fields as VaultTemplateField[]) : [],
    });
    if (!norm.ok) return { ok: false, error: `Import rejected: ${norm.error}` };
    return auditImport(input, nameRaw, createVaultTemplate({
      tenantEmail: input.tenantEmail,
      actor: input.actor,
      dataDir: input.dataDir,
      name: norm.name,
      description: norm.description,
      body: norm.body,
      fields: norm.fields,
      source: "upload",
    }));
  }

  if (ext === "txt" || ext === "md") {
    if (!printableText(input.bytes)) {
      return { ok: false, error: "Template text file contains binary control bytes" };
    }
    const body = new TextDecoder().decode(input.bytes);
    const title = nameRaw.replace(/\.(txt|md)$/i, "").trim() || "Imported template";
    const norm = validateTemplateInput({ name: title, description: "Imported template", body, fields: [] });
    if (!norm.ok) return norm;
    return auditImport(input, nameRaw, createVaultTemplate({
      tenantEmail: input.tenantEmail,
      actor: input.actor,
      dataDir: input.dataDir,
      name: norm.name,
      description: norm.description,
      body: norm.body,
      fields: norm.fields,
      source: "upload",
    }));
  }

  return { ok: false, error: `Unsupported template file type .${ext} — expected .json, .txt or .md` };
}
/**
 * Provenance audit for template IMPORT: a successful upload must leave a
 * `vaultTemplate.import` entry in the immutable vault audit (in addition to
 * the inner `vaultTemplate.create` write audit) so the audit trail can tell
 * an uploaded template apart from a scratch-created one. Uses the same
 * fail-closed `audit()` (throws if the audit write fails).
 */
function auditImport(input: TemplateWriteOpts, fileName: string, out: TemplateOutcome): TemplateOutcome {
  if (out.ok && out.template) {
    audit(input, "vaultTemplate.import", out.template.id, `Imported template ${out.template.name} (v${out.template.version}) from ${sanitizeVaultTemplateFileName(fileName)}`);
  }
  return out;
}

/** Sanitize an uploaded template file name (never a path, never dot-led). */
export function sanitizeVaultTemplateFileName(raw: string): string {
  let name = (raw || "template").replace(/[\\/]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  name = name.split(" ").map((seg) => seg.replace(/^\.+/, "")).filter((seg) => seg !== "").join(" ");
  if (!name) return "template";
  return name.slice(0, 120);
}