/**
 * native/dealroom/store.ts — durable, tenant-keyed deal room store (Phase 2.4).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   map first — zero cross-tenant paths (a foreign deal room id resolves to
 *   null → fail-closed 404 upstream).
 * - Mutations are applied ONLY by the gated write path (gate.ts) or the
 *   idempotent pending-apply executor — the store never mutates on its own.
 * - Every mutation appends an IMMUTABLE native.dealroom.* audit entry.
 * - Share slugs live in a GLOBAL index mapping slug → tenantId ONLY (nothing
 *   else — no tenant data) — same discipline as native proposals (2.1).
 * - The deal room NEVER stores proposal PDF bytes or checklist progress — the
 *   PDF is read from the linked proposal's docId (Phase 1.2 add-only history)
 *   and progress is read from the linked checklist record (derived refs only).
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_DEALROOMS_KEY,
  NATIVE_DEALROOMS_AUDIT_KEY,
  NATIVE_DEALROOM_SLUGS_KEY,
  MAX_DEAL_ROOMS_PER_TENANT,
  MAX_DEAL_ROOM_NAME,
  MAX_CUSTOMER_NAME,
  MAX_CUSTOMER_EMAIL,
  MAX_DEAL_ROOM_DESC,
  type DealRoomMutation,
  type DealRoomRecord,
  type DealRoomStatus,
  type PendingDealRoomWrite,
} from "./types";

export interface NativeDealRoomAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.dealroom.<create|update|archive|delete|pending|apply>.*
  dealRoomId: string;
  detail: string;
}

interface TenantDealRoomState {
  dealRooms: DealRoomRecord[];
  pendingWrites: PendingDealRoomWrite[];
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantDealRoomState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_DEALROOMS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantDealRoomState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantDealRoomState>): void {
  writeJSON(dataPath(dataDir, NATIVE_DEALROOMS_KEY), state);
}
export function generateDealRoomEntityId(prefix: "dea" | "dlw"): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
export function generateDealRoomSlug(): string {
  // Randomized, unguessable public slug (no tenant data in the slug itself).
  return `dr_${Date.now().toString(36)}${randomBytes(9).toString("base64url")}`;
}

// ── Share-slug global index (slug → tenantId ONLY) ─────────────────────────
function loadSlugs(dataDir: string): Record<string, string> {
  const raw = readJSON(dataPath(dataDir, NATIVE_DEALROOM_SLUGS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}
function saveSlugs(dataDir: string, slugs: Record<string, string>): void {
  writeJSON(dataPath(dataDir, NATIVE_DEALROOM_SLUGS_KEY), slugs);
}
export function lookupDealRoomShareTenant(dataDir: string, slug: string): string | null {
  const t = loadSlugs(dataDir)[slug];
  return typeof t === "string" && t.length > 0 ? t : null;
}
export function registerDealRoomSlug(dataDir: string, slug: string, tenantId: string): void {
  const slugs = loadSlugs(dataDir);
  slugs[slug] = tenantId;
  saveSlugs(dataDir, slugs);
}
export function unregisterDealRoomSlug(dataDir: string, slug: string): void {
  const slugs = loadSlugs(dataDir);
  if (!(slug in slugs)) return;
  delete slugs[slug];
  saveSlugs(dataDir, slugs);
}

// ── Deal rooms ──────────────────────────────────────────────────────────────
export function listDealRooms(dataDir: string, tenantId: string): DealRoomRecord[] {
  return loadState(dataDir)[tenantId]?.dealRooms ?? [];
}
export function getDealRoom(dataDir: string, tenantId: string, dealRoomId: string): DealRoomRecord | null {
  return listDealRooms(dataDir, tenantId).find((d) => d.id === dealRoomId) ?? null;
}
export function getDealRoomBySlug(dataDir: string, tenantId: string, slug: string): DealRoomRecord | null {
  return listDealRooms(dataDir, tenantId).find((d) => d.shareSlug === slug) ?? null;
}
export function countDealRooms(dataDir: string, tenantId: string): number {
  return listDealRooms(dataDir, tenantId).length;
}
/** Hard-remove an existing deal room record (gated delete executor only). */
export function removeDealRoom(dataDir: string, tenantId: string, dealRoomId: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.dealRooms.findIndex((d) => d.id === dealRoomId) ?? -1;
  if (!tenant || idx < 0) return false;
  tenant.dealRooms.splice(idx, 1);
  saveState(dataDir, state);
  return true;
}
/** Insert a NEW deal room record (validated upstream; gated executor only). */
export function insertDealRoom(dataDir: string, record: DealRoomRecord): void {
  const state = loadState(dataDir);
  const tenant = state[record.tenantId] ?? { dealRooms: [], pendingWrites: [] };
  if (tenant.dealRooms.length >= MAX_DEAL_ROOMS_PER_TENANT) {
    throw new Error(`Deal room cap reached (${MAX_DEAL_ROOMS_PER_TENANT})`);
  }
  state[record.tenantId] = tenant;
  tenant.dealRooms.push(record);
  saveState(dataDir, state);
}

/**
 * Apply a validated mutation + status transition to an existing deal room.
 * Returns the updated record, or null when the deal room id is unknown (404).
 * The shareSlug is only set by the create executor — never via update.
 */
export function applyDealRoomMutation(
  dataDir: string,
  tenantId: string,
  dealRoomId: string,
  mutation: DealRoomMutation,
  nextStatus: DealRoomStatus | null,
  actor: string,
  extra?: { archivedAt?: string; archivedBy?: string },
): DealRoomRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.dealRooms.findIndex((d) => d.id === dealRoomId) ?? -1;
  if (!tenant || idx < 0) return null;
  const d = tenant.dealRooms[idx];
  const now = new Date().toISOString();
  const updated: DealRoomRecord = {
    ...d,
    ...(mutation.name !== undefined ? { name: mutation.name.trim().slice(0, MAX_DEAL_ROOM_NAME) } : {}),
    ...(mutation.customerName !== undefined ? { customerName: mutation.customerName.trim().slice(0, MAX_CUSTOMER_NAME) } : {}),
    ...(mutation.customerEmail !== undefined ? { customerEmail: mutation.customerEmail.trim().slice(0, MAX_CUSTOMER_EMAIL) } : {}),
    ...(mutation.description !== undefined ? { description: mutation.description.trim().slice(0, MAX_DEAL_ROOM_DESC) } : {}),
    ...(mutation.linkedProposalId !== undefined ? { linkedProposalId: mutation.linkedProposalId ?? d.linkedProposalId } : {}),
    ...(mutation.linkedChecklistId !== undefined ? { linkedChecklistId: mutation.linkedChecklistId ?? null } : {}),
    ...(nextStatus === "archived" ? { status: "archived" as const, archivedAt: extra?.archivedAt ?? now, archivedBy: extra?.archivedBy ?? actor } : {}),
    ...(nextStatus !== null && nextStatus !== "archived" ? { status: nextStatus } : {}),
    version: d.version + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  tenant.dealRooms[idx] = updated;
  saveState(dataDir, state);
  return updated;
}

// ── Pending writes (durable mirror of the approval card) ────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingDealRoomWrite[] {
  return loadState(dataDir)[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingDealRoomWrite): void {
  const state = loadState(dataDir);
  const tenant = state[w.tenantId] ?? { dealRooms: [], pendingWrites: [] };
  state[w.tenantId] = tenant;
  tenant.pendingWrites.push(w);
  saveState(dataDir, state);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingDealRoomWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingDealRoomWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  actor: string,
  result?: { status?: DealRoomStatus; dealRoomId?: string; error?: string },
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
    w.appliedResult = { status: result?.status ?? "draft", dealRoomId: result?.dealRoomId ?? "" };
  } else {
    w.status = "rejected";
    w.error = result?.error ?? "rejected by owner";
  }
  saveState(dataDir, state);
}

// ── Immutable audit (append-only, keyed by tenant) ──────────────────────────
function loadAudit(dataDir: string): NativeDealRoomAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_DEALROOMS_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeDealRoomAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeDealRoomAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({
    id: generateDealRoomEntityId("dlw"),
    ts: new Date().toISOString(),
    ...entry,
  });
  writeJSON(dataPath(dataDir, NATIVE_DEALROOMS_AUDIT_KEY), audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeDealRoomAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}