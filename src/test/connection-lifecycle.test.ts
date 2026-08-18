// #230 connection-loss prevention — connection-lifecycle + health-heartbeat.
//
// 1. nextRefreshDueMs: proactive per-credential due math (refresh BEFORE expiry).
// 2. Scheduled refresher: refreshes ONLY due creds (never churns fresh), rotates
//    the refresh token into the store, marks conns Connected, never overlaps.
// 3. Failure classification: invalid_grant/consumed → reconnect_required + loud
//    failure path; connection record marked for human reauthorization.
// 4. Owner alert throttling (6h window, new root cause after 1 min).
// 5. Health heartbeat: audited probe registry only (no guessed URLs), status
//    transitions ok→degraded, durable records.
// All provider calls use a mocked fetch — no live provider traffic in CI.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  nextRefreshDueMs,
  refreshOneCredential,
  startScheduledTokenRefresher,
  classifyRefreshError,
  alertOwnerReconnectRequired,
  reconnectAlertDue,
  noteAlertSent,
  scheduledRefresherStats,
  RECONNECT_ALERT_THROTTLE_MS,
} from "../lib/token-refresher";
import {
  probeProvider,
  PROBE_REGISTRY,
  ConnectionHealthTracker,
  startHealthHeartbeat,
} from "../lib/connection-health";
import { writeJSON, readJSON } from "../lib/data-store";
import { durableEnabled, durableGet, durableClose } from "../lib/durable-store";
import { enforceTestDurableIsolation, assertDurableDisabled } from "./test-isolation";
import { acquireRefreshLease, releaseRefreshLease, refreshContentionStats } from "../lib/connection-refresh-lock";

const HOUR = 60 * 60 * 1000;
const originalFetch = globalThis.fetch;
let tmp: string;

function okFetch(extra?: Partial<Record<string, any>>) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => "",
    json: async () => ({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: "offline_access", ...extra }),
  }) as unknown as Response);
}
function failFetch(status: number, body: string) {
  return vi.fn(async () => {
    const r = { ok: false, status, headers: { get: () => "application/json" }, text: async () => body, json: async () => ({}) } as unknown as Response;
    return r;
  });
}

function seedCreds(entries: Record<string, any>): void {
  assertDurableDisabled(); // fixtures may ONLY live on disk under the tmp data dir
  writeJSON(join(tmp, "tenant_oauth_credentials.json"), entries);
  const conns: Record<string, any[]> = {};
  for (const key of Object.keys(entries)) {
    const email = key.split(":")[0];
    const cred = entries[key];
    const provider = String(cred.provider || key.split(":")[1]);
    conns[email] = conns[email] || [];
    conns[email].push({ providerId: provider, status: "Connected", connectedAt: new Date().toISOString() });
  }
  writeJSON(join(tmp, "tenant_integrations.json"), conns);
}

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "sl-conn-lifecycle-"));
  // HARD TEST ISOLATION (#230): aborts if a DATABASE_URL (real Neon) leaks into
  // the test env; durable store is DISABLED so fixture writes go to tmp disk dirs
  // only — never to the production basename-keyed durable row.
  enforceTestDurableIsolation();
  assertDurableDisabled();
  for (const k of Object.keys(process.env)) {
    if (/^(OAUTH_)?(XERO|HUBSPOT|DOCUSIGN|GOOGLE|MICROSOFT)_CLIENT_(ID|SECRET)$/.test(k)) delete process.env[k];
  }
  scheduledRefresherStats.tickCount = 0;
  scheduledRefresherStats.refreshed = 0;
  scheduledRefresherStats.transientFailures = 0;
  scheduledRefresherStats.reconnectRequired = 0;
  scheduledRefresherStats.alertsSent = 0;
  scheduledRefresherStats.lastError = null;
  refreshContentionStats.contended = 0;
  refreshContentionStats.lastContention = null;
});
afterEach(() => { globalThis.fetch = originalFetch; });
afterAll(async () => { globalThis.fetch = originalFetch; await durableClose(); });

describe("nextRefreshDueMs — proactive due math", () => {
  it("returns now when the token is already due", () => {
    const now = Date.now();
    const entry = { expiresAt: now / 1000 - 10, updatedAt: new Date(now - 2 * HOUR).toISOString() };
    expect(nextRefreshDueMs(entry, now)).toBe(now);
  });
  it("returns the lead-window instant BEFORE expiry (never at expiry)", () => {
    const now = Date.now();
    const issued = now / 1000; // just issued
    const exp = issued + 3600; // 1h lifetime
    const entry = { expiresAt: exp, updatedAt: new Date(now).toISOString() };
    const due = nextRefreshDueMs(entry, now);
    expect(due).toBeLessThan(exp * 1000); // strictly before expiry (lead window)
    expect(due).toBeGreaterThan(now); // still in the future — not yet due
  });
  it("no-expiry tokens refresh after the 12h staleness window", () => {
    const now = Date.now();
    const entry = { updatedAt: new Date(now - 10 * HOUR).toISOString() };
    expect(nextRefreshDueMs(entry, now)).toBeGreaterThan(now);
    const stale = { updatedAt: new Date(now - 13 * HOUR).toISOString() };
    expect(nextRefreshDueMs(stale, now)).toBe(now);
  });
});

describe("scheduled refresher — proactive, single-writer, durable rotation", () => {
  it("refreshes ONLY due credentials and persists the ROTATED refresh token", async () => {
    const now = Date.now();
    const hubEntry = {
      provider: "hubspot", accessToken: "fresh-token", refreshToken: "fresh-refresh",
      expiresAt: now / 1000 + 3600, updatedAt: new Date(now - HOUR).toISOString(), clientId: "cid", clientSecret: "secret",
    };
    seedCreds({
      "xero": { provider: "xero", clientId: "cid", clientSecret: "secret" },
      "tenant@example.com:xero": {
        provider: "xero", accessToken: "old-access", refreshToken: "old-refresh",
        expiresAt: now / 1000 - 1, updatedAt: new Date(now - 2 * HOUR).toISOString(),
      },
      "tenant@example.com:slack": {
        provider: "slack", accessToken: "xoxb-ok", updatedAt: new Date(now - 1000).toISOString(),
      },
      "tenant@example.com:hubspot": hubEntry,
    });
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const handle = startScheduledTokenRefresher(tmp, { now: () => now, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await handle.runTick(); // awaits boot catch-up, then a fresh tick
    handle.stop();
    // Boot catch-up refreshed the ONE due credential; the second tick found
    // nothing left due (never churns freshly-refreshed tokens).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.due).toBe(0);
    // Rotation persisted: the store now carries the NEW refresh token (single-use rule).
    const stored = readJSON(join(tmp, "tenant_oauth_credentials.json"));
    expect(stored["tenant@example.com:xero"].refreshToken).toBe("new-refresh");
    expect(stored["tenant@example.com:xero"].accessToken).toBe("new-access");
    expect(stored["tenant@example.com:hubspot"].refreshToken).toBe("fresh-refresh"); // untouched
    // Connection record flipped back to Connected.
    const conns = readJSON(join(tmp, "tenant_integrations.json"));
    expect(conns["tenant@example.com"].find((c: any) => c.providerId === "xero").status).toBe("Connected");
  });
});

describe("failure classification + reconnect_required", () => {
  it("classifies consumed/invalid_grant refresh tokens as reconnect_required", () => {
    expect(classifyRefreshError("Token refresh failed (400): {refresh token has been consumed}")).toBe("reconnect_required");
    expect(classifyRefreshError("invalid_grant")).toBe("reconnect_required");
    expect(classifyRefreshError("rate limited (429)")).toBe("transient");
    expect(classifyRefreshError("connection reset")).toBe("transient");
  });
  it("marks the connection reconnect_required on a fatal refresh error", async () => {
    const now = Date.now();
    seedCreds({
      "xero": { provider: "xero", clientId: "cid", clientSecret: "secret" },
      "tenant@example.com:xero": {
        provider: "xero", accessToken: "old-access", refreshToken: "consumed-refresh",
        expiresAt: now / 1000 - 1, updatedAt: new Date(now - 2 * HOUR).toISOString(),
      },
    });
    const fetchMock = failFetch(400, '{"error":"invalid_grant","error_description":"Refresh token has been consumed"}');
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // emailImpl no-op → no alert sent, counts stay testable
    const res = await refreshOneCredential(tmp,
      readJSON(join(tmp, "tenant_oauth_credentials.json")),
      readJSON(join(tmp, "tenant_integrations.json")),
      "tenant@example.com:xero",
      { now, fetchImpl: fetchMock as unknown as typeof fetch },
    );
    expect(res.status).toBe("reconnect_required");
    expect(scheduledRefresherStats.reconnectRequired).toBe(1);
    const conns = readJSON(join(tmp, "tenant_integrations.json"));
    const xeroConn = conns["tenant@example.com"].find((c: any) => c.providerId === "xero");
    expect(xeroConn.status).toBe("reconnect_required");
    expect(xeroConn.lastRefreshError).toMatch(/consumed/);
  });
});

describe("owner alert throttling", () => {
  it("sends once, throttles repeats for 6h, then allows again", async () => {
    const now = 1_800_000_000_000;
    let sent = 0;
    const emailImpl = async () => { sent++; return { ok: true }; };
    expect(await alertOwnerReconnectRequired({ provider: "xero", email: "owner@x.io", reason: "consumed", nowMs: now, emailImpl })).toBe(true);
    expect(await alertOwnerReconnectRequired({ provider: "xero", email: "owner@x.io", reason: "consumed", nowMs: now + 60_000, emailImpl })).toBe(false);
    expect(sent).toBe(1);
    // New root cause within throttle → allowed after 1 min.
    expect(await alertOwnerReconnectRequired({ provider: "xero", email: "owner@x.io", reason: "revoked", nowMs: now + 120_000, emailImpl })).toBe(true);
    expect(sent).toBe(2);
    // Same cause, well inside throttle → still blocked.
    expect(await alertOwnerReconnectRequired({ provider: "xero", email: "owner@x.io", reason: "revoked", nowMs: now + 3 * HOUR, emailImpl })).toBe(false);
    // After the full 6h window → allowed for the same cause.
    expect(await alertOwnerReconnectRequired({ provider: "xero", email: "owner@x.io", reason: "revoked", nowMs: now + 120_000 + RECONNECT_ALERT_THROTTLE_MS + 1, emailImpl })).toBe(true);
    expect(sent).toBe(3);
  });
  it("REGRESSION #231 — throttle engages when the email impl returns the repo's real shape { success, isMock } instead of { ok }", async () => {
    // Distinct future base time: the throttle map is module-scoped, so this must not
    // collide with state left by the prior test (which used 1_800_000_000_000).
    const now = 2_000_000_000_000;
    let sent = 0;
    // Mirrors src/integrations/email.ts sendEmail(): { success, messageId, isMock, recipient } — no `ok`.
    const emailImpl = async () => { sent++; return { success: true, isMock: true, messageId: "mock-1", recipient: ["owner@x.io"] }; };
    expect(await alertOwnerReconnectRequired({ provider: "onedrive", email: "owner@x.io", reason: "probe failed", nowMs: now, emailImpl })).toBe(true);
    // Same cause 1 min later → throttle MUST have recorded the send → blocked.
    expect(await alertOwnerReconnectRequired({ provider: "onedrive", email: "owner@x.io", reason: "probe failed", nowMs: now + 60_000, emailImpl })).toBe(false);
    expect(sent).toBe(1);
    // After the 6h window → allowed again.
    expect(await alertOwnerReconnectRequired({ provider: "onedrive", email: "owner@x.io", reason: "probe failed", nowMs: now + 60_000 + RECONNECT_ALERT_THROTTLE_MS + 1, emailImpl })).toBe(true);
    expect(sent).toBe(2);
  });
  it("failure from the email impl does not record throttle (not a send)", async () => {
    // Distinct email key + future base so neither earlier test's throttle state applies.
    const now = 2_100_000_000_000;
    let attempts = 0;
    const emailImpl = async () => { attempts++; return { success: false, isMock: false, messageId: "", recipient: ["fails@x.io"] }; };
    expect(await alertOwnerReconnectRequired({ provider: "onedrive", email: "fails@x.io", reason: "probe failed", nowMs: now, emailImpl })).toBe(false);
    expect(attempts).toBe(1);
    // Not recorded → an immediate retry attempts the sender again (throttle did not engage).
    expect(await alertOwnerReconnectRequired({ provider: "onedrive", email: "fails@x.io", reason: "probe failed", nowMs: now + 5_000, emailImpl })).toBe(false);
    expect(attempts).toBe(2);
  });
});

describe("health heartbeat — audited probes + status transitions", () => {
  it("probe registry contains ONLY audited, known provider endpoints", () => {
    const allowHosts = new Set([
      "www.googleapis.com", "graph.microsoft.com", "slack.com", "api.xero.com", "api.hubapi.com", "account-d.docusign.com",
    ]);
    for (const [provider, def] of Object.entries(PROBE_REGISTRY)) {
      const url = def.buildRequest({ accessToken: "t" }).url;
      const host = new URL(url).host;
      expect(allowHosts.has(host), `${provider} probe host ${host} must be audited`).toBe(true);
    }
  });
  it("tracks ok → degraded → ok with loud-state persistence", async () => {
    const ok = okFetch();
    globalThis.fetch = ok as unknown as typeof fetch;
    const tracker = new ConnectionHealthTracker(tmp);
    await probeProvider("hubspot", { accessToken: "t" }, ok as unknown as typeof fetch).then((r) => tracker.record("hubspot", "tenant@example.com", r, false));
    expect(tracker.get("hubspot", "tenant@example.com")?.status).toBe("ok");
    const bad = failFetch(401, "unauthorized");
    await probeProvider("hubspot", { accessToken: "dead" }, bad as unknown as typeof fetch).then((r) => tracker.record("hubspot", "tenant@example.com", r, false));
    const rec = tracker.get("hubspot", "tenant@example.com")!;
    expect(rec.status).toBe("degraded");
    expect(rec.consecutiveFailures).toBe(1);
    // refreshFatal flips the status to reconnect_required
    await probeProvider("hubspot", { accessToken: "dead" }, bad as unknown as typeof fetch).then((r) => tracker.record("hubspot", "tenant@example.com", r, true));
    expect(tracker.get("hubspot", "tenant@example.com")?.status).toBe("reconnect_required");
    // persistence file written
    const stored = readJSON(join(tmp, "connection_health.json"));
    expect(stored["tenant@example.com:hubspot"].consecutiveFailures).toBe(2);
  });
  it("heartbeat cycle probes only refreshable, audited providers (fail-closed)", async () => {
    const now = Date.now();
    seedCreds({
      "tenant@example.com:google-drive": { provider: "google-drive", accessToken: "tok", expiresAt: now / 1000 + 3600, updatedAt: new Date(now - HOUR).toISOString() },
      "tenant@example.com:unknown-app": { provider: "unknown-app", accessToken: "tok" },
    });
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const hb = startHealthHeartbeat(tmp, { intervalMs: 60_000, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await hb.runCycle();
    hb.stop();
    expect(res.probed).toBe(1); // only google-drive (unknown-app has no audited probe→fail-closed)
    expect(res.ok).toBe(1);
    expect(readJSON(join(tmp, "connection_health.json"))["tenant@example.com:google-drive"].status).toBe("ok");
  });
});
describe("HARD TEST ISOLATION — real Neon rows cannot be touched by this suite (regression)", () => {
  it("aborts the suite when a DATABASE_URL (real Neon) leaks into the test env", () => {
    const prev = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgresql://user:secret@ep-REAL-neon.region.aws.neon.tech/kv_store?sslmode=require";
      let threw = false;
      try { enforceTestDurableIsolation(); } catch (e: any) { threw = true; expect(e.message).toMatch(/HARD TEST ISOLATION/); }
      expect(threw).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prev;
    }
  });
  it("keeps the durable store disabled so no fixture write can ever reach Neon", async () => {
    // The fixtures from the earlier tests (tenant@example.com:* seeds) were written
    // under durable-DISABLED mode: the production durable key must hold no trace.
    expect(durableEnabled()).toBe(false);
    expect(durableGet("tenant_oauth_credentials.json")).toBeUndefined();
    // Even an explicit get for the fixture keys returns nothing from the durable cache.
    expect(durableGet("tenant_oauth_credentials.json") as any).toBeUndefined();
  });
});

describe("SINGLE-FLIGHT refresh — Xero single-use token race (regression)", () => {
  it("two concurrent refresh attempts on a single-use token: exactly ONE succeeds, token moves forward, the other is recorded contention (not a silent consumed loss)", async () => {
    const now = Date.now();
    const KEY = "tenant@example.com:xero";
    seedCreds({
      "xero": { provider: "xero", clientId: "cid", clientSecret: "secret" },
      "tenant@example.com:xero": {
        provider: "xero", accessToken: "old-access", refreshToken: "single-use-RT",
        expiresAt: now / 1000 - 1, updatedAt: new Date(now - 2 * HOUR).toISOString(),
      },
    });
    // Process A (the sweeper) claims exclusive refresh ownership.
    expect(acquireRefreshLease(tmp, KEY, "sweeper:1")).toBe(true);
    // Process B (verification CLI) tries to refresh the SAME single-use token
    // while A holds the lease → must CONTEND, not race/consume it.
    const fetchB = okFetch();
    globalThis.fetch = fetchB as unknown as typeof fetch;
    const contended = await refreshOneCredential(tmp,
      readJSON(join(tmp, "tenant_oauth_credentials.json")),
      readJSON(join(tmp, "tenant_integrations.json")),
      KEY, { now, fetchImpl: fetchB as unknown as typeof fetch, leaseOwner: "verify:2" },
    );
    expect(contended.status).toBe("contended");
    expect(contended.refreshed).toBe(false);
    expect(fetchB).toHaveBeenCalledTimes(0); // protected — NO competing refresh call
    expect(refreshContentionStats.contended).toBe(1); // recorded, not silent
    // B's attempt must NOT have overwritten the token (A still owns it).
    const afterB = readJSON(join(tmp, "tenant_oauth_credentials.json"));
    expect(afterB["tenant@example.com:xero"].refreshToken).toBe("single-use-RT");
    // A finishes and releases.
    releaseRefreshLease(tmp, KEY, "sweeper:1");
    // Now B (still the verification path) can refresh with exactly one call.
    const fetchB2 = okFetch();
    globalThis.fetch = fetchB2 as unknown as typeof fetch;
    const win = await refreshOneCredential(tmp,
      readJSON(join(tmp, "tenant_oauth_credentials.json")),
      readJSON(join(tmp, "tenant_integrations.json")),
      KEY, { now, fetchImpl: fetchB2 as unknown as typeof fetch, leaseOwner: "verify:2" },
    );
    expect(win.status).toBe("ok");
    expect(fetchB2).toHaveBeenCalledTimes(1); // exactly ONE refresh across both attempts
    const afterWin = readJSON(join(tmp, "tenant_oauth_credentials.json"));
    expect(afterWin["tenant@example.com:xero"].refreshToken).toBe("new-refresh"); // token moved forward
  });
});

describe("REGRESSION #231 — validate-before-replace (never swap a working token for a provider-rejected one)", () => {
  const now = () => Date.now();
  it("provider probe URL for MS providers sits inside the granted Files.ReadWrite scope", () => {
    // Graph /v1.0/me needs User.Read; the token only carries Files.ReadWrite.
    // The audited probe must hit /me/drive/root so a VALID token reports ok.
    for (const prov of ["onedrive", "microsoft-word", "microsoft-excel", "microsoft-powerpoint"]) {
      const req = PROBE_REGISTRY[prov].buildRequest({ accessToken: "t" });
      expect(req.url).toBe("https://graph.microsoft.com/v1.0/me/drive/root");
    }
  });
  it("refresh persists when the new token PASSES the audited probe", async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    seedCreds({
      "microsoft-word": { provider: "microsoft-word", clientId: "cid", clientSecret: "secret" },
      "tenant@example.com:microsoft-word": {
        provider: "microsoft-word", accessToken: "old-access", refreshToken: "old-refresh",
        expiresAt: now() / 1000 + 60, updatedAt: new Date(now() - 2 * HOUR).toISOString(),
      },
    });
    const validateToken = async () => ({ ok: true });
    const res = await refreshOneCredential(tmp,
      readJSON(join(tmp, "tenant_oauth_credentials.json")),
      readJSON(join(tmp, "tenant_integrations.json")),
      "tenant@example.com:microsoft-word",
      { now: now(), fetchImpl: fetchMock as unknown as typeof fetch, validateToken },
    );
    expect(res.status).toBe("ok");
    expect(res.refreshed).toBe(true);
    const stored = readJSON(join(tmp, "tenant_oauth_credentials.json"));
    expect(stored["tenant@example.com:microsoft-word"].accessToken).toBe("new-access");
  });
  it("DOES NOT overwrite the stored token when the probe REJECTS the new token", async () => {
    const fetchMock = okFetch(); // token endpoint 200, but...
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    seedCreds({
      "onedrive": { provider: "onedrive", clientId: "cid", clientSecret: "secret" },
      "tenant@example.com:onedrive": {
        provider: "onedrive", accessToken: "valid-working-token", refreshToken: "old-refresh",
        expiresAt: now() / 1000 + 3600, updatedAt: new Date(now() - 2 * HOUR).toISOString(),
      },
    });
    const validateToken = async () => ({ ok: false, httpStatus: 401, error: "Graph 401 UnknownError (scope)" });
    const res = await refreshOneCredential(tmp,
      readJSON(join(tmp, "tenant_oauth_credentials.json")),
      readJSON(join(tmp, "tenant_integrations.json")),
      "tenant@example.com:onedrive",
      { now: now(), fetchImpl: fetchMock as unknown as typeof fetch, validateToken },
    );
    expect(res.refreshed).toBe(false);
    expect(res.status).toBe("transient");
    expect(res.error).toContain("REJECTED");
    // The previous valid token is RETAINED — not replaced by the broken one.
    const stored = readJSON(join(tmp, "tenant_oauth_credentials.json"));
    expect(stored["tenant@example.com:onedrive"].accessToken).toBe("valid-working-token");
    // Connection marked auth_failed with the loud error surfaced.
    const conns = readJSON(join(tmp, "tenant_integrations.json"));
    const c = conns["tenant@example.com"].find((x: any) => x.providerId === "onedrive");
    expect(c.status).toBe("auth_failed");
    expect(c.lastRefreshError).toContain("REJECTED");
  });
  it("scheduled refresher with validate-before-replace: rejection never persists a broken token", async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    seedCreds({
      "onedrive": { provider: "onedrive", clientId: "cid", clientSecret: "secret" },
      "tenant@example.com:onedrive": {
        provider: "onedrive", accessToken: "valid-working-token", refreshToken: "old-refresh",
        expiresAt: now() / 1000 + 60, updatedAt: new Date(now() - 2 * HOUR).toISOString(),
      },
    });
    const validateToken = async () => ({ ok: false, httpStatus: 401, error: "rejected" });
    const handle = startScheduledTokenRefresher(tmp, { now, fetchImpl: fetchMock as unknown as typeof fetch, validateToken });
    await handle.runTick();
    handle.stop();
    const stored = readJSON(join(tmp, "tenant_oauth_credentials.json"));
    expect(stored["tenant@example.com:onedrive"].accessToken).toBe("valid-working-token");
    expect(stored["tenant@example.com:onedrive"].refreshToken).toBe("old-refresh");
  });
});
