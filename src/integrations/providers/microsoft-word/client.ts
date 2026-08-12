import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";
import { buildMinimalDocx, extractDocxText } from "../microsoft-office/ooxml";

/**
 * Microsoft Word client — Graph API.
 *
 * Canonical hosts (never guessed):
 *   - Graph: https://graph.microsoft.com/v1.0
 *
 * Word documents are .docx (OOXML ZIP) files stored in OneDrive. The client:
 *   - createWordDocument: builds a minimal valid .docx and PUTs it to
 *     /me/drive/root/children/{name}:/content
 *   - readWordDocument: GET /me/drive/items/{id}/content and extracts text
 *     (handles stored and deflated zip entries)
 *   - listWordDocuments: GET /me/drive/root/children filtered by .docx
 */
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class MicrosoftWordClient {
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
      const { refreshWordToken } = await import("./auth");
      this.tokens = await refreshWordToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  /** PUT raw content to a OneDrive path (binary-safe; HttpClient JSON-stringifies bodies). */
  private async putContent(path: string, content: Uint8Array, mimeType: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${GRAPH_BASE}${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.tokens.accessToken}`,
          "Content-Type": mimeType,
        },
        body: content,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Microsoft Graph: PUT content failed HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ── Create ─────────────────────────────────────────────────────────── */
  /** Create a Word document from paragraphs of text, stored in OneDrive root. */
  async createWordDocument(name: string, paragraphs: string[]): Promise<any> {
    await this.ensureToken();
    if (!name) throw new Error("Microsoft Word: createWordDocument requires a name");
    if (!/\.docx$/i.test(name)) name = `${name}.docx`;
    const docx = buildMinimalDocx(paragraphs);
    return this.putContent(`/me/drive/root/children/${encodeURIComponent(name)}:/content`, docx, DOCX_MIME);
  }

  /* ── Read ───────────────────────────────────────────────────────────── */
  /** Fetch item metadata (name, size, mimeType, webUrl). */
  async getWordDocumentMetadata(id: string): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("Microsoft Word: getWordDocumentMetadata requires an id");
    const r = await this.client.get(`/me/drive/items/${encodeURIComponent(id)}`, this.headers);
    return r.data;
  }

  /** Download the .docx binary and extract its plain text (binary-safe). */
  async readWordDocumentText(id: string): Promise<string> {
    await this.ensureToken();
    if (!id) throw new Error("Microsoft Word: readWordDocumentText requires an id");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${GRAPH_BASE}/me/drive/items/${encodeURIComponent(id)}/content`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.tokens.accessToken}` },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Microsoft Graph: content download failed HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return extractDocxText(bytes);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** List Word documents in the drive root. */
  async listWordDocuments(): Promise<any[]> {
    await this.ensureToken();
    const r = await this.client.get("/me/drive/root/children?$select=id,name,size,file,webUrl", this.headers);
    const items = (r.data?.value as any[]) || [];
    return items.filter((f) => /\.docx$/i.test(f.name || ""));
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

export function createWordClient(config: ConnectionConfig): MicrosoftWordClient {
  return new MicrosoftWordClient(
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
