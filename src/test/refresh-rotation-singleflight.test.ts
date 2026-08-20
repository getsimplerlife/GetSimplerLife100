import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initDurableStore, durableClose, MemoryKvDriver } from "../lib/durable-store";
import { readJSON, writeJSON } from "../lib/data-store";
import { refreshOneCredential } from "../lib/token-refresher";
import { acquireRefreshLease, releaseRefreshLease, refreshContentionStats } from "../lib/connection-refresh-lock";

/**
 * P0 #2ecd8f — refresh-ROTATION single-flight + durable persistence.
 *
 * The live incident (2026-08-20): Xero auto-renew worked ONCE (23:03:26Z) then
 * every sweep failed "invalid_grant Refresh token has been consumed". Xero (and
 * QuickBooks) rotate refresh tokens on every refresh; each is SINGLE-USE. Two
 * failure modes are fixed here:
 *
 *  (a) CROSS-INSTANCE single-flight. The old lease was a read-modify-write on a
 *      LOCAL `refresh_leases.json` — a second instance saw its own empty file,
 *      acquired, and raced to redeem the same single-use token. The new lease
 *      is an ATOMIC durable compare-and-set per provider-key, so across ALL
 *      instances sharing the store exactly ONE process can refresh at a time.
 *  (b) STALE-SNAPSHOT + ROTATION PERSISTENCE. `refreshOneCredential` now
 *      re-reads the LIVE token at refresh time (not the tick-start snapshot), so
 *      a holder always redeems the freshest (unconsumed) token, and the rotated
 *      token is durably flushed BEFORE the lease is released — the next reader
 *      sees the new token, never the consumed one.
 *
 * Tests use an isolated in-memory MemoryKvDriver (no real Neon), simulating two
 * live instances sharing one Postgres.
 */
const KEY = "mathewortiz97@gmail.com:xero";

let tmpBase: string;
let now: number;
const originalFetch = globalThis.fetch;

/** Rotating single-use provider mock: a refresh token can be redeemed ONCE. */
function rotatingFetch() {
  const consumed = new Set<string>();
  let seq = 0;
  const fn = async (_url: any, init: any) => {
    const body = new URLSearchParams(String(init?.body));
    const rt = body.get("refresh_token") || "";
    if (consumed.has(rt)) {
      return {
        ok: false, status: 400,
        text: async () => JSON.stringify({ error: "invalid_grant", error_description: "Refresh token has been consumed" }),
        json: async () => ({}),
      } as unknown as Response;
    }
    consumed.add(rt);
    seq++;
    const newRt = `rt-${seq}`;
    return {
      ok: true, status: 200,
      headers: { get: () => "application/json" },
      text: async () => "",
      json: async () => ({ access_token: `at-${seq}`, refresh_token: newRt, expires_in: 3600, scope: "offline_access" }),
    } as unknown as Response;
  };
  return { fn, currentRt: () => `rt-${seq}` };
}

function seedTokenEntry(rt: string): Record<string, any> {
  return {
    email: "mathewortiz97@gmail.com",
    provider: "xero",
    accessToken: "at-0",
    refreshToken: rt,
    expiresAt: Math.floor(now / 1000) - 1, // expired → refresh due
    scope: "offline_access",
    tokenType: "Bearer",
    updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  };
}

beforeAll(() => {
  tmpBase = mkdtempSync(join(tmpdir(), "sl-refresh-rot-"));
  now = Date.now();
  refreshContentionStats.contended = 0;
  refreshContentionStats.lastContention = null;
});
afterAll(async () => {
  await durableClose();
  globalThis.fetch = originalFetch;
  try { rmSync(tmpBase, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("cross-instance single-flight — durable atomic lease", () => {
  it("two instances sharing one store: exactly ONE acquires the lease; the other contends and never touches the token", async () => {
    const dirA = join(tmpBase, `instA-${Math.random().toString(36).slice(2, 8)}`);
    const dirB = join(tmpBase, `instB-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    // Two "instances" hydrate from the SAME shared backing driver (= one Postgres).
    const shared = new MemoryKvDriver({
      "tenant_oauth_credentials.json": {
        [KEY]: seedTokenEntry("shared-rt"),
        xero: { clientId: "cid", clientSecret: "secret" },
      },
    });
    await initDurableStore(dirA, shared);
    // Instance B "boots" fresh against the same shared store.
    await durableClose();
    await initDurableStore(dirB, shared);

    // Instance A (the sweeper) claims exclusive refresh ownership.
    expect(await acquireRefreshLease(dirA, KEY, "sweeper:1")).toBe(true);

    // Instance B (a verification CLI / second live host) must CONTEND — the
    // atomic durable lease makes a second acquire impossible across instances.
    const fetchB = rotatingFetch().fn;
    const contended = await refreshOneCredential(
      dirB,
      readJSON(join(dirB, "tenant_oauth_credentials.json")),
      readJSON(join(dirB, "tenant_integrations.json")),
      KEY, { now, fetchImpl: fetchB as unknown as typeof fetch, leaseOwner: "verify:2" },
    );
    expect(contended.status).toBe("contended");
    expect(contended.refreshed).toBe(false);
    expect(refreshContentionStats.contended).toBeGreaterThan(0); // recorded, not silent

    // A releases; now B can refresh exactly once using the SAME valid token.
    await releaseRefreshLease(dirA, KEY, "sweeper:1");
    const fetchB2 = rotatingFetch().fn;
    const win = await refreshOneCredential(
      dirB,
      readJSON(join(dirB, "tenant_oauth_credentials.json")),
      readJSON(join(dirB, "tenant_integrations.json")),
      KEY, { now, fetchImpl: fetchB2 as unknown as typeof fetch, leaseOwner: "verify:2" },
    );
    expect(win.status).toBe("ok");
    expect(win.refreshed).toBe(true);
    // The rotated token reached the DURABLE store (cross-instance visible).
    const stored = (shared.dump()["tenant_oauth_credentials.json"] as Record<string, any>)[KEY];
    expect(stored.refreshToken).not.toBe("shared-rt");
    expect(stored.refreshToken).toMatch(/^rt-/);
  });
});

describe("multi-cycle rotation — token moves forward, never consumed", () => {
  it("runs N refresh cycles on a continuously-rotating provider; every cycle uses the current (unconsumed) token and persists the rotation", async () => {
    const dir = join(tmpBase, `cycles-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(dir, { recursive: true });
    const driver = new MemoryKvDriver({
      "tenant_oauth_credentials.json": {
        [KEY]: seedTokenEntry("rt-0"),
        xero: { clientId: "cid", clientSecret: "secret" },
      },
    });
    await initDurableStore(dir, driver);
    const tokenFile = join(dir, "tenant_oauth_credentials.json");
    const connsFile = join(dir, "tenant_integrations.json");
    writeJSON(connsFile, { "mathewortiz97@gmail.com": [{ providerId: "xero", status: "Connected" }] });

    const { fn, currentRt } = rotatingFetch();
    const N = 4;
    for (let i = 1; i <= N; i++) {
      // Pass a deliberately STALE snapshot (one cycle behind the true token) to
      // prove the live re-read redeems the freshest token, never the snapshot.
      const staleSnapshot: Record<string, any> = {
        [KEY]: seedTokenEntry(`rt-${i - 1}`),
        xero: { clientId: "cid", clientSecret: "secret" },
      };
      const out = await refreshOneCredential(dir, staleSnapshot, readJSON(connsFile), KEY, { now, fetchImpl: fn as unknown as typeof fetch });
      expect(out.status).toBe("ok");
      expect(out.refreshed).toBe(true);

      // The rotation is durably persisted (mergeDurableCredential awaits the
      // flush), so the durable convention sees the NEW token for the next cycle.
      const live = ((await readJSON(tokenFile)) as Record<string, any>)[KEY];
      expect(live.refreshToken).toBe(currentRt());
      expect(live.accessToken).toBe(`at-${i}`);
    }
    // Four consecutive rotations, zero "has been consumed" — each single-use
    // refresh token was redeemed exactly once and advanced to the next.
    const stored = (driver.dump()["tenant_oauth_credentials.json"] as Record<string, any>)[KEY];
    expect(stored.refreshToken).toBe(currentRt());
    expect(stored.refreshToken).toMatch(/^rt-/);
  });
});
