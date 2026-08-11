import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, basename } from "path";

/**
 * durable-store.ts — durable runtime data mirror backed by Postgres (Neon).
 *
 * WHY (connection-loss bug, real fix 2026-08-11): the live host does not
 * preserve ANY file path across publishes — file-based storage (inside OR
 * outside the publish tree) is ephemeral per deploy. Connections, OAuth
 * tokens, sessions, users, purchases, chat, and audit logs must live in a
 * durable external database so they survive every publish.
 *
 * This module mirrors the file-based JSON store (data-store.ts) into a
 * Postgres table `runtime_kv (key TEXT PRIMARY KEY, value JSONB, updated_at)`.
 * - `initDurableStore(dataDir)` hydrates an in-memory cache from Postgres,
 *   then migrates any files that exist locally but are missing in the DB
 *   (strictly create-if-missing, idempotent).
 * - `durableGet`/`durableSet` are synchronous (backed by the cache) so the
 *   150+ existing `readJSON`/`writeJSON` call sites keep working unchanged.
 * - Writes are queued and upserted to Postgres asynchronously with bounded
 *   retry; the cache is updated synchronously so reads are immediately
 *   consistent.
 *
 * The driver is injectable for tests: `initDurableStore(dataDir, driver?)`.
 * The default driver uses Bun.sql against `process.env.DATABASE_URL`
 * (Neon). When DATABASE_URL is absent, the durable store stays disabled and
 * the file-based store (data-store.ts) is the only layer — current behavior.
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
      // INSERT ... (key, value) VALUES ($1, $2) ON CONFLICT ...
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

const DURABLE_TABLE = "runtime_kv";
const MAX_WRITE_ATTEMPTS = 3;

let enabled = false;
let driver: KvDriver | null = null;
let dataDir: string | null = null;
/** key -> JSON text (same shape files store) */
const cache = new Map<string, string>();
/** serialized write queue so upserts land in order */
let writeChain: Promise<void> = Promise.resolve();

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

/** Queue an upsert; bounded retry, failure logged (cache keeps latest). */
function queueUpsert(key: string, value: any): void {
  if (!enabled || !driver) return;
  const text = JSON.stringify(value);
  writeChain = writeChain.then(async () => {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
      try {
        await driver!.unsafe(
          `INSERT INTO ${DURABLE_TABLE} (key, value, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, text],
        );
        return;
      } catch (e) {
        lastErr = e;
        if (attempt < MAX_WRITE_ATTEMPTS) await Bun.sleep(50 * attempt);
      }
    }
    console.log(`[durable-store] FAILED upsert key=${key} err=${(lastErr as any)?.message || String(lastErr)} (will retry on next write)`);
  });
}

/** Synchronous set: update cache immediately, queue async upsert. */
export function durableSet(key: string, value: any): void {
  if (!enabled) return;
  cache.set(key, JSON.stringify(value));
  queueUpsert(key, value);
}

/** Await all pending writes (tests, boot verification). */
export async function durableFlush(): Promise<void> { await writeChain; }

/** Close the connection (tests). */
export async function durableClose(): Promise<void> {
  enabled = false;
  driver = null;
  dataDir = null;
  cache.clear();
}

/**
 * Initialize the durable store. Loads every row from Postgres into the cache,
 * then migrates any .json files in `dataDir` that are missing in the DB
 * (create-if-missing, idempotent). Safe to call once at boot; returns the
 * status (enabled / loaded / migrated).
 */
export async function initDurableStore(
  dir: string,
  providedDriver?: KvDriver,
): Promise<{ enabled: boolean; loaded: number; migrated: number; error?: string }> {
  dataDir = dir;
  const url = process.env.DATABASE_URL?.trim();
  if (!providedDriver && !url) {
    return { enabled: false, loaded: 0, migrated: 0 };
  }
  try {
    if (!providedDriver) {
      const { SQL } = await import("bun");
      const host = (() => { try { return new URL(url!).hostname; } catch { return ""; } })();
      const needsTls = !!host && host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
      // Neon requires TLS; local Postgres usually does not.
      providedDriver = new SQL({ url, tls: needsTls, connectTimeout: 8, max: 2 }) as unknown as KvDriver;
    }
    driver = providedDriver;
    enabled = true; // must be set before queueUpsert runs (migration below)
    await driver.unsafe(
      `CREATE TABLE IF NOT EXISTS ${DURABLE_TABLE} (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );
    const rows: any[] = await driver.unsafe(`SELECT key, value FROM ${DURABLE_TABLE}`);
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
