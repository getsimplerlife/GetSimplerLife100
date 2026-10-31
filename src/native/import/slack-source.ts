/**
 * native/import/slack-source.ts — Phase 5.1 (6.5) SLACK IMPORT SOURCE LANE
 * (110th publish slice, with google-calendar + sendgrid).
 *
 * REAL live-provider lane backed by the existing verified Slack read client
 * (slack/client.ts — https://slack.com/api, conversations.list): a client
 * connects their OWN Slack workspace and the PULL stage fetches a bounded
 * snapshot of the tenant's own workspace CHANNELS (page 1, limit 200, sliced
 * to MAX_PAGE_SIZE) into the import slice's existing tenant-keyed staging
 * store. The existing map → preview → gated importTableRows commit path
 * applies unchanged. Owner 10-20 direction: provider connections are
 * CLIENT-optional data-transfer lanes — read-only adapter, the client manages
 * their own credentials, chooses what to import, approves every commit; we
 * never run or write through their tools.
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-slack-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:slack` ONLY
 *     (loadStoredCredential with tenant — no cross-tenant fallback; absent
 *     means absent → honest failed pull, never another tenant's token, zero
 *     API calls). The credential-source env fallback to the platform-wide
 *     `SLACK_BOT_TOKEN` (used by the verification CLI with NO tenant) is
 *     REJECTED here by source check — a bot token is account-level, never a
 *     tenant's own workspace, so a tenant with no stored connection fails
 *     honestly instead of silently reading channels with a global token.
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar fields
 *     (id/name/created/num_members + is_private/is_archived/is_member
 *     booleans) + a derived kind "channel"; nested-only records skipped with
 *     an honest note.
 *   - bounded snapshot: ONE listConversations() call (GET
 *     /conversations.list?types=public_channel,private_channel&limit=200 —
 *     page 1 only), sliced to MAX_PAGE_SIZE then capped at MAX_STAGING_ROWS
 *     and the 512 KiB byte cap — caps enforced by the caller gate as well
 *     (belt and braces). No paging, no channel-history reads, no message
 *     content.
 *   - HONEST RUN OUTCOMES: every pull records pulled counts + the provider
 *     HTTP status on the ledger; a client is NEVER told their Slack messages
 *     were imported when only channel metadata was staged ("channel metadata
 *     only — message content is NOT downloaded by this lane"; "0 fabricated";
 *     "nothing imported until you approve"; "page 1").
 *   - secrets never returned: the credential object exists only inside this
 *     reader; rows contain mapped channel metadata only.
 *   - fail-closed: missing credential / expired token with no app creds /
 *     provider HTTP error → throw with httpStatus → gate records an honest
 *     failed run (native.import.failed event) and the pull returns an error.
 */
import { createSlackClient } from "../../integrations/providers/slack/client";
import { refreshSlackToken } from "../../integrations/providers/slack/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { loadOAuthAppCredentials, loadStoredCredential } from "../../verification/credential-source";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Path-style redirect URI for the Slack OAuth app (PR #238 discipline). */
function slackRedirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback/slack` : "";
}

/** Fixed safe scalar fields from a conversations.list channel — deterministic,
 *  never guessed. */
const CHANNEL_FIELDS = [
  "id",
  "name",
  "created",
  "num_members",
  "is_private",
  "is_archived",
  "is_member",
] as const;

/** Helper: keep only scalar values (string/number/boolean/null) — skip nested
 *  objects/arrays deterministically so staged rows stay flat and bounded. */
function pickScalars(record: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = record[f];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[f] = v;
  }
  return out;
}

/** Flatten one Slack channel: safe top-level scalars + a derived kind. */
function flattenChannel(record: Record<string, unknown>): Record<string, unknown> {
  const out = pickScalars(record, CHANNEL_FIELDS);
  out.kind = "channel";
  return out;
}

/** Error with an optional provider HTTP status — the gate records it on the
 *  honest failed run when present. */
export class SlackImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "SlackImportSourceError";
    this.httpStatus = httpStatus;
  }
}

export interface SlackImportSourceDeps {
  /** Injectable fetch (tests). Defaults to global fetch at call time. */
  fetchImpl?: typeof fetch;
}

/** Build the Slack import source reader (injectable for tests). */
export function makeSlackImportSourceReader(deps: SlackImportSourceDeps = {}): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    void fetchImpl;
    // 1. STRICT tenant-scoped credential — `${tenantId}:slack` only. The
    //    loader (credential-source.ts) never falls back to another tenant's
    //    row; the Slack calls below are token-scoped (per-tenant Bearer).
    const stored = loadStoredCredential("slack", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    // REJECT the platform-wide env fallback: source "env SLACK_BOT_TOKEN" is
    // the verification CLI's global bot token (no tenant) — it is never a
    // tenant's own workspace credential. A tenant with no stored connection
    // fails honestly with ZERO Slack API calls.
    if (!cred?.accessToken || stored.source === "env SLACK_BOT_TOKEN") {
      throw new SlackImportSourceError(
        `No Slack account is connected for this tenant — connect your own Slack workspace to import (0 rows pulled; nothing fabricated).`,
      );
    }
    // 2. Refresh the access token ONLY when expired (mutates the in-memory
    //    copy; the durable store is updated by the platform's own refresher,
    //    not here). One-shot / client-initiated — never a background loop.
    let accessToken = cred.accessToken;
    let refreshToken = cred.refreshToken;
    let expiresAt = cred.expiresAt;
    const expired = isTokenExpired({ accessToken, refreshToken, expiresAt, scope: cred.scope, raw: {} } as never);
    if (expired) {
      const app = loadOAuthAppCredentials("slack");
      if (!app?.clientId || !app?.clientSecret) {
        throw new SlackImportSourceError(
          "Slack access token expired and OAUTH_SLACK_CLIENT_ID/SECRET are not configured — cannot refresh (0 rows pulled).",
        );
      }
      if (!refreshToken) {
        throw new SlackImportSourceError(
          "Slack access token expired and this connection has no refresh token — the client must re-authorise their own Slack workspace (0 rows pulled; nothing fabricated).",
        );
      }
      try {
        // Slack's OAuth app config (auth.ts getSlackOAuthConfig) uses the
        // standard clientId/clientSecret/redirectUri shape; the token
        // exchange happens at slack.com/api/oauth.v2.access.
        const cfg = { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: slackRedirectUri() };
        const refreshed = await refreshSlackToken(cfg, refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
      } catch (e) {
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        throw new SlackImportSourceError(`Slack token refresh failed${status ? ` (HTTP ${status})` : ""} — 0 rows pulled.`, status);
      }
    }
    // 3. Bounded read-only snapshot: ONE listConversations() call (GET
    //    /conversations.list?types=public_channel,private_channel&limit=200 —
    //    page 1 only; no paging, no history reads), sliced to MAX_PAGE_SIZE
    //    then to MAX_STAGING_ROWS below (belt and braces).
    const client = createSlackClient({
      accessToken,
      refreshToken,
      expiresAt,
      scope: cred.scope,
      clientId: process.env.OAUTH_SLACK_CLIENT_ID,
      clientSecret: process.env.OAUTH_SLACK_CLIENT_SECRET,
      redirectUri: slackRedirectUri(),
    });
    const rows: Record<string, unknown>[] = [];
    let skippedNested = 0;
    try {
      const itemsRaw = await client.listConversations("public_channel,private_channel");
      const items = Array.isArray(itemsRaw) ? (itemsRaw as unknown[]).slice(0, MAX_PAGE_SIZE) : [];
      for (const it of items) {
        const flat = flattenChannel((it as Record<string, unknown> | undefined) ?? {});
        if (Object.keys(flat).length <= 1) skippedNested += 1; // kind-only rows are empty payloads
        else rows.push(flat);
      }
    } catch (e) {
      const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : undefined;
      throw new SlackImportSourceError(
        `Slack read failed${status ? ` (HTTP ${status})` : ""}: ${e instanceof Error ? e.message : String(e)} — 0 rows pulled; nothing fabricated.`,
        status,
      );
    }
    // 4. Bound total rows + bytes (belt and braces on top of the gate caps).
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new SlackImportSourceError("Slack snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const noteParts = [
      "Slack HTTP 200",
      `${sliced.length} channel(s) listed (workspace channels, page 1)`,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "channel metadata only — message content is NOT downloaded by this lane",
      "0 fabricated",
    ];
    if (skippedNested > 0) noteParts.push(`${skippedNested} item(s) with no mapped scalar fields skipped (nested-only payloads)`);
    return { rows: sliced, note: noteParts.join("; "), httpStatus: 200 };
  };
}

/** Register the Slack lane in the import source registry (idempotent). Called
 *  by prod-server at boot and by tests. One-shot/client-initiated re-runs
 *  only — no webhooks, no write-back, no re-authorisation program (owner 10-20). */
export function registerSlackImportSource(deps: SlackImportSourceDeps = {}): void {
  registerImportSource("slack", makeSlackImportSourceReader(deps));
}