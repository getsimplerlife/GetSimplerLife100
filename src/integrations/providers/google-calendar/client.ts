import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

/**
 * Google Calendar client — Calendar API v3.
 *
 * Canonical host (never guessed): https://www.googleapis.com/calendar/v3
 *
 * Tenant-scoped: the client is always constructed from a per-tenant OAuth
 * token (createGCalendarClient) and every request carries that tenant's
 * Bearer token; events are created/read inside the tenant's own calendar.
 * Fail-closed: missing ids/summary throw before any network call.
 */
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarEventInput {
  /** Event title (required). */
  summary: string;
  /** Start datetime in RFC3339 (required, e.g. 2026-08-12T18:00:00Z). */
  start: string;
  /** End datetime in RFC3339 (required). */
  end: string;
  description?: string;
  location?: string;
  /** Calendar id; defaults to the tenant's primary calendar. */
  calendarId?: string;
}

export class GoogleCalendarClient {
  private http: HttpClient;
  private tokens: OAuthTokens;
  private authConfig: any;

  constructor(tokens: OAuthTokens, authConfig: any) {
    this.http = new HttpClient({
      baseUrl: CALENDAR_BASE,
      rateLimit: { maxRequestsPerSecond: 60 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
    this.tokens = tokens;
    this.authConfig = authConfig;
  }

  private get headers() {
    return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" };
  }

  private async ensureToken() {
    if (isTokenExpired(this.tokens) && this.tokens.refreshToken) {
      const { refreshCalendarToken } = await import("./auth");
      this.tokens = await refreshCalendarToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  /* ── Understand (read) ─────────────────────────────────────────────── */
  /** List the tenant's calendars (calendarList). */
  async listCalendars(maxResults = 50): Promise<any[]> {
    await this.ensureToken();
    const r = await this.http.get(`/users/me/calendarList?maxResults=${maxResults}`, this.headers);
    return r.data?.items || [];
  }

  /**
   * List events for a calendar (default primary). Single events, ordered by
   * start time. Optional timeMin/timeMax in RFC3339.
   */
  async listEvents(calendarId = "primary", timeMin?: string, timeMax?: string, maxResults = 50): Promise<any[]> {
    await this.ensureToken();
    const q = new URLSearchParams({ maxResults: String(maxResults), singleEvents: "true", orderBy: "startTime" });
    if (timeMin) q.set("timeMin", timeMin);
    if (timeMax) q.set("timeMax", timeMax);
    const r = await this.http.get(
      `/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`,
      this.headers,
    );
    return r.data?.items || [];
  }

  /** Fetch a single event by id (fail-closed: missing id throws). */
  async getEvent(calendarId: string, eventId: string): Promise<any> {
    if (!calendarId) throw new Error("Google Calendar: getEvent requires a calendar id");
    if (!eventId) throw new Error("Google Calendar: getEvent requires an event id");
    await this.ensureToken();
    const r = await this.http.get(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      this.headers,
    );
    return r.data;
  }

  /* ── Automate (write) ──────────────────────────────────────────────── */
  /**
   * Create an event in the tenant's calendar (default primary).
   * Idempotent for a given input set since each call produces its own event.
   */
  async createEvent(input: CalendarEventInput): Promise<any> {
    if (!input.summary || !input.summary.trim()) {
      throw new Error("Google Calendar: createEvent requires a summary");
    }
    if (!input.start || !input.end) {
      throw new Error("Google Calendar: createEvent requires start and end datetimes (RFC3339)");
    }
    await this.ensureToken();
    const calendarId = input.calendarId || "primary";
    const body: any = {
      summary: input.summary.trim(),
      start: { dateTime: input.start },
      end: { dateTime: input.end },
    };
    if (input.description) body.description = input.description;
    if (input.location) body.location = input.location;
    const r = await this.http.post(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      body,
      this.headers,
    );
    return r.data;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.http.get("/users/me/calendarList?maxResults=1", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createGCalendarClient(config: ConnectionConfig): GoogleCalendarClient {
  return new GoogleCalendarClient(
    {
      accessToken: config.accessToken || "",
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
      scope: config.scope,
      raw: config,
    },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
  );
}
