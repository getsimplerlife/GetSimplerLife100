import { describe, it, expect, afterEach, vi } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  TEST_PORT_BASE,
  TEST_PORT_SPAN,
  TEST_DATA_DIR_DEFAULT,
  testPort,
  testBaseUrl,
  testDataDir,
  dataDirForPort,
  claimSpecificPort,
  claimPortForPid,
  portClaimConflicts,
  resetPortClaimConflictsForTest,
  releasePortClaim,
  freeOwnedTestPort,
  killTestServerGroup,
  ensureTestServer,
} from "./test-env";

/**
 * SLICE 172 — the shared-test-server defect must never come back.
 *
 * Three consecutive gates (`cfaac98`, `9f1bc01`, `46b2c03`) were corrupted by
 * ONE server on ONE port (3999) shared by every vitest worker. Two workers
 * then fought over it:
 *   - `freeTestPort()` SIGKILLed whatever LISTENED on the port with no
 *     ownership test, so a worker booting its server killed the other worker's
 *     live one mid-request (`SocketError: other side closed` on :3999, then
 *     `ECONNREFUSED 127.0.0.1:3999` — the measured failure signature);
 *   - `wipeIsolatedDataDir()` wiped the ONE shared data dir for a "fresh boot",
 *     deleting files the other worker's server was serving from
 *     (`expect(existsSync(counterFile)).toBe(true)` → false).
 *
 * These tests pin the two guards that make that impossible now:
 *  1. A port is claimed ATOMICALLY and a claim held by a LIVE foreign pid is
 *     never handed out — the allocator moves on and records the refusal.
 *  2. Teardown may only signal a process group THIS process spawned; anything
 *     else is refused, loudly.
 *
 * They are behavioural, not source greps: each one fails on the pre-fix code
 * (verified by restoring the old shared-port behaviour — see the PR body).
 */

/** A live process to hold a claim / pose as a stranger. Long-lived by design. */
function spawnLiveFixture(): ChildProcess {
  return spawn("bun", ["-e", "setInterval(() => {}, 999);"], { stdio: "ignore" });
}

function pidAlive(pid: number | undefined): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** The pid recorded in a port's claim file, or null. */
function claimOwnerOnDisk(port: number): number | null {
  const p = join(tmpdir(), "sl100-test-ports", String(port), "owner");
  if (!existsSync(p)) return null;
  const pid = Number(readFileSync(p, "utf-8").trim().split(/\s+/)[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

const fixtures: ChildProcess[] = [];
const claimedPorts: number[] = [];

function fixture(): number {
  const f = spawnLiveFixture();
  fixtures.push(f);
  return f.pid as number;
}

afterEach(() => {
  for (const port of claimedPorts.splice(0)) releasePortClaim(port, { force: true });
  for (const f of fixtures.splice(0)) { try { f.kill("SIGKILL"); } catch { /* gone */ } }
  resetPortClaimConflictsForTest();
});

describe("SLICE 172 — a worker's test server is its own (port claim)", () => {
  it("allocates from a private pool, never a reserved or already-shared port", () => {
    const port = testPort();
    expect(port).toBeGreaterThanOrEqual(TEST_PORT_BASE);
    expect(port).toBeLessThan(TEST_PORT_BASE + TEST_PORT_SPAN);
    // The ports this box uses for something else must never be in the pool.
    for (const reserved of [3000, 3017, 3021, 3999, 4198, 4199, 4200, 4597, 4598, 4599, 4600, 4601]) {
      expect(reserved).not.toBe(port);
    }
    // Stable for the process: every test file in this worker agrees.
    expect(testPort()).toBe(port);
    expect(testBaseUrl()).toBe(`http://localhost:${port}`);
  });

  it("refuses to hand a claimed port to a second, live claimant — and records the refusal", () => {
    resetPortClaimConflictsForTest();
    const holder = fixture();
    const rival = fixture();
    expect(holder).not.toBe(rival);

    const port = claimPortForPid(holder);
    claimedPorts.push(port);
    expect(claimOwnerOnDisk(port)).toBe(holder);

    // The rival asks for the SAME port directly: it must be refused.
    expect(claimSpecificPort(port, rival)).toBe(false);
    const conflicts = portClaimConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({ port, heldBy: holder, refused: rival });
    // The claim was not stolen: the holder still owns it on disk.
    expect(claimOwnerOnDisk(port)).toBe(holder);

    // And the allocator never routes a different live worker onto it either.
    const rivalPort = claimPortForPid(rival);
    claimedPorts.push(rivalPort);
    expect(rivalPort).not.toBe(port);
  });

  it("reclaims a claim whose owner is dead (a crashed run cannot wedge the pool)", async () => {
    const dead = fixture();
    const port = claimPortForPid(dead);
    claimedPorts.push(port);
    expect(claimOwnerOnDisk(port)).toBe(dead);
    // Wait for the OS to actually reap it (a zombie still answers kill(pid, 0)),
    // then a live claimant must win the freed claim.
    const gone = new Promise<void>((r) => { const f = fixtures[fixtures.length - 1]; if (f) f.once("exit", () => r()); else r(); });
    process.kill(dead, "SIGKILL");
    await gone;
    await new Promise((r) => setTimeout(r, 100));
    const survivor = fixture();
    expect(claimSpecificPort(port, survivor)).toBe(true);
    expect(claimOwnerOnDisk(port)).toBe(survivor);
  });

  it("gives every worker its own data dir, derived from its own port", () => {
    const a = fixture();
    const b = fixture();
    const portA = claimPortForPid(a);
    const portB = claimPortForPid(b);
    claimedPorts.push(portA, portB);
    expect(portA).not.toBe(portB);
    // Distinct dirs are what stops one worker wiping the store another is serving.
    expect(dataDirForPort(portA)).not.toBe(dataDirForPort(portB));
    expect(dataDirForPort(portA).startsWith(TEST_DATA_DIR_DEFAULT)).toBe(true);
    // This worker's own dir is the one derived from ITS port.
    expect(testDataDir()).toBe(dataDirForPort(testPort()));
  });

  it("refuses to free a port this worker does not own", async () => {
    const mine = testPort();
    const foreign = mine === TEST_PORT_BASE ? TEST_PORT_BASE + 1 : TEST_PORT_BASE;
    await expect(freeOwnedTestPort(foreign)).rejects.toThrow(/REFUSED to free port/);
    // Its own port is fine (and there is nothing listening on it yet).
    await expect(freeOwnedTestPort()).resolves.toBeUndefined();
  });
});

describe("SLICE 172 — teardown only ever kills a server it created", () => {
  it("REFUSES to kill the process group of a pid it did not spawn", () => {
    const stranger = fixture();
    const handle = { pid: stranger, exitCode: null } as unknown as ChildProcess;
    const loud = vi.spyOn(console, "error").mockImplementation(() => { /* captured */ });
    try {
      // The throwing form (stopTestServer's path) must be loud.
      expect(() => killTestServerGroup(handle)).toThrow(/REFUSED to kill process group/);
      // The non-throwing form (process exit / signal handlers) must still refuse.
      expect(killTestServerGroup(handle, { throwOnForeignPid: false })).toBe(false);
      expect(loud).toHaveBeenCalled();
      expect(String(loud.mock.calls[0]?.[0] ?? "")).toContain("did not spawn it");
    } finally {
      loud.mockRestore();
    }
    // The stranger is untouched — this is the whole point.
    expect(pidAlive(stranger)).toBe(true);
  });

  it("boots this worker's server on this worker's port and serves health", async () => {
    const url = await ensureTestServer();
    expect(url).toBe(testBaseUrl());
    const res = await fetch(`${url}/api/health`);
    expect(res.ok).toBe(true);
    // The server really is on the claimed port, not a shared one.
    expect(new URL(url).port).toBe(String(testPort()));
  }, 90_000);
});
