import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, basename } from "path";
import { getDb, initDbSchema, pingDb, dbAll, closeDb } from "./db";

/**
 * durable-store.ts — durable runtime data mirror backed by Postgres (Neon).
 *
 * WHY (connection-loss bug, real fix 2026-08-11): the live host does not
 * preserve ANY file path across publishes — file-based storage (inside OR
 * outside the publish tree) is ephemeral per deploy. Connections, OAuth
 * tokens, sessions, users, purchases, chat, and audit logs must live in a
 * durable external database so they survive every publish.
 *
 * This module mirrors the file-based JSON store (data-store.ts) into the
 * Postgres `kv_store` table (see src/lib/db.ts):
 * - `initDurableStore(dataDir)` hydrates an in-memory cache from Postgres,
 *   then migrates any files that exist locally but are missing in the DB
 *   (strictly create-if-missing, idempotent).
 * - `durableGet`/`durableSet` are synchronous (backed by the cache) so the
 *   150+ existing `readJSON`/`writeJSON` call sites keep working unchanged.
 * - Writes are queued and upserted to Postgres asynchronously; the cache is
 *   updated synchronously so reads are immediately consistent.
 *
 * Durability hardening (2026-08-12): a database outage can never silently
 * lose a client write and never leave the app booted with empty data:
 *   1. Write-ahead retry queue: if a DB upsert fails, the latest value per
 *      key is held in an in-memory pending map (latest-wins) and retried
 *      with exponential backoff (1s → 2s → 4s … capped at 60s) until it
 *      succeeds or the process exits. No silent drops — an overflow past the
 *      cap (default 10k keys) logs loudly and is surfaced in admin
 *      diagnostics (`overflowed`), never a crash.
 *   2. Boot resilience: if Postgres is unreachable at init the store stays
 *      disabled (server still boots fail-soft), but a background reconnection
 *      loop retries init; when it succeeds the cache is hydrated from the DB
 *      and reads immediately see real data. `hydrationState` distinguishes
 *      "ready" from "retrying".
 *   3. Backup snapshots (owner mandate 2026-08-12 — "never lose anything
 *      from clients connections"): `durableSnapshotBackup()` copies every
 *      kv_store row into the `kv_store_backup` table with a timestamped
 *      snapshot id; old snapshots past the retention window (default 7 days)
 *      are pruned. Even a catastrophic kv_store failure can be restored from
 *      the most recent snapshot. Status surfaces via durableStoreStatus()
 *      (lastSnapshotAt, snapshotCount) and GET /api/admin/datadir.
 *
 * The driver is injectable for tests: `initDurableStore(dataDir, driver?)`.
 * The default driver uses `postgres` (src/lib/db.ts) against
 * `process.env.DATABASE_URL` (Neon). When DATABASE_URL is absent, the
 * durable store stays disabled and the file-based store (data-store.ts) is
 * the only layer — current behavior, byte-for-byte.
 */

export interface KvDriver {
  /** Execute a SQL statement; returns rows (array of objects) or empty. */
  unsafe<T = any>(sql: string, values?: any[]): Promise<T>;
  /**
   * OPTIONAL atomic single-row lease primitives (P0 #2ecd8f refresh-rotation
   * single-flight). When present the durable store uses these for the
   * refresh lease so acquire is an ATOMIC compare-and-set against the SHARED
   * backing store — two processes/instances can never both acquire. When
   * absent, the durable store falls back to an equivalent conditional SQL
   * (works for the real Postgres driver).
   */
  atomicLeaseAcquire?(leaseKey: string, owner: string, ttlMs: number, nowMs: number): Promise<boolean>;
  atomicLeaseHas?(leaseKey: string, nowMs: number): Promise<boolean>;
  atomicLeaseRelease?(leaseKey: string, owner: string): Promise<void>;
}

/**
 * In-memory fake driver used by tests (also useful for local dev).
 * Table-aware: keeps kv_store and kv_store_backup as separate maps so
 * snapshot/retention logic is exercised exactly like the real DB.
 */
export class MemoryKvDriver implements KvDriver {
  private tables = new Map<string, Map<string, any>>([
    ["kv_store", new Map()],
    ["kv_store_backup", new Map()],
  ]);
  private rows: any[] = [];
  constructor(private initial: Record<string, any> = {}) {
    const t = this.tables.get("kv_store")!;
    for (const [k, v] of Object.entries(initial)) t.set(k, v);
  }
  private tableFor(sql: string): Map<string, any> {
    const m = sql.match(/(?:into|from|update|table)\s+([a-z_0-9]+)/i);
    const name = m ? m[1] : "kv_store";
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }
  async unsafe<T = any>(sql: string, values?: any[]): Promise<T> {
    const s = sql.trim();
    if (/^create table/i.test(s)) return [] as any;
    if (/^insert|^update|^upsert/i.test(s)) {
      const key = String(values?.[0] ?? "");
      const value = values?.[1] ?? null;
      this.tableFor(s).set(key, value === null ? null : (typeof value === "string" ? JSON.parse(value) : value));
      return [] as any;
    }
    if (/^delete/i.test(s)) {
      const keys = values?.[0];
      if (Array.isArray(keys)) for (const k of keys) this.tableFor(s).delete(String(k));
      return [] as any;
    }
    if (/^select/i.test(s)) {
      this.rows = [...this.tableFor(s).entries()].map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
      }));
      return this.rows as any;
    }
    return [] as any;
  }
  get size(): number { return this.tables.get("kv_store")!.size; }
  has(key: string): boolean { return this.tables.get("kv_store")!.has(key); }
  get(key: string): any { return this.tables.get("kv_store")!.get(key); }
  // Atomic lease primitives (P0 #2ecd8f): operate on the kv_store map with a
  // check-then-set that contains no `await`, so two callers sharing this driver
  // (simulating two live instances sharing one Postgres) can never both acquire.
  async atomicLeaseAcquire(leaseKey: string, owner: string, ttlMs: number, nowMs: number): Promise<boolean> {
    const t = this.tables.get("kv_store")!;
    const cur = t.get(leaseKey);
    if (cur && typeof cur === "object" && !Array.isArray(cur) && Number(cur.expiresAt) > nowMs) return false;
    t.set(leaseKey, { owner, acquiredAt: nowMs, expiresAt: nowMs + ttlMs });
    return true;
  }
  async atomicLeaseHas(leaseKey: string, nowMs: number): Promise<boolean> {
    const cur = this.tables.get("kv_store")!.get(leaseKey);
    return Boolean(cur && typeof cur === "object" && Number(cur.expiresAt) > nowMs);
  }
  async atomicLeaseRelease(leaseKey: string, owner: string): Promise<void> {
    const t = this.tables.get("kv_store")!;
    const cur = t.get(leaseKey);
    if (cur && typeof cur === "object" && cur.owner === owner) t.delete(leaseKey);
  }
  dump(): Record<string, any> { return this.dumpTable("kv_store"); }
  dumpTable(name: string): Record<string, any> {
    const t = this.tables.get(name) || new Map();
    const out: Record<string, any> = {};
    for (const [k, v] of t) out[k] = typeof v === "string" ? v : JSON.parse(JSON.stringify(v));
    return out;
  }
}

// ── Tunables (tests shrink these; production defaults below) ────────────────
export interface DurableStoreOptions {
  /** Max distinct keys buffered in the write-ahead queue (default 10_000). */
  pendingCap?: number;
  /** Initial exponential backoff for the write-ahead queue (default 1s). */
  retryBaseMs?: number;
  /** Max backoff for the write-ahead queue (default 60s). */
  retryMaxMs?: number;
  /** How often boot reconnection is attempted while the DB is down (default 30s). */
  reconnectIntervalMs?: number;
  /** Max reconnect attempts (0 = indefinite, default). */
  reconnectMaxAttempts?: number;
  /** Set false to disable the boot reconnection loop entirely (tests). */
  reconnectEnabled?: boolean;
  /** Keep backup snapshots for this many days (default 7). */
  backupRetentionDays?: number;
}
const DEFAULT_OPTIONS: Required<DurableStoreOptions> = {
  pendingCap: 10_000,
  retryBaseMs: 1_000,
  retryMaxMs: 60_000,
  reconnectIntervalMs: 30_000,
  reconnectMaxAttempts: 0,
  reconnectEnabled: true,
  backupRetentionDays: 7,
};
let opts: Required<DurableStoreOptions> = { ...DEFAULT_OPTIONS };

/** Override tunables (tests). Reset via `durableResetOptions()`. */
export function setDurableOptions(next: DurableStoreOptions): void {
  opts = { ...opts, ...next };
}
export function durableResetOptions(): void {
  opts = { ...DEFAULT_OPTIONS };
}

let enabled = false;
let driver: KvDriver | null = null;
let dataDir: string | null = null;
/** key -> JSON text (same shape files store) */
const cache = new Map<string, string>();
/** serialized write queue so upserts land in order */
let writeChain: Promise<void> = Promise.resolve();

// ── Write-ahead retry queue (never silently drop a write) ───────────────────
/** key -> latest JSON text; latest-wins so memory cannot grow unbounded. */
const pendingWrites = new Map<string, { text: string }>();
let drainPromise: Promise<number> | null = null;
let drainTimer: any = null;
let drainDelayMs = DEFAULT_OPTIONS.retryBaseMs;
let overflowed = false;
let lastWriteError: string | null = null;

// ── Backup snapshots (owner mandate: never lose client data) ────────────────
let lastSnapshotAt: number | null = null;
let snapshotCount = 0;
let snapshotSeq = 0;
let lastSnapshotError: string | null = null;

// ── Boot resilience (never permanently fall back to files) ──────────────────
type HydrationState = "ready" | "retrying";
let hydrationState: HydrationState = "ready";
let reconnectTimer: any = null;
let reconnectAttempts = 0;
let retryDir: string | null = null;
let retryDriver: KvDriver | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function durableEnabled(): boolean { return enabled; }

export function durableKeyCount(): number { return cache.size; }

/** True for plain objects (NOT arrays, NOT strings/numbers/null). */
export function isPlainObject(v: any): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Runtime JSON files whose handlers do read-modify-write against tenant keys
 * (`data[email] = ...`, `data[token] = ...`). They MUST parse to plain
 * objects. A row stored as a JSONB *string* (e.g. Neon cell `"{}"` — the
 * string "{}", not the object) parses to a string primitive, so those writes
 * throw "Attempted to assign to readonly property" (real bug found live
 * 2026-08-13 on tenant_purchases.json). The boot repair below normalizes any
 * of these that parse to a non-object back to {} and writes the fix through.
 * NOTE: tenant_audit_logs.json is intentionally absent — its reader tolerates
 * both object and array shapes, so we never destroy an array-format history.
 */
export const OBJECT_FILE_KEYS: readonly string[] = [
  "tenant_purchases.json",
  "sessions.json",
  "users.json",
  "tenant_integrations.json",
  "tenant_oauth_credentials.json",
  "oauth_states.json",
  "leads.json",
  "lead_notifications.json",
  "pending_emails.json",
  "chat_sessions.json",
  "client_files.json",
  "agent_integration_map.json",
];

/**
 * Boot repair for the "parses-to-primitive" class (Neon JSONB-string bug):
 * for every known object-shape key already in the cache, if the parsed value
 * is not a plain object, normalize the cache to {} and queue the write-through
 * so the stored row heals on the next flush. Returns the number of keys
 * repaired. Only touches keys that EXIST — it never creates new rows.
 */
export function repairPrimitiveShapes(): number {
  if (!enabled) return 0;
  let repaired = 0;
  const repairedKeys: string[] = [];
  for (const key of OBJECT_FILE_KEYS) {
    const raw = cache.get(key);
    if (raw === undefined) continue;
    let needsRepair = false;
    try {
      needsRepair = !isPlainObject(JSON.parse(raw));
    } catch {
      needsRepair = true; // unparseable row — heal it
    }
    if (needsRepair) {
      cache.set(key, JSON.stringify({}));
      queueUpsert(key, {});
      repaired++;
      repairedKeys.push(key);
    }
  }
  if (repaired > 0) {
    console.log(`[durable-store] boot repair: normalized ${repaired} primitive-shaped row(s) to {} (${repairedKeys.join(", ")})`);
  }
  return repaired;
}

export function durableDataDir(): string | null { return dataDir; }

/** Relative key for a file path (basename — DATA_DIR files are flat). */
export function durableKeyFor(filePath: string): string {
  return basename(filePath);
}

export function durableGet(key: string): any | undefined {
  if (!enabled) return undefined;
  const raw = cache.get(key);
  if (raw === undefined) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

/**
 * LIVE read straight from the durable store (Postgres), bypassing the
 * boot-hydrated in-memory cache. This is the cross-instance read: when the
 * public site is served by more than one process/instance, a value written by
 * instance A (authorize) is only visible to instance B (callback) by querying
 * the DB directly — B's cache was hydrated at boot and never sees A's write.
 *
 * - Returns the parsed value for `key`, or undefined when absent/unreachable.
 * - On a DB error it falls back to the cache (same contract as durableGet).
 * - Never throws.
 */
export async function durableGetLive(key: string): Promise<any | undefined> {
  if (!enabled || !driver) return durableGet(key);
  try {
    const rows: any[] = await driver.unsafe(`SELECT key, value FROM kv_store WHERE key = $1`, [key]);
    const row = (rows || []).find((r: any) => r && String(r.key) === key);
    if (!row) return undefined;
    let raw = row.value;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { /* keep raw string */ } }
    return raw;
  } catch (e: any) {
    console.log(`[durable-store] live read failed key=${key} err=${e?.message || String(e)}`);
    return durableGet(key);
  }
}

export function durableHas(key: string): boolean {
  return enabled && cache.has(key);
}

// ── Atomic refresh lease (P0 #2ecd8f — cross-instance single-flight) ────────
// Each provider-key owns ONE durable row (`refresh_lease:<providerKey>`) so the
// lease can be acquired/released with an ATOMIC compare-and-set against the
// SHARED backing store. This closes the gap where the previous file-backed
// lease (`refresh_leases.json`) was read-modify-write on a LOCAL file: two live
// instances each saw their own empty file and both acquired, then both redeemed
// the same single-use refresh token — the second got "Refresh token has been
// consumed" (Xero / QBO). When the durable store is disabled these return
// false/noop and the caller falls back to its file-based lease (single-process).
export const REFRESH_LEASE_PREFIX = "refresh_lease:";
export function durableLeaseKey(providerKey: string): string {
  return REFRESH_LEASE_PREFIX + providerKey;
}

/**
 * ATOMIC acquire of the refresh lease for `providerKey`. Only ONE owner across
 * ALL instances sharing the durable store can hold it at a time (fail-closed:
 * an unexpired foreign lease is never overwritten). Returns true only when the
 * lease is now ours.
 */
export async function durableTryLease(
  providerKey: string,
  owner: string,
  ttlMs: number,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!enabled || !driver) return false; // durable disabled → caller uses file lease
  const key = durableLeaseKey(providerKey);
  if (typeof driver.atomicLeaseAcquire === "function") {
    return driver.atomicLeaseAcquire(key, owner, ttlMs, nowMs);
  }
  const val = { owner, acquiredAt: nowMs, expiresAt: nowMs + ttlMs };
  try {
    const rows: any[] = await driver.unsafe(
      `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2::jsonb, now()) ` +
        `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now() ` +
        `WHERE (kv_store.value->>'expiresAt')::bigint < $3 RETURNING key`,
      [key, JSON.stringify(val), nowMs],
    );
    return (rows || []).length > 0;
  } catch (e: any) {
    console.log(`[durable-store] durableTryLease FAILED key=${key} err=${e?.message || String(e)}`);
    return false; // fail-closed: never force a lease on a DB error
  }
}

/** True when `providerKey` currently has a live lease held by ANY owner. */
export async function durableHasLease(providerKey: string, nowMs: number = Date.now()): Promise<boolean> {
  if (!enabled || !driver) return false;
  const key = durableLeaseKey(providerKey);
  if (typeof driver.atomicLeaseHas === "function") {
    return driver.atomicLeaseHas(key, nowMs);
  }
  try {
    const rows: any[] = await driver.unsafe(
      `SELECT key FROM kv_store WHERE key = $1 AND (value->>'expiresAt')::bigint > $2`,
      [key, nowMs],
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

/** Release OUR lease (owner must match; never clears a foreign lease). */
export async function durableReleaseLease(providerKey: string, owner: string): Promise<void> {
  if (!enabled || !driver) return;
  const key = durableLeaseKey(providerKey);
  if (typeof driver.atomicLeaseRelease === "function") {
    await driver.atomicLeaseRelease(key, owner);
    return;
  }
  try {
    await driver.unsafe(`DELETE FROM kv_store WHERE key = $1 AND value->>'owner' = $2`, [key, owner]);
  } catch { /* best effort */ }
}

/**
 * Diagnostics for /api/admin: current store state. `hydrationState` is
 * "retrying" while boot reconnection is still looking for Postgres.
 */
export function durableStoreStatus(): {
  enabled: boolean;
  hydrationState: HydrationState;
  pendingWriteCount: number;
  lastWriteError: string | null;
  overflowed: boolean;
  lastSnapshotAt: number | null;
  snapshotCount: number;
  lastSnapshotError: string | null;
} {
  return {
    enabled,
    hydrationState,
    pendingWriteCount: pendingWrites.size,
    lastWriteError,
    overflowed,
    lastSnapshotAt,
    snapshotCount,
    lastSnapshotError,
  };
}

async function upsertOne(key: string, text: string): Promise<void> {
  await driver!.unsafe(
    `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, text],
  );
}

/** Buffer a failed write for retry (latest-wins; bounded by pendingCap). */
function bufferPending(key: string, text: string): void {
  if (pendingWrites.size >= opts.pendingCap && !pendingWrites.has(key)) {
    if (!overflowed) {
      overflowed = true;
      console.log(
        `[durable-store] PENDING WRITE QUEUE OVERFLOW — ${opts.pendingCap} distinct keys buffered while the DB is down; ` +
        `further NEW keys will be dropped until the queue drains (surfaced in admin as overflowed=true)`,
      );
    }
    return; // drop — never crash, never grow unbounded
  }
  pendingWrites.set(key, { text });
}

/** One attempt at flushing every pending key. Serialized — concurrent callers share a pass. */
export function drainPendingWrites(): Promise<number> {
  if (drainPromise) return drainPromise;
  drainPromise = (async (): Promise<number> => {
    if (!enabled || !driver || pendingWrites.size === 0) return 0;
    let drained = 0;
    let failed = false;
    for (const [key, entry] of [...pendingWrites.entries()]) {
      try {
        await upsertOne(key, entry.text);
        pendingWrites.delete(key);
        drained++;
      } catch (e: any) {
        failed = true;
        lastWriteError = e?.message || String(e);
      }
    }
    if (failed) drainDelayMs = Math.min(drainDelayMs * 2, opts.retryMaxMs);
    else { drainDelayMs = opts.retryBaseMs; lastWriteError = null; }
    if (pendingWrites.size > 0) scheduleDrain();
    return drained;
  })();
  return drainPromise.finally(() => { drainPromise = null; });
}

function scheduleDrain(): void {
  if (drainTimer || drainPromise) return;
  drainTimer = setTimeout(() => {
    drainTimer = null;
    void drainPendingWrites();
  }, drainDelayMs);
  if (drainTimer?.unref) drainTimer.unref();
}

/** Queue an upsert; single fast-path attempt, then the write-ahead queue. */
function queueUpsert(key: string, value: any): void {
  if (!enabled || !driver) return;
  const text = JSON.stringify(value);
  writeChain = writeChain.then(async () => {
    try {
      await upsertOne(key, text);
      lastWriteError = null;
    } catch (e: any) {
      lastWriteError = e?.message || String(e);
      bufferPending(key, text);
      scheduleDrain();
    }
  });
}

/** Synchronous set: update cache immediately, queue async upsert. */
export function durableSet(key: string, value: any): void {
  if (!enabled) return;
  cache.set(key, JSON.stringify(value));
  queueUpsert(key, value);
}

/** Await all pending writes (tests, boot verification). */
export async function durableFlush(): Promise<void> {
  await writeChain;
  await drainPendingWrites();
}

// ── Backup snapshots (owner mandate 2026-08-12) ──────────────────────────────
/**
 * Snapshot every kv_store row into kv_store_backup with a timestamped id,
 * then prune snapshots older than the retention window (default 7 days).
 * Call from the hourly background sweeper in prod-server.ts. Never crashes —
 * failures are recorded in lastSnapshotError and surfaced in admin.
 */
export async function durableSnapshotBackup(): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!enabled || !driver) {
    lastSnapshotError = "durable store not enabled";
    return { ok: false, count: 0, error: lastSnapshotError };
  }
  try {
    const rows: any[] = await driver.unsafe(`SELECT key, value FROM kv_store`);
    const keys: Record<string, any> = {};
    for (const r of rows) {
      let raw = r.value;
      if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { /* keep raw string */ } }
      keys[String(r.key)] = raw;
    }
    // Monotonic suffix guarantees uniqueness even for back-to-back snapshots
    // in the same millisecond (identical ISO ids would collide on the PK).
    const snapshotId = "snap_" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + (++snapshotSeq);
    await driver.unsafe(
      `INSERT INTO kv_store_backup (snapshot_id, data, taken_at) VALUES ($1, $2::jsonb, now())`,
      [snapshotId, JSON.stringify({ takenAt: Date.now(), keys })],
    );
    lastSnapshotAt = Date.now();
    snapshotCount++;
    lastSnapshotError = null;
    const pruned = await pruneOldBackups();
    if (pruned > 0) console.log(`[durable-store] backup snapshot ${snapshotId}: pruned ${pruned} stale snapshot(s) (retention ${opts.backupRetentionDays}d)`);
    return { ok: true, count: Object.keys(keys).length };
  } catch (e: any) {
    lastSnapshotError = e?.message || String(e);
    console.log(`[durable-store] backup snapshot FAILED: ${lastSnapshotError}`);
    return { ok: false, count: 0, error: lastSnapshotError };
  }
}

/** Delete backup snapshots older than the retention window. */
async function pruneOldBackups(): Promise<number> {
  if (!enabled || !driver) return 0;
  const cutoff = Date.now() - opts.backupRetentionDays * 86_400_000;
  try {
    const rows: any[] = await driver.unsafe(`SELECT snapshot_id, data FROM kv_store_backup`);
    const stale: string[] = [];
    for (const r of rows) {
      const raw = r.data ?? r.value;
      let parsed: any = raw;
      if (typeof raw === "string") { try { parsed = JSON.parse(raw); } catch { continue; } }
      if (parsed?.takenAt && Number(parsed.takenAt) < cutoff) stale.push(String(r.snapshot_id ?? r.key));
    }
    if (stale.length) await driver.unsafe(`DELETE FROM kv_store_backup WHERE snapshot_id = ANY($1)`, [stale]);
    return stale.length;
  } catch { return 0; }
}

/** Number of backup snapshots currently stored (0 when disabled). */
export async function durableSnapshotCount(): Promise<number> {
  if (!enabled || !driver) return 0;
  try {
    const rows: any[] = await driver.unsafe(`SELECT snapshot_id FROM kv_store_backup`);
    return rows?.length || 0;
  } catch { return 0; }
}

/** Poll until the store is enabled (boot reconnection succeeded). */
export async function durableWaitForReady(timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now();
  while (!enabled && Date.now() - start < timeoutMs) await sleep(25);
  return enabled;
}

/** Stop the boot reconnection loop (tests / shutdown). */
export function durableStopReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
}

/** Close the connection (tests). */
export async function durableClose(): Promise<void> {
  durableStopReconnect();
  if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
  drainPromise = null;
  pendingWrites.clear();
  drainDelayMs = opts.retryBaseMs;
  overflowed = false;
  lastWriteError = null;
  lastSnapshotAt = null;
  snapshotCount = 0;
  snapshotSeq = 0;
  lastSnapshotError = null;
  hydrationState = "ready";
  writeChain = Promise.resolve();
  enabled = false;
  driver = null;
  dataDir = null;
  retryDir = null;
  retryDriver = null;
  cache.clear();
  await closeDb();
}

function startReconnectLoop(): void {
  if (!opts.reconnectEnabled || reconnectTimer) return;
  reconnectAttempts = 0;
  reconnectTimer = setTimeout(doReconnectAttempt, opts.reconnectIntervalMs);
  if (reconnectTimer?.unref) reconnectTimer.unref();
}

async function doReconnectAttempt(): Promise<void> {
  reconnectTimer = null;
  if (opts.reconnectMaxAttempts > 0 && reconnectAttempts >= opts.reconnectMaxAttempts) return;
  reconnectAttempts++;
  if (!retryDir) return;
  const result = await attemptInit(retryDir, retryDriver);
  if (result.enabled) {
    hydrationState = "ready";
    reconnectAttempts = 0;
    // Any writes buffered during the outage drain via their own backoff loop.
    if (pendingWrites.size > 0) scheduleDrain();
    return;
  }
  hydrationState = "retrying";
  reconnectTimer = setTimeout(doReconnectAttempt, opts.reconnectIntervalMs);
  if (reconnectTimer?.unref) reconnectTimer.unref();
}

/**
 * Initialize the durable store. Loads every row from Postgres into the cache,
 * then migrates any .json files in `dataDir` that are missing in the DB
 * (create-if-missing, idempotent). Safe to call once at boot; returns the
 * status (enabled / loaded / migrated).
 *
 * If the DB is unreachable, returns enabled:false (server still boots
 * fail-soft on files) but starts a background reconnection loop — the store
 * is NOT permanently stuck on files.
 */
export async function initDurableStore(
  dir: string,
  providedDriver?: KvDriver,
  overrides?: DurableStoreOptions,
): Promise<{ enabled: boolean; loaded: number; migrated: number; error?: string }> {
  if (overrides) setDurableOptions(overrides);
  dataDir = dir;
  if (!providedDriver && !process.env.DATABASE_URL?.trim()) {
    durableStopReconnect();
    hydrationState = "ready";
    return { enabled: false, loaded: 0, migrated: 0 };
  }
  const result = await attemptInit(dir, providedDriver);
  if (result.enabled) {
    hydrationState = "ready";
    reconnectAttempts = 0;
    durableStopReconnect();
    return result;
  }
  // Real attempt failed — keep retrying in the background instead of
  // permanently falling back to the (ephemeral) file store.
  hydrationState = "retrying";
  retryDir = dir;
  retryDriver = providedDriver || null;
  startReconnectLoop();
  return result;
}

const CREATE_BACKUP_TABLE =
  `CREATE TABLE IF NOT EXISTS kv_store_backup (` +
  `snapshot_id TEXT PRIMARY KEY, ` +
  `data JSONB NOT NULL, ` +
  `taken_at TIMESTAMPTZ NOT NULL DEFAULT now())`;

async function attemptInit(
  dir: string,
  providedDriver?: KvDriver,
): Promise<{ enabled: boolean; loaded: number; migrated: number; error?: string }> {
  try {
    if (!providedDriver) {
      // Real Postgres driver (src/lib/db.ts) — throws if DATABASE_URL missing.
      const db = getDb();
      await initDbSchema(db); // creates kv_store AND kv_store_backup
      await pingDb(db);
      providedDriver = {
        unsafe: (sql: string, values?: any[]) => db.unsafe(sql, values),
      } as KvDriver;
      const rows = await dbAll(db);
      cache.clear();
      for (const r of rows) cache.set(r.key, JSON.stringify(r.value));
      driver = providedDriver;
      enabled = true; // must be set before migration upserts queue up
      let migrated = 0;
      if (existsSync(dir)) {
        for (const name of readdirSync(dir)) {
          if (!name.endsWith(".json")) continue;
          if (cache.has(name)) continue;
          const full = join(dir, name);
          try {
            if (!statSync(full).isFile()) continue;
            const text = readFileSync(full, "utf-8");
            const parsed = JSON.parse(text);
            cache.set(name, JSON.stringify(parsed));
            queueUpsert(name, parsed);
            migrated++;
          } catch { /* unreadable/corrupt — skip */ }
        }
      }
      await durableFlush();
      // Boot repair: heal any row that parses to a primitive (Neon JSONB-string
      // bug class) BEFORE the first request — read-modify-write handlers
      // (purchases/sessions/users/...) would otherwise throw on the primitive.
      repairPrimitiveShapes();
      await durableFlush();
      return { enabled: true, loaded: rows.length, migrated };
    }
    driver = providedDriver;
    enabled = true; // must be set before queueUpsert runs (migration below)
    await driver.unsafe(
      `CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );
    await driver.unsafe(CREATE_BACKUP_TABLE);
    const rows: any[] = await driver.unsafe(`SELECT key, value FROM kv_store`);
    cache.clear();
    for (const r of rows) {
      const v = r.value;
      cache.set(String(r.key), typeof v === "string" ? v : JSON.stringify(v));
    }
    // Migrate local files that are missing in the DB (create-if-missing).
    let migrated = 0;
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".json")) continue;
        if (cache.has(name)) continue;
        const full = join(dir, name);
        try {
          if (!statSync(full).isFile()) continue;
          const text = readFileSync(full, "utf-8");
          const parsed = JSON.parse(text);
          cache.set(name, JSON.stringify(parsed));
          queueUpsert(name, parsed);
          migrated++;
        } catch { /* unreadable/corrupt — skip */ }
      }
    }
    // Await the migration writes so a caller can rely on data being durable.
    await durableFlush();
    // Boot repair: heal any row that parses to a primitive (Neon JSONB-string
    // bug class) BEFORE the first request.
    repairPrimitiveShapes();
    await durableFlush();
    return { enabled: true, loaded: rows.length, migrated };
  } catch (e: any) {
    console.log(`[durable-store] init failed (falling back to file store): ${e?.message || String(e)}`);
    enabled = false;
    driver = null;
    return { enabled: false, loaded: 0, migrated: 0, error: e?.message || String(e) };
  }
}
