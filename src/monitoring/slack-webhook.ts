/**
 * Slack Events API receiver for the monitoring pipeline.
 *
 * Slack webhook contract (api.slack.com/events-api):
 *  - URL-verification challenge: when a Request URL is saved, Slack POSTs
 *    `{ type: "url_verification", challenge: "..." }`. The receiver MUST reply
 *    200 with the challenge string as plain text (Content-Type text/plain) if
 *    the signature is valid, else 401.
 *  - Event deliveries: Slack POSTs `{ type: "event_callback", event: {...} }`.
 *    We subscribe to `app_mention` and `message` (channel messages), map them
 *    to the slack-monitor-mention / slack-monitor-channel-activity contracts,
 *    record a durable receipt, dispatch through the entitlement-gated pipeline,
 *    and ACK 200 fast.
 *  - Signature: `X-Slack-Signature` = `v0=` + hex HMAC-SHA256(
 *    `v0:<X-Slack-Request-Timestamp>:<rawBody>`, SLACK_SIGNING_SECRET). Verified
 *    FIRST on every request; wrong/missing signature -> 401. The legacy
 *    `X-Slack-Token` header is NOT accepted. Replay guard: reject
 *    `|now - timestamp| > 300s`.
 *
 * Fail-closed rules (owner mandate):
 *  - SLACK_SIGNING_SECRET unset -> 503, nothing processed (no guessed keys).
 *  - Missing / mismatched signature -> 401, nothing processed. Constant-time
 *    compare throughout.
 *  - Malformed JSON -> 400.
 *  - Unknown event types are acknowledged but never dispatched.
 *  - Receiving a webhook NEVER deletes or mutates anything in the tenant
 *    workspace (non-destruction mandate). It only records a receipt and
 *    dispatches to the monitoring pipeline, which is entitlement-gated.
 *
 * Synthetic-receipt rejection (PR #167 lesson): the receiver records EVERY
 * processed event, including our own signed verification POSTs which carry
 * synthetic markers (channel "verification-probe", ts "abc123"). The verify CLI
 * only counts receipts carrying a plausible REAL Slack channel + timestamp
 * (see latestRealSlackWebhookReceipt).
 */
import { join } from "node:path";
import { readJSON, writeJSON } from "../lib/data-store";
import type { EventOutcome, MonitoredEvent } from "./types";

/** Slack's signature header: `v0=` + hex HMAC-SHA256 of the signed base string. */
export const SLACK_SIGNATURE_HEADER = "x-slack-signature";
/** Slack's request timestamp header (unix seconds). */
export const SLACK_TIMESTAMP_HEADER = "x-slack-request-timestamp";
/** Max age of a Slack request timestamp (replay guard). */
export const SLACK_MAX_TIMESTAMP_SKEW_SECONDS = 300;
/** Employee that owns the Slack monitor capability contracts. */
export const SLACK_MONITOR_EMPLOYEE_ID = "communications";

/** Slack event.type -> monitor capability contract id (exact map, fail-closed). */
export const SLACK_MONITOR_EVENT_MAP: Record<string, string> = {
  app_mention: "slack-monitor-mention",
  message: "slack-monitor-channel-activity",
};

export interface SlackWebhookEvent {
  type: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  user?: string;
  text?: string;
  team?: string;
}

export interface SlackWebhookReceipt {
  capabilityId: string;
  eventId: string;
  eventType: string;
  teamId: string;
  outcome: string;
  receivedAt: string;
}

export interface SlackWebhookDeps {
  /** Returns the configured SLACK_SIGNING_SECRET (undefined => fail closed). */
  getSigningSecret(): string | undefined;
  /** Entitlement gate for a Slack team id (fail-closed on unknown/error). */
  ensureTeamGate(teamId: string): Promise<boolean>;
  /** Dispatch a mapped event through the monitoring pipeline. */
  dispatch(event: MonitoredEvent): Promise<EventOutcome>;
  /** Persist a live-receipt record so the verification CLI can confirm receipt. */
  recordReceipt?(receipt: SlackWebhookReceipt): void | Promise<void>;
}

/** Constant-time string equality (length-safe, no early exit). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** hex(HMAC-SHA256(signingBaseString, secret)) — the Slack signature scheme. */
export async function computeSlackSignature(signingBaseString: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(signingBaseString));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Verify a Slack request: signature header (`v0=...`) against the HMAC of
 * `v0:<timestamp>:<rawBody>` with the signing secret, plus the replay guard.
 * Fail-closed: missing/empty secret or signature, wrong signature, or a
 * timestamp older than 5 minutes -> false.
 */
export async function verifySlackRequest(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  signingSecret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!signingSecret) return false;
  if (!signatureHeader || !timestampHeader) return false;
  if (!signatureHeader.startsWith("v0=")) return false;
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > SLACK_MAX_TIMESTAMP_SKEW_SECONDS) return false;
  const expected = await computeSlackSignature(`v0:${timestampHeader}:${rawBody}`, signingSecret).catch(() => null);
  return expected !== null && constantTimeEqual(signatureHeader.slice("v0=".length), expected);
}

/** Parse the Slack POST envelope. Fail-closed: invalid JSON / no type field. */
export function parseSlackPayload(rawBody: string): { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "Invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "Payload must be a JSON object" };
  const body = parsed as Record<string, unknown>;
  if (typeof body.type !== "string" || body.type.length === 0) {
    return { ok: false, reason: "Payload must carry a non-empty type" };
  }
  return { ok: true, body };
}

/** Exact event.type -> monitor contract capability id (null = not in subscription). */
export function mapSlackEventType(eventType: string): string | null {
  return SLACK_MONITOR_EVENT_MAP[eventType] ?? null;
}

/** Stable event id for dedupe/lease: `slack:<teamId>:<eventType>:<channel>:<ts>`. */
export function slackEventId(event: SlackWebhookEvent): string {
  return `slack:${event.team ?? "unknown"}:${event.type}:${event.channel ?? "no-channel"}:${event.ts ?? "no-ts"}`;
}

/** Build a MonitoredEvent for a mapped Slack event (requires a team to dispatch). */
export function buildSlackMonitoredEvent(event: SlackWebhookEvent, capabilityId: string): MonitoredEvent {
  return {
    id: slackEventId(event),
    employeeId: SLACK_MONITOR_EMPLOYEE_ID,
    providerId: "slack",
    eventType: event.type,
    tenantId: event.team,
    payload: {
      capabilityId,
      eventType: event.type,
      channel: event.channel,
      channelType: event.channel_type,
      ts: event.ts,
      user: event.user,
      text: event.text,
      team: event.team,
    },
    receivedAt: new Date().toISOString(),
    signature: undefined,
  };
}

/**
 * Full Slack webhook route handler.
 *  - POST url_verification -> 200 with the challenge string (text/plain) if the
 *    signature is valid, else 401.
 *  - POST event_callback -> verify signature, map app_mention/message to monitor
 *    contracts, dispatch through the entitlement-gated pipeline, record a
 *    receipt, and ACK 200 fast.
 *  - anything else -> 405.
 */
export async function handleSlackWebhook(req: Request, deps: SlackWebhookDeps): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed — POST (url_verification / event_callback) required" }, { status: 405 });
  }

  const signingSecret = deps.getSigningSecret();
  if (!signingSecret) {
    console.error("[monitor] Slack signing secret not configured (SLACK_SIGNING_SECRET) — failing closed");
    return Response.json({ error: "Signing secret not configured" }, { status: 503 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return Response.json({ error: "Failed to read body" }, { status: 400 });
  }

  const signatureHeader = req.headers.get(SLACK_SIGNATURE_HEADER);
  const timestampHeader = req.headers.get(SLACK_TIMESTAMP_HEADER);
  if (!(await verifySlackRequest(rawBody, signatureHeader, timestampHeader, signingSecret))) {
    console.error("[monitor] Slack signature rejected (missing/wrong/stale)");
    return Response.json({ error: "Invalid X-Slack-Signature header" }, { status: 401 });
  }

  const parsed = parseSlackPayload(rawBody);
  if (!parsed.ok) {
    return Response.json({ error: parsed.reason }, { status: 400 });
  }

  // ── url_verification challenge ──────────────────────────────────────────────
  if (parsed.body.type === "url_verification") {
    const challenge = typeof parsed.body.challenge === "string" ? parsed.body.challenge : "";
    if (!challenge) return Response.json({ error: "url_verification challenge missing" }, { status: 400 });
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" },
    });
  }

  // ── event_callback deliveries ───────────────────────────────────────────────
  if (parsed.body.type === "event_callback") {
    const event = (parsed.body.event ?? {}) as SlackWebhookEvent;
    const capabilityId = mapSlackEventType(event.type ?? "");
    if (!capabilityId) {
      // Not in our subscription — acknowledged, never dispatched.
      return Response.json({ received: true, processed: 0, skipped: 0, failed: 0, ignored: [event.type ?? "unknown"] });
    }
    if (!event.team) {
      return Response.json({ received: true, processed: 0, failed: 1, outcomes: [{ eventType: event.type, capabilityId, status: "failed", reason: "Event has no team" }] });
    }
    let outcome: EventOutcome;
    try {
      // Best-effort team-gate registration (self-heal); the dispatcher itself
      // re-checks entitlement (canMonitor) and fails unentitled events.
      await deps.ensureTeamGate(event.team);
      outcome = await deps.dispatch(buildSlackMonitoredEvent(event, capabilityId));
    } catch (error) {
      outcome = { eventId: slackEventId(event), status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
    if (outcome.status === "processed") {
      try {
        await deps.recordReceipt?.({
          capabilityId,
          eventId: outcome.eventId || slackEventId(event),
          eventType: event.type,
          teamId: event.team,
          outcome: outcome.status,
          receivedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("[monitor] Failed to record Slack webhook receipt:", error instanceof Error ? error.message : error);
      }
    }
    return Response.json({
      received: true,
      processed: outcome.status === "processed" ? 1 : 0,
      skipped: outcome.status === "skipped" ? 1 : 0,
      failed: outcome.status === "failed" ? 1 : 0,
      outcomes: [{ eventType: event.type, capabilityId, status: outcome.status, reason: outcome.reason }],
    });
  }

  return Response.json({ error: "Unknown Slack payload type: " + String(parsed.body.type) }, { status: 400 });
}

// ── Live-receipt log (evidence for the batch verification CLI) ───────────────

export const SLACK_RECEIPTS_FILE = "slack_monitoring_receipts.json";
const MAX_RECEIPTS = 200;

export function slackReceiptsPath(dataDir: string): string {
  return join(dataDir, SLACK_RECEIPTS_FILE);
}

/** Append a live-receipt record (bounded). Never stores credentials. */
export async function recordSlackWebhookReceipt(receipt: SlackWebhookReceipt, dataDir: string): Promise<void> {
  const file = slackReceiptsPath(dataDir);
  const receipts: SlackWebhookReceipt[] = Array.isArray(readJSON(file)) ? readJSON(file) : [];
  receipts.push(receipt);
  writeJSON(file, receipts.slice(-MAX_RECEIPTS));
}

export function readSlackWebhookReceipts(dataDir: string): SlackWebhookReceipt[] {
  const value = readJSON(slackReceiptsPath(dataDir));
  return Array.isArray(value) ? (value as SlackWebhookReceipt[]) : [];
}

// ── Team-gate registration (entitlement for webhook dispatch) ────────────────

/** Canonical Slack auth.test endpoint (never guessed). */
export const SLACK_AUTH_TEST_URL = "https://slack.com/api/auth.test";

/**
 * Resolve the team id for a Slack access/bot token via the canonical auth.test
 * endpoint. Bounded to the canonical host — never a guessed URL.
 */
export async function resolveSlackTeamId(accessToken: string | undefined): Promise<string> {
  if (!accessToken) throw new Error("Slack credential has no access token");
  const response = await fetch(SLACK_AUTH_TEST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Slack auth.test failed HTTP ${response.status}`);
  const body = (await response.json()) as { ok?: boolean; team_id?: string; error?: string };
  if (body.ok !== true || !body.team_id) throw new Error(`Slack auth.test failed: ${body.error || "no team_id"}`);
  return body.team_id;
}

export interface SelfHealTeamGateOptions {
  /** Runtime data dir holding tenant_oauth_credentials.json. */
  dataDir: string;
  /** The team id from the webhook event (event.team). */
  teamId: string;
  /** Entitlement check — only purchased tenants may get a team gate. */
  canMonitor: (email: string) => boolean;
  /** Registers the team as an active monitoring gate on match. */
  configureTenant: (teamId: string, gate: { purchased: boolean; status: string }) => void;
}

/**
 * Runtime self-heal for the Slack team gate: when no persisted teamId in
 * tenant_oauth_credentials.json matches the event's team id, resolve each
 * entitled tenant's Slack team live via the canonical auth.test API and, on
 * match, configure the gate AND persist teamId back into the credential record
 * (durable write-through).
 *
 * Fail-closed rules (mirror selfHealXeroOrgGate):
 *  - Only the canonical SLACK_AUTH_TEST_URL is contacted (no guessed URLs).
 *  - A per-credential resolve error skips that credential (stale/expired
 *    token) — no access is granted, and NOTHING is mutated on failure.
 *  - If no credential matches the team, returns false (event stays denied).
 */
export async function selfHealSlackTeamGate(opts: SelfHealTeamGateOptions): Promise<boolean> {
  const file = join(opts.dataDir, "tenant_oauth_credentials.json");
  const creds = readJSON(file);
  if (!creds || typeof creds !== "object") return false;
  for (const [key, raw] of Object.entries(creds)) {
    if (!key.endsWith(":slack") || !raw || typeof raw !== "object") continue;
    const email = key.slice(0, -":slack".length);
    if (!opts.canMonitor(email)) continue; // only entitled tenants get team gates
    const record = raw as Record<string, unknown>;
    let teamId = typeof record.teamId === "string" ? record.teamId : undefined;
    if (!teamId) {
      try {
        teamId = await resolveSlackTeamId(typeof record.accessToken === "string" ? record.accessToken : undefined);
        record.teamId = teamId;
        const all = readJSON(file);
        if (all && typeof all === "object") {
          all[key] = record;
          writeJSON(file, all);
        }
      } catch (error) {
        console.log("[monitor] Slack team-gate registration skipped for " + email + ": " + (error instanceof Error ? error.message : error));
        continue;
      }
    }
    if (teamId === opts.teamId) {
      opts.configureTenant(teamId, { purchased: true, status: "Active" });
      return true;
    }
  }
  return false;
}

/**
 * A plausible real Slack channel id + message timestamp:
 *  - channel: never "verification-probe" / empty / synthetic markers
 *  - ts: real Slack message timestamps look like "<epoch>.<microseconds>"
 *    (e.g. "1405895017.000506"); our verification probes use "abc123".
 * Fail-closed on clearly-synthetic tokens; fail-open on plausible values.
 */
export function isSyntheticSlackEventMarker(channel: string | undefined, ts: string | undefined): boolean {
  const c = (channel ?? "").trim().toLowerCase();
  const t = (ts ?? "").trim().toLowerCase();
  if (c.length === 0 || t.length === 0) return true;
  if (c === "verification-probe" || c.includes("verification")) return true;
  if (t.includes("abc123")) return true;
  // Real Slack ts is "<digits>.<digits>". Reject clearly-non-timestamp tokens.
  if (!/^\d+\.\d+$/.test(t)) return true;
  return false;
}

/** Newest processed receipt for a capability within `withinMs` that carries REAL
 *  Slack markers (channel + ts). Synthetic verification-probe receipts never count. */
export function latestRealSlackWebhookReceipt(capabilityId: string, dataDir: string, withinMs: number): SlackWebhookReceipt | undefined {
  const cutoff = Date.now() - withinMs;
  const matches = readSlackWebhookReceipts(dataDir)
    .filter((r) => r.capabilityId === capabilityId && r.outcome === "processed")
    .filter((r) => new Date(r.receivedAt).getTime() >= cutoff)
    .filter((r) => {
      // eventId format: `slack:<teamId>:<eventType>:<channel>:<ts>`
      const parts = r.eventId.split(":");
      if (parts.length < 5) return false;
      const channel = parts[3];
      const ts = parts.slice(4).join(":");
      return !isSyntheticSlackEventMarker(channel, ts);
    });
  matches.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  return matches[0];
}
