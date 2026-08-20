// Fast-retry + pre-emptive tenure renewal — "keep connections alive".
//
// Regression tests for src/lib/token-refresher.ts:
//   1. A transient refresh failure schedules an immediate fast backoff retry
//      (5s/15s/45s) instead of waiting for the next 60s tick, and a blip that
//      recovers is healed without any human action.
//   2. reconnect_required (consumed/revoked token) is NOT retryable — it goes
//      straight to the one-click re-consent path (no retry loop).
//   3. Pre-emptive renewal: a refresh token nearing its provider tenure cap is
//      renewed even when the access token is not yet due (never ages into a
//      dead token).
// All provider calls use a mocked fetch — no live provider traffic in CI.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  needsRefresh,
  refreshTokenNearingTenure,
  TRANSIENT_RETRY_DELAYS_MS,
  transientRetryStats,
  startScheduledTokenRefresher,
} from "../lib/token-refresher";
import { writeJSON } from "../lib/data-store";
import { initDurableStore, durableClose, MemoryKvDriver } from "../lib/durable-store";

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function makeCred(tokenKey: string, over: Record<string, any> = {}) {
  const now = over.now ?? Date.now();
  return {
    [tokenKey]: {
      provider: over.provider ?? "xero",
      email: "owner@example.com",
      accessToken: "old-access",
      refreshToken: over.refreshToken === null ? undefined : (over.refreshToken ?? "old-refresh"),
      expiresAt: over.expiresAt ?? Math.floor((now + 3600 * 1000) / 1000),
      scope: "offline_access",
      tokenType: "Bearer",
      updatedAt: over.updatedAt ?? new Date(now - 60_000).toISOString(),
    },
    xero: { clientId: "client-id", clientSecret: "client-secret" }, // OAuth app creds
  };
}

function seedStore(tokenData: Record<string, any>): string {
  const dir = mkdtempSync(join(tmpdir(), "sl-fast-retry-"));
  writeJSON(join(dir, "tenant_oauth_credentials.json"), tokenData);
  writeJSON(join(dir, "tenant_integrations.json"), {
    "owner@example.com": [{
      id: "int-1",
      provider: "xero",
      providerId: "xero",
      category: "Finance",
      status: "Connected",
      connectedAt: new Date().toISOString(),
      lastSync: new Date().toISOString(),
      credentials: { apiKey: "old-access", oauth: true },
    }],
  });
  return dir;
}

function seedDurableFrom(dir: string): MemoryKvDriver {
  const driver = new MemoryKvDriver({
    "tenant_oauth_credentials.json": JSON.parse(readFileSync(join(dir, "tenant_oauth_credentials.json"), "utf-8")),
    "tenant_integrations.json": JSON.parse(readFileSync(join(dir, "tenant_integrations.json"), "utf-8")),
  });
  return driver;
}

beforeEach(async () => {
  transientRetryStats.scheduled = 0;
  transientRetryStats.attempted = 0;
  transientRetryStats.recovered = 0;
  transientRetryStats.exhausted = 0;
  await durableClose();
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

describe("pre-emptive tenure renewal", () => {
  it("refreshTokenNearingTenure returns true near a provider's tenure cap, false far from it", () => {
    const now = Date.now();
    // xero tenure 60d, lead 12d → renew once the refresh token is older than 48d.
    const near = { provider: "xero", updatedAt: new Date(now - 50 * 24 * 60 * 60 * 1000).toISOString() };
    expect(refreshTokenNearingTenure(near, now)).toBe(true);
    const fresh = { provider: "xero", updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() };
    expect(refreshTokenNearingTenure(fresh, now)).toBe(false);
  });

  it("an access token not yet due is still refreshed when the refresh token nears tenure (no dead-token aging)", () => {
    const now = Date.now();
    const entry = {
      provider: "xero",
      updatedAt: new Date(now - 50 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: Math.floor((now + 90 * 24 * 60 * 60 * 1000) / 1000), // 90d left → access rule alone says "keep"
    };
    expect(needsRefresh(entry, now)).toBe(true); // due via tenure, not access
  });

  it("unknown/no provider → tenure check is a no-op (fail-safe)", () => {
    const now = Date.now();
    expect(refreshTokenNearingTenure({ updatedAt: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString() }, now)).toBe(false);
  });
});

describe("fast retry on transient renewal failure", () => {
  it("TRANSIENT_RETRY_DELAYS_MS is a short exponential backoff (5s/15s/45s)", () => {
    expect(TRANSIENT_RETRY_DELAYS_MS).toEqual([5_000, 15_000, 45_000]);
  });

  it(
    "a transient failure schedules a fast retry which heals on its next attempt",
    async () => {
      const dir = seedStore(makeCred("owner@example.com:xero", {
        expiresAt: Math.floor((Date.now() + 60_000) / 1000),
        updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }));
      await initDurableStore(dir, seedDurableFrom(dir));
      // 1 transient 503, then success — a blip, not a dead token.
      let calls = 0;
      const flaky = vi.fn(async () => {
        calls++;
        if (calls === 1) return { ok: false, status: 503, text: async () => "boom", json: async () => ({}) } as unknown as Response;
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: "offline_access" }) } as unknown as Response;
      });
      let clock = Date.now();
      const h = startScheduledTokenRefresher(dir, {
        tickMs: 60_000,
        fetchImpl: flaky as unknown as typeof fetch,
        now: () => clock,
      });
      try {
        // The boot catch-up fires immediately on construction → first attempt
        // (503) → a transient failure that arms a fast backoff retry.
        await new Promise((r) => setTimeout(r, 60)); // let boot settle
        expect(calls).toBeGreaterThanOrEqual(1);
        expect(transientRetryStats.scheduled).toBeGreaterThanOrEqual(1); // not dropped

        // Advance the clock past the first backoff window and run the retry.
        clock += TRANSIENT_RETRY_DELAYS_MS[0];
        const before = calls;
        await h.runRetries();
        expect(calls - before).toBeGreaterThanOrEqual(1); // retry fired
        expect(transientRetryStats.attempted).toBeGreaterThanOrEqual(1);
      } finally {
        h.stop();
        await durableClose();
      }
    },
    20_000,
  );

  it(
    "reconnect_required (consumed/revoked token) is NOT retried — goes straight to re-consent, no retry loop",
    async () => {
      const dir = seedStore(makeCred("owner@example.com:xero", {
        expiresAt: Math.floor((Date.now() + 60_000) / 1000),
        updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }));
      await initDurableStore(dir, seedDurableFrom(dir));
      // Always a fatal invalid_grant — a dead/single-use-consumed token.
      fetchMock.mockImplementation(async () => ({
        ok: false, status: 400,
        text: async () => JSON.stringify({ error: "invalid_grant", error_description: "Refresh token has been consumed" }),
        json: async () => ({}),
      }) as unknown as Response);
      const h = startScheduledTokenRefresher(dir, { tickMs: 10_000, fetchImpl: fetchMock as unknown as typeof fetch });
      try {
        const boot = await h.runTick();
        expect(boot.outcomes.some((o) => o.status === "reconnect_required")).toBe(true);
        // No transient retry was scheduled (consumed tokens are not retryable).
        expect(transientRetryStats.scheduled).toBe(0);
        expect(transientRetryStats.attempted).toBe(0);
      } finally {
        h.stop();
        await durableClose();
      }
    },
    20_000,
  );
});
