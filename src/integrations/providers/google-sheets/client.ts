import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

/**
 * Google Sheets client.
 *
 * Canonical host: https://sheets.googleapis.com/v4 (vetted Google-owned domain).
 * The existing legacy read path (queryGoogleSheets in src/lib/provider-api.ts)
 * targets the same host's values.get endpoint; this client covers the full
 * create/read/write surface: create spreadsheets, write ranges, append rows,
 * read ranges, and batch structural updates.
 */
const SHEETS_BASE = "https://sheets.googleapis.com/v4";

export class GoogleSheetsClient {
  private client: HttpClient;
  private tokens: OAuthTokens;
  private authConfig: any;

  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({
      baseUrl: SHEETS_BASE,
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
      const { refreshSheetsToken } = await import("./auth");
      this.tokens = await refreshSheetsToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  /* ── Create ─────────────────────────────────────────────────────────── */
  /** Create a spreadsheet with an optional title and tab names. */
  async createSpreadsheet(title: string, sheets?: string[]): Promise<any> {
    await this.ensureToken();
    const body: any = { properties: { title } };
    if (Array.isArray(sheets) && sheets.length > 0) {
      body.sheets = sheets.map((s) => ({ properties: { title: s } }));
    }
    const r = await this.client.post("/spreadsheets", body, this.headers);
    return r.data;
  }

  /* ── Read ───────────────────────────────────────────────────────────── */
  /** Fetch spreadsheet metadata (tabs, grid info). */
  async getSpreadsheet(spreadsheetId: string): Promise<any> {
    await this.ensureToken();
    const r = await this.client.get(`/spreadsheets/${encodeURIComponent(spreadsheetId)}`, this.headers);
    return r.data;
  }

  /** Read a range of values, e.g. "Sheet1!A1:D50". Returns rows of values. */
  async readRange(spreadsheetId: string, range: string): Promise<any[][]> {
    await this.ensureToken();
    if (!range) throw new Error("Google Sheets: readRange requires a range (e.g. Sheet1!A1:D50)");
    const r = await this.client.get(
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
      this.headers,
    );
    return (r.data?.values as any[][]) || [];
  }

  /* ── Write ──────────────────────────────────────────────────────────── */
  /** Overwrite a range with values (valueInputOption=RAW, server-side coerced). */
  async writeRange(spreadsheetId: string, range: string, values: any[][]): Promise<any> {
    await this.ensureToken();
    if (!range) throw new Error("Google Sheets: writeRange requires a range (e.g. Sheet1!A1)");
    if (!Array.isArray(values)) throw new Error("Google Sheets: writeRange requires a values array");
    const r = await this.client.put(
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { values, majorDimension: "ROWS" },
      this.headers,
    );
    return r.data;
  }

  /** Append rows to a range (grows the sheet; idempotent per call). */
  async appendRows(spreadsheetId: string, range: string, values: any[][]): Promise<any> {
    await this.ensureToken();
    if (!range) throw new Error("Google Sheets: appendRows requires a range (e.g. Sheet1!A1)");
    if (!Array.isArray(values) || values.length === 0) throw new Error("Google Sheets: appendRows requires a non-empty values array");
    const r = await this.client.post(
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`,
      { values, majorDimension: "ROWS" },
      this.headers,
    );
    return r.data;
  }

  /** Batch structural updates (add sheets, resize, formatting, etc.). */
  async batchUpdate(spreadsheetId: string, requests: any[]): Promise<any> {
    await this.ensureToken();
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error("Google Sheets: batchUpdate requires a non-empty requests array");
    }
    const r = await this.client.post(
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      { requests },
      this.headers,
    );
    return r.data;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get("/spreadsheets?fields=spreadsheetId", this.headers);
      return r.status === 400 || r.ok; // 400 = missing id param but auth OK
    } catch {
      return false;
    }
  }
}

export function createGSheetsClient(config: ConnectionConfig): GoogleSheetsClient {
  return new GoogleSheetsClient(
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
