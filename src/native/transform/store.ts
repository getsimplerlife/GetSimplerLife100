/**
 * native/transform/store.ts — durable, tenant-keyed TRANSFORM store (3.5).
 * Transforms + runs + pending-write mirror + immutable native.transform.*
 * audit. Every read/write takes tenantId explicitly — zero cross-tenant paths.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  MAX_RUNS_PER_TENANT,
  NATIVE_TRANSFORM_AUDIT_KEY,
  NATIVE_TRANSFORM_KEY,
  NATIVE_TRANSFORM_PENDING_KEY,
  NATIVE_TRANSFORM_RUNS_KEY,
  type PendingTransformWrite,
  type TransformRecord,
  type TransformRun,
} from "./types";
export interface NativeTransformAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.transform.<...>.*
  transformId?: string;
  runId?: string;
  detail: string;
}
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
export function generateTransformEntityId(kind: "trf" | "trn" | "trw"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
// ── Transforms ──────────────────────────────────────────────────────────────
interface TransformIndex {
  transforms: TransformRecord[];
}
export function listTransforms(dataDir: string, tenantId: string): TransformRecord[] {
  return load<Record<string, TransformIndex>>(dataDir, NATIVE_TRANSFORM_KEY, {})[tenantId]?.transforms ?? [];
}
export function saveTransform(dataDir: string, t: TransformRecord): void {
  const all = load<Record<string, TransformIndex>>(dataDir, NATIVE_TRANSFORM_KEY, {});
  const idx = all[t.tenantId] ?? { transforms: [] };
  const i = idx.transforms.findIndex((x) => x.id === t.id);
  if (i >= 0) idx.transforms[i] = t;
  else idx.transforms.push(t);
  all[t.tenantId] = idx;
  save(dataDir, NATIVE_TRANSFORM_KEY, all);
}
export function getTransform(dataDir: string, tenantId: string, transformId: string): TransformRecord | null {
  return listTransforms(dataDir, tenantId).find((t) => t.id === transformId) ?? null;
}
export function deleteTransformRecord(dataDir: string, tenantId: string, transformId: string): void {
  const all = load<Record<string, TransformIndex>>(dataDir, NATIVE_TRANSFORM_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.transforms = idx.transforms.filter((t) => t.id !== transformId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_TRANSFORM_KEY, all);
}
// ── Runs ────────────────────────────────────────────────────────────────────
interface RunIndex {
  runs: TransformRun[];
}
export function listRuns(dataDir: string, tenantId: string, transformId?: string): TransformRun[] {
  const all = load<Record<string, RunIndex>>(dataDir, NATIVE_TRANSFORM_RUNS_KEY, {});
  const runs = all[tenantId]?.runs ?? [];
  return transformId ? runs.filter((r) => r.transformId === transformId) : runs;
}
export function getRun(dataDir: string, tenantId: string, runId: string): TransformRun | null {
  return listRuns(dataDir, tenantId).find((r) => r.id === runId) ?? null;
}
export function countRuns(dataDir: string, tenantId: string, transformId: string): number {
  return listRuns(dataDir, tenantId, transformId).length;
}
export function saveRun(dataDir: string, run: TransformRun): void {
  const all = load<Record<string, RunIndex>>(dataDir, NATIVE_TRANSFORM_RUNS_KEY, {});
  const idx = all[run.tenantId] ?? { runs: [] };
  const i = idx.runs.findIndex((x) => x.id === run.id);
  if (i >= 0) idx.runs[i] = run;
  else idx.runs.push(run);
  // retention trim (first-in evicted) — bounds the store per tenant
  while (idx.runs.length > MAX_RUNS_PER_TENANT) idx.runs.shift();
  all[run.tenantId] = idx;
  save(dataDir, NATIVE_TRANSFORM_RUNS_KEY, all);
}
// ── Pending writes (durable mirror of the approval card) ────────────────────
interface PendingIndex {
  pendingWrites: PendingTransformWrite[];
}
export function listPendingWrites(dataDir: string, tenantId: string): PendingTransformWrite[] {
  return load<Record<string, PendingIndex>>(dataDir, NATIVE_TRANSFORM_PENDING_KEY, {})[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingTransformWrite): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_TRANSFORM_PENDING_KEY, {});
  const idx = all[w.tenantId] ?? { pendingWrites: [] };
  idx.pendingWrites.push(w);
  all[w.tenantId] = idx;
  save(dataDir, NATIVE_TRANSFORM_PENDING_KEY, all);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingTransformWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingTransformWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  result?: { transformId?: string; runId?: string; error?: string },
): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_TRANSFORM_PENDING_KEY, {});
  const idx = all[tenantId];
  const w = idx?.pendingWrites.find((x) => x.id === id);
  if (!idx || !w || w.status !== "pending") return; // idempotent
  w.status = status;
  if (status === "applied") w.appliedResult = { transformId: result?.transformId, runId: result?.runId };
  else w.error = result?.error ?? "rejected by owner";
  all[tenantId] = idx;
  save(dataDir, NATIVE_TRANSFORM_PENDING_KEY, all);
}
// ── Immutable audit (append-only) ───────────────────────────────────────────
function loadAudit(dataDir: string): NativeTransformAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_TRANSFORM_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeTransformAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeTransformAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({ id: generateTransformEntityId("trw"), ts: new Date().toISOString(), ...entry });
  save(dataDir, NATIVE_TRANSFORM_AUDIT_KEY, audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeTransformAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}