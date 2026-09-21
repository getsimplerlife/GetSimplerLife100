/**
 * native/checklists/store.ts — durable, tenant-keyed checklist store (Phase 2.3).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   map first — zero cross-tenant paths (a foreign checklist id resolves to
 *   null → fail-closed 404 upstream).
 * - Mutations are applied ONLY by the gated write path (gate.ts) or the
 *   idempotent pending-apply executor — the store never mutates on its own.
 * - Every mutation appends an IMMUTABLE native.checklist.* audit entry.
 * - Progress is recomputed from the item set on every write (single source of
 *   truth is the items array; the record never stores derived state it can drift).
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_CHECKLISTS_KEY,
  NATIVE_CHECKLISTS_AUDIT_KEY,
  MAX_CHECKLISTS_PER_TENANT,
  type ChecklistItem,
  type ChecklistItemInput,
  type ChecklistMutation,
  type ChecklistRecord,
  type ChecklistStatus,
  type PendingChecklistWrite,
} from "./types";

export interface NativeChecklistAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.checklist.<create|update|close|delete|pending|apply>.*
  checklistId: string;
  detail: string;
}

interface TenantChecklistState {
  checklists: ChecklistRecord[];
  pendingWrites: PendingChecklistWrite[];
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantChecklistState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_CHECKLISTS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantChecklistState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantChecklistState>): void {
  writeJSON(dataPath(dataDir, NATIVE_CHECKLISTS_KEY), state);
}
export function generateChecklistEntityId(prefix: "chk" | "clw" | "cli"): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── Checklists ──────────────────────────────────────────────────────────────
export function listChecklists(dataDir: string, tenantId: string): ChecklistRecord[] {
  return loadState(dataDir)[tenantId]?.checklists ?? [];
}
export function getChecklist(dataDir: string, tenantId: string, checklistId: string): ChecklistRecord | null {
  return listChecklists(dataDir, tenantId).find((c) => c.id === checklistId) ?? null;
}
export function countChecklists(dataDir: string, tenantId: string): number {
  return listChecklists(dataDir, tenantId).length;
}
/** Hard-remove an existing checklist record (gated delete executor only). */
export function removeChecklist(dataDir: string, tenantId: string, checklistId: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.checklists.findIndex((c) => c.id === checklistId) ?? -1;
  if (!tenant || idx < 0) return false;
  tenant.checklists.splice(idx, 1);
  saveState(dataDir, state);
  return true;
}
/** Insert a NEW checklist record (validated upstream; gated executor only). */
export function insertChecklist(dataDir: string, record: ChecklistRecord): void {
  const state = loadState(dataDir);
  const tenant = state[record.tenantId] ?? { checklists: [], pendingWrites: [] };
  if (tenant.checklists.length >= MAX_CHECKLISTS_PER_TENANT) {
    throw new Error(`Checklist cap reached (${MAX_CHECKLISTS_PER_TENANT})`);
  }
  state[record.tenantId] = tenant;
  tenant.checklists.push(record);
  saveState(dataDir, state);
}

export function computeProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.status === "done").length, total: items.length };
}

/**
 * Apply a validated mutation + status transition to an existing checklist.
 * Returns the updated record, or null when the checklist id is unknown (404).
 * Item semantics:
 *   - items referencing an EXISTING cli_ id update that item in place (its
 *     title/status/assignee replace in position, id preserved);
 *   - items WITHOUT an id are NEW (a server-assigned id was given by
 *     normalizeItems at validate time);
 *   - any existing item NOT present in the incoming set is dropped when the
 *     set is fully supplied (explicit item-set replacement — the gate enforces
 *     that no incoming id is forged).
 */
export function applyChecklistMutation(
  dataDir: string,
  tenantId: string,
  checklistId: string,
  mutation: ChecklistMutation,
  nextStatus: ChecklistStatus | null,
  actor: string,
  extra?: { closedAt?: string; closedBy?: string },
): ChecklistRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.checklists.findIndex((c) => c.id === checklistId) ?? -1;
  if (!tenant || idx < 0) return null;
  const c = tenant.checklists[idx];
  const now = new Date().toISOString();
  let items = c.items;
  if (mutation.items !== undefined) {
    const incoming = mutation.items;
    const byId = new Map(c.items.map((i) => [i.id, i]));
    const next: ChecklistItem[] = [];
    for (const it of incoming as ChecklistItemInput[]) {
      if (it.id && byId.has(it.id)) {
        const prev = byId.get(it.id)!;
        next.push({
          ...prev,
          title: it.title,
          status: it.status,
          ...(it.assignee !== undefined ? { assignee: it.assignee } : {}),
          ...(prev.status !== "done" && it.status === "done" ? { completedAt: now, completedBy: actor } : {}),
          ...(it.status !== "done" ? { completedAt: undefined, completedBy: undefined } : {}),
        });
      } else {
        next.push({
          id: it.id!, // server-assigned by normalizeItems
          title: it.title,
          status: it.status,
          ...(it.assignee !== undefined ? { assignee: it.assignee } : {}),
          ...(it.status === "done" ? { completedAt: now, completedBy: actor } : {}),
        });
      }
    }
    items = next;
  }
  const updated: ChecklistRecord = {
    ...c,
    ...(mutation.name !== undefined ? { name: mutation.name.trim().slice(0, 200) } : {}),
    ...(mutation.description !== undefined ? { description: mutation.description.trim().slice(0, 2000) } : {}),
    ...(mutation.kind !== undefined ? { kind: mutation.kind } : {}),
    ...(mutation.linkedProposalId !== undefined ? { linkedProposalId: mutation.linkedProposalId ?? null } : {}),
    items,
    progress: computeProgress(items),
    ...(nextStatus === "closed" ? { status: "closed" as const, closedAt: extra?.closedAt ?? now, closedBy: extra?.closedBy ?? actor } : {}),
    version: c.version + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  tenant.checklists[idx] = updated;
  saveState(dataDir, state);
  return updated;
}

// ── Pending writes (durable mirror of the approval card) ────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingChecklistWrite[] {
  return loadState(dataDir)[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingChecklistWrite): void {
  const state = loadState(dataDir);
  const tenant = state[w.tenantId] ?? { checklists: [], pendingWrites: [] };
  state[w.tenantId] = tenant;
  tenant.pendingWrites.push(w);
  saveState(dataDir, state);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingChecklistWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingChecklistWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  actor: string,
  result?: { status?: ChecklistRecord["status"]; checklistId?: string; error?: string },
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
    w.appliedResult = { status: result?.status ?? "open", checklistId: result?.checklistId ?? "" };
  } else {
    w.status = "rejected";
    w.error = result?.error ?? "rejected by owner";
  }
  saveState(dataDir, state);
}

// ── Immutable audit (append-only, keyed by tenant) ──────────────────────────
function loadAudit(dataDir: string): NativeChecklistAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_CHECKLISTS_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeChecklistAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeChecklistAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({
    id: generateChecklistEntityId("clw"),
    ts: new Date().toISOString(),
    ...entry,
  });
  writeJSON(dataPath(dataDir, NATIVE_CHECKLISTS_AUDIT_KEY), audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeChecklistAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}