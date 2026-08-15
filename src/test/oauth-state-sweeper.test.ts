/**
 * oauth-state-sweeper.test.ts — fail-safe behavior of the OAuth-state TTL
 * sweeper (I3, owner-approved).
 *
 * Rules under test:
 *  - entries older than the TTL are removed;
 *  - entries younger than the TTL are never removed;
 *  - the TTL boundary (exactly ttlMs old) is KEPT (strictly-older rule);
 *  - entries with no valid createdAt are KEPT (never guess an age);
 *  - non-object stores are left untouched (no-op);
 *  - only oauth_states.json is touched — other files/keys are never modified;
 *  - the result reports checked/removed counts; idempotent second run.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { sweepExpiredOAuthStates, OAUTH_STATE_TTL_MS } from "../lib/oauth-state-sweeper";

const TTL = OAUTH_STATE_TTL_MS;

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "oauth-sweep-"));
  return dir;
}
let dir: string;
beforeEach(() => {
  dir = freshDir();
});
afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ }
});

function writeStates(dir: string, states: Record<string, unknown>): void {
  writeFileSync(join(dir, "oauth_states.json"), JSON.stringify(states));
}
function readStates(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, "oauth_states.json"), "utf-8"));
}

describe("sweepExpiredOAuthStates — TTL behavior", () => {
  it("removes entries older than 24h and keeps fresh ones", () => {
    writeStates(dir, {
      old_state: { provider: "xero", createdAt: Date.now() - TTL - 60_000 },
      fresh_state: { provider: "slack", createdAt: Date.now() - 60_000 },
    });
    const result = sweepExpiredOAuthStates(dir);
    expect(result.removed).toBe(1);
    expect(result.checked).toBe(2);
    const kept = readStates(dir);
    expect(kept).toHaveProperty("fresh_state");
    expect(kept).not.toHaveProperty("old_state");
  });

  it("keeps an entry exactly at the TTL boundary (strictly-older rule)", () => {
    // Use a fixed reference time so the boundary is deterministic — under
    // load, the ms elapsed between writing createdAt=Date.now()-TTL and the
    // sweep's own Date.now() used to push the entry past the boundary and
    // remove it (pre-existing flake).
    const now = Date.now();
    writeStates(dir, {
      boundary: { provider: "hubspot", createdAt: now - TTL },
    });
    const result = sweepExpiredOAuthStates(dir, TTL, now);
    expect(result.removed).toBe(0);
    expect(readStates(dir)).toHaveProperty("boundary");
  });

  it("never removes entries with missing/invalid createdAt (fail-safe)", () => {
    writeStates(dir, {
      no_ts: { provider: "xero" },
      bad_ts: { provider: "slack", createdAt: "yesterday" },
      null_ts: { provider: "stripe", createdAt: null },
    });
    const result = sweepExpiredOAuthStates(dir);
    expect(result.removed).toBe(0);
    const kept = readStates(dir);
    expect(kept).toHaveProperty("no_ts");
    expect(kept).toHaveProperty("bad_ts");
    expect(kept).toHaveProperty("null_ts");
  });

  it("respects a custom TTL", () => {
    writeStates(dir, {
      fifteen_min_old: { provider: "xero", createdAt: Date.now() - 15 * 60_000 },
      just_created: { provider: "slack", createdAt: Date.now() },
    });
    const result = sweepExpiredOAuthStates(dir, 10 * 60_000);
    expect(result.removed).toBe(1);
    expect(result.ttlMs).toBe(10 * 60_000);
    expect(readStates(dir)).toHaveProperty("just_created");
  });

  it("is idempotent — a second sweep removes nothing more", () => {
    writeStates(dir, {
      old_state: { provider: "xero", createdAt: Date.now() - TTL - 60_000 },
    });
    const first = sweepExpiredOAuthStates(dir);
    const second = sweepExpiredOAuthStates(dir);
    expect(first.removed).toBe(1);
    expect(second.removed).toBe(0);
    expect(second.checked).toBe(0); // nothing left to check
  });
});

describe("sweepExpiredOAuthStates — containment and no-ops", () => {
  it("leaves other files in the data dir untouched", () => {
    writeStates(dir, {
      old_state: { provider: "xero", createdAt: Date.now() - TTL - 60_000 },
    });
    writeFileSync(join(dir, "users.json"), JSON.stringify({ real: { email: "real@x.com" } }));
    const usersBefore = readFileSync(join(dir, "users.json"), "utf-8");
    sweepExpiredOAuthStates(dir);
    expect(readFileSync(join(dir, "users.json"), "utf-8")).toBe(usersBefore);
  });

  it("does nothing when the store is missing", () => {
    const result = sweepExpiredOAuthStates(dir);
    expect(result.removed).toBe(0);
    expect(result.checked).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("does nothing on a non-object store (array or primitive)", () => {
    writeFileSync(join(dir, "oauth_states.json"), JSON.stringify(["a", "b"]));
    const result = sweepExpiredOAuthStates(dir);
    expect(result.removed).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "oauth_states.json"), "utf-8"))).toEqual(["a", "b"]);
  });

  it("does not create the file when sweeping a missing store", () => {
    sweepExpiredOAuthStates(dir);
    expect(existsSync(join(dir, "oauth_states.json"))).toBe(false);
  });
});
