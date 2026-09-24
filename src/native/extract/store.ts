/**
 * native/extract/store.ts — durable, tenant-keyed EXTRACT store (Phase 3.3).
 *
 * - The extraction DRAFTS live in the 5b extraction-store (vault_extractions)
 *   — reused as-is (tenant-scoped by tenantVaultKey, `ext_` ids). This store
 *   holds only the Phase 3.3 slice's own durable state: the pending-write
 *   mirror + the immutable native.extract.* audit.
 * - Every read/write takes tenantId explicitly — zero cross-tenant paths.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import { NATIVE_EXTRACT_PENDING_KEY, NATIVE_EXTRACT_AUDIT_KEY, type PendingExtractWrite } from "./types";

export interface NativeExtractAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.extract.<...>.*
  documentId?: string;
  resultId?: string;
  detail: string;
}

interface TenantExtractState {
  pendingWrites: PendingExtractWrite[];
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantExtractState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_EXTRACT_PENDING_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantExtractState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantExtractState>): void {
  writeJSON(dataPath(dataDir, NATIVE_EXTRACT_PENDING_KEY), state);
}
export function generateExtractEntityId(): string {
  return `xew_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── Pending writes (durable mirror of the approval card) ────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingExtractWrite[] {
  return loadState(dataDir)[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingExtractWrite): void {
  const state = loadState(dataDir);
  const tenant = state[w.tenantId] ?? { pendingWrites: [] };
  state[w.tenantId] = tenant;
  tenant.pendingWrites.push(w);
  saveState(dataDir, state);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingExtractWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingExtractWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  actor: string,
  result?: { status?: string; resultId?: string; category?: string; requiresReview?: boolean; error?: string },
): void {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const w = tenant?.pendingWrites.find((x) => x.id === id);
  if (!tenant || !w || w.status !== "pending") return; // idempotent
  const now = new Date().toISOString();
  if (status === "applied") {
    w.status = "applied";
    w.appliedAt = now;
    w.appliedBy = actor;
    w.appliedResult = { status: result?.status ?? "applied", resultId: result?.resultId, category: result?.category, requiresReview: result?.requiresReview };
  } else {
    w.status = "rejected";
    w.error = result?.error ?? "rejected by owner";
  }
  saveState(dataDir, state);
}

// ── Immutable audit (append-only, keyed by tenant) ──────────────────────────
function loadAudit(dataDir: string): NativeExtractAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_EXTRACT_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeExtractAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeExtractAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({
    id: generateExtractEntityId(),
    ts: new Date().toISOString(),
    ...entry,
  });
  writeJSON(dataPath(dataDir, NATIVE_EXTRACT_AUDIT_KEY), audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeExtractAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}