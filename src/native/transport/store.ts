/**
 * native/transport/store.ts — durable, tenant-keyed SECURE TRANSPORT store
 * (Phase 4.1). Connections / rules / runs / PGP keys + durable pending-write
 * mirror + immutable native.assistant-class audit. Every read/write takes
 * tenantId explicitly — zero cross-tenant paths (a foreign entity id resolves
 * to null → fail-closed 404 upstream).
 *
 * Secret hygiene: connection credentials and PGP key material are stored
 * ENCRYPTED AT REST (AES-256-GCM, key = INTEGRATION_ENCRYPTION_KEY when set,
 * else a per-process random key — hermetic in tests: a secret written by one
 * process run is read back by the same run, and production sets the env key).
 * No GET lane ever returns the plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_TRANSPORT_CONNECTIONS_KEY,
  NATIVE_TRANSPORT_RULES_KEY,
  NATIVE_TRANSPORT_RUNS_KEY,
  NATIVE_TRANSPORT_KEYS_KEY,
  NATIVE_TRANSPORT_PENDING_KEY,
  NATIVE_TRANSPORT_AUDIT_KEY,
  type NativeTransportAuditEntry,
  type PendingTransportWrite,
  type PgpKey,
  type SftpConnection,
  type TransferRule,
  type TransferRun,
} from "./types";

const CIPHER = "aes-256-gcm";
let cachedKey: Buffer | null = null;
function secretKey(): Buffer {
  if (cachedKey) return cachedKey;
  const env = process.env.INTEGRATION_ENCRYPTION_KEY || "";
  cachedKey = Buffer.from(env.length >= 32 ? env.slice(0, 32) : randomBytes(32).toString("hex").slice(0, 32));
  return cachedKey;
}
export function encryptSecret(plain: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(CIPHER, secretKey(), iv);
  let enc = cipher.update(plain, "utf8", "hex");
  enc += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
}
export function decryptSecret(encrypted: string): string {
  const [ivHex, tagHex, body] = encrypted.split(":");
  if (!ivHex || !tagHex || !body) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv(CIPHER, secretKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let out = decipher.update(body, "hex", "utf8");
  out += decipher.final("utf8");
  return out;
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

/** Server-assigned ids only — never accept a client-provided id. */
export function generateTransportEntityId(kind: "sfc" | "tru" | "trn" | "pgk" | "tpw" | "aev"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── SFTP connections ────────────────────────────────────────────────────────
interface ConnectionIndex {
  connections: SftpConnection[];
}
export function listConnections(dataDir: string, tenantId: string): SftpConnection[] {
  return load<Record<string, ConnectionIndex>>(dataDir, NATIVE_TRANSPORT_CONNECTIONS_KEY, {})[tenantId]?.connections ?? [];
}
export function getConnection(dataDir: string, tenantId: string, connectionId: string): SftpConnection | null {
  return listConnections(dataDir, tenantId).find((c) => c.id === connectionId) ?? null;
}
export function saveConnection(dataDir: string, c: SftpConnection): void {
  const all = load<Record<string, ConnectionIndex>>(dataDir, NATIVE_TRANSPORT_CONNECTIONS_KEY, {});
  const idx = all[c.tenantId] ?? { connections: [] };
  const i = idx.connections.findIndex((x) => x.id === c.id);
  if (i >= 0) idx.connections[i] = c;
  else idx.connections.push(c);
  all[c.tenantId] = idx;
  save(dataDir, NATIVE_TRANSPORT_CONNECTIONS_KEY, all);
}
export function deleteConnectionRecord(dataDir: string, tenantId: string, connectionId: string): void {
  const all = load<Record<string, ConnectionIndex>>(dataDir, NATIVE_TRANSPORT_CONNECTIONS_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.connections = idx.connections.filter((x) => x.id !== connectionId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_TRANSPORT_CONNECTIONS_KEY, all);
}

// ── Transfer rules ──────────────────────────────────────────────────────────
interface RuleIndex {
  rules: TransferRule[];
}
export function listRules(dataDir: string, tenantId: string): TransferRule[] {
  return load<Record<string, RuleIndex>>(dataDir, NATIVE_TRANSPORT_RULES_KEY, {})[tenantId]?.rules ?? [];
}
export function getRule(dataDir: string, tenantId: string, ruleId: string): TransferRule | null {
  return listRules(dataDir, tenantId).find((r) => r.id === ruleId) ?? null;
}
export function saveRule(dataDir: string, r: TransferRule): void {
  const all = load<Record<string, RuleIndex>>(dataDir, NATIVE_TRANSPORT_RULES_KEY, {});
  const idx = all[r.tenantId] ?? { rules: [] };
  const i = idx.rules.findIndex((x) => x.id === r.id);
  if (i >= 0) idx.rules[i] = r;
  else idx.rules.push(r);
  all[r.tenantId] = idx;
  save(dataDir, NATIVE_TRANSPORT_RULES_KEY, all);
}
export function deleteRuleRecord(dataDir: string, tenantId: string, ruleId: string): void {
  const all = load<Record<string, RuleIndex>>(dataDir, NATIVE_TRANSPORT_RULES_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.rules = idx.rules.filter((x) => x.id !== ruleId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_TRANSPORT_RULES_KEY, all);
}

// ── Transfer runs (durable ledger) ─────────────────────────────────────────
interface RunIndex {
  runs: TransferRun[];
}
export function listRuns(dataDir: string, tenantId: string): TransferRun[] {
  return load<Record<string, RunIndex>>(dataDir, NATIVE_TRANSPORT_RUNS_KEY, {})[tenantId]?.runs ?? [];
}
export function getRun(dataDir: string, tenantId: string, runId: string): TransferRun | null {
  return listRuns(dataDir, tenantId).find((r) => r.id === runId) ?? null;
}
export function saveRun(dataDir: string, r: TransferRun): void {
  const all = load<Record<string, RunIndex>>(dataDir, NATIVE_TRANSPORT_RUNS_KEY, {});
  const idx = all[r.tenantId] ?? { runs: [] };
  const i = idx.runs.findIndex((x) => x.id === r.id);
  if (i >= 0) idx.runs[i] = r;
  else idx.runs.push(r);
  all[r.tenantId] = idx;
  save(dataDir, NATIVE_TRANSPORT_RUNS_KEY, all);
}
/** Durable daily-run ledger: count runs requested today (cap enforced BEFORE gate). */
export function countTodayRuns(dataDir: string, tenantId: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return listRuns(dataDir, tenantId).filter((r) => r.createdAt.slice(0, 10) === today).length;
}

// ── PGP key ring ────────────────────────────────────────────────────────────
interface KeyIndex {
  keys: PgpKey[];
}
export function listKeys(dataDir: string, tenantId: string): PgpKey[] {
  return load<Record<string, KeyIndex>>(dataDir, NATIVE_TRANSPORT_KEYS_KEY, {})[tenantId]?.keys ?? [];
}
export function getKey(dataDir: string, tenantId: string, keyId: string): PgpKey | null {
  return listKeys(dataDir, tenantId).find((k) => k.id === keyId) ?? null;
}
export function saveKey(dataDir: string, k: PgpKey): void {
  const all = load<Record<string, KeyIndex>>(dataDir, NATIVE_TRANSPORT_KEYS_KEY, {});
  const idx = all[k.tenantId] ?? { keys: [] };
  const i = idx.keys.findIndex((x) => x.id === k.id);
  if (i >= 0) idx.keys[i] = k;
  else idx.keys.push(k);
  all[k.tenantId] = idx;
  save(dataDir, NATIVE_TRANSPORT_KEYS_KEY, all);
}
export function deleteKeyRecord(dataDir: string, tenantId: string, keyId: string): void {
  const all = load<Record<string, KeyIndex>>(dataDir, NATIVE_TRANSPORT_KEYS_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.keys = idx.keys.filter((x) => x.id !== keyId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_TRANSPORT_KEYS_KEY, all);
}

// ── Pending writes (durable mirror of the approval card) ───────────────────
interface PendingIndex {
  pendingWrites: PendingTransportWrite[];
}
export function listPendingWrites(dataDir: string, tenantId: string): PendingTransportWrite[] {
  return load<Record<string, PendingIndex>>(dataDir, NATIVE_TRANSPORT_PENDING_KEY, {})[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingTransportWrite): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_TRANSPORT_PENDING_KEY, {});
  const idx = all[w.tenantId] ?? { pendingWrites: [] };
  idx.pendingWrites.push(w);
  all[w.tenantId] = idx;
  save(dataDir, NATIVE_TRANSPORT_PENDING_KEY, all);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingTransportWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingTransportWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  result?: { appliedResult?: Record<string, unknown>; error?: string },
): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_TRANSPORT_PENDING_KEY, {});
  const idx = all[tenantId];
  const w = idx?.pendingWrites.find((x) => x.id === id);
  if (!idx || !w || w.status !== "pending") return; // idempotent
  w.status = status;
  if (status === "applied") w.appliedResult = result?.appliedResult;
  else w.error = result?.error ?? "rejected by owner";
  all[tenantId] = idx;
  save(dataDir, NATIVE_TRANSPORT_PENDING_KEY, all);
}

// ── Immutable audit (append-only) ───────────────────────────────────────────
function loadAudit(dataDir: string): NativeTransportAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_TRANSPORT_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeTransportAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeTransportAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({ id: generateTransportEntityId("aev"), ts: new Date().toISOString(), ...entry });
  save(dataDir, NATIVE_TRANSPORT_AUDIT_KEY, audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeTransportAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}

/** sha256 fingerprint of armored key material (server-derived; hex). */
export function fingerprintOf(armored: string): string {
  return createHash("sha256").update(armored, "utf8").digest("hex");
}