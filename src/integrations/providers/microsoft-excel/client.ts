import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";
import { buildMinimalXlsx } from "../microsoft-office/ooxml";

/**
 * Microsoft Excel client — Graph API.
 *
 * Canonical hosts (never guessed):
 *   - Graph: https://graph.microsoft.com/v1.0
 *
 * Excel workbooks are .xlsx (OOXML ZIP) files in OneDrive. Creation builds a
 * minimal valid .xlsx and PUTs it; value read/write goes through the native
 * Graph workbook API (/workbook/worksheets/{name}/range(...)/values), which is
 * the correct, honest path for reading cells back (no zip parsing needed).
 */
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const DEFAULT_WORKSHEET = "Sheet1";

export class MicrosoftExcelClient {
  private client: HttpClient;
  private tokens: OAuthTokens;
  private authConfig: any;

  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({
      baseUrl: GRAPH_BASE,
      rateLimit: { maxRequestsPerSecond: 30 },
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
      const { refreshExcelToken } = await import("./auth");
      this.tokens = await refreshExcelToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  /** PUT raw xlsx content to OneDrive (binary-safe). */
  private async putContent(path: string, content: Uint8Array): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${GRAPH_BASE}${path}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": XLSX_MIME },
        body: content,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Microsoft Graph: PUT xlsx failed HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ── Create ─────────────────────────────────────────────────────────── */
  /** Create an Excel workbook with an initial set of rows (Sheet1). */
  async createExcelWorkbook(name: string, rows: unknown[][]): Promise<any> {
    await this.ensureToken();
    if (!name) throw new Error("Microsoft Excel: createExcelWorkbook requires a name");
    if (!/\.xlsx$/i.test(name)) name = `${name}.xlsx`;
    const xlsx = buildMinimalXlsx(rows);
    return this.putContent(`/me/drive/root:/${encodeURI(name)}:/content`, xlsx);
  }

  /* ── Read ───────────────────────────────────────────────────────────── */
  /** Fetch workbook metadata. */
  async getWorkbookMetadata(id: string): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("Microsoft Excel: getWorkbookMetadata requires an id");
    const r = await this.client.get(`/me/drive/items/${encodeURIComponent(id)}`, this.headers);
    return r.data;
  }

  /** Read a range of values via the Graph workbook API (e.g. "Sheet1!A1:D50"). */
  async readWorkbookRange(id: string, range = `${DEFAULT_WORKSHEET}!A1:Z100`): Promise<any[][]> {
    await this.ensureToken();
    if (!id) throw new Error("Microsoft Excel: readWorkbookRange requires an id");
    const r = await this.client.get(
      `/me/drive/items/${encodeURIComponent(id)}/workbook/worksheets/${DEFAULT_WORKSHEET}/range(address='${range}')/values`,
      this.headers,
    );
    return (r.data as any[][]) || [];
  }

  /* ── Write ──────────────────────────────────────────────────────────── */
  /** Write values into a range via the Graph workbook API. */
  async writeWorkbookRange(id: string, range: string, values: unknown[][]): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("Microsoft Excel: writeWorkbookRange requires an id");
    if (!range) throw new Error("Microsoft Excel: writeWorkbookRange requires a range");
    if (!Array.isArray(values) || values.length === 0) throw new Error("Microsoft Excel: writeWorkbookRange requires a non-empty values array");
    const r = await this.client.patch(
      `/me/drive/items/${encodeURIComponent(id)}/workbook/worksheets/${DEFAULT_WORKSHEET}/range(address='${range}')/values`,
      values,
      this.headers,
    );
    return r.data;
  }

  /** List Excel workbooks in the drive root. */
  async listExcelWorkbooks(): Promise<any[]> {
    await this.ensureToken();
    const r = await this.client.get("/me/drive/root/children?$select=id,name,size,file,webUrl", this.headers);
    const items = (r.data?.value as any[]) || [];
    return items.filter((f) => /\.xlsx$/i.test(f.name || ""));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get("/me/drive/root", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createExcelClient(config: ConnectionConfig): MicrosoftExcelClient {
  return new MicrosoftExcelClient(
    {
      accessToken: config.accessToken || "",
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
      scope: config.scope,
      raw: config,
    },
    {
      tenantId: config.tenantId || "common",
      clientId: config.clientId || "",
      clientSecret: config.clientSecret || "",
      redirectUri: config.redirectUri || "",
    },
  );
}
