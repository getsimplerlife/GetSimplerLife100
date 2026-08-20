import { describe, expect, it, beforeEach, afterEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initDurableStore, durableClose, durableGet, MemoryKvDriver } from "../lib/durable-store";
import { buildConnectedAccountsFromCredentials } from "../lib/connected-accounts";
import { startHealthHeartbeat } from "../lib/connection-health";
import { sweepExpiredTokens, startScheduledTokenRefresher } from "../lib/token-refresher";

/**
 * #234 durable-first reads — regression suite (2026-08-19).
 *
 * The live host runs multiple instances. When ONE instance handles an OAuth
 * reconnect it persists the token to the durable store (Neon); the OTHER
 * instances booted earlier still hold a boot-hydrated in-memory cache and a
 * local file WITHOUT the new row. Before this fix the three hot-path readers
 * (Connected Accounts page, health heartbeat, token refresher) used readJSON()
 * (cache → file) and therefore never saw the reconnect token — so the owner's
 * freshly reconnected Xero card vanished minutes after connecting.
 *
 * Each test simulates exactly that: file without xero, cache without xero,
 * durable store WITH xero (written by "another instance" after this one
 * booted). With durable-first reads (readJSONLive) all three readers must see
 * the token.
 */
const EMAIL = "durable-first@example.com";
const PROVIDER = "xero";
const KEY = `${EMAIL}:${PROVIDER}`;

let tmpBase: string;
let now: number;
const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(() => {
  tmpBase = mkdtempSync(join(tmpdir(), "sl-durable-first-"));
});
afterAll(async () => {
  await durableClose();
  globalThis.fetch = originalFetch;
  try { rmSync(tmpBase, { recursive: true, force: true }); } catch { /* best effort */ }
});
beforeEach(() => {
  now = Date.now();
  // Deterministic env: no provider client credentials leaking from the host.
  for (const k of Object.keys(process.env)) {
    if (/^(OAUTH_)?(XERO|HUBSPOT|DOCUSIGN)_CLIENT_(ID|SECRET)$/.test(k)) delete process.env[k];
  }
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: "offline_access" }),
  }) as unknown as Response);
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});
afterEach(async () => {
  globalThis.fetch = originalFetch;
  await durableClose();
});

/** A token that exists ONLY in the durable store, not in this instance's boots. */
function durableOnlyToken(over: { expiresAt?: number; withAppCreds?: boolean } = {}): Record<string, any> {
  const tokenEntry: Record<string, any> = {
    email: EMAIL,
    provider: PROVIDER,
    accessToken: "at-durable-only",
    refreshToken: "rt-durable-only",
    // The token lives ONLY in the durable store; a stored Xero tenant means the
    // health probe resolves it without a header-less /Organisation call (the
    // #185 tenant-resolution hotfix is fail-closed: no stored tenant + no
    // /connections result ⇒ no probe). Assertion (probed=1, ok=1) is unchanged.
    tenantId: "tenant-durable-only",
    expiresAt: over.expiresAt ?? Math.floor((now - 60_000) / 1000), // expired → refresh due
    scope: "accounting.transactions",
    tokenType: "Bearer",
    updatedAt: new Date(now - 120_000).toISOString(),
  };
  const payload: Record<string, any> = { [KEY]: tokenEntry };
  if (over.withAppCreds) payload[PROVIDER] = { clientId: "client-id", clientSecret: "client-secret" };
  return payload;
}

/** Boot a fresh instance: LOCAL file + cache have NO xero; the driver is the DB. */
async function bootFresh(dir: string): Promise<MemoryKvDriver> {
  await durableClose();
  mkdirSync(dir, { recursive: true });
  // Local file without xero (this instance's stale publish snapshot).
  writeFileSync(join(dir, "tenant_oauth_credentials.json"), JSON.stringify({}));
  const driver = new MemoryKvDriver({});
  const r = await initDurableStore(dir, driver);
  expect(r.enabled).toBe(true);
  // Sanity guard: this instance genuinely boots WITHOUT the durable-only token.
  const cached = durableGet("tenant_oauth_credentials.json") || {};
  expect(cached[KEY]).toBeUndefined();
  const file = JSON.parse(readFileSync(join(dir, "tenant_oauth_credentials.json"), "utf8"));
  expect(file[KEY]).toBeUndefined();
  return driver;
}

/** "Another instance" persists the token straight into the DB after boot. */
async function anotherInstanceWritesXero(driver: MemoryKvDriver, payload: Record<string, any>): Promise<void> {
  await driver.unsafe("INSERT INTO kv_store (k, v) VALUES ($1, $2)", ["tenant_oauth_credentials.json", payload]);
}

describe("#234 durable-first reads — token only in the durable store", () => {
  it("(a) Connected Accounts returns the xero card from the durable store alone", async () => {
    const dir = join(tmpBase, `ca-${Math.random().toString(36).slice(2, 8)}`);
    const driver = await bootFresh(dir);
    await anotherInstanceWritesXero(driver, durableOnlyToken());

    const accounts = await buildConnectedAccountsFromCredentials(EMAIL, dir);

    const xero = accounts.find((a) => a.provider === PROVIDER);
    expect(xero).toBeDefined();
    expect(xero!.id).toBe(KEY);
    expect(xero!.status).toBe("Connected");
    // No phantom connectors leak in.
    expect(accounts.some((a) => a.provider === "slack")).toBe(false);
    // A different tenant never sees the token (data isolation holds by key).
    const stranger = await buildConnectedAccountsFromCredentials("someone-else@example.com", dir);
    expect(stranger.some((a) => a.provider === PROVIDER)).toBe(false);
  });

  it("(b) the health heartbeat probes the durable-only token (probed=1, ok=1)", async () => {
    const dir = join(tmpBase, `hb-${Math.random().toString(36).slice(2, 8)}`);
    const driver = await bootFresh(dir);
    await anotherInstanceWritesXero(driver, durableOnlyToken());

    const hb = startHealthHeartbeat(dir, {
      intervalMs: 1_000_000_000, // never auto-fires; we drive runCycle ourselves
      // Real Response so probeProvider can call .text(); HTTP 200 → xero probe ok.
      fetchImpl: (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
      now: () => now,
    });
    try {
      const r = await hb.runCycle();
      expect(r.probed).toBe(1); // xero has an audited probe and a refresh path
      expect(r.ok).toBe(1);
    } finally {
      hb.stop();
    }
  });

  it("(c) the refresher sweep sees the durable-only token and refreshes it", async () => {
    const dir = join(tmpBase, `sw-${Math.random().toString(36).slice(2, 8)}`);
    const driver = await bootFresh(dir);
    await anotherInstanceWritesXero(driver, durableOnlyToken({ withAppCreds: true }));

    const r = await sweepExpiredTokens(dir, { now });

    expect(r.refreshed).toBe(1);
    expect(r.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("(c-sched) the scheduled refresher tick considers the durable-only token due", async () => {
    const dir = join(tmpBase, `sc-${Math.random().toString(36).slice(2, 8)}`);
    const driver = await bootFresh(dir);
    // No app creds → refreshOneCredential short-circuits WITHOUT network and
    // without mutating the token, so every tick deterministically sees it due.
    await anotherInstanceWritesXero(driver, durableOnlyToken({ withAppCreds: false }));

    const handle = startScheduledTokenRefresher(dir, { tickMs: 1_000_000_000, now: () => now });
    try {
      const res = await handle.runTick();
      expect(res.due).toBe(1); // the durable-only token was found and due
      expect(res.outcomes).toHaveLength(1);
      expect(res.outcomes[0].refreshed).toBe(false); // skipped on missing creds only
      expect(String(res.outcomes[0].error)).toContain("creds");
      expect(fetchMock).not.toHaveBeenCalled(); // fail-closed: never guessed network calls
    } finally {
      handle.stop();
    }
  });
});