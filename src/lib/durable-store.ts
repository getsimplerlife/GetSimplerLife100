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
}

/** In-memory fake driver used by tests (also useful for local dev). */
export class MemoryKvDriver implements KvDriver {
  private store = new Map<string, any>();
  private rows: any[] = [];
  constructor(private initial: Record<string, any> = {}) {
    for (const [k, v] of Object.entries(initial)) this.store.set(k, v);
  }
  async unsafe<T = any>(sql: string, values?: any[]): Promise<T> {
    const s = sql.trim();
    if (/^create table/i.test(s)) return [] as any;
    if (/^insert|^update|^upsert/i.test(s)) {
      const key = String(values?.[0] ?? "");
      const value = values?.[1] ?? null;
      this.store.set(key, value === null ? null : (typeof value === "string" ? JSON.parse(value) : value));
      return [] as any;
    }
    if (/^select/i.test(s)) {
      this.rows = [...this.store.entries()].map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
      }));
      return this.rows as any;
    }
    return [] as any;
  }
  get size(): number { return this.store.size; }
  has(key: string): boolean { return this.store.has(key); }
  get(key: string): any { return this.store.get(key); }
  dump(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of this.store) out[k] = typeof v === "string" ? v : JSON.parse(JSON.stringify(v));
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
}
const DEFAULT_OPTIONS: Required<DurableStoreOptions> = {
  pendingCap: 10_000,
  retryBaseMs: 1_000,
  retryMaxMs: 60_000,
  reconnectIntervalMs: 30_000,
  reconnectMaxAttempts: 0,
  reconnectEnabled: true,
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

export function durableHas(key: string): boolean {
  return enabled && cache.has(key);
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
} {
  return {
    enabled,
    hydrationState,
    pendingWriteCount: pendingWrites.size,
    lastWriteError,
    overflowed,
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

async function attemptInit(
  dir: string,
  providedDriver?: KvDriver,
): Promise<{ enabled: boolean; loaded: number; migrated: number; error?: string }> {
  try {
    if (!providedDriver) {
      // Real Postgres driver (src/lib/db.ts) — throws if DATABASE_URL missing.
      const db = getDb();
      await initDbSchema(db);
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
      return { enabled: true, loaded: rows.length, migrated };
    }
    driver = providedDriver;
    enabled = true; // must be set before queueUpsert runs (migration below)
    await driver.unsafe(
      `CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );
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
    return { enabled: true, loaded: rows.length, migrated };
  } catch (e: any) {
    console.log(`[durable-store] init failed (falling back to file store): ${e?.message || String(e)}`);
    enabled = false;
    driver = null;
    return { enabled: false, loaded: 0, migrated: 0, error: e?.message || String(e) };
  }
}
