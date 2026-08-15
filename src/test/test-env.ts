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
 *  - Fresh state every run: the spawn-lock winner FREES port 3999, WIPES the
 *    default isolated data dir, then boots the server. A previous run's
 *    purchases / users / oauth states can never pollute the next run (the
 *    NO-FREE-STUFF audit used to read a prior run's tenant_purchases.json and
 *    fail fast). Explicit TEST_DATA_DIR (live-dir verification mode) is NEVER
 *    wiped — that is a hard fail-closed guard.
 *  - Reuse is freshness-gated: the spawner writes a BOOT MARKER into the data
 *    dir once the server is healthy. The fast reuse path only reuses a server
 *    whose marker is (a) recent (bootTime within REUSE_GRACE_MS) AND (b) whose
 *    SPAWNER PROCESS IS STILL ALIVE. A leftover server from a crashed run can
 *    be healthy yet serve STALE data; its spawner is dead, so it is never
 *    reused — the port is freed, the dir wiped, and a fresh server booted.
 *  - The spawn lock is stale-aware: a lock dir left behind by a crashed run
 *    older than 60s is reclaimed instead of making every later run wait for a
 *    server that will never boot.
 *  - Server spawn is retried (bounded loop) when a boot fails to become
 *    healthy or the lock-winner died mid-boot (port-3999 contention / slow
 *    cold start).
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
import { readFileSync, mkdirSync, rmSync, statSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export const TEST_PORT = 3999;
export const SELF_HOSTED_BASE_URL = `http://localhost:${TEST_PORT}`;
export const TEST_DATA_DIR_DEFAULT = "/tmp/simplerlife100-test-data";
const BOOT_MARKER_FILE = ".sl100-test-boot";
/** A server is only reusable while its marker is this fresh. Bounds any single
 *  suite run (worst case ~7 min) plus margin; also guards against PID reuse
 *  making a long-dead spawner look alive. */
export const REUSE_GRACE_MS = 15 * 60_000;
const LOCK_STALE_MS = 60_000;
const MAX_SPAWN_ATTEMPTS = 3;

// The spawn-lock path is mutable ONLY for unit tests (hardening test swaps it
// to a scratch path to prove release + owner-reclaim without touching the real
// /tmp lock). Never reassigned in production paths.
let spawnLockDir = join(tmpdir(), "sl100-test-server.lock");

/** Test-only: point the spawn lock at a scratch dir. */
export function setSpawnLockDirForTest(dir: string): void {
  spawnLockDir = dir;
}

/** The path of the atomic spawn-lock dir (exposed for the hardening test). */
export function spawnLockPath(): string {
  return spawnLockDir;
}

// The default isolated dir is mutable ONLY for unit tests (hardening test
// swaps it to a scratch dir to prove the wipe guard). Never reassigned in
// production paths.
let defaultIsolatedDataDir = TEST_DATA_DIR_DEFAULT;

/** Test-only: point the "default isolated dir" at a scratch dir so the wipe
 *  guard can be exercised without touching the real /tmp test dir. */
export function setDefaultIsolatedDataDirForTest(dir: string): void {
  defaultIsolatedDataDir = dir;
}

/** True when the dir is the default isolated test dir (safe to wipe). */
export function isDefaultIsolatedDataDir(dir: string): boolean {
  return dir === defaultIsolatedDataDir;
}

/** Wipe + recreate the isolated data dir, but ONLY when it is the default
 *  isolated dir. Explicit TEST_DATA_DIR (live-dir verification mode) and any
 *  other directory are NEVER wiped — this is the fail-closed guard. */
export function wipeIsolatedDataDir(dir: string): void {
  if (isDefaultIsolatedDataDir(dir)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  mkdirSync(dir, { recursive: true });
}

/** Dedicated test data dir (env TEST_DATA_DIR overrides). Never the live dir by default. */
export function testDataDir(): string {
  return process.env.TEST_DATA_DIR?.trim() || TEST_DATA_DIR_DEFAULT;
}

/** Base URL: self-hosted test server by default; TEST_BASE_URL overrides. */
export function testBaseUrl(): string {
  return process.env.TEST_BASE_URL?.trim() || SELF_HOSTED_BASE_URL;
}

/** True when the given PID refers to a live process on this host. */
function pidIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    // ESRCH = no such process (dead); EPERM = exists but not ours → alive.
    return e?.code === "EPERM";
  }
}

/** Write the boot marker into the data dir after a server becomes healthy.
 *  Records the SPAWNER pid + boot time; reuse of that server is only allowed
 *  while the marker is recent AND the spawner is still alive. */
export function writeBootMarker(dir: string): void {
  try {
    writeFileSync(join(dir, BOOT_MARKER_FILE), JSON.stringify({ pid: process.pid, bootTime: Date.now() }));
  } catch { /* best effort — a missing marker only disables reuse, never breaks a run */ }
}

/** True when the server booted into `dir` is reusable: marker present, recent,
 *  and its spawner still alive. Missing/corrupt/old/dead-spawner markers fail
 *  closed → the caller must free the port and respawn fresh. */
export function isBootMarkerFresh(dir: string, now = Date.now()): boolean {
  try {
    const p = join(dir, BOOT_MARKER_FILE);
    if (!existsSync(p)) return false;
    const { pid, bootTime } = JSON.parse(readFileSync(p, "utf-8")) as { pid?: number; bootTime?: number };
    if (typeof bootTime !== "number" || !Number.isFinite(bootTime)) return false;
    if (now - bootTime > REUSE_GRACE_MS) return false;
    if (!pidIsAlive(pid as number)) return false;
    return true;
  } catch { return false; }
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
 * spawn the server. Reclaims the lock when its recorded owner is gone: either
 * the lock is older than LOCK_STALE_MS (crashed run) or the owner PID is no
 * longer alive (the spawning worker itself died mid-run — its server may
 * still be up but its data dir ownership is untrustworthy, so we respawn).
 */
export function acquireSpawnLock(): boolean {
  try {
    mkdirSync(spawnLockDir);
    writeFileSync(join(spawnLockDir, "owner"), `${process.pid} ${Date.now()}`);
    return true;
  } catch {
    // Lock dir exists — someone else is (or was) the winner.
    let stale = false;
    try {
      const st = statSync(spawnLockDir);
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS) stale = true;
    } catch { /* lock vanished in a race — loser path is fine */ }
    if (!stale) {
      // Owner PID dead ⇒ the spawner worker died mid-run. Reclaim now rather
      // than making later runs wait for a server whose owner is gone.
      try {
        const ownerRaw = readFileSync(join(spawnLockDir, "owner"), "utf-8");
        const ownerPid = Number(String(ownerRaw).trim().split(" ")[0]);
        if (!Number.isFinite(ownerPid) || !pidIsAlive(ownerPid)) stale = true;
      } catch { /* no owner file — treat as live to avoid racing a live spawn */ }
    }
    if (stale) {
      try {
        rmSync(spawnLockDir, { recursive: true, force: true });
        mkdirSync(spawnLockDir);
        writeFileSync(join(spawnLockDir, "owner"), `${process.pid} ${Date.now()}`);
        return true;
      } catch { return false; }
    }
    return false;
  }
}

/**
 * Release the spawn lock. The lock dir contains an owner file, so it MUST be
 * removed recursively — rmdirSync would throw ENOTEMPTY and LEAK the lock,
 * making every later worker a permanent loser.
 */
export function releaseSpawnLock(): void {
  try { rmSync(spawnLockDir, { recursive: true, force: true }); } catch { /* lock already gone */ }
}

/**
 * Spawn the self-hosted server once. The caller must hold the spawn lock and
 * must have freed the port + prepared a fresh data dir. Throws if the server
 * does not become healthy. Writes the boot marker on success.
 */
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
  try {
    await waitForHealth();
  } catch (e: any) {
    const tail = childLog.slice(-12).join("\n");
    throw new Error(`${e?.message}\n--- test server log tail ---\n${tail}`);
  }
  // Server is healthy and serving from a fresh dir — mark it reusable.
  writeBootMarker(testDataDir());
}

/**
 * Ensure the self-hosted file-backed test server is running on port 3999.
 * Reuses an already-running instance ONLY when its boot marker is fresh AND
 * its spawner process is still alive (i.e. it belongs to this run or a
 * sibling run). Stale leftovers — healthy servers booted by a crashed
 * previous run — are freed, wiped, and respawned so no run can ever read
 * another run's data. Returns the base URL. No-op when TEST_BASE_URL is set.
 */
export async function ensureTestServer(): Promise<string> {
  if (process.env.TEST_BASE_URL?.trim()) return process.env.TEST_BASE_URL.trim();
  if (starting) {
    await starting;
    return SELF_HOSTED_BASE_URL;
  }
  starting = (async () => {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_SPAWN_ATTEMPTS; attempt++) {
      // Fast reuse — ONLY when the marker proves this server belongs to a
      // live run (fresh bootTime + live spawner). A healthy leftover from a
      // crashed run serves STALE data: never reuse it.
      if (isBootMarkerFresh(testDataDir())) {
        try {
          const res = await fetch(`${SELF_HOSTED_BASE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
          if (res.ok) return;
        } catch { /* not up yet */ }
      }
      if (!acquireSpawnLock()) {
        // Another worker/run is (or was) spawning — wait for its server, then
        // loop to re-verify freshness (covers a winner that died mid-boot).
        // A timeout here just means the winner is still booting: keep looping.
        try {
          await waitForHealth(attempt < MAX_SPAWN_ATTEMPTS ? 15_000 : 45_000);
        } catch (e) {
          lastErr = e;
        }
        continue;
      }
      let spawnSucceeded = false;
      try {
        // Fresh state every run: free the port (kill any stale leftover
        // server), then wipe + recreate the default isolated data dir, then
        // boot. NEVER wipe an explicit TEST_DATA_DIR (live-dir mode).
        await freeTestPort();
        await new Promise((r) => setTimeout(r, 700));
        wipeIsolatedDataDir(testDataDir());
        await spawnServerOnce();
        spawnSucceeded = true;
        return;
      } catch (e) {
        lastErr = e;
        if (child) { try { child.kill("SIGKILL"); } catch { /* gone */ } child = null; }
      } finally {
        // The lock dir contains an owner file, so it must be removed
        // recursively — rmdirSync would throw ENOTEMPTY and LEAK the lock,
        // making every later worker a permanent loser.
        releaseSpawnLock();
      }
      if (!spawnSucceeded) {
        // Port contention or slow cold start — harder kill, longer settle, retry.
        await freeTestPort();
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    throw lastErr ?? new Error("test server spawn failed after retries");
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
