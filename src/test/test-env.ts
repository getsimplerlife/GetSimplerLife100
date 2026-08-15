/**
 * test-env.ts — isolated environment for the canonical suite (owner-approved I6).
 *
 * PROBLEM: the canonical suite used to default TEST_BASE_URL to the LIVE
 * port-3000 prod server and TEST_DATA_DIR to the LIVE data dir, so a plain
 * `bun test` run wrote *.test users / purchases / oauth states into live Neon.
 *
 * FIX: the suite now defaults to a SELF-HOSTED, file-backed prod server on
 * port 3999 with a dedicated test data dir (/tmp/simplerlife100-test-data).
 * The spawned server runs with DATABASE_URL="" so the Neon durable store is
 * DISABLED — it writes only to the tmp mirror. The live server keeps
 * DATA_DIR=/var/lib/simplerlife100/.data untouched.
 *
 * FLAKE HARDENING (task 21f80636):
 *  - The shared test data dir is WIPED by the spawn-lock winner before the
 *    server boots, so a previous run's purchases / users / oauth states can
 *    never pollute the next run (e.g. the NO-FREE-STUFF audit used to read a
 *    prior run's tenant_purchases.json and fail). Explicit TEST_DATA_DIR
 *    (live-dir verification mode) is NEVER wiped.
 *  - The spawn lock is stale-aware: a lock dir left behind by a crashed run
 *    older than 60s is reclaimed instead of making every later run wait for a
 *    server that will never boot.
 *  - Server spawn is retried once if the first boot fails to become healthy
 *    (port-3999 contention / slow cold start).
 *
 * HOW TO RUN THE SUITE (canonical, no live contact, zero Neon pollution):
 *   SLACK_BOT_TOKEN= bun run test        # vitest (testTimeout 30s, hookTimeout 60s)
 *   SLACK_BOT_TOKEN= bun test --maxWorkers=2   # bun native (timeout raised via bunfig.toml)
 *
 * To point the suite at a REAL branch instance instead (e.g. when verifying
 * a deployed server): TEST_BASE_URL=http://host:port TEST_DATA_DIR=<real dir>.
 * To keep the old live-server behavior explicitly:
 *   TEST_BASE_URL=http://localhost:3000 TEST_DATA_DIR=/var/lib/simplerlife100/.data
 */
import { spawn, type ChildProcess } from "child_process";
import { readFileSync, mkdirSync, rmdirSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export const TEST_PORT = 3999;
export const SELF_HOSTED_BASE_URL = `http://localhost:${TEST_PORT}`;
export const TEST_DATA_DIR_DEFAULT = "/tmp/simplerlife100-test-data";
const SPAWN_LOCK = join(tmpdir(), "sl100-test-server.lock");
const LOCK_STALE_MS = 60_000;
const SPAWN_ATTEMPTS = 2;

/** True when the dir is the default isolated test dir (safe to wipe at suite start). */
export function isDefaultIsolatedDataDir(dir: string): boolean {
  return dir === TEST_DATA_DIR_DEFAULT;
}

/** Dedicated test data dir (env TEST_DATA_DIR overrides). Never the live dir by default. */
export function testDataDir(): string {
  return process.env.TEST_DATA_DIR?.trim() || TEST_DATA_DIR_DEFAULT;
}

/** Base URL: self-hosted test server by default; TEST_BASE_URL overrides. */
export function testBaseUrl(): string {
  return process.env.TEST_BASE_URL?.trim() || SELF_HOSTED_BASE_URL;
}

let child: ChildProcess | null = null;
let starting: Promise<void> | null = null;
let childLog: string[] = [];

async function waitForHealth(timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SELF_HOSTED_BASE_URL}/api/health`);
      if (res.ok) return;
      lastErr = `status ${res.status}`;
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`test server did not become ready on ${SELF_HOSTED_BASE_URL} (${lastErr})`);
}

/** Mirrors the Stripe secret the spawned server will enforce (from .env). */
export function resolveWebhookSecretFromEnv(): string {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf-8");
    const m = raw.match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m);
    if (m) return m[1].trim();
  } catch { /* no .env in worktree */ }
  return "whsec_test";
}

/** Free the port from any stale leftover test server holding it (async-safe). */
async function freeTestPort(): Promise<void> {
  const { execSync } = await import("child_process");
  try { execSync(`lsof -ti tcp:${TEST_PORT} | xargs -r kill -9 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* no lsof */ }
  try { execSync(`fuser -k ${TEST_PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* fuser missing */ }
}

/**
 * Try to acquire the spawn lock. Returns true when THIS process won and must
 * spawn the server. Reclaims a stale lock (crashed run) older than 60s.
 */
function acquireSpawnLock(): boolean {
  try {
    mkdirSync(SPAWN_LOCK);
    writeFileSync(join(SPAWN_LOCK, "owner"), `${process.pid} ${Date.now()}`);
    return true;
  } catch {
    // Lock dir exists — someone else is (or was) the winner.
    try {
      const st = statSync(SPAWN_LOCK);
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
        // Crashed run left a stale lock — reclaim it.
        rmSync(SPAWN_LOCK, { recursive: true, force: true });
        try {
          mkdirSync(SPAWN_LOCK);
          writeFileSync(join(SPAWN_LOCK, "owner"), `${process.pid} ${Date.now()}`);
          return true;
        } catch { return false; }
      }
    } catch { /* lock vanished in a race — loser path is fine */ }
    return false;
  }
}

/** Spawn the self-hosted server once; throws if it does not become healthy. */
async function spawnServerOnce(): Promise<void> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PORT: String(TEST_PORT),
    DATA_DIR: testDataDir(),
    // Disable the Neon durable store: file-backed, zero live writes.
    DATABASE_URL: "",
    STRIPE_WEBHOOK_SECRET: resolveWebhookSecretFromEnv(),
    SLACK_BOT_TOKEN: "",
    OAUTH_STATE_SWEEP_INTERVAL_MS: String(60 * 60 * 1000),
    BACKUP_SNAPSHOT_INTERVAL_MS: String(60 * 60 * 1000),
    TOKEN_SWEEP_INTERVAL_MS: String(60 * 60 * 1000),
  };
  childLog = [];
  child = spawn("bun", ["run", "prod-server.ts"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => { childLog.push(String(d)); });
  child.stderr?.on("data", (d) => { childLog.push(String(d)); });
  child.on("exit", (code, sig) => { childLog.push(`[test-server] exited code=${code} sig=${sig}`); });
  await waitForHealth().catch((e) => {
    const tail = childLog.slice(-12).join("\n");
    throw new Error(`${e.message}\n--- test server log tail ---\n${tail}`);
  });
}

/**
 * Ensure the self-hosted file-backed test server is running on port 3999.
 * Reuses an already-running instance (idempotent across vitest workers via a
 * spawn lock); returns the base URL. No-op when TEST_BASE_URL is set.
 */
export async function ensureTestServer(): Promise<string> {
  if (process.env.TEST_BASE_URL?.trim()) return process.env.TEST_BASE_URL.trim();
  if (starting) {
    await starting;
    return SELF_HOSTED_BASE_URL;
  }
  starting = (async () => {
    // Reuse if an instance is already up (another worker spawned it).
    try {
      const res = await fetch(`${SELF_HOSTED_BASE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch { /* not up yet */ }
    // Atomic spawn lock — the winner spawns, losers wait for health.
    if (!acquireSpawnLock()) {
      await waitForHealth();
      return;
    }
    try {
      const dir = testDataDir();
      // Fresh state every run: wipe the default isolated dir before the
      // server boots so a previous run's records can never pollute this run.
      // NEVER wipe an explicit TEST_DATA_DIR (live-dir verification mode).
      if (isDefaultIsolatedDataDir(dir)) {
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
      mkdirSync(dir, { recursive: true });
      // Free the port from any stale leftover test server BEFORE spawning
      // (a previous crashed worker can leave one holding 3999 with a
      // different secret, which would poison every signed request).
      await freeTestPort();
      await new Promise((r) => setTimeout(r, 700));
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= SPAWN_ATTEMPTS; attempt++) {
        try {
          await spawnServerOnce();
          return;
        } catch (e) {
          lastErr = e;
          if (attempt < SPAWN_ATTEMPTS) {
            // Port contention or slow cold start — kill harder and retry.
            if (child) { try { child.kill("SIGKILL"); } catch { /* gone */ } child = null; }
            await freeTestPort();
            await new Promise((r) => setTimeout(r, 1200));
          }
        }
      }
      throw lastErr ?? new Error("test server spawn failed");
    } finally {
      try { rmdirSync(SPAWN_LOCK); } catch { /* lock already gone */ }
    }
  })();
  try {
    await starting;
  } finally {
    starting = null;
  }
  return SELF_HOSTED_BASE_URL;
}
export function stopTestServer(): void {
  if (child) {
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
    child = null;
  }
}
process.on("exit", () => {
  if (child) {
    try { child.kill("SIGKILL"); } catch { /* already gone */ }
  }
});
