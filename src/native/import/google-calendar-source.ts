/**
 * native/import/google-calendar-source.ts — Phase 5.1 (6.5) GOOGLE CALENDAR
 * IMPORT SOURCE LANE (110th publish slice, with sendgrid + slack).
 *
 * REAL live-provider lane (like the 6.4 file lanes) backed by the existing
 * verified Google Calendar read client (google-calendar/client.ts — Calendar
 * API v3, https://www.googleapis.com/calendar/v3): a client connects their OWN
 * Google Calendar account and the PULL stage fetches a bounded snapshot of the
 * tenant's own primary-calendar EVENTS (last 30 days, page 1, maxResults =
 * MAX_PAGE_SIZE) into the import slice's existing tenant-keyed staging store.
 * The existing map → preview → gated importTableRows commit path applies
 * unchanged. Owner 10-20 direction: provider connections are CLIENT-optional
 * data-transfer lanes — read-only adapter, the client manages their own
 * credentials, chooses what to import, approves every commit; we never run or
 * write through their tools.
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-google-calendar-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:google-calendar`
 *     ONLY (loadStoredCredential with tenant — no cross-tenant fallback;
 *     absent means absent → honest failed pull, never another tenant's token,
 *     zero API calls). The Calendar calls are token-scoped (per-tenant Bearer
 *     header) against the tenant's own primary calendar (or the calendarId
 *     captured on their connection).
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar fields
 *     (id/summary/status/created/updated + derived start/end from the event's
 *     start.dateTime|date / end.dateTime|date — explicit fixed scalar paths,
 *     never guessed) + a derived kind "event"; nested-only records skipped
 *     with an honest note.
 *   - bounded snapshot: ONE listEvents() call to the tenant's primary
 *     calendar, last-30-days window, page 1 (maxResults = MAX_PAGE_SIZE),
 *     entries sliced to MAX_PAGE_SIZE then capped at MAX_STAGING_ROWS and the
 *     512 KiB byte cap — caps enforced by the caller gate as well (belt and
 *     braces). No paging, no calendar enumeration beyond the one read.
 *   - HONEST RUN OUTCOMES: every pull records pulled counts + the provider
 *     HTTP status on the ledger; a client is NEVER told their calendar events
 *     were imported when only metadata was staged ("calendar event metadata
 *     listed; event attachments are NOT downloaded by this lane"; "0
 *     fabricated"; "nothing imported until you approve"; "page 1").
 *   - secrets never returned: the credential object exists only inside this
 *     reader; rows contain mapped event metadata only.
 *   - fail-closed: missing credential / expired token with no app creds /
 *     provider HTTP error → throw with httpStatus → gate records an honest
 *     failed run (native.import.failed event) and the pull returns an error.
 */
import { createGCalendarClient } from "../../integrations/providers/google-calendar/client";
import { refreshCalendarToken } from "../../integrations/providers/google-calendar/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { loadOAuthAppCredentials, loadStoredCredential } from "../../verification/credential-source";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Path-style redirect URI for the Google Calendar OAuth app (PR #238
 *  discipline). */
function googleCalendarRedirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback/google-calendar` : "";
}

/** Fixed safe scalar fields from a Calendar API v3 event — deterministic,
 *  never guessed. `start`/`end` are derived below from the explicit
 *  start.dateTime|date / end.dateTime|date scalar paths. */
const EVENT_FIELDS = [
  "id",
  "summary",
  "status",
  "created",
  "updated",
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

/** Read the explicit dateTime|date scalar from a Google event time object
 *  (start/end). Deterministic — no guessing, no nested objects staged. */
function eventTime(edge: unknown): string | undefined {
  if (!edge || typeof edge !== "object" || Array.isArray(edge)) return undefined;
  const e = edge as Record<string, unknown>;
  if (typeof e["dateTime"] === "string") return e["dateTime"] as string;
  if (typeof e["date"] === "string") return e["date"] as string;
  return undefined;
}

/** Flatten one Calendar event: safe top-level scalars + derived start/end
 *  (explicit fixed scalar paths) + derived kind "event". Deterministic. */
function flattenEvent(record: Record<string, unknown>): Record<string, unknown> {
  const out = pickScalars(record, EVENT_FIELDS);
  out.kind = "event";
  const start = eventTime(record["start"]);
  const end = eventTime(record["end"]);
  if (start !== undefined) out["start"] = start;
  if (end !== undefined) out["end"] = end;
  return out;
}

/** Error with an optional provider HTTP status — the gate records it on the
 *  honest failed run when present. */
export class GoogleCalendarImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "GoogleCalendarImportSourceError";
    this.httpStatus = httpStatus;
  }
}

export interface GoogleCalendarImportSourceDeps {
  /** Injectable fetch (tests). Defaults to global fetch at call time. */
  fetchImpl?: typeof fetch;
}

/** Build the Google Calendar import source reader (injectable for tests). */
export function makeGoogleCalendarImportSourceReader(deps: GoogleCalendarImportSourceDeps = {}): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    void fetchImpl;
    // 1. STRICT tenant-scoped credential — `${tenantId}:google-calendar` only.
    //    The loader (credential-source.ts) never falls back to another
    //    tenant's row; the Calendar calls below are token-scoped (per-tenant
    //    Bearer header).
    const stored = loadStoredCredential("google-calendar", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    if (!cred?.accessToken) {
      throw new GoogleCalendarImportSourceError(
        `No Google Calendar account is connected for this tenant — connect your own Google Calendar account to import (0 rows pulled; nothing fabricated).`,
      );
    }
    // The calendar to read: the calendarId captured on the tenant's own
    // connection when available, else the authenticated user's primary
    // calendar (the exact default the verified google-calendar-list-events
    // capability uses).
    const calendarId = typeof cred.calendarId === "string" && cred.calendarId.length > 0 ? cred.calendarId : "primary";
    // 2. Refresh the access token ONLY when expired (mutates the in-memory
    //    copy; the durable store is updated by the platform's own refresher,
    //    not here). One-shot / client-initiated — never a background loop.
    let accessToken = cred.accessToken;
    let refreshToken = cred.refreshToken;
    let expiresAt = cred.expiresAt;
    const expired = isTokenExpired({ accessToken, refreshToken, expiresAt, scope: cred.scope, raw: {} } as never);
    if (expired) {
      const app = loadOAuthAppCredentials("google-calendar");
      if (!app?.clientId || !app?.clientSecret) {
        throw new GoogleCalendarImportSourceError(
          "Google Calendar access token expired and OAUTH_GOOGLE_CALENDAR_CLIENT_ID/SECRET are not configured — cannot refresh (0 rows pulled).",
        );
      }
      if (!refreshToken) {
        throw new GoogleCalendarImportSourceError(
          "Google Calendar access token expired and this connection has no refresh token — reconnect the client's Google Calendar account (0 rows pulled).",
        );
      }
      try {
        // Google Calendar's OAuth app config (auth.ts getGCalendarOAuthConfig)
        // uses the standard clientId/clientSecret/redirectUri shape; the
        // token exchange happens at oauth2.googleapis.com/token.
        const cfg = { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: googleCalendarRedirectUri() };
        const refreshed = await refreshCalendarToken(cfg, refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
      } catch (e) {
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        throw new GoogleCalendarImportSourceError(`Google Calendar token refresh failed${status ? ` (HTTP ${status})` : ""} — 0 rows pulled.`, status);
      }
    }
    // 3. Bounded read-only snapshot: ONE listEvents() call on the tenant's
    //    own calendar, last 30 days, page 1 (maxResults = MAX_PAGE_SIZE) —
    //    the exact read family the verified google-calendar-list-events
    //    capability makes. Entries sliced to MAX_PAGE_SIZE, then to
    //    MAX_STAGING_ROWS below (belt and braces).
    const client = createGCalendarClient({
      accessToken,
      refreshToken,
      expiresAt,
      scope: cred.scope,
      clientId: process.env.OAUTH_GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: process.env.OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET,
      redirectUri: googleCalendarRedirectUri(),
    });
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const rows: Record<string, unknown>[] = [];
    let skippedNested = 0;
    try {
      const itemsRaw = await client.listEvents(calendarId, since, undefined, MAX_PAGE_SIZE);
      const items = Array.isArray(itemsRaw) ? (itemsRaw as unknown[]).slice(0, MAX_PAGE_SIZE) : [];
      for (const it of items) {
        const flat = flattenEvent((it as Record<string, unknown> | undefined) ?? {});
        if (Object.keys(flat).length <= 1) skippedNested += 1; // kind-only rows are empty payloads
        else rows.push(flat);
      }
    } catch (e) {
      const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : undefined;
      throw new GoogleCalendarImportSourceError(
        `Google Calendar read failed${status ? ` (HTTP ${status})` : ""}: ${e instanceof Error ? e.message : String(e)} — 0 rows pulled; nothing fabricated.`,
        status,
      );
    }
    // 4. Bound total rows + bytes (belt and braces on top of the gate caps).
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new GoogleCalendarImportSourceError("Google Calendar snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const noteParts = [
      "Google Calendar HTTP 200",
      `${sliced.length} event(s) listed (calendar '${calendarId}', last 30 days, page 1)`,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "calendar event metadata listed; event attachments are NOT downloaded by this lane",
      "0 fabricated",
    ];
    if (skippedNested > 0) noteParts.push(`${skippedNested} item(s) with no mapped scalar fields skipped (nested-only payloads)`);
    return { rows: sliced, note: noteParts.join("; "), httpStatus: 200 };
  };
}

/** Register the Google Calendar lane in the import source registry
 *  (idempotent). Called by prod-server at boot and by tests. One-shot /
 *  client-initiated re-runs only — no webhooks, no write-back, no reconnect
 *  program (owner 10-20). */
export function registerGoogleCalendarImportSource(deps: GoogleCalendarImportSourceDeps = {}): void {
  registerImportSource("google-calendar", makeGoogleCalendarImportSourceReader(deps));
}