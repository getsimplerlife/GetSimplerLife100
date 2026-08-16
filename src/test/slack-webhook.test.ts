import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SLACK_MONITOR_EVENT_MAP,
  SLACK_MONITOR_EMPLOYEE_ID,
  SLACK_MAX_TIMESTAMP_SKEW_SECONDS,
  buildSlackMonitoredEvent,
  computeSlackSignature,
  constantTimeEqual,
  handleSlackWebhook,
  isSyntheticSlackEventMarker,
  latestRealSlackWebhookReceipt,
  mapSlackEventType,
  parseSlackPayload,
  recordSlackWebhookReceipt,
  resolveSlackTeamId,
  selfHealSlackTeamGate,
  slackEventId,
  verifySlackRequest,
  type SlackWebhookDeps,
} from "../monitoring/slack-webhook";

const SIGNING_SECRET = "slack-signing-secret-test-123";

/** Sign a Slack request body the way Slack does: v0= hex HMAC-SHA256. */
async function slackSignature(rawBody: string, timestamp: string, secret = SIGNING_SECRET): Promise<string> {
  return `v0=${await computeSlackSignature(`v0:${timestamp}:${rawBody}`, secret)}`;
}

function deps(overrides: Partial<SlackWebhookDeps> = {}): SlackWebhookDeps & { dispatched: any[]; receipts: any[] } {
  const dispatched: any[] = [];
  const receipts: any[] = [];
  return {
    getSigningSecret: () => SIGNING_SECRET,
    ensureTeamGate: async () => true,
    dispatch: async (event) => {
      dispatched.push(event);
      return { eventId: event.id, status: "processed" as const, dispatchedTo: event.employeeId };
    },
    recordReceipt: (receipt) => {
      receipts.push(receipt);
    },
    ...overrides,
    dispatched,
    receipts,
  };
}

/** POST with the X-Slack-Signature header computed from the raw body. */
const signedPost = async (
  path: string,
  body: unknown,
  opts: { sig?: string | null; timestamp?: string | null; secret?: string } = {},
) => {
  const rawBody = JSON.stringify(body);
  const ts = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const headerValue = opts.sig !== undefined ? opts.sig : await slackSignature(rawBody, ts, opts.secret);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (headerValue !== null) headers["X-Slack-Signature"] = headerValue;
  if (opts.timestamp !== null) headers["X-Slack-Request-Timestamp"] = ts;
  return new Request(`https://example.test${path}`, { method: "POST", headers, body: rawBody });
};

describe("computeSlackSignature / verifySlackRequest", () => {
  it("accepts a valid v0 signature within the timestamp window", async () => {
    const rawBody = JSON.stringify({ type: "url_verification", challenge: "xyz" });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await slackSignature(rawBody, ts);
    expect(await verifySlackRequest(rawBody, sig, ts, SIGNING_SECRET)).toBe(true);
  });
  it("rejects a missing signature, missing timestamp and missing secret", async () => {
    const rawBody = "{}";
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await slackSignature(rawBody, ts);
    expect(await verifySlackRequest(rawBody, null, ts, SIGNING_SECRET)).toBe(false);
    expect(await verifySlackRequest(rawBody, sig, null, SIGNING_SECRET)).toBe(false);
    expect(await verifySlackRequest(rawBody, sig, ts, undefined)).toBe(false);
  });
  it("rejects a wrong signature and a tampered body (constant-time)", async () => {
    const rawBody = JSON.stringify({ type: "event_callback", event: { type: "message" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await slackSignature(rawBody, ts);
    const tampered = sig.endsWith("0") ? sig.slice(0, -1) + "1" : sig.slice(0, -1) + "0";
    expect(await verifySlackRequest(rawBody, "v0=deadbeef", ts, SIGNING_SECRET)).toBe(false);
    expect(await verifySlackRequest(rawBody + " ", sig, ts, SIGNING_SECRET)).toBe(false);
    expect(await verifySlackRequest(rawBody, tampered, ts, SIGNING_SECRET)).toBe(false);
  });
  it("rejects a non-v0 signature prefix", async () => {
    const rawBody = "{}";
    const ts = String(Math.floor(Date.now() / 1000));
    expect(await verifySlackRequest(rawBody, "v1=abc", ts, SIGNING_SECRET)).toBe(false);
  });
  it("rejects a stale timestamp (replay guard) beyond 300s", async () => {
    const rawBody = "{}";
    const now = Math.floor(Date.now() / 1000);
    const stale = String(now - SLACK_MAX_TIMESTAMP_SKEW_SECONDS - 10);
    const sig = await slackSignature(rawBody, stale);
    expect(await verifySlackRequest(rawBody, sig, stale, SIGNING_SECRET, now)).toBe(false);
  });
  it("accepts a timestamp exactly at the skew boundary", async () => {
    const rawBody = "{}";
    const now = Math.floor(Date.now() / 1000);
    const edge = String(now - SLACK_MAX_TIMESTAMP_SKEW_SECONDS);
    const sig = await slackSignature(rawBody, edge);
    expect(await verifySlackRequest(rawBody, sig, edge, SIGNING_SECRET, now)).toBe(true);
  });
  it("rejects a non-numeric timestamp", async () => {
    const rawBody = "{}";
    const sig = await slackSignature(rawBody, "abc");
    expect(await verifySlackRequest(rawBody, sig, "abc", SIGNING_SECRET)).toBe(false);
  });
});

describe("mapSlackEventType / buildSlackMonitoredEvent / slackEventId", () => {
  it("maps app_mention and message to monitor contracts; unknown fails closed", () => {
    expect(mapSlackEventType("app_mention")).toBe("slack-monitor-mention");
    expect(mapSlackEventType("message")).toBe("slack-monitor-channel-activity");
    expect(mapSlackEventType("reaction_added")).toBeNull();
    expect(SLACK_MONITOR_EVENT_MAP.app_mention).toBe("slack-monitor-mention");
  });
  it("builds a MonitoredEvent scoped to the communications employee with the contract in payload", () => {
    const evt = buildSlackMonitoredEvent({ team: "T1234", type: "app_mention", channel: "C5678", ts: "1405895017.000506" }, "slack-monitor-mention");
    expect(evt.employeeId).toBe(SLACK_MONITOR_EMPLOYEE_ID);
    expect(evt.providerId).toBe("slack");
    expect(evt.tenantId).toBe("T1234");
    expect(evt.payload).toMatchObject({ capabilityId: "slack-monitor-mention", eventType: "app_mention" });
    expect(evt.id).toBe("slack:T1234:app_mention:C5678:1405895017.000506");
  });
  it("slackEventId follows the documented eventId format", () => {
    expect(slackEventId({ team: "T1", type: "message", channel: "C1", ts: "1.2" })).toBe("slack:T1:message:C1:1.2");
  });
});

describe("handleSlackWebhook — url_verification challenge", () => {
  it("returns 200 with the challenge string as plain text when signed", async () => {
    const d = deps();
    const response = await handleSlackWebhook(
      await signedPost("/api/monitoring/webhook/slack", { type: "url_verification", challenge: "challenge-token-123", token: "ignored" }),
      d,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(await response.text()).toBe("challenge-token-123");
    expect(d.dispatched).toHaveLength(0);
  });
  it("returns 401 for a wrong signature and never answers the challenge", async () => {
    const d = deps();
    const response = await handleSlackWebhook(
      await signedPost("/api/monitoring/webhook/slack", { type: "url_verification", challenge: "challenge-token-123" }, { sig: "v0=deadbeef" }),
      d,
    );
    expect(response.status).toBe(401);
    expect(d.dispatched).toHaveLength(0);
  });
  it("returns 401 when the signature is missing", async () => {
    const d = deps();
    const response = await handleSlackWebhook(
      new Request("https://example.test/api/monitoring/webhook/slack", { method: "POST", body: JSON.stringify({ type: "url_verification", challenge: "x" }) }),
      d,
    );
    expect(response.status).toBe(401);
  });
  it("returns 401 for a stale timestamp (replay guard)", async () => {
    const d = deps();
    const stale = String(Math.floor(Date.now() / 1000) - 400);
    const response = await handleSlackWebhook(
      await signedPost("/api/monitoring/webhook/slack", { type: "url_verification", challenge: "x" }, { timestamp: stale }),
      d,
    );
    expect(response.status).toBe(401);
    expect(d.dispatched).toHaveLength(0);
  });
  it("returns 400 for a signed challenge without a challenge string", async () => {
    const d = deps();
    const response = await handleSlackWebhook(await signedPost("/api/monitoring/webhook/slack", { type: "url_verification" }), d);
    expect(response.status).toBe(400);
  });
});

describe("handleSlackWebhook — event_callback deliveries", () => {
  beforeEach(async () => {
    const { clearSeen } = await import("../monitoring/dedupe");
    clearSeen();
  });
  it("maps app_mention to slack-monitor-mention, dispatches and records a receipt", async () => {
    const d = deps();
    const response = await handleSlackWebhook(
      await signedPost("/api/monitoring/webhook/slack", {
        type: "event_callback",
        event: { type: "app_mention", channel: "C123", ts: "1405895017.000506", user: "U1", text: "<@BOT> hi", team: "T123" },
      }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.outcomes[0]).toMatchObject({ eventType: "app_mention", capabilityId: "slack-monitor-mention", status: "processed" });
    expect(d.dispatched).toHaveLength(1);
    expect(d.dispatched[0]).toMatchObject({ providerId: "slack", eventType: "app_mention", tenantId: "T123" });
    expect(d.receipts[0]).toMatchObject({ capabilityId: "slack-monitor-mention", eventId: "slack:T123:app_mention:C123:1405895017.000506", outcome: "processed" });
  });
  it("maps message to slack-monitor-channel-activity and records a receipt", async () => {
    const d = deps();
    const response = await handleSlackWebhook(
      await signedPost("/api/monitoring/webhook/slack", {
        type: "event_callback",
        event: { type: "message", channel: "C456", channel_type: "channel", ts: "1405895020.000100", team: "T456", text: "hello" },
      }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcomes[0]).toMatchObject({ capabilityId: "slack-monitor-channel-activity", status: "processed" });
    expect(d.receipts[0]).toMatchObject({ capabilityId: "slack-monitor-channel-activity", teamId: "T456" });
  });
  it("acks an authenticated event for an unentitled team but never records a receipt", async () => {
    const d = deps({
      ensureTeamGate: async () => false,
      dispatch: async (event) => ({ eventId: event.id, status: "failed" as const, reason: "Team is not entitled to monitoring" }),
    });
    const response = await handleSlackWebhook(
      await signedPost("/api/monitoring/webhook/slack", {
        type: "event_callback",
        event: { type: "message", channel: "C9", ts: "1405895020.000100", team: "T-unknown" },
      }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.failed).toBe(1);
    expect(d.receipts).toHaveLength(0);
  });
  it("acks unknown event types as ignored and never dispatches", async () => {
    const d = deps();
    const response = await handleSlackWebhook(
      await signedPost("/api/monitoring/webhook/slack", {
        type: "event_callback",
        event: { type: "reaction_added", channel: "C1", ts: "1.1", team: "T1" },
      }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(0);
    expect(body.ignored).toEqual(["reaction_added"]);
    expect(d.dispatched).toHaveLength(0);
    expect(d.receipts).toHaveLength(0);
  });
  it("returns 503 when SLACK_SIGNING_SECRET is unset (fail-closed)", async () => {
    const d = deps({ getSigningSecret: () => undefined });
    const response = await handleSlackWebhook(await signedPost("/api/monitoring/webhook/slack", { type: "event_callback", event: {} }), d);
    expect(response.status).toBe(503);
  });
  it("returns 400 for signed malformed JSON", async () => {
    const d = deps();
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await slackSignature("{not-json", ts);
    const response = await handleSlackWebhook(
      new Request("https://example.test/api/monitoring/webhook/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Slack-Signature": sig, "X-Slack-Request-Timestamp": ts },
        body: "{not-json",
      }),
      d,
    );
    expect(response.status).toBe(400);
    expect(d.dispatched).toHaveLength(0);
  });
  it("returns 405 for non-POST methods", async () => {
    const d = deps();
    const response = await handleSlackWebhook(new Request("https://example.test/api/monitoring/webhook/slack", { method: "GET" }), d);
    expect(response.status).toBe(405);
  });
});

describe("synthetic-receipt rejection (PR #167 lesson) + latestRealSlackWebhookReceipt", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "slack-wh-"));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });
  const now = () => new Date().toISOString();
  it("isSyntheticSlackEventMarker rejects verification-probe channel and abc123 ts", () => {
    expect(isSyntheticSlackEventMarker("verification-probe", "abc123")).toBe(true);
    expect(isSyntheticSlackEventMarker("C123", "abc123")).toBe(true);
    expect(isSyntheticSlackEventMarker("verification-probe", "1405895017.000506")).toBe(true);
    expect(isSyntheticSlackEventMarker("", "1405895017.000506")).toBe(true);
    expect(isSyntheticSlackEventMarker("C123", "1405895017.000506")).toBe(false);
  });
  it("synthetic receipts do NOT verify the monitor; a real event does", async () => {
    const capabilityId = "slack-monitor-mention";
    await recordSlackWebhookReceipt(
      { capabilityId, eventId: "slack:T1:app_mention:verification-probe:abc123", eventType: "app_mention", teamId: "T1", outcome: "processed", receivedAt: now() },
      dataDir,
    );
    // Newest synthetic receipt is rejected — no real evidence.
    expect(latestRealSlackWebhookReceipt(capabilityId, dataDir, 24 * 60 * 60 * 1000)).toBeUndefined();
    await recordSlackWebhookReceipt(
      { capabilityId, eventId: "slack:T1:app_mention:C123:1405895017.000506", eventType: "app_mention", teamId: "T1", outcome: "processed", receivedAt: now() },
      dataDir,
    );
    const real = latestRealSlackWebhookReceipt(capabilityId, dataDir, 24 * 60 * 60 * 1000);
    expect(real).toBeDefined();
    expect(real!.eventId).toBe("slack:T1:app_mention:C123:1405895017.000506");
  });
  it("newest real beats newest synthetic", async () => {
    const capabilityId = "slack-monitor-channel-activity";
    await recordSlackWebhookReceipt(
      { capabilityId, eventId: "slack:T1:message:C1:1405895017.000506", eventType: "message", teamId: "T1", outcome: "processed", receivedAt: now() },
      dataDir,
    );
    await recordSlackWebhookReceipt(
      { capabilityId, eventId: "slack:T1:message:verification-probe:abc123", eventType: "message", teamId: "T1", outcome: "processed", receivedAt: now() },
      dataDir,
    );
    const real = latestRealSlackWebhookReceipt(capabilityId, dataDir, 24 * 60 * 60 * 1000);
    expect(real!.eventId).toBe("slack:T1:message:C1:1405895017.000506");
  });
  it("rejects stale receipts outside the TTL window", async () => {
    const capabilityId = "slack-monitor-mention";
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await recordSlackWebhookReceipt(
      { capabilityId, eventId: "slack:T1:app_mention:C123:1405895017.000506", eventType: "app_mention", teamId: "T1", outcome: "processed", receivedAt: stale },
      dataDir,
    );
    expect(latestRealSlackWebhookReceipt(capabilityId, dataDir, 24 * 60 * 60 * 1000)).toBeUndefined();
  });
  it("only counts processed outcomes for the requested capability", async () => {
    await recordSlackWebhookReceipt(
      { capabilityId: "slack-monitor-mention", eventId: "slack:T1:app_mention:C123:1405895017.000506", eventType: "app_mention", teamId: "T1", outcome: "failed", receivedAt: now() },
      dataDir,
    );
    await recordSlackWebhookReceipt(
      { capabilityId: "slack-monitor-channel-activity", eventId: "slack:T1:message:C1:1405895020.000100", eventType: "message", teamId: "T1", outcome: "processed", receivedAt: now() },
      dataDir,
    );
    expect(latestRealSlackWebhookReceipt("slack-monitor-mention", dataDir, 24 * 60 * 60 * 1000)).toBeUndefined();
    expect(latestRealSlackWebhookReceipt("slack-monitor-channel-activity", dataDir, 24 * 60 * 60 * 1000)).toBeDefined();
  });
});

describe("resolveSlackTeamId / selfHealSlackTeamGate", () => {
  it("resolves a team id via the canonical auth.test endpoint", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url === "https://slack.com/api/auth.test") {
        return new Response(JSON.stringify({ ok: true, team_id: "TREAL123", team: "Acme" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    try {
      expect(await resolveSlackTeamId("xoxb-test")).toBe("TREAL123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it("throws when auth.test returns ok:false or an error status", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      if (String(input) === "https://slack.com/api/auth.test") {
        return new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    try {
      await expect(resolveSlackTeamId("xoxb-bad")).rejects.toThrow(/invalid_auth|team_id/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it("self-heals the team gate for an entitled tenant and persists teamId back", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slack-gate-"));
    try {
      writeFileSync(
        join(dataDir, "tenant_oauth_credentials.json"),
        JSON.stringify({ "owner@example.com:slack": { accessToken: "xoxb-1", teamId: "TREAL123" } }),
      );
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, team_id: "TREAL123" }), { status: 200 })) as typeof fetch;
      const configured: string[] = [];
      try {
        const ok = await selfHealSlackTeamGate({
          dataDir,
          teamId: "TREAL123",
          canMonitor: () => true,
          configureTenant: (tid) => {
            configured.push(tid);
          },
        });
        expect(ok).toBe(true);
        expect(configured).toEqual(["TREAL123"]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
  it("fails closed (false) when no credential matches the team", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slack-gate-"));
    try {
      writeFileSync(
        join(dataDir, "tenant_oauth_credentials.json"),
        JSON.stringify({ "owner@example.com:slack": { accessToken: "xoxb-1", teamId: "TOTHER123" } }),
      );
      const ok = await selfHealSlackTeamGate({
        dataDir,
        teamId: "TREAL123",
        canMonitor: () => true,
        configureTenant: () => {},
      });
      expect(ok).toBe(false);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
  it("fails closed (false) when the tenant is not entitled", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slack-gate-"));
    try {
      writeFileSync(
        join(dataDir, "tenant_oauth_credentials.json"),
        JSON.stringify({ "owner@example.com:slack": { accessToken: "xoxb-1", teamId: "TREAL123" } }),
      );
      const ok = await selfHealSlackTeamGate({
        dataDir,
        teamId: "TREAL123",
        canMonitor: () => false,
        configureTenant: () => {},
      });
      expect(ok).toBe(false);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe("parseSlackPayload", () => {
  it("parses a valid envelope and fails closed on invalid JSON / missing type", () => {
    expect(parseSlackPayload('{"type":"event_callback"}').ok).toBe(true);
    const badJson = parseSlackPayload("{nope");
    expect(badJson.ok).toBe(false);
    const noType = parseSlackPayload('{"event":{}}');
    expect(noType.ok).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("compares equal strings true and different-length false", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
