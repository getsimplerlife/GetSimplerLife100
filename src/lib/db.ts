import postgres from "postgres";

/**
 * db.ts — thin Neon/Postgres client for the durable runtime data store.
 *
 * WHY (connection-loss bug, real fix 2026-08-11): the live host does not
 * preserve ANY file path across publishes — file-based storage (inside OR
 * outside the publish tree) is ephemeral per deploy. Runtime data
 * (connections, OAuth tokens, sessions, users, purchases, chat, audit logs)
 * must live in a durable external database so it survives every publish.
 *
 * Fail-closed contract:
 *  - `getDb()` throws a clear error at FIRST USE if DATABASE_URL is missing —
 *    NOT at import, so tests/sandbox without the env var still run.
 *  - `initDbSchema()` is idempotent (CREATE TABLE IF NOT EXISTS).
 *  - `pingDb()` verifies connectivity (SELECT 1).
 *  - Schema is a single `kv_store` table: one row per JSON document key,
 *    JSON payload in a jsonb column, upsert on write.
 */

const KV_TABLE = "kv_store";

let _db: postgres.Sql | null = null;

/** Get (and lazily create) the Postgres client. Throws if DATABASE_URL is absent. */
export function getDb(): postgres.Sql {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "[db] DATABASE_URL is not set — durable Postgres store unavailable. " +
        "Set DATABASE_URL (Neon serverless Postgres connection string) to enable durable storage; " +
        "without it the app uses the file-based store exactly as before.",
    );
  }
  if (!_db) {
    const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
    const needsTls = !!host && host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
    // Neon requires TLS; local Postgres usually does not.
    _db = postgres(url, {
      ssl: needsTls ? "require" : false,
      connect_timeout: 8,
      max: 2,
      idle_timeout: 30,
      // Fail soft at connect: callers decide what to do (boot keeps file fallback).
      onnotice: () => {},
    });
  }
  return _db;
}

/** Idempotent schema init — CREATE TABLE IF NOT EXISTS kv_store. */
export async function initDbSchema(db: postgres.Sql = getDb()): Promise<void> {
  await db.unsafe(
    `CREATE TABLE IF NOT EXISTS ${KV_TABLE} (` +
      `key TEXT PRIMARY KEY, ` +
      `value JSONB NOT NULL, ` +
      `updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
}

/** Ping the DB (SELECT 1). Throws on failure. */
export async function pingDb(db: postgres.Sql = getDb()): Promise<boolean> {
  const rows: any[] = await db.unsafe(`SELECT 1 AS ok`);
  return rows?.[0]?.ok === 1;
}

/** Upsert a JSON document into kv_store (create or replace). */
export async function dbUpsert(key: string, value: unknown, db: postgres.Sql = getDb()): Promise<void> {
  await db.unsafe(
    `INSERT INTO ${KV_TABLE} (key, value, updated_at) VALUES ($1, $2::jsonb, now()) ` +
      `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

/** Read a JSON document from kv_store (null when missing). */
export async function dbGet(key: string, db: postgres.Sql = getDb()): Promise<any | null> {
  const rows: any[] = await db.unsafe(`SELECT value FROM ${KV_TABLE} WHERE key = $1`, [key]);
  if (!rows?.length) return null;
  const v = rows[0].value;
  return typeof v === "string" ? JSON.parse(v) : v;
}

/** Load every kv_store row: { key, value }[] (value parsed). */
export async function dbAll(db: postgres.Sql = getDb()): Promise<{ key: string; value: any }[]> {
  const rows: any[] = await db.unsafe(`SELECT key, value FROM ${KV_TABLE}`);
  return (rows || []).map((r) => ({
    key: String(r.key),
    value: typeof r.value === "string" ? JSON.parse(r.value) : r.value,
  }));
}

/** Close the client (tests / graceful shutdown). */
export async function closeDb(): Promise<void> {
  if (_db) {
    try { await _db.end(); } catch { /* best effort */ }
    _db = null;
  }
}
