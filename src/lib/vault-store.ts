/**
 * vault-store.ts — per-tenant document vault store (Phase 1.5a native slice).
 *
 * DURABILITY: metadata lives in vault_index.json (the platform's write-through
 * JSON store, same as every other module); file BYTES live on disk under
 * <dataDir>/vault/blobs/<tenantHash>/<docId>/v<version>.bin — OUTSIDE the
 * publish tree, exactly like .data itself, so a publish can never swap the
 * store under the runtime.
 *
 * TENANT ISOLATION (hard guarantee): the blob bucket is keyed by a sha256 of
 * the tenant email; the index is keyed by tenant email; every lookup requires
 * BOTH the tenant key AND an exact doc id — a doc id from tenant B can never
 * resolve under tenant A. There is no path that walks "all tenants".
 *
 * DEDUPE: content-hash (sha256) dedupe — uploading bytes already stored in the
 * same tenant returns the origin doc (no new blob). Versioning is ADD-ONLY:
 * a new version of a doc is a NEW version number, never an overwrite
 * (#235 non-destruction + owner mandate).
 *
 * DELETION: `destroyVaultDocument` accepts ONE exact known doc id (never a
 * glob/query) — the caller (vault-filing.ts) must have passed the approval
 * gate / explicit allow-list first. Unknown ids fail closed.
 */
import { createHash, randomBytes } from "crypto";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { readJSON, writeJSON, resolveDataDir } from "./data-store";
import type {
  VaultDoc,
  VaultRetention,
  VaultVersion,
  VaultFileExtension,
} from "./vault-types";

export const VAULT_INDEX_KEY = "vault_index.json";
export const VAULT_BLOB_ROOT = "vault/blobs";

/** Deterministic tenant bucket key (sha256 hex — safe for the filesystem). */
export function tenantVaultKey(tenantEmail: string): string {
  return createHash("sha256").update(tenantEmail.toLowerCase().trim()).digest("hex");
}

/** Resolve the vault root under a data dir. */
export function vaultRoot(dataDir: string): string {
  return join(resolveDataDir(dataDir, process.cwd()), "vault");
}

/** Blob directory for one tenant's documents. */
export function tenantBlobDir(dataDir: string, tenantEmail: string): string {
  return join(vaultRoot(dataDir), "blobs", tenantVaultKey(tenantEmail));
}

function indexPath(dataDir: string): string {
  return join(resolveDataDir(dataDir, process.cwd()), VAULT_INDEX_KEY);
}

export type VaultIndex = Record<string, VaultDoc[]>;

function loadIndex(dataDir: string): VaultIndex {
  const raw = readJSON(indexPath(dataDir)) as Record<string, unknown>;
  const out: VaultIndex = {};
  for (const [tenant, docs] of Object.entries(raw || {})) {
    if (Array.isArray(docs)) out[tenant] = docs as VaultDoc[];
  }
  return out;
}

function saveIndex(dataDir: string, index: VaultIndex, tenantEmail: string): void {
  // Ensure the blob root exists (index file lives at vault root too).
  mkdirSync(join(vaultRoot(dataDir), "blobs"), { recursive: true });
  writeJSON(indexPath(dataDir), index);
}

export function newVaultDocId(): string {
  return `doc_${randomBytes(9).toString("hex")}`;
}

export function sha256Of(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Blob file for a specific doc version. */
export function blobPathFor(
  dataDir: string,
  tenantEmail: string,
  documentId: string,
  version: number,
): string {
  return join(tenantBlobDir(dataDir, tenantEmail), documentId, `v${version}.bin`);
}

/** Resolve the blob to READ for a doc/version, following duplicateOf pointers. */
export function resolveBlobSource(
  dataDir: string,
  doc: VaultDoc,
  version: number,
  index?: VaultIndex,
): { path: string; doc: VaultDoc } | null {
  let target = doc;
  let guard = 0;
  const idx = index || loadIndex(dataDir);
  while (target.duplicateOf && guard < 8) {
    const origin = (idx[target.tenantEmail] || []).find((d) => d.id === target.duplicateOf);
    if (!origin) return null; // broken pointer → fail closed (never guess a path)
    target = origin;
    guard += 1;
  }
  const p = blobPathFor(dataDir, doc.tenantEmail, target.id, version);
  return existsSync(p) ? { path: p, doc: target } : null;
}

function readBlobBytes(path: string): Uint8Array | null {
  try {
    return new Uint8Array(readFileSync(path));
  } catch {
    return null;
  }
}

/** Write a blob file for a doc version (mkdir -p). */
export function writeBlob(
  dataDir: string,
  tenantEmail: string,
  documentId: string,
  version: number,
  bytes: Uint8Array | Buffer,
): void {
  const dir = join(tenantBlobDir(dataDir, tenantEmail), documentId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `v${version}.bin`), bytes);
}

export interface CreateVaultDocInput {
  tenantEmail: string;
  fileName: string;
  bytes: Uint8Array;
  mime: string;
  ext: VaultFileExtension;
  actor: string;
  tags?: string[];
  docType?: string;
  customer?: string;
  project?: string;
  text?: string;
  retention?: Partial<VaultRetention>;
  dataDir: string;
}

export interface CreateVaultDocResult {
  doc: VaultDoc;
  /** true when the exact same bytes + name already exist → idempotent no-op. */
  unchanged?: boolean;
  /** true when bytes match an existing doc (content dedupe). */
  duplicate?: boolean;
  duplicateOf?: string;
}

/**
 * Capture a document's bytes into the tenant's private vault bucket.
 * Creates the doc record in status "pending_filing" (route ""), writes the
 * first version blob, and dedupes by sha256 within the tenant.
 */
export function createVaultDocument(input: CreateVaultDocInput): CreateVaultDocResult {
  const { tenantEmail, fileName, bytes, mime, ext, actor, dataDir } = input;
  const now = new Date().toISOString();
  const checksum = sha256Of(bytes);

  const index = loadIndex(dataDir);
  const tenantDocs = index[tenantEmail] || [];

  // Content dedupe within the tenant — exact bytes already stored?
  const sameBytes = tenantDocs.find((d) => d.versions.some((v) => v.sha256 === checksum));
  if (sameBytes) {
    const sameName = sameBytes.name === fileName;
    const result: CreateVaultDocResult = { doc: sameBytes };
    if (sameName) result.unchanged = true;
    else {
      result.duplicate = true;
      result.duplicateOf = sameBytes.id;
    }
    return result;
  }

  const id = newVaultDocId();
  const version: VaultVersion = {
    number: 1,
    sha256: checksum,
    size: bytes.byteLength,
    createdAt: now,
    createdBy: actor,
    mime,
    ext,
  };
  const doc: VaultDoc = {
    id,
    tenantEmail,
    name: fileName,
    status: "pending_filing",
    route: "",
    versions: [version],
    version: 1,
    tags: input.tags || [],
    docType: input.docType,
    customer: input.customer,
    project: input.project,
    text: input.text,
    retention: {
      policy: input.retention?.policy || "keep",
      destroyBy: input.retention?.destroyBy,
    },
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
  };

  // Bytes first (durable), then the index record — an index entry always has
  // a real blob behind it (never a dangling record).
  writeBlob(dataDir, tenantEmail, id, 1, bytes);
  index[tenantEmail] = [...tenantDocs, doc];
  saveIndex(dataDir, index, tenantEmail);
  return { doc };
}

/** Fetch one doc — ALWAYS tenant-scoped; cross-tenant ids fail closed (null). */
export function getVaultDocument(
  dataDir: string,
  tenantEmail: string,
  documentId: string,
): VaultDoc | null {
  const index = loadIndex(dataDir);
  const doc = (index[tenantEmail] || []).find((d) => d.id === documentId);
  return doc ? { ...doc } : null;
}

/** List a tenant's docs with optional status filter (never other tenants). */
export function listVaultDocuments(
  dataDir: string,
  tenantEmail: string,
  opts?: { status?: VaultDoc["status"][] },
): VaultDoc[] {
  const index = loadIndex(dataDir);
  const docs = index[tenantEmail] || [];
  const wanted = opts?.status;
  return docs
    .filter((d) => !wanted || wanted.includes(d.status))
    .map((d) => ({ ...d }));
}

/** Read current-version bytes for a doc (authentication is the caller's job). */
export function readVaultDocumentBytes(
  dataDir: string,
  tenantEmail: string,
  documentId: string,
  version?: number,
): { bytes: Uint8Array; doc: VaultDoc } | null {
  const doc = getVaultDocument(dataDir, tenantEmail, documentId);
  if (!doc) return null;
  const v = version ?? doc.version;
  const target = doc.versions.find((vv) => vv.number === v);
  if (!target) return null;
  const src = resolveBlobSource(dataDir, doc, v);
  if (!src) return null;
  const bytes = readBlobBytes(src.path);
  if (!bytes) return null;
  return { bytes, doc: { ...doc, version: v } };
}

/** Append a NEW version to a doc (add-only — never overwrites existing). */
export function addVaultDocumentVersion(
  dataDir: string,
  tenantEmail: string,
  documentId: string,
  bytes: Uint8Array,
  mime: string,
  ext: VaultFileExtension,
  actor: string,
): VaultDoc | null {
  const index = loadIndex(dataDir);
  const tenantDocs = index[tenantEmail] || [];
  const idx = tenantDocs.findIndex((d) => d.id === documentId);
  if (idx === -1) return null;
  const doc = tenantDocs[idx];
  const checksum = sha256Of(bytes);
  const nextNumber = doc.version + 1;
  const version: VaultVersion = {
    number: nextNumber,
    sha256: checksum,
    size: bytes.byteLength,
    createdAt: new Date().toISOString(),
    createdBy: actor,
    mime,
    ext,
  };
  writeBlob(dataDir, tenantEmail, documentId, nextNumber, bytes);
  const updated: VaultDoc = {
    ...doc,
    versions: [...doc.versions, version],
    version: nextNumber,
    updatedAt: new Date().toISOString(),
  };
  tenantDocs[idx] = updated;
  index[tenantEmail] = tenantDocs;
  saveIndex(dataDir, index, tenantEmail);
  return { ...updated };
}

/** Attach a route and mark the doc active — the filing write itself is gated
 *  by the CALLER (vault-filing.ts) BEFORE this store mutation runs. */
export function attachRouteToDocument(
  dataDir: string,
  tenantEmail: string,
  documentId: string,
  route: string,
): VaultDoc | null {
  const index = loadIndex(dataDir);
  const tenantDocs = index[tenantEmail] || [];
  const idx = tenantDocs.findIndex((d) => d.id === documentId);
  if (idx === -1) return null;
  const doc = tenantDocs[idx];
  if (doc.route === route && doc.status === "active") return { ...doc }; // idempotent
  const updated: VaultDoc = {
    ...doc,
    route,
    status: "active",
    updatedAt: new Date().toISOString(),
  };
  tenantDocs[idx] = updated;
  index[tenantEmail] = tenantDocs;
  saveIndex(dataDir, index, tenantEmail);
  return { ...updated };
}

export type VaultDocStatus = VaultDoc["status"];

/** Set status (active/archived/pending_filing). Caller gates first. */
export function setVaultDocumentStatus(
  dataDir: string,
  tenantEmail: string,
  documentId: string,
  status: VaultDocStatus,
): VaultDoc | null {
  const index = loadIndex(dataDir);
  const tenantDocs = index[tenantEmail] || [];
  const idx = tenantDocs.findIndex((d) => d.id === documentId);
  if (idx === -1) return null;
  const doc = tenantDocs[idx];
  const updated: VaultDoc = { ...doc, status, updatedAt: new Date().toISOString() };
  tenantDocs[idx] = updated;
  index[tenantEmail] = tenantDocs;
  saveIndex(dataDir, index, tenantEmail);
  return { ...updated };
}

/** Update metadata (tags / retention / docType / customer / project / text).
 *  Metadata edits are ALSO gated by the caller (they are file writes). */
export function updateVaultDocumentMeta(
  dataDir: string,
  tenantEmail: string,
  documentId: string,
  patch: {
    tags?: string[];
    retention?: Partial<VaultRetention>;
    docType?: string;
    customer?: string;
    project?: string;
    text?: string;
  },
): VaultDoc | null {
  const index = loadIndex(dataDir);
  const tenantDocs = index[tenantEmail] || [];
  const idx = tenantDocs.findIndex((d) => d.id === documentId);
  if (idx === -1) return null;
  const doc = tenantDocs[idx];
  const updated: VaultDoc = {
    ...doc,
    tags: patch.tags ?? doc.tags,
    retention: {
      ...doc.retention,
      ...(patch.retention ? { ...patch.retention } : {}),
    },
    docType: patch.docType ?? doc.docType,
    customer: patch.customer ?? doc.customer,
    project: patch.project ?? doc.project,
    text: patch.text ?? doc.text,
    updatedAt: new Date().toISOString(),
  };
  tenantDocs[idx] = updated;
  index[tenantEmail] = tenantDocs;
  saveIndex(dataDir, index, tenantEmail);
  return { ...updated };
}

/**
 * DESTROY — the ONLY delete path, and it accepts exactly ONE known doc id.
 * The caller (vault-filing.ts) must have passed the approval gate / explicit
 * non-glob allow-listed action + this known id. Removes the doc's blob dir
 * and its index record. Never a glob, never a query, never cross-tenant.
 * Returns null when the id is unknown for this tenant (fail closed).
 */
export function destroyVaultDocument(
  dataDir: string,
  tenantEmail: string,
  documentId: string,
): VaultDoc | null {
  const index = loadIndex(dataDir);
  const tenantDocs = index[tenantEmail] || [];
  const idx = tenantDocs.findIndex((d) => d.id === documentId);
  if (idx === -1) return null;
  const [removed] = tenantDocs.splice(idx, 1);
  index[tenantEmail] = tenantDocs;
  saveIndex(dataDir, index, tenantEmail);
  const blobDir = join(tenantBlobDir(dataDir, tenantEmail), documentId);
  try {
    if (existsSync(blobDir)) rmSync(blobDir, { recursive: true, force: true });
  } catch {
    // Best-effort physical cleanup; the index record is already gone — an
    // orphan blob is unreachable (no index entry) and never listed again.
  }
  return { ...removed };
}

/** Per-tenant stats for admin/health surfaces. */
export function vaultTenantStats(dataDir: string, tenantEmail: string): {
  count: number;
  bytes: number;
} {
  const docs = listVaultDocuments(dataDir, tenantEmail);
  const bytes = docs.reduce((acc, d) => acc + d.versions.reduce((a, v) => a + v.size, 0), 0);
  return { count: docs.length, bytes };
}