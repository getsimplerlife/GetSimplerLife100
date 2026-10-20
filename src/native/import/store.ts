/**
 * native/import/store.ts — Phase 5.1 (6.1) native IMPORT / MIGRATION slice.
 * Tenant-keyed JSON stores (structural `{ [tenantId]: ... }`), mirroring every
 * native slice: zero cross-tenant paths; foreign/stranger ids fail closed at
 * the callers. Server-assigned ids only — clients never supply ids.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_IMPORT_JOBS_KEY,
  NATIVE_IMPORT_STAGING_KEY,
  NATIVE_IMPORT_PENDING_KEY,
  NATIVE_IMPORT_RUNS_KEY,
  NATIVE_IMPORT_AUDIT_KEY,
  type ImportJob,
  type ImportStaging,
  type ImportRun,
  type NativeImportAuditEntry,
  type PendingImportWrite,
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
export function generateImportEntityId(kind: "imp" | "imw" | "imr" | "ima"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
// ── Import jobs ─────────────────────────────────────────────────────────────
interface JobIndex {
  jobs: ImportJob[];
}
export function listJobs(dataDir: string, tenantId: string): ImportJob[] {
  return [...(load<Record<string, JobIndex>>(dataDir, NATIVE_IMPORT_JOBS_KEY, {})[tenantId]?.jobs ?? [])].sort((a, b) =>
    a.createdAt > b.createdAt ? 1 : -1,
  );
}
export function getJob(dataDir: string, tenantId: string, importId: string): ImportJob | null {
  return listJobs(dataDir, tenantId).find((j) => j.id === importId) ?? null;
}
export function saveJob(dataDir: string, job: ImportJob): void {
  const all = load<Record<string, JobIndex>>(dataDir, NATIVE_IMPORT_JOBS_KEY, {});
  const idx = all[job.tenantId] ?? { jobs: [] };
  const i = idx.jobs.findIndex((x) => x.id === job.id);
  if (i >= 0) idx.jobs[i] = job;
  else idx.jobs.push(job);
  all[job.tenantId] = idx;
  save(dataDir, NATIVE_IMPORT_JOBS_KEY, all);
}
export function deleteJobRecord(dataDir: string, tenantId: string, importId: string): void {
  const all = load<Record<string, JobIndex>>(dataDir, NATIVE_IMPORT_JOBS_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.jobs = idx.jobs.filter((x) => x.id !== importId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_IMPORT_JOBS_KEY, all);
  deleteStagingForJob(dataDir, tenantId, importId);
}
// ── Staging ─────────────────────────────────────────────────────────────────
interface StagingIndex {
  staging: ImportStaging[];
}
export function listStaging(dataDir: string, tenantId: string): ImportStaging[] {
  return load<Record<string, StagingIndex>>(dataDir, NATIVE_IMPORT_STAGING_KEY, {})[tenantId]?.staging ?? [];
}
export function getStaging(dataDir: string, tenantId: string, importId: string): ImportStaging | null {
  return listStaging(dataDir, tenantId).find((s) => s.importId === importId) ?? null;
}
export function saveStaging(dataDir: string, staging: ImportStaging): void {
  const all = load<Record<string, StagingIndex>>(dataDir, NATIVE_IMPORT_STAGING_KEY, {});
  const idx = all[staging.tenantId] ?? { staging: [] };
  const i = idx.staging.findIndex((x) => x.importId === staging.importId);
  if (i >= 0) idx.staging[i] = staging;
  else idx.staging.push(staging);
  all[staging.tenantId] = idx;
  save(dataDir, NATIVE_IMPORT_STAGING_KEY, all);
}
export function deleteStagingForJob(dataDir: string, tenantId: string, importId: string): void {
  const all = load<Record<string, StagingIndex>>(dataDir, NATIVE_IMPORT_STAGING_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.staging = idx.staging.filter((x) => x.importId !== importId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_IMPORT_STAGING_KEY, all);
}
// ── Pending-write mirror ────────────────────────────────────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingImportWrite[] {
  return [...(load<Record<string, PendingImportWrite[]>>(dataDir, NATIVE_IMPORT_PENDING_KEY, {})[tenantId] ?? [])].sort((a, b) =>
    a.requestedAt > b.requestedAt ? 1 : -1,
  );
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingImportWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingImportWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function savePendingWrite(dataDir: string, write: PendingImportWrite): void {
  const all = load<Record<string, PendingImportWrite[]>>(dataDir, NATIVE_IMPORT_PENDING_KEY, {});
  const arr = all[write.tenantId] ?? [];
  const i = arr.findIndex((x) => x.id === write.id);
  if (i >= 0) arr[i] = write;
  else arr.push(write);
  all[write.tenantId] = arr;
  save(dataDir, NATIVE_IMPORT_PENDING_KEY, all);
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  detail?: { appliedResult?: PendingImportWrite["appliedResult"]; error?: string },
): PendingImportWrite | null {
  const w = getPendingWriteById(dataDir, tenantId, id);
  if (!w) return null;
  w.status = status;
  if (detail?.appliedResult !== undefined) w.appliedResult = detail.appliedResult;
  if (detail?.error !== undefined) w.error = detail.error;
  savePendingWrite(dataDir, w);
  return w;
}
// ── Runs ledger ─────────────────────────────────────────────────────────────
export function listRuns(dataDir: string, tenantId: string, importId?: string): ImportRun[] {
  const runs = load<Record<string, ImportRun[]>>(dataDir, NATIVE_IMPORT_RUNS_KEY, {})[tenantId] ?? [];
  const filtered = importId ? runs.filter((r) => r.importId === importId) : runs;
  return [...filtered].sort((a, b) => (a.at > b.at ? 1 : -1));
}
export function appendRun(dataDir: string, run: ImportRun): void {
  const all = load<Record<string, ImportRun[]>>(dataDir, NATIVE_IMPORT_RUNS_KEY, {});
  const arr = all[run.tenantId] ?? [];
  arr.push(run);
  all[run.tenantId] = arr;
  save(dataDir, NATIVE_IMPORT_RUNS_KEY, all);
}
// ── Audit ───────────────────────────────────────────────────────────────────
export function appendAudit(dataDir: string, entry: Omit<NativeImportAuditEntry, "id" | "ts">): void {
  const all = load<Record<string, NativeImportAuditEntry[]>>(dataDir, NATIVE_IMPORT_AUDIT_KEY, {});
  const arr = all[entry.tenantId] ?? [];
  arr.push({ id: generateImportEntityId("ima"), ts: new Date().toISOString(), ...entry });
  all[entry.tenantId] = arr;
  save(dataDir, NATIVE_IMPORT_AUDIT_KEY, all);
}
export function listAudit(dataDir: string, tenantId: string): NativeImportAuditEntry[] {
  return [...(load<Record<string, NativeImportAuditEntry[]>>(dataDir, NATIVE_IMPORT_AUDIT_KEY, {})[tenantId] ?? [])].sort((a, b) =>
    a.ts > b.ts ? 1 : -1,
  );
}