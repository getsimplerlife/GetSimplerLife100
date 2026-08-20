import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  acquireSingleInstanceOwnership,
  portAlreadyBound,
} from "../src/lib/single-instance";

const dirs: string[] = [];
function tmpDataDir(): string {
  const d = mkdtempSync(join(tmpdir(), "single-instance-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("single-instance guard", () => {
  it("acquires ownership when no other live instance holds the lock", () => {
    const d = tmpDataDir();
    const own = acquireSingleInstanceOwnership(d, 3000);
    expect(own.ok).toBe(true);
    expect(own.reason).toBeUndefined();
    expect(existsSync(join(d, "prod-server.lock"))).toBe(true);
    own.release!();
    expect(existsSync(join(d, "prod-server.lock"))).toBe(false);
  });

  it("refuses to start when another LIVE instance holds the lock", () => {
    const d = tmpDataDir();
    const lockFile = join(d, "prod-server.lock");
    // Simulate a live owner: our own PID is alive.
    writeFileSync(lockFile, JSON.stringify({ pid: process.pid, port: 3000, startedAt: new Date().toISOString() }));
    const own = acquireSingleInstanceOwnership(d, 3000);
    expect(own.ok).toBe(false);
    expect(own.reason).toMatch(/another live prod-server instance holds ownership/);
  });

  it("reclaims a stale lock whose owner is dead", () => {
    const d = tmpDataDir();
    const lockFile = join(d, "prod-server.lock");
    // A PID that almost certainly does not exist (large) → dead → reclaimable.
    writeFileSync(lockFile, JSON.stringify({ pid: 99999999, port: 3000, startedAt: new Date().toISOString() }));
    const own = acquireSingleInstanceOwnership(d, 3000);
    expect(own.ok).toBe(true);
    expect(JSON.parse(readFileSync(lockFile, "utf-8")).pid).toBe(process.pid);
    own.release!();
  });

  it("portAlreadyBound returns false for an unbound high port", async () => {
    // Use a very high ephemeral port that is almost certainly not listening.
    const bound = await portAlreadyBound(45678, 500);
    expect(bound).toBe(false);
  });
});
