/**
 * native/proposals/store.ts — durable, tenant-keyed proposal store (Phase 2.1).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   map first — zero cross-tenant paths (a foreign proposal id resolves to
 *   null → fail-closed 404 upstream).
 * - Mutations are applied ONLY by the gated write path (gate.ts) or the
 *   idempotent pending-apply executor — the store never mutates records on
 *   its own.
 * - Proposal DELETE is exact-id ONLY (no globs, no cascades) and removes the
 *   proposal's share-slug index entry.
 * - Every mutation appends an IMMUTABLE native.proposal.* audit entry (the
 *   audit file is append-only via read-modify-write; entries carry actor,
 *   action and a detail string).
 * - Share slugs live in a GLOBAL index mapping slug → tenantId ONLY (nothing
 *   else — no tenant data) — same discipline as native forms (1.3).
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_PROPOSALS_KEY,
  NATIVE_PROPOSALS_AUDIT_KEY,
  NATIVE_PROPOSAL_SLUGS_KEY,
  MAX_PROPOSALS_PER_TENANT,
  type ProposalRecord,
  type PendingProposalWrite,
  type ProposalStatus,
  type ProposalMutation,
  type ProposalLineItem,
} from "./types";

export interface NativeProposalAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.proposal.<create|update|open|approve|reject|send|delete|pending|apply>.*
  proposalId: string;
  detail: string;
}

interface TenantProposalState {
  proposals: ProposalRecord[];
  pendingWrites: PendingProposalWrite[];
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantProposalState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_PROPOSALS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantProposalState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantProposalState>): void {
  writeJSON(dataPath(dataDir, NATIVE_PROPOSALS_KEY), state);
}
export function generateProposalEntityId(prefix: "prop" | "ppw"): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
export function generateShareSlug(): string {
  // Randomized, unguessable public slug (no tenant data in the slug itself).
  return `sp_${Date.now().toString(36)}${randomBytes(9).toString("base64url")}`;
}

// ── Share-slug global index (slug → tenantId ONLY) ─────────────────────────
function loadSlugs(dataDir: string): Record<string, string> {
  const raw = readJSON(dataPath(dataDir, NATIVE_PROPOSAL_SLUGS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}
function saveSlugs(dataDir: string, slugs: Record<string, string>): void {
  writeJSON(dataPath(dataDir, NATIVE_PROPOSAL_SLUGS_KEY), slugs);
}
export function lookupShareTenant(dataDir: string, slug: string): string | null {
  const t = loadSlugs(dataDir)[slug];
  return typeof t === "string" && t.length > 0 ? t : null;
}
export function registerSlug(dataDir: string, slug: string, tenantId: string): void {
  const slugs = loadSlugs(dataDir);
  slugs[slug] = tenantId;
  saveSlugs(dataDir, slugs);
}
export function unregisterSlug(dataDir: string, slug: string): void {
  const slugs = loadSlugs(dataDir);
  if (!(slug in slugs)) return;
  delete slugs[slug];
  saveSlugs(dataDir, slugs);
}

// ── Proposals ───────────────────────────────────────────────────────────────
export function listProposals(dataDir: string, tenantId: string): ProposalRecord[] {
  return loadState(dataDir)[tenantId]?.proposals ?? [];
}
export function getProposal(dataDir: string, tenantId: string, proposalId: string): ProposalRecord | null {
  return listProposals(dataDir, tenantId).find((p) => p.id === proposalId) ?? null;
}
export function getProposalBySlug(dataDir: string, tenantId: string, slug: string): ProposalRecord | null {
  return listProposals(dataDir, tenantId).find((p) => p.shareSlug === slug) ?? null;
}
/** Hard-remove an existing proposal record (gated delete executor only). */
export function removeProposal(dataDir: string, tenantId: string, proposalId: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.proposals.findIndex((p) => p.id === proposalId) ?? -1;
  if (!tenant || idx < 0) return false;
  tenant.proposals.splice(idx, 1);
  saveState(dataDir, state);
  return true;
}
export function countProposals(dataDir: string, tenantId: string): number {
  return listProposals(dataDir, tenantId).length;
}
/** Insert a NEW proposal record (validated upstream; gated executor only). */
export function insertProposal(dataDir: string, record: ProposalRecord): void {
  const state = loadState(dataDir);
  const tenant = state[record.tenantId] ?? { proposals: [], pendingWrites: [] };
  if (tenant.proposals.length >= MAX_PROPOSALS_PER_TENANT) {
    throw new Error(`Proposal cap reached (${MAX_PROPOSALS_PER_TENANT})`);
  }
  state[record.tenantId] = tenant;
  tenant.proposals.push(record);
  saveState(dataDir, state);
}
/**
 * Apply a validated mutation + status transition to an existing proposal.
 * Returns the updated record, or null when the proposal id is unknown (404).
 * Does NOT audit or gate — the executor handles that.
 */
export function applyProposalMutation(
  dataDir: string,
  tenantId: string,
  proposalId: string,
  mutation: ProposalMutation,
  nextStatus: ProposalStatus | null,
  actor: string,
  extra?: { shareSlug?: string; docId?: string | null; signerName?: string },
): ProposalRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.proposals.findIndex((p) => p.id === proposalId) ?? -1;
  if (!tenant || idx < 0) return null;
  const p = tenant.proposals[idx];
  const now = new Date().toISOString();
  const updated: ProposalRecord = {
    ...p,
    ...(mutation.title !== undefined ? { title: mutation.title.trim().slice(0, 120) } : {}),
    ...(mutation.clientName !== undefined ? { clientName: mutation.clientName.trim().slice(0, 120) } : {}),
    ...(mutation.clientEmail !== undefined ? { clientEmail: mutation.clientEmail.trim().slice(0, 200) } : {}),
    ...(mutation.clientCompany !== undefined ? { clientCompany: mutation.clientCompany.trim().slice(0, 200) } : {}),
    ...(mutation.currency !== undefined ? { currency: mutation.currency.trim().toUpperCase() } : {}),
    ...(mutation.terms !== undefined ? { terms: mutation.terms.slice(0, 4000) } : {}),
    ...(mutation.validityDays !== undefined ? { validityDays: mutation.validityDays } : {}),
    ...(mutation.lineItems !== undefined ? { lineItems: mutation.lineItems as ProposalLineItem[] } : {}),
    ...(extra?.shareSlug !== undefined ? { shareSlug: extra.shareSlug } : {}),
    ...(extra?.docId !== undefined ? { docId: extra.docId } : {}),
    ...(nextStatus !== null ? applyStatusMeta(nextStatus, actor) : {}),
    version: p.version + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  tenant.proposals[idx] = updated;
  saveState(dataDir, state);
  return updated;
}
function applyStatusMeta(next: ProposalStatus, actor: string): Partial<ProposalRecord> {
  const now = new Date().toISOString();
  switch (next) {
    case "approved":
      return { status: "approved", approvedAt: now, approvedBy: actor, rejectedAt: undefined, rejectedBy: undefined };
    case "rejected":
      return { status: "rejected", rejectedAt: now, rejectedBy: actor, approvedAt: undefined, approvedBy: undefined };
    case "sent":
      return { status: "sent", sentAt: now, sentBy: actor };
    default:
      return { status: next };
  }
}

// ── Pending writes (durable mirror of the approval card) ────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingProposalWrite[] {
  return loadState(dataDir)[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingProposalWrite): void {
  const state = loadState(dataDir);
  const tenant = state[w.tenantId] ?? { proposals: [], pendingWrites: [] };
  state[w.tenantId] = tenant;
  tenant.pendingWrites.push(w);
  saveState(dataDir, state);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingProposalWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingProposalWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  actor: string,
  result?: { status?: ProposalStatus; proposalId?: string; docId?: string | null; error?: string },
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
    w.appliedResult = { status: result?.status ?? "draft", proposalId: result?.proposalId ?? "", docId: result?.docId ?? null };
  } else {
    w.status = "rejected";
    w.error = result?.error ?? "rejected by owner";
  }
  saveState(dataDir, state);
}

// ── Immutable audit (append-only, keyed by tenant) ──────────────────────────
function loadAudit(dataDir: string): NativeProposalAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_PROPOSALS_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeProposalAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeProposalAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({
    id: generateProposalEntityId("ppw"),
    ts: new Date().toISOString(),
    ...entry,
  });
  writeJSON(dataPath(dataDir, NATIVE_PROPOSALS_AUDIT_KEY), audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeProposalAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}