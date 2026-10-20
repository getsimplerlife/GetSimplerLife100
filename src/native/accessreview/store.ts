/**
 * native/accessreview/store.ts — durable, tenant-keyed ACCESS-REVIEW store
 * (Phase 4.3). Campaigns / review items / append-only evidence / durable
 * pending-write mirror + immutable native.accessreview.* audit. Every
 * read/write takes tenantId explicitly — zero cross-tenant paths (a foreign
 * entity id resolves to null → fail-closed 404 upstream).
 *
 * The slice NEVER mutates the tenant's 1.4 member rows or 3.7 workflow rules
 * — it only READS them (via ../tables/store + ../automation/store) and keeps
 * ALL of its own state here.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_ACCESSREVIEW_CAMPAIGNS_KEY,
  NATIVE_ACCESSREVIEW_ITEMS_KEY,
  NATIVE_ACCESSREVIEW_EVIDENCE_KEY,
  NATIVE_ACCESSREVIEW_PENDING_KEY,
  NATIVE_ACCESSREVIEW_AUDIT_KEY,
  type EvidenceEntry,
  type NativeAccessReviewAuditEntry,
  type PendingAccessReviewWrite,
  type ReviewCampaign,
  type ReviewItem,
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
export function generateAccessReviewEntityId(kind: "arc" | "ari" | "aev" | "apw" | "aau"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── Campaigns ───────────────────────────────────────────────────────────────
interface CampaignIndex {
  campaigns: ReviewCampaign[];
}
export function listCampaigns(dataDir: string, tenantId: string): ReviewCampaign[] {
  return load<Record<string, CampaignIndex>>(dataDir, NATIVE_ACCESSREVIEW_CAMPAIGNS_KEY, {})[tenantId]?.campaigns ?? [];
}
export function getCampaign(dataDir: string, tenantId: string, campaignId: string): ReviewCampaign | null {
  return listCampaigns(dataDir, tenantId).find((c) => c.id === campaignId) ?? null;
}
export function saveCampaign(dataDir: string, c: ReviewCampaign): void {
  const all = load<Record<string, CampaignIndex>>(dataDir, NATIVE_ACCESSREVIEW_CAMPAIGNS_KEY, {});
  const idx = all[c.tenantId] ?? { campaigns: [] };
  const i = idx.campaigns.findIndex((x) => x.id === c.id);
  if (i >= 0) idx.campaigns[i] = c;
  else idx.campaigns.push(c);
  all[c.tenantId] = idx;
  save(dataDir, NATIVE_ACCESSREVIEW_CAMPAIGNS_KEY, all);
}
export function deleteCampaignRecord(dataDir: string, tenantId: string, campaignId: string): void {
  const all = load<Record<string, CampaignIndex>>(dataDir, NATIVE_ACCESSREVIEW_CAMPAIGNS_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.campaigns = idx.campaigns.filter((x) => x.id !== campaignId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_ACCESSREVIEW_CAMPAIGNS_KEY, all);
}

// ── Review items ────────────────────────────────────────────────────────────
interface ItemIndex {
  items: ReviewItem[];
}
export function listItems(dataDir: string, tenantId: string, campaignId?: string): ReviewItem[] {
  const all = load<Record<string, ItemIndex>>(dataDir, NATIVE_ACCESSREVIEW_ITEMS_KEY, {})[tenantId]?.items ?? [];
  const scoped = campaignId ? all.filter((i) => i.campaignId === campaignId) : all;
  return [...scoped].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}
export function getItem(dataDir: string, tenantId: string, itemId: string): ReviewItem | null {
  return listItems(dataDir, tenantId).find((i) => i.id === itemId) ?? null;
}
export function saveItem(dataDir: string, i: ReviewItem): void {
  const all = load<Record<string, ItemIndex>>(dataDir, NATIVE_ACCESSREVIEW_ITEMS_KEY, {});
  const idx = all[i.tenantId] ?? { items: [] };
  const n = idx.items.findIndex((x) => x.id === i.id);
  if (n >= 0) idx.items[n] = i;
  else idx.items.push(i);
  all[i.tenantId] = idx;
  save(dataDir, NATIVE_ACCESSREVIEW_ITEMS_KEY, all);
}
/** Snapshotted items for a campaign are never deleted (evidence durability). */
export function countItemsForCampaign(dataDir: string, tenantId: string, campaignId: string): number {
  return listItems(dataDir, tenantId, campaignId).length;
}
export function countPendingItems(dataDir: string, tenantId: string, campaignId: string): number {
  return listItems(dataDir, tenantId, campaignId).filter((i) => i.status === "pending").length;
}

// ── Evidence (append-only) ──────────────────────────────────────────────────
interface EvidenceIndex {
  evidence: EvidenceEntry[];
}
export function listEvidence(dataDir: string, tenantId: string, campaignId?: string): EvidenceEntry[] {
  const all = load<Record<string, EvidenceIndex>>(dataDir, NATIVE_ACCESSREVIEW_EVIDENCE_KEY, {})[tenantId]?.evidence ?? [];
  const scoped = campaignId ? all.filter((e) => e.campaignId === campaignId) : all;
  return [...scoped].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}
export function getEvidence(dataDir: string, tenantId: string, evidenceId: string): EvidenceEntry | null {
  return listEvidence(dataDir, tenantId).find((e) => e.id === evidenceId) ?? null;
}
export function appendEvidence(dataDir: string, e: EvidenceEntry): void {
  const all = load<Record<string, EvidenceIndex>>(dataDir, NATIVE_ACCESSREVIEW_EVIDENCE_KEY, {});
  const idx = all[e.tenantId] ?? { evidence: [] };
  idx.evidence.push(e);
  all[e.tenantId] = idx;
  save(dataDir, NATIVE_ACCESSREVIEW_EVIDENCE_KEY, all);
}
export function countEvidence(dataDir: string, tenantId: string): number {
  return listEvidence(dataDir, tenantId).length;
}

// ── Pending writes (durable mirror of the approval card) ───────────────────
interface PendingIndex {
  pendingWrites: PendingAccessReviewWrite[];
}
export function listPendingWrites(dataDir: string, tenantId: string): PendingAccessReviewWrite[] {
  return load<Record<string, PendingIndex>>(dataDir, NATIVE_ACCESSREVIEW_PENDING_KEY, {})[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingAccessReviewWrite): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_ACCESSREVIEW_PENDING_KEY, {});
  const idx = all[w.tenantId] ?? { pendingWrites: [] };
  idx.pendingWrites.push(w);
  all[w.tenantId] = idx;
  save(dataDir, NATIVE_ACCESSREVIEW_PENDING_KEY, all);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingAccessReviewWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingAccessReviewWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  result?: { appliedResult?: Record<string, unknown>; error?: string },
): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_ACCESSREVIEW_PENDING_KEY, {});
  const idx = all[tenantId];
  const w = idx?.pendingWrites.find((x) => x.id === id);
  if (!idx || !w || w.status !== "pending") return; // idempotent
  w.status = status;
  if (status === "applied") w.appliedResult = result?.appliedResult;
  else w.error = result?.error ?? "rejected by owner";
  all[tenantId] = idx;
  save(dataDir, NATIVE_ACCESSREVIEW_PENDING_KEY, all);
}

// ── Immutable audit (append-only) ───────────────────────────────────────────
function loadAudit(dataDir: string): NativeAccessReviewAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_ACCESSREVIEW_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeAccessReviewAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeAccessReviewAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({ id: generateAccessReviewEntityId("aau"), ts: new Date().toISOString(), ...entry });
  save(dataDir, NATIVE_ACCESSREVIEW_AUDIT_KEY, audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeAccessReviewAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}