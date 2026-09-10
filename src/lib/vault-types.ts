/**
 * vault-types.ts — shared types for the NATIVE Document & File Intelligence
 * vault (Phase 1.5a, owner-greenlit 2026-09-10).
 *
 * The vault is a per-tenant, durable, non-destructive document store with:
 *   - tenant-scoped blob buckets (ZERO cross-tenant paths — hard guarantee),
 *   - folder engine + auto-folder rules (customer/project/type/date),
 *   - metadata + tags, full-text search surface, content-hash dedupe,
 *   - retention flags (keep / archive / destroy-by),
 *   - structured filing contract: file(document, route) with route DSL.
 *
 * SAFETY FLOOR (owner mandate — holds in EVERY mode, incl. autonomy):
 *   - every file write (file/move/archive/destroy/update) rides the Approval
 *     Queue by default; autonomy may auto-file ONLY against an explicit
 *     non-glob allow-listed action AND a known document id (never glob),
 *   - durable immutable audit entries per action (actor, tenant, action,
 *     route, checksum, timestamp),
 *   - non-destruction: never overwrite or delete unknown files; deletion
 *     requires an explicit allow-listed id — never glob-delete; versioning
 *     creates new versions instead of overwriting.
 */
import type { PendingAction } from "./approval-queue";

/** All file types the native intake accepts (type allowlist — never guessed). */
export const VAULT_ALLOWED_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "docx",
  "xlsx",
  "csv",
] as const;
export type VaultFileExtension = (typeof VAULT_ALLOWED_EXTENSIONS)[number];

/** Canonical MIME map — uploads are matched by BOTH extension AND magic bytes. */
export const VAULT_MIME_BY_EXT: Record<VaultFileExtension, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

export const VAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MiB

export type VaultDocStatus =
  | "pending_filing" // captured into the tenant's private inbox; NOT yet filed to a route
  | "active" // filed under a route (searchable, listed, organized)
  | "archived"; // retention: archive — hidden from default lists
export type VaultRetentionPolicy = "keep" | "archive" | "destroy";

export interface VaultRetention {
  policy: VaultRetentionPolicy;
  /** ISO timestamp after which the tenant's automation may destroy the doc. */
  destroyBy?: string;
}

export interface VaultVersion {
  /** 1-based version number (versions are ADD-ONLY — never overwritten). */
  number: number;
  /** sha256 hex of the version's bytes (content fingerprint / dedupe). */
  sha256: string;
  /** Byte size of the version. */
  size: number;
  /** ISO timestamp of the version write. */
  createdAt: string;
  /** Actor (user email or agent id) that created this version. */
  createdBy: string;
  /** Canonical MIME of the version (validated at intake). */
  mime: string;
  /** Original extension (validated at intake). */
  ext: VaultFileExtension;
}

/** The tenant-facing document record. All ids are per-tenant; a doc id from
 *  another tenant can never be resolved (isolation enforced at every read). */
export interface VaultDoc {
  id: string;
  /** Tenant isolation key (defense-in-depth — blob buckets are keyed by
   *  a hash of this; the record also stores it and every lookup verifies). */
  tenantEmail: string;
  /** Sanitized, human-friendly file name (never a raw path). */
  name: string;
  status: VaultDocStatus;
  /** Canonical route path e.g. "Acme Corp/Contracts/2026" ("" while pending). */
  route: string;
  /** Version history — add-only. `version` mirrors current latest number. */
  versions: VaultVersion[];
  version: number;
  tags: string[];
  /** Structured classification hints (filled by 5b extraction; settable now). */
  docType?: string;
  customer?: string;
  project?: string;
  /** Extracted/OCR text (populated by the 5b pipeline; searchable now). */
  text?: string;
  retention: VaultRetention;
  /** Content-hash dedupe: id of the first doc in this tenant with identical
   *  current-version sha256 ("" when this doc is the origin). */
  duplicateOf?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultFolder {
  id: string;
  /** Canonical path e.g. "Acme Corp/Contracts/2026" — unique per tenant. */
  path: string;
  name: string;
  parentPath: string; // "" for root-level folders
  createdBy: string;
  createdAt: string;
}

export type VaultDimensionKind = "customer" | "project" | "type" | "date";

export interface VaultRuleDimension {
  kind: VaultDimensionKind;
  /** Source for the value: doc.customer | doc.project | doc.docType |
   *  doc.createdAt (date). */
  source: "doc.customer" | "doc.project" | "doc.docType" | "doc.createdAt";
  /** Date format when kind === "date": "YYYY" | "YYYY-MM". */
  format?: "YYYY" | "YYYY-MM";
}

/** Auto-folder rule: matches a document against filters and produces a route
 *  from the dimension templates, e.g. "{customer}/{type}/{YYYY}". */
export interface VaultFolderRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Optional filters — rule only applies when ALL present filters match. */
  match?: { docType?: string[]; customer?: string[]; tags?: string[] };
  dimensions: VaultRuleDimension[];
  /** Route template. Allowed placeholders: {customer} {project} {type} {YYYY}
   *  {YYYY-MM}. Static segments allowed. Unknown placeholders are rejected
   *  at save time (no guessed routes). */
  target: string;
  /** Lower number wins when several rules apply. */
  priority: number;
  createdBy: string;
  createdAt: string;
}

export interface VaultTenantFolders {
  folders: VaultFolder[];
  rules: VaultFolderRule[];
}

/** Vault-audit entry — appended immutably (never edited/deleted). */
export interface VaultAuditEntry {
  id: string;
  ts: string; // ISO
  actor: string; // user email or "system/autonomy"
  tenantEmail: string;
  action:
    // Write-verb-first names (must match the Approval Queue WRITE classifier:
    // every gated vault mutation is a create/update/delete/… action so it can
    // never silently bypass the gate).
    | "writeVaultDocument"
    | "moveVaultDocument"
    | "archiveVaultDocument"
    | "restoreVaultDocument"
    | "deleteVaultDocument"
    | "updateVaultDocument"
    // Non-gated lifecycle + metadata audit events.
    | "vault.intake"
    | "vault.dedupe.hit"
    | "vault.document.download"
    | "vault.folder.rule.create"
    | "vault.folder.rule.update"
    | "vault.folder.rule.delete"
    | "vault.denied"; // a gated write was blocked
  documentId?: string;
  route?: string;
  sha256?: string;
  version?: number;
  outcome: "ok" | "pending" | "denied" | "error";
  detail?: string;
}

/** Result of the gated filing contract. */
export interface FilingOutcome {
  ok: boolean;
  /** true when the write was routed to the Approval Queue (default mode). */
  pending?: boolean;
  /** PendingAction id when pending (surface in the portal approvals queue). */
  actionId?: string;
  /** Document id when a document was created/affected. */
  documentId?: string;
  /** Canonical route the doc landed (or would land) on. */
  route?: string;
  /** true when autonomy mode auto-executed (allow-listed route + known id). */
  autonomy?: boolean;
  /** Rule id matched by the auto-folder engine, if any. */
  ruleId?: string;
  /** true when the call was an idempotent no-op (already filed to route). */
  unchanged?: boolean;
  /** true when intake deduped against an existing doc (same content hash). */
  duplicate?: boolean;
  error?: string;
}

/** Gate result shared by intake → file transitions. Reuses the approval queue
 *  PendingAction shape so the portal approvals surface renders the same cards. */
export interface VaultGateDecision {
  allowed: boolean;
  pending?: boolean;
  actionId?: string;
  autonomy?: boolean;
  allowListId?: string;
  workflowId?: string;
  error?: string;
  pendingAction?: PendingAction;
}