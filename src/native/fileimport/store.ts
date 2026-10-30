/**
 * native/fileimport/store.ts — durable, tenant-keyed file-import store.
 *
 * Every read/write takes tenantId explicitly and resolves the EXACT tenant map
 * first — zero cross-tenant paths. A job id belonging to another tenant simply
 * is not in this tenant's list, so it resolves to null and the router answers
 * 404 (no IDOR, no "forbidden" hint that the id exists).
 *
 * Server-assigned ids only (fimp_/fiw_/fia_): a client-supplied id is forged
 * and fails closed at the gate. Staged rows live in their own tenant-keyed map
 * so a job's row payload is bounded and never mixed into the job index.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_FILE_IMPORT_JOBS_KEY,
  NATIVE_FILE_IMPORT_ROWS_KEY,
  NATIVE_FILE_IMPORT_AUDIT_KEY,
  NATIVE_FILE_IMPORT_PENDING_KEY,
  type FileImportJob,
  type FileImportRow,
  type NativeFileImportAuditEntry,
  type PendingFileImportWrite,
} from "./types";

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}

function load<T>(dataDir: string, key: string, fallback: T): T {
  try {
    const raw = readJSON(dataPath(dataDir, key));
    return (raw ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function save(dataDir: string, key: string, value: unknown): void {
  writeJSON(dataPath(dataDir, key), value);
}

/** Server-assigned ids only — never accept a client-provided id. */
export function generateFileImportEntityId(kind: "fimp" | "fiw" | "fia"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── Jobs ───────────────────────────────────────────────────────────────────
export function listJobs(dataDir: string, tenantId: string): FileImportJob[] {
  const all = load<Record<string, FileImportJob[]>>(dataDir, NATIVE_FILE_IMPORT_JOBS_KEY, {});
  return [...(all[tenantId] ?? [])].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}

export function getJob(dataDir: string, tenantId: string, jobId: string): FileImportJob | null {
  if (!tenantId?.trim() || !jobId?.trim()) return null;
  return listJobs(dataDir, tenantId).find((j) => j.id === jobId) ?? null;
}

export function saveJob(dataDir: string, job: FileImportJob): void {
  const all = load<Record<string, FileImportJob[]>>(dataDir, NATIVE_FILE_IMPORT_JOBS_KEY, {});
  const arr = all[job.tenantId] ?? [];
  const i = arr.findIndex((x) => x.id === job.id);
  if (i >= 0) arr[i] = job;
  else arr.push(job);
  all[job.tenantId] = arr;
  save(dataDir, NATIVE_FILE_IMPORT_JOBS_KEY, all);
}

/** Delete exactly ONE known job id owned by this tenant (+ its staged rows). */
export function deleteJobRecord(dataDir: string, tenantId: string, jobId: string): void {
  const all = load<Record<string, FileImportJob[]>>(dataDir, NATIVE_FILE_IMPORT_JOBS_KEY, {});
  const arr = all[tenantId];
  if (!arr) return;
  all[tenantId] = arr.filter((j) => j.id !== jobId);
  save(dataDir, NATIVE_FILE_IMPORT_JOBS_KEY, all);
  deleteRowsForJob(dataDir, tenantId, jobId);
}

// ── Staged rows (per tenant, per job) ──────────────────────────────────────
export function getRows(dataDir: string, tenantId: string, jobId: string): FileImportRow[] {
  const all = load<Record<string, Record<string, FileImportRow[]>>>(dataDir, NATIVE_FILE_IMPORT_ROWS_KEY, {});
  return all[tenantId]?.[jobId] ?? [];
}

export function saveRows(dataDir: string, tenantId: string, jobId: string, rows: FileImportRow[]): void {
  const all = load<Record<string, Record<string, FileImportRow[]>>>(dataDir, NATIVE_FILE_IMPORT_ROWS_KEY, {});
  const tenant = all[tenantId] ?? {};
  tenant[jobId] = rows;
  all[tenantId] = tenant;
  save(dataDir, NATIVE_FILE_IMPORT_ROWS_KEY, all);
}

export function deleteRowsForJob(dataDir: string, tenantId: string, jobId: string): void {
  const all = load<Record<string, Record<string, FileImportRow[]>>>(dataDir, NATIVE_FILE_IMPORT_ROWS_KEY, {});
  const tenant = all[tenantId];
  if (!tenant) return;
  delete tenant[jobId];
  all[tenantId] = tenant;
  save(dataDir, NATIVE_FILE_IMPORT_ROWS_KEY, all);
}

// ── Pending-write mirror (the ONE gated action: commit) ────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingFileImportWrite[] {
  const all = load<Record<string, PendingFileImportWrite[]>>(dataDir, NATIVE_FILE_IMPORT_PENDING_KEY, {});
  return [...(all[tenantId] ?? [])].sort((a, b) => (a.requestedAt > b.requestedAt ? 1 : -1));
}

export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingFileImportWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}

export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingFileImportWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}

export function getPendingWriteForJob(dataDir: string, tenantId: string, jobId: string): PendingFileImportWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.jobId === jobId && w.status === "pending") ?? null;
}

export function savePendingWrite(dataDir: string, write: PendingFileImportWrite): void {
  const all = load<Record<string, PendingFileImportWrite[]>>(dataDir, NATIVE_FILE_IMPORT_PENDING_KEY, {});
  const arr = all[write.tenantId] ?? [];
  const i = arr.findIndex((x) => x.id === write.id);
  if (i >= 0) arr[i] = write;
  else arr.push(write);
  all[write.tenantId] = arr;
  save(dataDir, NATIVE_FILE_IMPORT_PENDING_KEY, all);
}

export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  detail?: { appliedResult?: PendingFileImportWrite["appliedResult"]; error?: string },
): PendingFileImportWrite | null {
  const w = getPendingWriteById(dataDir, tenantId, id);
  if (!w) return null;
  w.status = status;
  if (detail?.appliedResult !== undefined) w.appliedResult = detail.appliedResult;
  if (detail?.error !== undefined) w.error = detail.error;
  savePendingWrite(dataDir, w);
  return w;
}

// ── Immutable audit ────────────────────────────────────────────────────────
export function appendAudit(dataDir: string, entry: Omit<NativeFileImportAuditEntry, "id" | "ts">): NativeFileImportAuditEntry {
  const all = load<Record<string, NativeFileImportAuditEntry[]>>(dataDir, NATIVE_FILE_IMPORT_AUDIT_KEY, {});
  const arr = all[entry.tenantId] ?? [];
  const record: NativeFileImportAuditEntry = { id: generateFileImportEntityId("fia"), ts: new Date().toISOString(), ...entry };
  arr.push(record);
  all[entry.tenantId] = arr;
  save(dataDir, NATIVE_FILE_IMPORT_AUDIT_KEY, all);
  return record;
}

export function listAudit(dataDir: string, tenantId: string): NativeFileImportAuditEntry[] {
  const all = load<Record<string, NativeFileImportAuditEntry[]>>(dataDir, NATIVE_FILE_IMPORT_AUDIT_KEY, {});
  return [...(all[tenantId] ?? [])].sort((a, b) => (a.ts > b.ts ? 1 : -1));
}
