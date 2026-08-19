// Token refresher — keep OAuth connections alive 24/7 (2026-08-12).
//
// Regression tests for src/lib/token-refresher.ts:
//  1. Fresh tokens are never churned — no refresh call fires.
//  2. Near-expiry tokens are refreshed and the new tokens land in the
//     durable store via the existing connection write path.
//  3. A refresh failure marks the connection auth_failed and never crashes.
//  4. Unknown providers FAIL CLOSED — no registry entry ⇒ no network call,
//     no guessed URL.
// All provider calls use a mocked fetch — no live provider traffic in CI.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  needsRefresh, sweepExpiredTokens, isRefreshProvider, tokenSweepStats,
  REFRESH_REGISTRY,
} from "../lib/token-refresher";
import { writeJSON } from "../lib/data-store";
import { initDurableStore, durableClose, durableFlush, MemoryKvDriver } from "../lib/durable-store";

let tmpDir: string;
let now: number;
const HOUR = 60 * 60 * 1000;
const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sl-token-refresh-"));
});
beforeEach(() => {
  now = Date.now();
  // Deterministic env: no provider client credentials in env for these tests.
  for (const k of Object.keys(process.env)) {
    if (/^(OAUTH_)?(XERO|HUBSPOT|DOCUSIGN)_CLIENT_(ID|SECRET)$/.test(k)) delete process.env[k];
  }
  tokenSweepStats.lastSweep = 0;
  tokenSweepStats.nextSweep = 0;
  tokenSweepStats.tokensRefreshed = 0;
  tokenSweepStats.tokensFailed = 0;
  tokenSweepStats.lastError = null;
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
  // #234 durable-first reads: tests that init the durable store must not let a
  // flushed stale driver bleed into the next test — close it after every test
  // so later reads hit the per-test file (readJSONLive must see the seed, not
  // a previous test's flushed snapshot).
  await durableClose();
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await durableClose();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

/** Seed a token entry + matching connection for the sweep. */
function seedStore(over: {
  expiresAt?: number;
  updatedAt?: string;
  provider?: string;
  refreshToken?: string | null;
  status?: string;
  tokenKey?: string;
} = {}): string {
  const dir = join(tmpDir, `store-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const tokenKey = over.tokenKey ?? "owner@example.com:xero";
  const provider = over.provider ?? "xero";
  const tokenData: Record<string, any> = {
    [tokenKey]: {
      provider,
      email: "owner@example.com",
      accessToken: "old-access",
      refreshToken: over.refreshToken === null ? undefined : (over.refreshToken ?? "old-refresh"),
      expiresAt: over.expiresAt ?? Math.floor((now + HOUR) / 1000),
      scope: "offline_access",
      tokenType: "Bearer",
      updatedAt: over.updatedAt ?? new Date(now - 60_000).toISOString(),
    },
    [provider]: { clientId: "client-id", clientSecret: "client-secret" }, // OAuth app creds
  };
  const conns: Record<string, any> = {
    "owner@example.com": [{
      id: "int-1",
      provider,
      providerId: provider,
      category: "Finance",
      status: over.status ?? "Connected",
      connectedAt: new Date(now - 86_400_000).toISOString(),
      lastSync: new Date(now - 60_000).toISOString(),
      credentials: { apiKey: "old-access", oauth: true },
    }],
  };
  writeJSON(join(dir, "tenant_oauth_credentials.json"), tokenData);
  writeJSON(join(dir, "tenant_integrations.json"), conns);
  return dir;
}

describe("token refresher — needsRefresh policy", () => {
  it("refreshes at/past ~70% of the token lifetime", () => {
    // lifetime 1h, issued 1h ago, expires now → 100% elapsed → refresh.
    const near = { updatedAt: new Date(now - HOUR).toISOString(), expiresAt: Math.floor(now / 1000) };
    expect(needsRefresh(near, now)).toBe(true);
    // lifetime 1h, issued 10 min ago, expires in 50 min → ~16% elapsed → keep.
    const fresh = { updatedAt: new Date(now - 600_000).toISOString(), expiresAt: Math.floor((now + 50 * 60_000) / 1000) };
    expect(needsRefresh(fresh, now)).toBe(false);
  });

  it("no-expiry tokens refresh only after the sane window, never while fresh", () => {
    expect(needsRefresh({ updatedAt: new Date(now - 2 * HOUR).toISOString() }, now)).toBe(false);
    expect(needsRefresh({ updatedAt: new Date(now - 13 * HOUR).toISOString() }, now)).toBe(true);
    expect(needsRefresh({ updatedAt: undefined }, now)).toBe(false); // unknown age — don't churn
  });
});

describe("token refresher — registry fail-closed", () => {
  it("only audited providers are registered (xero, hubspot, docusign)", () => {
    expect(isRefreshProvider("xero")).toBe(true);
    expect(isRefreshProvider("hubspot")).toBe(true);
    expect(isRefreshProvider("docusign")).toBe(true);
    expect(isRefreshProvider("mystery")).toBe(false);
    expect(REFRESH_REGISTRY.xero.tokenUrl).toBe("https://identity.xero.com/connect/token");
    expect(REFRESH_REGISTRY.hubspot.tokenUrl).toBe("https://api.hubapi.com/oauth/v1/token");
    expect(REFRESH_REGISTRY.docusign.tokenUrl).toBe("https://account-d.docusign.com/oauth/token");
  });
});

describe("token refresher — sweep", () => {
  it("fresh token → no refresh call, nothing written", async () => {
    const dir = seedStore({ updatedAt: new Date(now - 60_000).toISOString(), expiresAt: Math.floor((now + HOUR) / 1000) });
    const r = await sweepExpiredTokens(dir, { now });
    expect(r.refreshed).toBe(0);
    expect(r.failed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    const onDisk = JSON.parse(readFileSync(join(dir, "tenant_oauth_credentials.json"), "utf-8"));
    expect(onDisk["owner@example.com:xero"].accessToken).toBe("old-access");
  });

  it("near-expiry → refresh called, tokens written through the durable store", async () => {
    const dir = seedStore({
      updatedAt: new Date(now - HOUR).toISOString(),
      expiresAt: Math.floor((now + 60_000) / 1000), // ~last 30% of a 1h token
    });
    // Init the durable store with the same data so the write path mirrors to the DB.
    const driver = new MemoryKvDriver({
      "tenant_oauth_credentials.json": JSON.parse(readFileSync(join(dir, "tenant_oauth_credentials.json"), "utf-8")),
      "tenant_integrations.json": JSON.parse(readFileSync(join(dir, "tenant_integrations.json"), "utf-8")),
    });
    await durableClose();
    await initDurableStore(dir, driver);

    const r = await sweepExpiredTokens(dir, { now });
    expect(r.refreshed).toBe(1);
    expect(r.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://identity.xero.com/connect/token");
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=old-refresh");
    expect(body).toContain("client_id=client-id");
    // Durable store (the real write path) holds the new tokens.
    await durableFlush();
    const dbTokens = driver.dump()["tenant_oauth_credentials.json"]["owner@example.com:xero"];
    expect(dbTokens.accessToken).toBe("new-access");
    expect(dbTokens.refreshToken).toBe("new-refresh");
    expect(dbTokens.expiresAt).toBeGreaterThan(Math.floor(now / 1000));
    // Connection record restored to Connected with the new apiKey.
    const dbConns = driver.dump()["tenant_integrations.json"]["owner@example.com"];
    expect(dbConns[0].status).toBe("Connected");
    expect(dbConns[0].credentials.apiKey).toBe("new-access");
    expect(dbConns[0].lastSync).toBe(new Date(now).toISOString());
  });

  it("docusign near-expiry → refresh against audited tokenUrl, rotated refresh token persisted", async () => {
    const dir = seedStore({
      provider: "docusign",
      tokenKey: "owner@example.com:docusign",
      updatedAt: new Date(now - HOUR).toISOString(),
      expiresAt: Math.floor((now + 60_000) / 1000), // ~last 30% of lifetime → refresh
    });
    const driver = new MemoryKvDriver({
      "tenant_oauth_credentials.json": JSON.parse(readFileSync(join(dir, "tenant_oauth_credentials.json"), "utf-8")),
      "tenant_integrations.json": JSON.parse(readFileSync(join(dir, "tenant_integrations.json"), "utf-8")),
    });
    await durableClose();
    await initDurableStore(dir, driver);
    const r = await sweepExpiredTokens(dir, { now });
    expect(r.refreshed).toBe(1);
    expect(r.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://account-d.docusign.com/oauth/token");
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=old-refresh");
    expect(body).toContain("client_id=client-id");
    // Rotation persisted through the durable write path (PR #156 rule).
    await durableFlush();
    const dbTokens = driver.dump()["tenant_oauth_credentials.json"]["owner@example.com:docusign"];
    expect(dbTokens.accessToken).toBe("new-access");
    expect(dbTokens.refreshToken).toBe("new-refresh");
    expect(dbTokens.expiresAt).toBeGreaterThan(Math.floor(now / 1000));
    const dbConns = driver.dump()["tenant_integrations.json"]["owner@example.com"];
    expect(dbConns[0].status).toBe("Connected");
    expect(dbConns[0].credentials.apiKey).toBe("new-access");
  });
  it("docusign refresh failure (bad grant) → fail-closed: auth_failed, exactly one call", async () => {
    const dir = seedStore({
      provider: "docusign",
      tokenKey: "owner@example.com:docusign",
      updatedAt: new Date(now - HOUR).toISOString(),
      expiresAt: Math.floor((now + 60_000) / 1000),
    });
    fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      headers: { get: () => "application/json" },
      text: async () => "invalid_grant",
    }) as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const r = await sweepExpiredTokens(dir, { now });
    expect(r.failed).toBe(1);
    expect(r.refreshed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.errors.join(" ")).toContain("invalid_grant");
    const conns = JSON.parse(readFileSync(join(dir, "tenant_integrations.json"), "utf-8"));
    expect(conns["owner@example.com"][0].status).toBe("auth_failed");
    expect(tokenSweepStats.tokensFailed).toBe(1);
  });
  it("refresh failure → connection marked auth_failed, no crash, no tight retry", async () => {
    const dir = seedStore({
      updatedAt: new Date(now - HOUR).toISOString(),
      expiresAt: Math.floor((now + 60_000) / 1000),
    });
    fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      headers: { get: () => "application/json" },
      text: async () => "invalid_grant",
    }) as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const r = await sweepExpiredTokens(dir, { now });
    expect(r.failed).toBe(1);
    expect(r.refreshed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // exactly once — next sweep backs off naturally
    const conns = JSON.parse(readFileSync(join(dir, "tenant_integrations.json"), "utf-8"));
    expect(conns["owner@example.com"][0].status).toBe("auth_failed");
    expect(tokenSweepStats.tokensFailed).toBe(1);
  });

  it("unknown provider → fail closed, no network call", async () => {
    const dir = seedStore({ provider: "mystery", tokenKey: "owner@example.com:mystery" });
    const r = await sweepExpiredTokens(dir, { now });
    expect(r.skipped).toBeGreaterThan(0);
    expect(r.refreshed).toBe(0);
    expect(r.failed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("entry without a refreshToken → skipped, no network call", async () => {
    const dir = seedStore({ refreshToken: null });
    const r = await sweepExpiredTokens(dir, { now });
    expect(r.skipped).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("known provider without client credentials → skipped with a clear error", async () => {
    const dir = seedStore({ updatedAt: new Date(now - HOUR).toISOString(), expiresAt: Math.floor((now + 60_000) / 1000) });
    // Remove the OAuth app credential entry for xero.
    const tokenFile = join(dir, "tenant_oauth_credentials.json");
    const tokenData = JSON.parse(readFileSync(tokenFile, "utf-8"));
    delete tokenData.xero;
    writeJSON(tokenFile, tokenData);
    const r = await sweepExpiredTokens(dir, { now });
    expect(r.skipped).toBeGreaterThan(0);
    expect(r.refreshed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.errors.join(" ")).toContain("no OAuth client credentials");
  });
});
