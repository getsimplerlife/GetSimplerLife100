/**
 * native/communications/store.ts — durable, tenant-keyed COMMUNICATIONS store
 * (P1-4). Native reply log (native_communications_messages.json keyed by
 * tenantId) + durable pending-write mirror + immutable native.communications.*
 * audit. Every read/write takes tenantId explicitly — zero cross-tenant paths
 * (a foreign message id resolves to null → fail-closed 404 upstream). The
 * legacy tenant_communications.json rows (same per-tenant key) are read ONLY
 * so previously logged messages still appear in the thread; replies always
 * write to the NEW native store.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  LEGACY_COMMUNICATIONS_KEY,
  NATIVE_COMMUNICATIONS_AUDIT_KEY,
  NATIVE_COMMUNICATIONS_MESSAGES_KEY,
  NATIVE_COMMUNICATIONS_PENDING_KEY,
  type CommMessage,
  type NativeCommunicationsAuditEntry,
  type PendingCommunicationsWrite,
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
export function generateCommunicationsId(kind: "cmm" | "cmw" | "cmu"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

/** Legacy tenant_communications.json shape: { [tenantId]: rows[] } — read
 *  ONLY (this slice never migrates/writes the legacy log). */
interface LegacyCommIndex {
  [tenantId: string]: Array<Record<string, unknown>>;
}

/** Messages the tenant can see in the thread: legacy rows (projected) PLUS
 *  native reply rows. Legacy rows are safe-projected into CommMessage shape
 *  with direction "inbound" (their original record is untouchable). */
export function listMessages(dataDir: string, tenantId: string): CommMessage[] {
  const native = load<Record<string, CommMessage[]>>(dataDir, NATIVE_COMMUNICATIONS_MESSAGES_KEY, {})[tenantId] ?? [];
  const legacyRows = load<LegacyCommIndex>(dataDir, LEGACY_COMMUNICATIONS_KEY, {})[tenantId] ?? [];
  const legacy: CommMessage[] = legacyRows
    .filter((r) => r && typeof r === "object")
    .map((r, i) => ({
      id: typeof r.id === "string" && r.id ? r.id : `legacy_${i}`,
      tenantId,
      from: typeof r.from === "string" ? r.from : "unknown",
      subject: typeof r.subject === "string" ? r.subject : "Message",
      body: typeof r.preview === "string" ? r.preview : typeof r.body === "string" ? r.body : "",
      preview: typeof r.preview === "string" ? r.preview : "",
      channel: typeof r.channel === "string" ? r.channel : "log",
      direction: "inbound",
      time: typeof r.time === "string" ? r.time : "",
      sentiment: typeof r.sentiment === "string" ? r.sentiment : "neutral",
      read: r.read === true,
      createdAt: "",
      createdBy: tenantId,
    }));
  return [...native, ...legacy].sort((a, b) => (a.createdAt || a.time) > (b.createdAt || b.time) ? 1 : (a.createdAt || a.time) < (b.createdAt || b.time) ? -1 : 0);
}

/** Resolve a message by id across BOTH the native reply store and the legacy
 *  log — in-tenant only (a foreign id → null). */
export function getMessage(dataDir: string, tenantId: string, messageId: string): CommMessage | null {
  if (!messageId) return null;
  return listMessages(dataDir, tenantId).find((m) => m.id === messageId) ?? null;
}

/** Append a reply row to the tenant's OWN native store. */
export function appendMessage(dataDir: string, m: CommMessage): void {
  const all = load<Record<string, CommMessage[]>>(dataDir, NATIVE_COMMUNICATIONS_MESSAGES_KEY, {});
  const rows = all[m.tenantId] ?? [];
  rows.push(m);
  all[m.tenantId] = rows;
  save(dataDir, NATIVE_COMMUNICATIONS_MESSAGES_KEY, all);
}

export function countNativeMessages(dataDir: string, tenantId: string): number {
  return (load<Record<string, CommMessage[]>>(dataDir, NATIVE_COMMUNICATIONS_MESSAGES_KEY, {})[tenantId] ?? []).length;
}

// ── Pending writes (durable mirror of the approval card) ───────────────────
interface PendingIndex {
  pendingWrites: PendingCommunicationsWrite[];
}
export function listPendingWrites(dataDir: string, tenantId: string): PendingCommunicationsWrite[] {
  return load<Record<string, PendingIndex>>(dataDir, NATIVE_COMMUNICATIONS_PENDING_KEY, {})[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingCommunicationsWrite): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_COMMUNICATIONS_PENDING_KEY, {});
  const idx = all[w.tenantId] ?? { pendingWrites: [] };
  idx.pendingWrites.push(w);
  all[w.tenantId] = idx;
  save(dataDir, NATIVE_COMMUNICATIONS_PENDING_KEY, all);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingCommunicationsWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingCommunicationsWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  result?: { appliedResult?: Record<string, unknown>; error?: string },
): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_COMMUNICATIONS_PENDING_KEY, {});
  const idx = all[tenantId];
  const w = idx?.pendingWrites.find((x) => x.id === id);
  if (!idx || !w || w.status !== "pending") return; // idempotent
  w.status = status;
  if (status === "applied") w.appliedResult = result?.appliedResult;
  else w.error = result?.error ?? "rejected by owner";
  all[tenantId] = idx;
  save(dataDir, NATIVE_COMMUNICATIONS_PENDING_KEY, all);
}

// ── Immutable audit (append-only) ───────────────────────────────────────────
function loadAudit(dataDir: string): NativeCommunicationsAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_COMMUNICATIONS_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeCommunicationsAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeCommunicationsAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({ id: generateCommunicationsId("cmu"), ts: new Date().toISOString(), ...entry });
  save(dataDir, NATIVE_COMMUNICATIONS_AUDIT_KEY, audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeCommunicationsAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}