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
 * HOW TO RUN THE SUITE (canonical, no live contact, zero Neon pollution):
 *   SLACK_BOT_TOKEN= bun test --maxWorkers=2
 *
 * To point the suite at a REAL branch instance instead (e.g. when verifying
 * a deployed server): TEST_BASE_URL=http://host:port TEST_DATA_DIR=<real dir>.
 * To keep the old live-server behavior explicitly:
 *   TEST_BASE_URL=http://localhost:3000 TEST_DATA_DIR=/var/lib/simplerlife100/.data
 */
import { spawn, type ChildProcess } from "child_process";
import { readFileSync, mkdirSync, rmdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export const TEST_PORT = 3999;
export const SELF_HOSTED_BASE_URL = `http://localhost:${TEST_PORT}`;
export const TEST_DATA_DIR_DEFAULT = "/tmp/simplerlife100-test-data";
const SPAWN_LOCK = join(tmpdir(), "sl100-test-server.lock");

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
    try {
      mkdirSync(SPAWN_LOCK);
    } catch {
      await waitForHealth();
      return;
    }
    try {
      mkdirSync(testDataDir(), { recursive: true });
      // Free the port from any stale leftover test server BEFORE spawning
      // (a previous crashed worker can leave one holding 3999 with a
      // different secret, which would poison every signed request).
      const { execSync } = await import("child_process");
      // Kill any stale leftover test server holding the port by PID (more
      // reliable than fuser across environments).
      try { execSync(`lsof -ti tcp:${TEST_PORT} | xargs -r kill -9 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* no lsof */ }
      try { execSync(`fuser -k ${TEST_PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* fuser missing */ }
      await new Promise((r) => setTimeout(r, 700));
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
