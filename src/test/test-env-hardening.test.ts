import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  isDefaultIsolatedDataDir,
  TEST_DATA_DIR_DEFAULT,
  setDefaultIsolatedDataDirForTest,
  setSpawnLockDirForTest,
  spawnLockPath,
  acquireSpawnLock,
  releaseSpawnLock,
  wipeIsolatedDataDir,
  writeBootMarker,
  isBootMarkerFresh,
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
