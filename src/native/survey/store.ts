/**
 * native/survey/store.ts — durable, tenant-keyed SURVEY store (Phase 3.4).
 * Surveys + responses + pending-write mirror + immutable native.survey.*
 * audit. Every read/write takes tenantId explicitly — zero cross-tenant paths.
 * The slug→survey index is per-tenant ONLY (public share resolves the tenant
 * via the slug index, then further reads are tenant-scoped — the 3.1 booking
 * share pattern).
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_SURVEY_KEY,
  NATIVE_SURVEY_RESPONSES_KEY,
  NATIVE_SURVEY_PENDING_KEY,
  NATIVE_SURVEY_AUDIT_KEY,
  type PendingSurveyWrite,
  type SurveyRecord,
  type SurveyResponse,
} from "./types";

export interface NativeSurveyAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.survey.<...>.*
  surveyId?: string;
  responseId?: string;
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
export function generateSurveyEntityId(kind: "svy" | "q" | "rsp" | "svw"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
export function generateSurveySlug(): string {
  return randomBytes(6).toString("hex");
}

// ── Surveys ─────────────────────────────────────────────────────────────────
interface SurveyIndex {
  surveys: SurveyRecord[];
}
export function listSurveys(dataDir: string, tenantId: string): SurveyRecord[] {
  return load<Record<string, SurveyIndex>>(dataDir, NATIVE_SURVEY_KEY, {})[tenantId]?.surveys ?? [];
}
export function saveSurvey(dataDir: string, s: SurveyRecord): void {
  const all = load<Record<string, SurveyIndex>>(dataDir, NATIVE_SURVEY_KEY, {});
  const idx = all[s.tenantId] ?? { surveys: [] };
  const i = idx.surveys.findIndex((x) => x.id === s.id);
  if (i >= 0) idx.surveys[i] = s;
  else idx.surveys.push(s);
  all[s.tenantId] = idx;
  save(dataDir, NATIVE_SURVEY_KEY, all);
}
export function getSurvey(dataDir: string, tenantId: string, surveyId: string): SurveyRecord | null {
  return listSurveys(dataDir, tenantId).find((s) => s.id === surveyId) ?? null;
}
export function deleteSurveyRecord(dataDir: string, tenantId: string, surveyId: string): void {
  const all = load<Record<string, SurveyIndex>>(dataDir, NATIVE_SURVEY_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.surveys = idx.surveys.filter((s) => s.id !== surveyId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_SURVEY_KEY, all);
}
/** Resolve a PUBLISHED survey by slug → { tenantId, survey } (public lane). */
export function lookupPublishedSurvey(dataDir: string, slug: string): { tenantId: string; survey: SurveyRecord } | null {
  const all = load<Record<string, SurveyIndex>>(dataDir, NATIVE_SURVEY_KEY, {});
  for (const [tenantId, idx] of Object.entries(all)) {
    const s = idx.surveys.find((x) => x.slug === slug && x.status === "published");
    if (s) return { tenantId, survey: s };
  }
  return null;
}

// ── Responses ───────────────────────────────────────────────────────────────
interface ResponseIndex {
  responses: SurveyResponse[];
}
export function listResponses(dataDir: string, tenantId: string, surveyId?: string): SurveyResponse[] {
  const all = load<Record<string, ResponseIndex>>(dataDir, NATIVE_SURVEY_RESPONSES_KEY, {});
  const list = all[tenantId]?.responses ?? [];
  return surveyId ? list.filter((r) => r.surveyId === surveyId) : list;
}
export function saveResponse(dataDir: string, r: SurveyResponse): void {
  const all = load<Record<string, ResponseIndex>>(dataDir, NATIVE_SURVEY_RESPONSES_KEY, {});
  const idx = all[r.tenantId] ?? { responses: [] };
  const i = idx.responses.findIndex((x) => x.id === r.id);
  if (i >= 0) idx.responses[i] = r;
  else idx.responses.push(r);
  all[r.tenantId] = idx;
  save(dataDir, NATIVE_SURVEY_RESPONSES_KEY, all);
}
export function getResponse(dataDir: string, tenantId: string, responseId: string): SurveyResponse | null {
  return listResponses(dataDir, tenantId).find((r) => r.id === responseId) ?? null;
}
export function countResponses(dataDir: string, tenantId: string, surveyId: string): number {
  return listResponses(dataDir, tenantId, surveyId).length;
}

// ── Pending writes (durable mirror of the approval card) ────────────────────
interface PendingIndex {
  pendingWrites: PendingSurveyWrite[];
}
export function listPendingWrites(dataDir: string, tenantId: string): PendingSurveyWrite[] {
  return load<Record<string, PendingIndex>>(dataDir, NATIVE_SURVEY_PENDING_KEY, {})[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingSurveyWrite): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_SURVEY_PENDING_KEY, {});
  const idx = all[w.tenantId] ?? { pendingWrites: [] };
  idx.pendingWrites.push(w);
  all[w.tenantId] = idx;
  save(dataDir, NATIVE_SURVEY_PENDING_KEY, all);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingSurveyWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingSurveyWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  result?: { responseId?: string; error?: string },
): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_SURVEY_PENDING_KEY, {});
  const idx = all[tenantId];
  const w = idx?.pendingWrites.find((x) => x.id === id);
  if (!idx || !w || w.status !== "pending") return; // idempotent
  w.status = status;
  if (status === "applied") w.appliedResult = { responseId: result?.responseId };
  else w.error = result?.error ?? "rejected by owner";
  all[tenantId] = idx;
  save(dataDir, NATIVE_SURVEY_PENDING_KEY, all);
}

// ── Immutable audit (append-only) ───────────────────────────────────────────
function loadAudit(dataDir: string): NativeSurveyAuditEntry[] {
  // readJSON may return {} for a missing file — array-robust (push-safe).
  const raw = readJSON(dataPath(dataDir, NATIVE_SURVEY_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeSurveyAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeSurveyAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({ id: generateSurveyEntityId("svw"), ts: new Date().toISOString(), ...entry });
  save(dataDir, NATIVE_SURVEY_AUDIT_KEY, audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeSurveyAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}