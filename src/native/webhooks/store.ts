/**
 * native/webhooks/store.ts — durable, tenant-keyed stores for the native
 * webhook layer (Phase 1.1).
 *
 * Isolation is STRUCTURAL: every tenant-scoped file is `{ [tenantId]: [...] }`
 * and every read/write takes tenantId explicitly — there is no cross-tenant
 * read path. Sink ids are globally indexed (the unauthenticated receiver must
 * resolve sinkId → tenantId) but sink secrets are ENCRYPTED at rest and the
 * index carries only the encrypted secret + tenant + metadata.
 *
 * Store files (all under one dataDir, mirroring vault/approval stores):
 *   native_webhook_sinks.json           { [sinkId]: NativeWebhookSink }
 *   native_webhook_receipts.json        { [tenantId]: NativeWebhookReceipt[] }
 *   native_webhook_seen.json            { [tenantId]: { [key]: {eventId, hash, ts} } }
 *   native_webhook_subscriptions.json   { [tenantId]: NativeWebhookSubscription[] }
 *   native_webhook_deliveries.json      { [tenantId]: NativeWebhookDelivery[] }
 *   native_webhook_audit.json           { [tenantId]: NativeAuditEntry[] }
 */
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  NATIVE_SINKS_KEY,
  NATIVE_RECEIPTS_KEY,
  NATIVE_SEEN_KEY,
  NATIVE_SUBSCRIPTIONS_KEY,
  NATIVE_DELIVERIES_KEY,
  NATIVE_AUDIT_KEY,
  MAX_RECEIPTS_PER_TENANT,
  MAX_DELIVERIES_PER_TENANT,
  MAX_SEEN_PER_TENANT,
  type NativeWebhookSink,
  type NativeWebhookSubscription,
  type NativeWebhookReceipt,
  type NativeWebhookDelivery,
  type NativeAuditEntry,
} from "./types";

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadRecord<T>(path: string): Record<string, T> {
  const raw = readJSON(path);
  return raw && typeof raw === "object" ? (raw as Record<string, T>) : {};
}
function saveRecord<T>(path: string, record: Record<string, T>): void {
  writeJSON(path, record);
}

// ── Sinks (global index by sinkId) ──────────────────────────────────────────
export function listSinks(dataDir: string): NativeWebhookSink[] {
  return Object.values(loadRecord<NativeWebhookSink>(dataPath(dataDir, NATIVE_SINKS_KEY)));
}
export function getSink(dataDir: string, sinkId: string): NativeWebhookSink | null {
  return loadRecord<NativeWebhookSink>(dataPath(dataDir, NATIVE_SINKS_KEY))[sinkId] ?? null;
}
export function listSinksForTenant(dataDir: string, tenantId: string): NativeWebhookSink[] {
  return listSinks(dataDir).filter((s) => s.tenantId === tenantId);
}
export function saveSink(dataDir: string, sink: NativeWebhookSink): void {
  const path = dataPath(dataDir, NATIVE_SINKS_KEY);
  const all = loadRecord<NativeWebhookSink>(path);
  all[sink.sinkId] = sink;
  saveRecord(path, all);
}
export function deleteSink(dataDir: string, sinkId: string): boolean {
  const path = dataPath(dataDir, NATIVE_SINKS_KEY);
  const all = loadRecord<NativeWebhookSink>(path);
  if (!all[sinkId]) return false;
  delete all[sinkId];
  saveRecord(path, all);
  return true;
}
/**
 * Local AES-256-GCM cipher for webhook secrets at rest (same scheme the
 * platform uses for OAuth credentials; DB-free so the native layer stays
 * hermetic in tests). Key = INTEGRATION_ENCRYPTION_KEY when set (production
 * restart-stable), else a per-process random key (safe for this use: a secret
 * written by one process run is read back by the same run, and production
 * sets the env key).
 */
const WEBHOOK_CIPHER = "aes-256-gcm";
let cachedKey: Buffer | null = null;
const secretKey = (): Buffer => {
  if (cachedKey) return cachedKey;
  const env = process.env.INTEGRATION_ENCRYPTION_KEY || "";
  cachedKey = Buffer.from(env.length >= 32 ? env.slice(0, 32) : randomBytes(32).toString("hex").slice(0, 32));
  return cachedKey;
};
export function encryptSecret(plain: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(WEBHOOK_CIPHER, secretKey(), iv);
  let enc = cipher.update(plain, "utf8", "hex");
  enc += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
}
export function decryptSecret(encrypted: string): string {
  const [ivHex, tagHex, body] = encrypted.split(":");
  if (!ivHex || !tagHex || !body) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv(WEBHOOK_CIPHER, secretKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let out = decipher.update(body, "hex", "utf8");
  out += decipher.final("utf8");
  return out;
}

// ── Receipts (tenant-keyed, bounded) ────────────────────────────────────────
function tenantReceiptsPath(dataDir: string): string {
  return dataPath(dataDir, NATIVE_RECEIPTS_KEY);
}
export function listReceipts(dataDir: string, tenantId: string): NativeWebhookReceipt[] {
  return loadRecord<NativeWebhookReceipt[]>(tenantReceiptsPath(dataDir))[tenantId] ?? [];
}
export function appendReceipt(dataDir: string, tenantId: string, receipt: NativeWebhookReceipt): void {
  const path = tenantReceiptsPath(dataDir);
  const all = loadRecord<NativeWebhookReceipt[]>(path);
  const entries = all[tenantId] || [];
  entries.push(receipt);
  all[tenantId] = entries.slice(-MAX_RECEIPTS_PER_TENANT);
  saveRecord(path, all);
}
export function countReceipts(dataDir: string, tenantId: string): number {
  return listReceipts(dataDir, tenantId).length;
}

// ── Seen-set (idempotency, tenant-keyed, bounded, pruned by age) ────────────
interface SeenRecord {
  eventId: string;
  hash: string;
  ts: number;
}
function tenantSeenPath(dataDir: string): string {
  return dataPath(dataDir, NATIVE_SEEN_KEY);
}
export function seenValue(dataDir: string, tenantId: string, key: string): SeenRecord | null {
  const row = loadRecord<Record<string, SeenRecord>>(tenantSeenPath(dataDir))[tenantId];
  return row?.[key] ?? null;
}
export function markSeen(dataDir: string, tenantId: string, key: string, value: SeenRecord): void {
  const path = tenantSeenPath(dataDir);
  const all = loadRecord<Record<string, SeenRecord>>(path);
  const row = all[tenantId] || {};
  // Prune stale (>= 24h) and overflow while we are here.
  const now = Date.now();
  for (const [k, v] of Object.entries(row)) {
    if (now - v.ts > 24 * 60 * 60 * 1000) delete row[k];
  }
  row[key] = value;
  const keys = Object.keys(row);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SEEN_PER_TENANT))) delete row[k];
  all[tenantId] = row;
  saveRecord(path, all);
}

// ── Subscriptions (tenant-keyed, bounded) ───────────────────────────────────
function tenantSubscriptionsPath(dataDir: string): string {
  return dataPath(dataDir, NATIVE_SUBSCRIPTIONS_KEY);
}
export function listSubscriptions(dataDir: string, tenantId: string): NativeWebhookSubscription[] {
  return loadRecord<NativeWebhookSubscription[]>(tenantSubscriptionsPath(dataDir))[tenantId] ?? [];
}
export function saveSubscription(dataDir: string, sub: NativeWebhookSubscription): void {
  const path = tenantSubscriptionsPath(dataDir);
  const all = loadRecord<NativeWebhookSubscription[]>(path);
  const entries = all[sub.tenantId] || [];
  const idx = entries.findIndex((s) => s.id === sub.id);
  if (idx >= 0) entries[idx] = sub;
  else entries.push(sub);
  all[sub.tenantId] = entries;
  saveRecord(path, all);
}
export function deleteSubscription(dataDir: string, tenantId: string, id: string): boolean {
  const path = tenantSubscriptionsPath(dataDir);
  const all = loadRecord<NativeWebhookSubscription[]>(path);
  const entries = all[tenantId] || [];
  const next = entries.filter((s) => s.id !== id);
  if (next.length === entries.length) return false;
  all[tenantId] = next;
  saveRecord(path, all);
  return true;
}

// ── Deliveries (tenant-keyed queue + history, bounded) ──────────────────────
function tenantDeliveriesPath(dataDir: string): string {
  return dataPath(dataDir, NATIVE_DELIVERIES_KEY);
}
export function listDeliveries(dataDir: string, tenantId: string): NativeWebhookDelivery[] {
  return loadRecord<NativeWebhookDelivery[]>(tenantDeliveriesPath(dataDir))[tenantId] ?? [];
}
/** Tenants that currently hold at least one delivery record (sweeper scope). */
export function listTenantsWithDeliveries(dataDir: string): string[] {
  return Object.keys(loadRecord<NativeWebhookDelivery[]>(tenantDeliveriesPath(dataDir)));
}
export function saveDeliveries(dataDir: string, tenantId: string, deliveries: NativeWebhookDelivery[]): void {
  const path = tenantDeliveriesPath(dataDir);
  const all = loadRecord<NativeWebhookDelivery[]>(path);
  all[tenantId] = deliveries.slice(-MAX_DELIVERIES_PER_TENANT);
  saveRecord(path, all);
}

// ── Audit (tenant-keyed, immutable append-only — mirrors vault-audit) ───────
export function appendNativeAudit(
  dataDir: string,
  tenantId: string,
  actor: string,
  action: string,
  detail: string,
): NativeAuditEntry {
  const entry: NativeAuditEntry = {
    id: `nwa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ts: new Date().toISOString(),
    tenantId,
    action,
    detail,
    actor,
  };
  const path = dataPath(dataDir, NATIVE_AUDIT_KEY);
  const all = loadRecord<NativeAuditEntry[]>(path);
  const entries = all[tenantId] || [];
  entries.push(entry); // append-only
  all[tenantId] = entries;
  saveRecord(path, all);
  return entry;
}
export function listNativeAudit(dataDir: string, tenantId: string): NativeAuditEntry[] {
  return loadRecord<NativeAuditEntry[]>(dataPath(dataDir, NATIVE_AUDIT_KEY))[tenantId] ?? [];
}
export function countNativeAudit(dataDir: string, tenantId: string): number {
  return listNativeAudit(dataDir, tenantId).length;
}