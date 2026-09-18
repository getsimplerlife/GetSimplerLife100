import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn, execSync, type ChildProcess } from "child_process";
import { migrateLegacyData } from "../lib/data-store";
import {
  isDefaultIsolatedDataDir,
  TEST_DATA_DIR_DEFAULT,
  setDefaultIsolatedDataDirForTest,
  setSpawnLockDirForTest,
  acquireSpawnLock,
  releaseSpawnLock,
  wipeIsolatedDataDir,
  writeBootMarker,
  isBootMarkerFresh,
  hardKillTestServer,
} from "./test-env";

/**
 * test-env-hardening.test.ts — regression coverage for the flake fixes
 * (task 21f80636). Two invariants are load-bearing:
 *  1. Only the DEFAULT isolated data dir may be wiped; an explicit
 *     TEST_DATA_DIR (live-dir verification mode) is NEVER wiped.
 *  2. The self-hosted test server is only REUSED while its boot marker is
 *     fresh — a leftover server from a crashed run (healthy but serving
 *     stale data) must be replaced, not reused.
 */
describe("test-env flake hardening (fresh test state every run)", () => {
  afterEach(() => setDefaultIsolatedDataDirForTest(TEST_DATA_DIR_DEFAULT));

  it("treats ONLY the default isolated dir as wipable (never an explicit/live dir)", () => {
    expect(isDefaultIsolatedDataDir(TEST_DATA_DIR_DEFAULT)).toBe(true);
    // Explicit overrides — live dir and any custom dir — are never wiped.
    expect(isDefaultIsolatedDataDir("/var/lib/simplerlife100/.data")).toBe(false);
    expect(isDefaultIsolatedDataDir("/tmp/audit-data")).toBe(false);
    expect(isDefaultIsolatedDataDir("")).toBe(false);
    expect(isDefaultIsolatedDataDir("/tmp")).toBe(false);
  });

  it("points the default isolated dir under /tmp (never the repo or live data dir)", () => {
    expect(TEST_DATA_DIR_DEFAULT.startsWith("/tmp/")).toBe(true);
    expect(TEST_DATA_DIR_DEFAULT).not.toContain("simplerlife100/.data");
  });

  it("wipes + recreates the default isolated dir but NEVER an explicit dir", () => {
    // Explicit dir (live-dir verification mode): content must survive.
    const live = mkdtempSync(join(tmpdir(), "sl100-live-"));
    writeFileSync(join(live, "tenant_purchases.json"), JSON.stringify({ keep: true }));
    wipeIsolatedDataDir(live);
    expect(existsSync(join(live, "tenant_purchases.json"))).toBe(true);
    expect(readdirSync(live).length).toBeGreaterThan(0);
    rmSync(live, { recursive: true, force: true });

    // Default isolated dir (simulated via the test-only setter): stale
    // content must be wiped, then the dir recreated clean.
    const dflt = mkdtempSync(join(tmpdir(), "sl100-default-"));
    setDefaultIsolatedDataDirForTest(dflt);
    writeFileSync(join(dflt, "tenant_purchases.json"), JSON.stringify({ stale: true }));
    writeFileSync(join(dflt, "tenant_oauth_credentials.json"), JSON.stringify({ stale: true }));
    wipeIsolatedDataDir(dflt);
    expect(existsSync(dflt)).toBe(true);
    expect(readdirSync(dflt)).toEqual([]);
    rmSync(dflt, { recursive: true, force: true });
  });

  it("NEVER migrates the live store into the isolated dir (SKIP_LEGACY_MIGRATION)", () => {
    // Regression (oauth-disconnect-durable 100%-repro): the self-hosted test
    // server boots with an EMPTY isolated DATA_DIR, so boot-time
    // migrateLegacyData treated it as a fresh production boot and copied the
    // canonical host's live store — including REAL OAuth credentials (the
    // owner's Xero JWT) — into /tmp/simplerlife100-test-data. Any suite could
    // then read production secrets. The suite must NEVER migrate from the live
    // tree: test-env.ts spawns the server with SKIP_LEGACY_MIGRATION=1.
    const legacy = mkdtempSync(join(tmpdir(), "sl100-legacy-"));
    const target = mkdtempSync(join(tmpdir(), "sl100-target-"));
    try {
      writeFileSync(
        join(legacy, "tenant_oauth_credentials.json"),
        JSON.stringify({ "a@example.com:xero": { accessToken: "REAL-SECRET" } }),
      );

      // Default boot: fresh-dir migration still works (production recovery
      // semantics are unchanged — test-env is the only place that sets the flag).
      rmSync(target, { recursive: true, force: true });
      const migrated = migrateLegacyData(target, [legacy]);
      expect(migrated.migrated).toBe(1);
      expect(existsSync(join(target, "tenant_oauth_credentials.json"))).toBe(true);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(target);

      // Spawned-test-server env: migration skipped — the isolated dir stays clean.
      process.env.SKIP_LEGACY_MIGRATION = "1";
      try {
        const skipped = migrateLegacyData(target, [legacy]);
        expect(skipped.migrated).toBe(0);
        expect(readdirSync(target)).toEqual([]);
      } finally {
        delete process.env.SKIP_LEGACY_MIGRATION;
      }
    } finally {
      rmSync(legacy, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("reuses a server ONLY while its boot marker is fresh AND its spawner is alive", () => {
    const dir = mkdtempSync(join(tmpdir(), "sl100-marker-"));

    // No marker at all (server from a pre-marker era / never booted): not reusable.
    expect(isBootMarkerFresh(dir)).toBe(false);

    // Fresh marker, live spawner (this test process): reusable.
    writeBootMarker(dir);
    expect(isBootMarkerFresh(dir)).toBe(true);
    expect(isBootMarkerFresh(dir, Date.now() + 10_000)).toBe(true);

    // Fresh marker but DEAD spawner (a crashed run left its server up):
    // NOT reusable — the caller must free the port and respawn fresh.
    writeFileSync(join(dir, ".sl100-test-boot"), JSON.stringify({ pid: 2_147_483_647, bootTime: Date.now() }));
    expect(isBootMarkerFresh(dir)).toBe(false);

    // Marker older than the grace window (long-dead run / PID reuse): not reusable.
    writeFileSync(join(dir, ".sl100-test-boot"), JSON.stringify({ pid: process.pid, bootTime: Date.now() - 20 * 60 * 1000 }));
    expect(isBootMarkerFresh(dir)).toBe(false);

    // Corrupt marker: fail closed, never reuse.
    writeFileSync(join(dir, ".sl100-test-boot"), "{ not json");
    expect(isBootMarkerFresh(dir)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it("acquires and RELEASES the spawn lock even though it contains an owner file", () => {
    // Regression: rmdirSync on a lock dir holding an `owner` file throws
    // ENOTEMPTY → the lock LEAKED → every later worker was a permanent loser
    // ("test server spawn failed after retries"). Release must remove the
    // whole dir recursively.
    const lockDir = join(tmpdir(), `sl100-lock-${process.pid}-${Date.now()}-a`);
    setSpawnLockDirForTest(lockDir);
    expect(acquireSpawnLock()).toBe(true);
    expect(existsSync(join(lockDir, "owner"))).toBe(true);
    expect(acquireSpawnLock()).toBe(false); // held by us — another acquirer loses
    releaseSpawnLock();
    expect(existsSync(lockDir)).toBe(false);
    expect(acquireSpawnLock()).toBe(true); // fresh acquire after release
    releaseSpawnLock();
    rmSync(lockDir, { recursive: true, force: true });
  });

  it("reclaims the spawn lock when its recorded owner PID is dead", () => {
    // Regression: a spawning vitest worker died mid-run; its server was still
    // up but the marker's pid was dead → not reusable, and the leaked lock
    // (owner dead) blocked every later worker. The lock must be reclaimed
    // immediately when the recorded owner PID is no longer alive.
    const lockDir = join(tmpdir(), `sl100-lock-${process.pid}-${Date.now()}-b`);
    setSpawnLockDirForTest(lockDir);
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "owner"), "2147483647 1234567890"); // impossible live PID
    expect(acquireSpawnLock()).toBe(true);
    const owner = require("fs").readFileSync(join(lockDir, "owner"), "utf-8");
    expect(owner.startsWith(`${process.pid} `)).toBe(true); // we reclaimed it
    releaseSpawnLock();
    rmSync(lockDir, { recursive: true, force: true });
  });
});

/**
 * Teardown hardening (task 120b7f03) — the :3999 spawn-lock flake class.
 * Root cause: prod-server.ts installs its own SIGTERM/SIGINT handlers
 * (process.once("SIGTERM", () => release())), so SIGTERM is HANDLED, not
 * fatal — the spawned test server survives it and, once its spawner exits,
 * lingers as an orphan holding port 3999 (ppid=1, cwd=deleted worktree).
 * A SIGTERM-only teardown therefore ORPHANS the server; teardown must SIGKILL.
 */
describe("test-env teardown: SIGKILL reaps the spawned test server (no :3999 orphans)", () => {
  // Scratch fixture port — NEVER 3999, so the shared suite server is untouched.
  const SCRATCH_PORT = 4597;

  function pidAlive(pid: number | undefined): boolean {
    if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
  }

  function onceExit(ch: ChildProcess): Promise<void> {
    return new Promise((resolve) => ch.once("exit", () => resolve()));
  }

  async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${what}`)), ms)),
    ]);
  }

  async function waitForServerUp(port: number, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try { const r = await fetch(`http://localhost:${port}/api/health`); if (r.ok) return; } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`fixture server never came up on :${port}`);
  }

  it("hardKillTestServer reaps a SIGTERM-resistant bun server (the orphan class)", async () => {
    // Pre-free the scratch port (self-healing across repeated runs), mirroring
    // the suite's own freeTestPort before every fresh boot.
    try { execSync(`lsof -ti tcp:${SCRATCH_PORT} | xargs -r kill -9 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* no lsof */ }
    // Fixture: bun server with a NO-OP SIGTERM handler — empirically proven to
    // SURVIVE SIGTERM (the exact failure mode of prod-server.ts, which installs
    // its own SIGTERM handler). Only SIGKILL reaps it.
    const ch = spawn("bun", ["-e",
      `process.on("SIGTERM", () => {}); Bun.serve({ port: ${SCRATCH_PORT}, fetch() { return new Response("ok"); } }); setInterval(() => {}, 999);`,
    ], { stdio: "ignore" });
    try {
      await waitForServerUp(SCRATCH_PORT);
      // Document the failure mode: SIGTERM does NOT reap this fixture.
      ch.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 600));
      expect(pidAlive(ch.pid)).toBe(true); // would-be orphan: still serving
      // The fix: SIGKILL teardown reaps it and frees the port.
      const exited = onceExit(ch); // attach BEFORE the kill — after death the event is dropped
      hardKillTestServer(ch);
      await withTimeout(exited, 5000, "fixture did not exit after SIGKILL");
      expect(pidAlive(ch.pid)).toBe(false);
      await expect(fetch(`http://localhost:${SCRATCH_PORT}/api/health`)).rejects.toThrow();
    } finally {
      hardKillTestServer(ch); // belt-and-braces: never leave a stray behind
    }
  });

  it("hardKillTestServer tolerates null and already-exited children (no throw)", async () => {
    expect(() => hardKillTestServer(null)).not.toThrow();
    const done = spawn("sh", ["-c", "exit 0"], { stdio: "ignore" });
    const exited = onceExit(done); // attach immediately — the child exits on its own
    await withTimeout(exited, 5000, "fixture did not exit on its own");
    expect(() => hardKillTestServer(done)).not.toThrow();
    expect(pidAlive(done.pid)).toBe(false);
  });
});
