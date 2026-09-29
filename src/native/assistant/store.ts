/**
 * native/assistant/store.ts — durable, tenant-keyed assistant store (3.8).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   state first — zero cross-tenant paths (a foreign message/write id resolves
 *   to null → fail-closed 404 upstream).
 * - Mutations are applied ONLY by the gated ask path (gate.ts) or the
 *   idempotent pending-apply executor — the store never writes messages
 *   directly outside those lanes.
 * - Every mutation appends an IMMUTABLE native.assistant.* audit entry —
 *   auditors see pending + applied asks.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_ASSISTANT_KEY,
  NATIVE_ASSISTANT_AUDIT_KEY,
  type AssistantMessage,
  type PendingAssistantWrite,
} from "./types";

export interface AssistantAuditRecord {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string;
  detail: string;
}

interface TenantAssistantState {
  messages: AssistantMessage[];
  pendingWrites: PendingAssistantWrite[];
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantAssistantState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_ASSISTANT_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantAssistantState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantAssistantState>): void {
  writeJSON(dataPath(dataDir, NATIVE_ASSISTANT_KEY), state);
}
function ensureTenant(state: Record<string, TenantAssistantState>, tenantId: string): TenantAssistantState {
  const t = state[tenantId] ?? { messages: [], pendingWrites: [] };
  state[tenantId] = t;
  return t;
}
function loadAudit(dataDir: string): Record<string, AssistantAuditRecord[]> {
  const raw = readJSON(dataPath(dataDir, NATIVE_ASSISTANT_AUDIT_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, AssistantAuditRecord[]>) : {};
}
function saveAudit(dataDir: string, audit: Record<string, AssistantAuditRecord[]>): void {
  writeJSON(dataPath(dataDir, NATIVE_ASSISTANT_AUDIT_KEY), audit);
}

/** Server-assigned ids only — never accept a client-provided id. */
export function generateAssistantEntityId(prefix: "asm" | "apw"): string {
  return `${prefix}_${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
}
function makeId(prefix: "alev"): string {
  return `${prefix}_${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
}

// ── messages ───────────────────────────────────────────────────────────
export function listMessages(dataDir: string, tenantId: string): AssistantMessage[] {
  const state = loadState(dataDir);
  return state[tenantId]?.messages ?? [];
}
export function getMessage(dataDir: string, tenantId: string, messageId: string): AssistantMessage | null {
  if (!messageId) return null;
  return listMessages(dataDir, tenantId).find((m) => m.id === messageId) ?? null;
}
export function appendMessage(dataDir: string, m: AssistantMessage): AssistantMessage {
  const state = loadState(dataDir);
  const t = ensureTenant(state, m.tenantId);
  t.messages.push(m);
  saveState(dataDir, state);
  return m;
}
export function markMessage(
  dataDir: string,
  tenantId: string,
  messageId: string,
  status: "applied" | "rejected",
): AssistantMessage | null {
  const state = loadState(dataDir);
  const t = state[tenantId];
  const m = t?.messages.find((x) => x.id === messageId);
  if (!m) return null;
  m.status = status;
  saveState(dataDir, state);
  return m;
}

// ── pending writes (durable mirror) ─────────────────────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingAssistantWrite[] {
  const state = loadState(dataDir);
  return state[tenantId]?.pendingWrites ?? [];
}
export function getPendingWrite(dataDir: string, tenantId: string, apwId: string): PendingAssistantWrite | null {
  if (!apwId) return null;
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === apwId) ?? null;
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, actionId: string): PendingAssistantWrite | null {
  if (!actionId) return null;
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === actionId) ?? null;
}
export function savePendingWrite(dataDir: string, w: PendingAssistantWrite): PendingAssistantWrite {
  const state = loadState(dataDir);
  const t = ensureTenant(state, w.tenantId);
  t.pendingWrites.push(w);
  saveState(dataDir, state);
  return w;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  apwId: string,
  status: "applied" | "rejected",
  actor: string,
): PendingAssistantWrite | null {
  const state = loadState(dataDir);
  const t = state[tenantId];
  const w = t?.pendingWrites.find((x) => x.id === apwId);
  if (!w) return null;
  if (w.status !== "pending") return w; // idempotent — double-decide is a no-op
  w.status = status;
  w.decidedAt = new Date().toISOString();
  w.decidedBy = actor;
  saveState(dataDir, state);
  return w;
}

// ── audit (immutable) ──────────────────────────────────────────────────
export function appendAudit(
  dataDir: string,
  tenantId: string,
  actor: string,
  action: string,
  detail: string,
): AssistantAuditRecord {
  const audit = loadAudit(dataDir);
  const entry: AssistantAuditRecord = {
    id: makeId("alev"),
    ts: new Date().toISOString(),
    tenantId,
    actor,
    action,
    detail,
  };
  audit[tenantId] = [...(audit[tenantId] ?? []), entry];
  saveAudit(dataDir, audit);
  return entry;
}
export function listAudit(dataDir: string, tenantId: string): AssistantAuditRecord[] {
  const audit = loadAudit(dataDir);
  return audit[tenantId] ?? [];
}
/** Fail-closed daily ask cap: count durable `native.assistant.ask.requested`
 *  audit entries created today for the tenant (cap enforced BEFORE gating). */
export function countTodayAsks(dataDir: string, tenantId: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return listAudit(dataDir, tenantId).filter(
    (e) => e.action === "native.assistant.ask.requested" && e.ts.slice(0, 10) === today,
  ).length;
}