/**
 * vault-intake.ts — intake validation for the native document vault.
 *
 * SECURITY-FIRST INPUT HANDLING (fail-closed):
 *   - type allowlist: only PDF/PNG/JPEG/WebP/GIF/DOCX/XLSX/CSV (extension AND
 *     canonical MIME map — never trusted from the client alone),
 *   - MAGIC-BYTES sniffing: a file claiming .pdf must actually start with
 *     %PDF- ; .docx/.xlsx must be a ZIP (PK\x03\x04); a .csv must be
 *     printable text. A spoofed extension is REJECTED, not guessed,
 *   - size limit: 25 MiB (VAULT_MAX_UPLOAD_BYTES),
 *   - filename sanitization: no path separators, no control chars, no
 *     leading dots, length-capped — the stored name can never be a path.
 *
 * `intakeDocument` captures bytes into the tenant's private bucket with status
 * "pending_filing" (route ""). FILING to a route is a separate, approval-
 * gated write (vault-filing.ts) — capture alone never makes a document
 * visible in any route, and never touches another tenant.
 */
import type { VaultFileExtension, VaultRetention } from "./vault-types";
import { VAULT_ALLOWED_EXTENSIONS, VAULT_MAX_UPLOAD_BYTES, VAULT_MIME_BY_EXT } from "./vault-types";
import { createVaultDocument, sha256Of, type CreateVaultDocInput } from "./vault-store";
import { appendVaultAudit } from "./vault-audit";

export interface SniffedFile {
  ok: boolean;
  extension: VaultFileExtension | null;
  mime: string;
  reason?: string;
}

function bytesPrefix(bytes: Uint8Array, n: number): Uint8Array {
  return bytes.subarray(0, Math.min(n, bytes.byteLength));
}

function ascii(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/**
 * Magic-byte sniffing — evidence-based type detection, never trust the
 * extension or client MIME alone. Returns { ok:false, reason } on mismatch.
 */
export function sniffFileType(bytes: Uint8Array, declaredExt: string): SniffedFile {
  const extLower = declaredExt.toLowerCase().replace(/^\./, "");
  if (!(VAULT_ALLOWED_EXTENSIONS as readonly string[]).includes(extLower)) {
    return { ok: false, extension: null, mime: "", reason: `Unsupported file type .${extLower}` };
  }
  const ext = extLower as VaultFileExtension;
  const head = ascii(bytesPrefix(bytes, 16));

  switch (ext) {
    case "pdf":
      if (!head.startsWith("%PDF-")) {
        return { ok: false, extension: ext, mime: VAULT_MIME_BY_EXT.pdf, reason: "File does not look like a PDF (bad magic bytes)" };
      }
      break;
    case "png": {
      const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      const b = bytesPrefix(bytes, 8);
      if (!magic.every((m, i) => b[i] === m)) {
        return { ok: false, extension: ext, mime: VAULT_MIME_BY_EXT.png, reason: "File does not look like a PNG (bad magic bytes)" };
      }
      break;
    }
    case "jpg":
    case "jpeg":
      if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
        return { ok: false, extension: ext, mime: VAULT_MIME_BY_EXT.jpeg, reason: "File does not look like a JPEG (bad magic bytes)" };
      }
      break;
    case "gif": {
      const magic = ["GIF87a", "GIF89a"];
      if (!magic.some((m) => head.startsWith(m))) {
        return { ok: false, extension: ext, mime: VAULT_MIME_BY_EXT.gif, reason: "File does not look like a GIF (bad magic bytes)" };
      }
      break;
    }
    case "webp":
      if (!(head.startsWith("RIFF") && head.slice(8, 12) === "WEBP")) {
        return { ok: false, extension: ext, mime: VAULT_MIME_BY_EXT.webp, reason: "File does not look like a WebP (bad magic bytes)" };
      }
      break;
    case "docx":
    case "xlsx":
      if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        return { ok: false, extension: ext, mime: VAULT_MIME_BY_EXT[ext], reason: `File does not look like an Office document (${ext} is a ZIP container)` };
      }
      break;
    case "csv": {
      // Printable-text check: reject NULs and heavy control bytes. (No magic
      // bytes exist for CSV — we require it to LOOK like text.)
      for (let i = 0; i < Math.min(bytes.byteLength, 1024); i++) {
        const b = bytes[i];
        if (b === 0 || (b < 0x09 || (b > 0x0d && b < 0x20))) {
          return { ok: false, extension: ext, mime: VAULT_MIME_BY_EXT.csv, reason: "CSV content contains binary control bytes" };
        }
      }
      break;
    }
  }
  return { ok: true, extension: ext, mime: VAULT_MIME_BY_EXT[ext] };
}

/** Normalize a client-provided file name into a safe stored name. */
export function sanitizeVaultFileName(raw: string): string {
  // Strip any path component (Windows + POSIX separators) and control chars.
  let name = (raw || "document").replace(/[\\/]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  // Drop path-traversal artifacts and dot-only segments entirely (never a
  // hidden/dotfile name, never a ".." that could resolve above the vault).
  name = name.split(" ").map((seg) => seg.replace(/^\.+/, "")).filter((seg) => seg !== "").join(" ");
  if (!name) return "document";
  if (name.length > 160) {
    const extIdx = name.lastIndexOf(".");
    name = extIdx > 0 ? `${name.slice(0, 140)}${name.slice(extIdx)}` : name.slice(0, 160);
  }
  return name;
}

export interface IntakeInput {
  tenantEmail: string;
  fileName: string;
  bytes: Uint8Array;
  actor: string;
  tags?: string[];
  docType?: string;
  customer?: string;
  project?: string;
  text?: string;
  retention?: Partial<VaultRetention>;
  dataDir: string;
}

export interface IntakeResult {
  ok: boolean;
  error?: string;
  /** Detected extension when validation succeeded. */
  extension?: VaultFileExtension;
  mime?: string;
  checksum?: string;
  /** createVaultDocument result details. */
  duplicate?: boolean;
  duplicateOf?: string;
  unchanged?: boolean;
  documentId?: string;
}

/**
 * Validate + capture one uploaded file into the tenant's private vault
 * bucket. This is the ONLY intake path for uploads (portal / API / webhook
 * when it lands in 5b). FILING (route assignment) is separately gated.
 */
export function intakeDocument(input: IntakeInput): IntakeResult {
  const { tenantEmail, fileName, bytes, actor, dataDir } = input;
  if (bytes.byteLength === 0) return { ok: false, error: "Empty file" };
  if (bytes.byteLength > VAULT_MAX_UPLOAD_BYTES) {
    return { ok: false, error: `File exceeds the ${Math.round(VAULT_MAX_UPLOAD_BYTES / 1024 / 1024)} MiB limit` };
  }
  const safeName = sanitizeVaultFileName(fileName);
  const extIdx = safeName.lastIndexOf(".");
  const extRaw = extIdx > 0 ? safeName.slice(extIdx + 1) : "";
  const sniff = sniffFileType(bytes, extRaw);
  if (!sniff.ok || !sniff.extension) {
    return { ok: false, error: sniff.reason || "Unsupported file type" };
  }

  const createInput: CreateVaultDocInput = {
    tenantEmail,
    fileName: safeName,
    bytes,
    mime: sniff.mime,
    ext: sniff.extension,
    actor,
    tags: input.tags,
    docType: input.docType,
    customer: input.customer,
    project: input.project,
    text: input.text,
    retention: input.retention,
    dataDir,
  };
  const created = createVaultDocument(createInput);
  const checksum = sha256Of(bytes);
  const outcome = {
    ok: true,
    extension: sniff.extension,
    mime: sniff.mime,
    checksum,
    documentId: created.doc.id,
    duplicate: created.duplicate,
    duplicateOf: created.duplicateOf,
    unchanged: created.unchanged,
  };

  // Durable immutable audit of the capture (intake / dedupe hit).
  appendVaultAudit(dataDir, tenantEmail, {
    actor,
    action: created.duplicate || created.unchanged ? "vault.dedupe.hit" : "vault.intake",
    documentId: created.doc.id,
    route: "",
    sha256: checksum,
    version: created.doc.version,
    outcome: "ok",
    detail: created.duplicate
      ? `Content already vaulted as ${created.duplicateOf}`
      : created.unchanged
        ? "Identical file already vaulted — no new version"
        : `Captured ${safeName} (${sniff.extension}) into tenant inbox`,
  });

  return outcome;
}