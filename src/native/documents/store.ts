/**
 * native/documents/store.ts — durable, tenant-keyed document store for the
 * native capability layer (Phase 1.2).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   map first — zero cross-tenant paths (another tenant's bucket/doc id
 *   resolves to null → fail-closed 404 upstream).
 * - PDF bytes live in the tenant's HASHED bucket (sha256 of lowercased
 *   tenant email — same convention as the vault blob store); metadata lives
 *   in `native_documents.json` (bounded per tenant).
 * - Versions are ADD-ONLY: an update pushes the current record onto
 *   `history` before mutating; prior checksums are never overwritten.
 * - DELETE accepts exactly ONE known id (never a glob). Re-delete of an
 *   unknown id is a fail-closed null (404), never a silent success.
 * - Every mutation appends an IMMUTABLE native-documents audit entry.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_DOCS_KEY,
  NATIVE_DOCS_AUDIT_KEY,
  MAX_HISTORY_VERSIONS,
  type NativeDocBucket,
  type NativeDocRecord,
  type NativeDocVersion,
} from "./types";

export interface NativeDocAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string;
  detail: string;
}

interface TenantDocState {
  buckets: NativeDocBucket[];
  docs: NativeDocRecord[];
  /** Documents SHARED with this tenant (reader view) — owner-granted, audited. */
  shared: NativeSharedRef[];
}

/** Read-only share reference stored under the READER's tenant slice. */
export interface NativeSharedRef {
  tenantId: string; // owning (granting) tenant
  docId: string;
  name: string;
  kind: string;
  pages: number;
  checksum: string;
  sharedAt: string;
  sharedBy: string;
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantDocState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_DOCS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantDocState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantDocState>): void {
  writeJSON(dataPath(dataDir, NATIVE_DOCS_KEY), state);
}

/** sha256 of the canonical tenant identity — the hashed bucket name. */
export function tenantDocBucketHash(tenantId: string): string {
  return createHash("sha256").update(tenantId.toLowerCase().trim()).digest("hex").slice(0, 32);
}
function tenantBinDir(dataDir: string, tenantId: string): string {
  return join(resolveDataDir(dataDir, process.cwd()), "native_docs", tenantDocBucketHash(tenantId));
}
export function documentBytesPath(dataDir: string, tenantId: string, docId: string): string {
  return join(tenantBinDir(dataDir, tenantId), `${docId}.pdf`);
}

export function sha256Of(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function generateDocEntityId(prefix: "bkt" | "doc"): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── Buckets ────────────────────────────────────────────────────────────────
export function listBuckets(dataDir: string, tenantId: string): NativeDocBucket[] {
  return loadState(dataDir)[tenantId]?.buckets ?? [];
}
export function getBucket(dataDir: string, tenantId: string, bucketId: string): NativeDocBucket | null {
  return listBuckets(dataDir, tenantId).find((b) => b.id === bucketId) ?? null;
}
export function createBucket(dataDir: string, bucket: NativeDocBucket): void {
  const state = loadState(dataDir);
  const tenant = state[bucket.tenantId] ?? { buckets: [], docs: [], shared: [] };
  tenant.buckets.push(bucket);
  state[bucket.tenantId] = tenant;
  saveState(dataDir, state);
  appendDocAudit(dataDir, bucket.tenantId, bucket.createdBy, "native.docs.bucket.create", `Bucket ${bucket.id}`);
}
/** Delete an exact bucket — only when it holds no documents (fail-closed). */
export function deleteBucket(dataDir: string, tenantId: string, bucketId: string, actor: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return false;
  const idx = tenant.buckets.findIndex((b) => b.id === bucketId);
  if (idx < 0) return false;
  if (tenant.docs.some((d) => d.bucketId === bucketId)) return false; // non-empty -> fail-closed
  tenant.buckets.splice(idx, 1);
  state[tenantId] = tenant;
  saveState(dataDir, state);
  appendDocAudit(dataDir, tenantId, actor, "native.docs.bucket.delete", `Bucket ${bucketId}`);
  return true;
}

// ── Documents ──────────────────────────────────────────────────────────────
export function listDocs(dataDir: string, tenantId: string): NativeDocRecord[] {
  return loadState(dataDir)[tenantId]?.docs ?? [];
}
export function listDocsInBucket(dataDir: string, tenantId: string, bucketId: string): NativeDocRecord[] {
  return listDocs(dataDir, tenantId).filter((d) => d.bucketId === bucketId);
}
export function getDoc(dataDir: string, tenantId: string, docId: string): NativeDocRecord | null {
  return listDocs(dataDir, tenantId).find((d) => d.id === docId) ?? null;
}
export function canReadDoc(record: NativeDocRecord, actor: string | null): boolean {
  if (!actor) return false;
  return record.acl.owner === actor || record.acl.readers.includes(actor);
}
export function canWriteDoc(record: NativeDocRecord, actor: string | null): boolean {
  return !!actor && record.acl.owner === actor;
}
export function createDocument(dataDir: string, record: NativeDocRecord, bytes: Uint8Array | Buffer): void {
  const state = loadState(dataDir);
  const tenant = state[record.tenantId] ?? { buckets: [], docs: [], shared: [] };
  tenant.docs.push(record);
  state[record.tenantId] = tenant;
  saveState(dataDir, state);
  // Bytes AFTER metadata so a failed write never leaves an orphan record.
  const dir = tenantBinDir(dataDir, record.tenantId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(documentBytesPath(dataDir, record.tenantId, record.id), bytes);
  appendDocAudit(dataDir, record.tenantId, record.updatedBy, "native.docs.create", `Document ${record.id} v1 (${record.pages}p)`);
}
/** Add-only update: pushes the current record onto history, then mutates. */
export function updateDocument(
  dataDir: string,
  tenantId: string,
  docId: string,
  next: Partial<Pick<NativeDocRecord, "name" | "kind" | "textProjection" | "checksum" | "sizeBytes" | "pages">>,
  bytes: Uint8Array | Buffer,
  actor: string,
): NativeDocRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return null;
  const idx = tenant.docs.findIndex((d) => d.id === docId);
  if (idx < 0) return null;
  const record = tenant.docs[idx];
  if (!canWriteDoc(record, actor)) return null;
  const version: NativeDocVersion = {
    version: record.version,
    checksum: record.checksum,
    sizeBytes: record.sizeBytes,
    pages: record.pages,
    createdAt: record.updatedAt,
    createdBy: record.updatedBy,
  };
  const history = [version, ...record.history].slice(0, MAX_HISTORY_VERSIONS);
  record.history = history;
  record.version += 1;
  if (next.name !== undefined) record.name = next.name;
  if (next.kind !== undefined) record.kind = next.kind;
  if (next.textProjection !== undefined) record.textProjection = next.textProjection;
  if (next.checksum !== undefined) record.checksum = next.checksum;
  if (next.sizeBytes !== undefined) record.sizeBytes = next.sizeBytes;
  if (next.pages !== undefined) record.pages = next.pages;
  record.updatedAt = new Date().toISOString();
  record.updatedBy = actor;
  // Refresh readers' shared refs to the new checksum/name (they read latest).
  for (const reader of record.acl.readers) {
    if (reader === tenantId) continue;
    upsertSharedRef(state, reader, {
      tenantId,
      docId,
      name: record.name,
      kind: record.kind,
      pages: record.pages,
      checksum: record.checksum,
      sharedAt: record.updatedAt,
      sharedBy: actor,
    });
  }
  state[tenantId] = tenant;
  saveState(dataDir, state);
  const path = documentBytesPath(dataDir, tenantId, docId);
  const dir = tenantBinDir(dataDir, tenantId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, bytes);
  appendDocAudit(dataDir, tenantId, actor, "native.docs.update", `Document ${docId} -> v${record.version}`);
  return record;
}
/** Delete an exact document id (owner-only). Returns the checksum removed. */
export function deleteDocument(dataDir: string, tenantId: string, docId: string, actor: string): string | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return null;
  const idx = tenant.docs.findIndex((d) => d.id === docId);
  if (idx < 0) return null;
  const record = tenant.docs[idx];
  if (!canWriteDoc(record, actor)) return null;
  tenant.docs.splice(idx, 1);
  state[tenantId] = tenant;
  saveState(dataDir, state);
  const path = documentBytesPath(dataDir, tenantId, docId);
  if (existsSync(path)) rmSync(path, { force: true });
  appendDocAudit(dataDir, tenantId, actor, "native.docs.delete", `Document ${docId}`);
  return record.checksum;
}
/** Replace the reader ACL (owner-only). Returns the updated record or null. */
export function listSharedDocs(dataDir: string, readerTenant: string): NativeSharedRef[] {
  return loadState(dataDir)[readerTenant]?.shared ?? [];
}
export function getSharedRef(dataDir: string, readerTenant: string, docId: string): NativeSharedRef | null {
  return listSharedDocs(dataDir, readerTenant).find((r) => r.docId === docId) ?? null;
}
function upsertSharedRef(
  state: Record<string, TenantDocState>,
  readerTenant: string,
  ref: NativeSharedRef,
): void {
  const tenant = state[readerTenant] ?? { buckets: [], docs: [], shared: [] };
  tenant.shared = [ref, ...tenant.shared.filter((r) => r.docId !== ref.docId || r.tenantId !== ref.tenantId)];
  state[readerTenant] = tenant;
}
function removeSharedRef(state: Record<string, TenantDocState>, readerTenant: string, docId: string): void {
  const tenant = state[readerTenant];
  if (!tenant) return;
  tenant.shared = tenant.shared.filter((r) => r.docId !== docId);
}
export function setDocAcl(dataDir: string, tenantId: string, docId: string, readers: string[], actor: string): NativeDocRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return null;
  const idx = tenant.docs.findIndex((d) => d.id === docId);
  if (idx < 0) return null;
  const record = tenant.docs[idx];
  if (!canWriteDoc(record, actor)) return null;
  const clean = (emails: string[]): string[] => [...new Set(emails.filter((e) => typeof e === "string" && e.length > 0))];
  const nextReaders = clean(readers);
  const previousReaders = clean(record.acl.readers);
  // Grant: add a read-only shared ref under each NEW reader's tenant slice.
  for (const reader of nextReaders) {
    if (reader === tenantId || previousReaders.includes(reader)) continue;
    upsertSharedRef(state, reader, {
      tenantId,
      docId,
      name: record.name,
      kind: record.kind,
      pages: record.pages,
      checksum: record.checksum,
      sharedAt: new Date().toISOString(),
      sharedBy: actor,
    });
  }
  // Revoke: drop the ref from any reader no longer on the list.
  for (const reader of previousReaders) {
    if (!nextReaders.includes(reader)) removeSharedRef(state, reader, docId);
  }
  record.acl = { owner: record.acl.owner, readers: nextReaders };
  state[tenantId] = tenant;
  saveState(dataDir, state);
  appendDocAudit(dataDir, tenantId, actor, "native.docs.acl", `Document ${docId} readers -> ${nextReaders.length}`);
  return record;
}
/** Read the PDF bytes for a document (caller must have checked canRead). */
export function readDocumentBytes(dataDir: string, tenantId: string, docId: string): Uint8Array | null {
  const path = documentBytesPath(dataDir, tenantId, docId);
  if (!existsSync(path)) return null;
  return new Uint8Array(readFileSync(path));
}

// ── Audit (immutable, tenant-keyed) ─────────────────────────────────────────
export function appendDocAudit(
  dataDir: string,
  tenantId: string,
  actor: string,
  action: string,
  detail: string,
): NativeDocAuditEntry {
  const entry: NativeDocAuditEntry = {
    id: `nda-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
    ts: new Date().toISOString(),
    tenantId,
    actor,
    action,
    detail,
  };
  const path = dataPath(dataDir, NATIVE_DOCS_AUDIT_KEY);
  const raw = readJSON(path);
  const all: Record<string, NativeDocAuditEntry[]> = raw && typeof raw === "object" ? (raw as Record<string, NativeDocAuditEntry[]>) : {};
  const entries = all[tenantId] || [];
  entries.push(entry); // append-only
  all[tenantId] = entries;
  writeJSON(path, all);
  return entry;
}
export function listDocAudit(dataDir: string, tenantId: string): NativeDocAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_DOCS_AUDIT_KEY));
  const all = raw && typeof raw === "object" ? (raw as Record<string, NativeDocAuditEntry[]>) : {};
  return all[tenantId] ?? [];
}
export function countDocAudit(dataDir: string, tenantId: string): number {
  return listDocAudit(dataDir, tenantId).length;
}

/** Count of binary PDF files in a tenant's hashed bucket (tests/cleanup). */
export function countTenantBucketFiles(dataDir: string, tenantId: string): number {
  const dir = tenantBinDir(dataDir, tenantId);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).length;
}