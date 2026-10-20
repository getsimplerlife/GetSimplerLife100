/**
 * native/dedupe/store.ts — durable, tenant-keyed DEDUPE/MDM store
 * (Phase 4.2). Match rules / quality rules / scan runs / merge suggestions /
 * record identities + durable pending-write mirror + immutable native.dedupe.*
 * audit. Every read/write takes tenantId explicitly — zero cross-tenant paths
 * (a foreign entity id resolves to null → fail-closed 404 upstream).
 *
 * The slice NEVER writes to the 1.4 tables store — it only READS the tenant's
 * own rows (via ../tables/store) and keeps ALL of its own state here.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_DEDUPE_MATCH_RULES_KEY,
  NATIVE_DEDUPE_QUALITY_RULES_KEY,
  NATIVE_DEDUPE_RUNS_KEY,
  NATIVE_DEDUPE_SUGGESTIONS_KEY,
  NATIVE_DEDUPE_IDENTITIES_KEY,
  NATIVE_DEDUPE_PENDING_KEY,
  NATIVE_DEDUPE_AUDIT_KEY,
  type DedupeRun,
  type MatchRule,
  type MergeSuggestion,
  type NativeDedupeAuditEntry,
  type PendingDedupeWrite,
  type QualityRule,
  type RecordIdentity,
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
export function generateDedupeEntityId(kind: "mru" | "qru" | "sug" | "drn" | "gem" | "dpw" | "dev"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── Match rules ─────────────────────────────────────────────────────────────
interface MatchRuleIndex {
  rules: MatchRule[];
}
export function listMatchRules(dataDir: string, tenantId: string): MatchRule[] {
  return load<Record<string, MatchRuleIndex>>(dataDir, NATIVE_DEDUPE_MATCH_RULES_KEY, {})[tenantId]?.rules ?? [];
}
export function getMatchRule(dataDir: string, tenantId: string, ruleId: string): MatchRule | null {
  return listMatchRules(dataDir, tenantId).find((r) => r.id === ruleId) ?? null;
}
export function saveMatchRule(dataDir: string, r: MatchRule): void {
  const all = load<Record<string, MatchRuleIndex>>(dataDir, NATIVE_DEDUPE_MATCH_RULES_KEY, {});
  const idx = all[r.tenantId] ?? { rules: [] };
  const i = idx.rules.findIndex((x) => x.id === r.id);
  if (i >= 0) idx.rules[i] = r;
  else idx.rules.push(r);
  all[r.tenantId] = idx;
  save(dataDir, NATIVE_DEDUPE_MATCH_RULES_KEY, all);
}
export function deleteMatchRuleRecord(dataDir: string, tenantId: string, ruleId: string): void {
  const all = load<Record<string, MatchRuleIndex>>(dataDir, NATIVE_DEDUPE_MATCH_RULES_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.rules = idx.rules.filter((x) => x.id !== ruleId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_DEDUPE_MATCH_RULES_KEY, all);
}

// ── Quality rules ───────────────────────────────────────────────────────────
interface QualityRuleIndex {
  rules: QualityRule[];
}
export function listQualityRules(dataDir: string, tenantId: string): QualityRule[] {
  return load<Record<string, QualityRuleIndex>>(dataDir, NATIVE_DEDUPE_QUALITY_RULES_KEY, {})[tenantId]?.rules ?? [];
}
export function getQualityRule(dataDir: string, tenantId: string, ruleId: string): QualityRule | null {
  return listQualityRules(dataDir, tenantId).find((r) => r.id === ruleId) ?? null;
}
export function saveQualityRule(dataDir: string, r: QualityRule): void {
  const all = load<Record<string, QualityRuleIndex>>(dataDir, NATIVE_DEDUPE_QUALITY_RULES_KEY, {});
  const idx = all[r.tenantId] ?? { rules: [] };
  const i = idx.rules.findIndex((x) => x.id === r.id);
  if (i >= 0) idx.rules[i] = r;
  else idx.rules.push(r);
  all[r.tenantId] = idx;
  save(dataDir, NATIVE_DEDUPE_QUALITY_RULES_KEY, all);
}
export function deleteQualityRuleRecord(dataDir: string, tenantId: string, ruleId: string): void {
  const all = load<Record<string, QualityRuleIndex>>(dataDir, NATIVE_DEDUPE_QUALITY_RULES_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.rules = idx.rules.filter((x) => x.id !== ruleId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_DEDUPE_QUALITY_RULES_KEY, all);
}

// ── Scan runs (durable honest ledger) ───────────────────────────────────────
interface RunIndex {
  runs: DedupeRun[];
}
export function listRuns(dataDir: string, tenantId: string): DedupeRun[] {
  return load<Record<string, RunIndex>>(dataDir, NATIVE_DEDUPE_RUNS_KEY, {})[tenantId]?.runs ?? [];
}
export function getRun(dataDir: string, tenantId: string, runId: string): DedupeRun | null {
  return listRuns(dataDir, tenantId).find((r) => r.id === runId) ?? null;
}
export function saveRun(dataDir: string, r: DedupeRun): void {
  const all = load<Record<string, RunIndex>>(dataDir, NATIVE_DEDUPE_RUNS_KEY, {});
  const idx = all[r.tenantId] ?? { runs: [] };
  const i = idx.runs.findIndex((x) => x.id === r.id);
  if (i >= 0) idx.runs[i] = r;
  else idx.runs.push(r);
  all[r.tenantId] = idx;
  save(dataDir, NATIVE_DEDUPE_RUNS_KEY, all);
}
/** Durable daily scan ledger (cap enforced BEFORE the gate). */
export function countTodayScans(dataDir: string, tenantId: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return listRuns(dataDir, tenantId).filter((r) => r.createdAt.slice(0, 10) === today).length;
}

// ── Merge suggestions ───────────────────────────────────────────────────────
interface SuggestionIndex {
  suggestions: MergeSuggestion[];
}
export function listSuggestions(dataDir: string, tenantId: string, status?: MergeSuggestion["status"]): MergeSuggestion[] {
  const all = load<Record<string, SuggestionIndex>>(dataDir, NATIVE_DEDUPE_SUGGESTIONS_KEY, {})[tenantId]?.suggestions ?? [];
  const scoped = status ? all.filter((s) => s.status === status) : all;
  return [...scoped].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}
export function getSuggestion(dataDir: string, tenantId: string, suggestionId: string): MergeSuggestion | null {
  return listSuggestions(dataDir, tenantId).find((s) => s.id === suggestionId) ?? null;
}
export function saveSuggestion(dataDir: string, s: MergeSuggestion): void {
  const all = load<Record<string, SuggestionIndex>>(dataDir, NATIVE_DEDUPE_SUGGESTIONS_KEY, {});
  const idx = all[s.tenantId] ?? { suggestions: [] };
  const i = idx.suggestions.findIndex((x) => x.id === s.id);
  if (i >= 0) idx.suggestions[i] = s;
  else idx.suggestions.push(s);
  all[s.tenantId] = idx;
  save(dataDir, NATIVE_DEDUPE_SUGGESTIONS_KEY, all);
}
/** Canonical pair key (row ids sorted) + rule — duplicate scan guard. */
export function canonicalSuggestionKey(ruleId: string, rowIds: string[]): string {
  return `${ruleId}|${[...rowIds].sort().join(",")}`;
}
export function suggestionExists(dataDir: string, tenantId: string, ruleId: string, rowIds: string[]): boolean {
  const key = canonicalSuggestionKey(ruleId, rowIds);
  return listSuggestions(dataDir, tenantId).some((s) => s.ruleId === ruleId && canonicalSuggestionKey(s.ruleId, s.rowIds) === key);
}
export function countOpenSuggestions(dataDir: string, tenantId: string): number {
  return listSuggestions(dataDir, tenantId, "open").length;
}

// ── Record identities (golden records — non-destructive merge pointers) ────
interface IdentityIndex {
  identities: RecordIdentity[];
}
export function listIdentities(dataDir: string, tenantId: string): RecordIdentity[] {
  return load<Record<string, IdentityIndex>>(dataDir, NATIVE_DEDUPE_IDENTITIES_KEY, {})[tenantId]?.identities ?? [];
}
export function getIdentity(dataDir: string, tenantId: string, id: string): RecordIdentity | null {
  return listIdentities(dataDir, tenantId).find((i) => i.id === id) ?? null;
}
export function saveIdentity(dataDir: string, id: RecordIdentity): void {
  const all = load<Record<string, IdentityIndex>>(dataDir, NATIVE_DEDUPE_IDENTITIES_KEY, {});
  const idx = all[id.tenantId] ?? { identities: [] };
  idx.identities.push(id);
  all[id.tenantId] = idx;
  save(dataDir, NATIVE_DEDUPE_IDENTITIES_KEY, all);
}
/** True when a row already participates in a record identity (survivor OR
 *  superseded) — such rows are excluded from new suggestions and merges. */
export function rowIsResolved(dataDir: string, tenantId: string, rowId: string): boolean {
  return listIdentities(dataDir, tenantId).some((i) => i.survivorRowId === rowId || i.supersededRowIds.includes(rowId));
}

// ── Pending writes (durable mirror of the approval card) ───────────────────
interface PendingIndex {
  pendingWrites: PendingDedupeWrite[];
}
export function listPendingWrites(dataDir: string, tenantId: string): PendingDedupeWrite[] {
  return load<Record<string, PendingIndex>>(dataDir, NATIVE_DEDUPE_PENDING_KEY, {})[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingDedupeWrite): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_DEDUPE_PENDING_KEY, {});
  const idx = all[w.tenantId] ?? { pendingWrites: [] };
  idx.pendingWrites.push(w);
  all[w.tenantId] = idx;
  save(dataDir, NATIVE_DEDUPE_PENDING_KEY, all);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingDedupeWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingDedupeWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  result?: { appliedResult?: Record<string, unknown>; error?: string },
): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_DEDUPE_PENDING_KEY, {});
  const idx = all[tenantId];
  const w = idx?.pendingWrites.find((x) => x.id === id);
  if (!idx || !w || w.status !== "pending") return; // idempotent
  w.status = status;
  if (status === "applied") w.appliedResult = result?.appliedResult;
  else w.error = result?.error ?? "rejected by owner";
  all[tenantId] = idx;
  save(dataDir, NATIVE_DEDUPE_PENDING_KEY, all);
}

// ── Immutable audit (append-only) ───────────────────────────────────────────
function loadAudit(dataDir: string): NativeDedupeAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_DEDUPE_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeDedupeAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeDedupeAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({ id: generateDedupeEntityId("dev"), ts: new Date().toISOString(), ...entry });
  save(dataDir, NATIVE_DEDUPE_AUDIT_KEY, audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeDedupeAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}