import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";
import { buildMinimalPptx, extractPptxText } from "../microsoft-office/ooxml";

/**
 * Microsoft PowerPoint client — Graph API.
 *
 * Canonical hosts (never guessed):
 *   - Graph: https://graph.microsoft.com/v1.0
 *
 * PowerPoint decks are .pptx (OOXML ZIP) files in OneDrive. Creation builds a
 * minimal valid .pptx (presentation + slide master + layout + theme + slides)
 * and PUTs it; read-back extracts all <a:t> text runs from every slide part.
 */
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export interface PresentationSlide {
  title: string;
  body?: string;
}

export class MicrosoftPowerPointClient {
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
      const { refreshPowerPointToken } = await import("./auth");
      this.tokens = await refreshPowerPointToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  /** PUT raw pptx content to OneDrive (binary-safe). */
  private async putContent(path: string, content: Uint8Array): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${GRAPH_BASE}${path}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": PPTX_MIME },
        body: content,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Microsoft Graph: PUT pptx failed HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ── Create ─────────────────────────────────────────────────────────── */
  /** Create a PowerPoint deck from an outline of slides (title + optional body). */
  async createPresentation(name: string, slides: PresentationSlide[]): Promise<any> {
    await this.ensureToken();
    if (!name) throw new Error("Microsoft PowerPoint: createPresentation requires a name");
    if (!Array.isArray(slides) || slides.length === 0) throw new Error("Microsoft PowerPoint: createPresentation requires at least one slide");
    if (!/\.pptx$/i.test(name)) name = `${name}.pptx`;
    const pptx = buildMinimalPptx(slides);
    return this.putContent(`/me/drive/root/children/${encodeURIComponent(name)}:/content`, pptx);
  }

  /* ── Read ───────────────────────────────────────────────────────────── */
  /** Fetch deck metadata (name, size, mimeType, webUrl). */
  async getPresentationMetadata(id: string): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("Microsoft PowerPoint: getPresentationMetadata requires an id");
    const r = await this.client.get(`/me/drive/items/${encodeURIComponent(id)}`, this.headers);
    return r.data;
  }

  /** Download the .pptx binary and extract all slide text (binary-safe). */
  async readPresentationText(id: string): Promise<string> {
    await this.ensureToken();
    if (!id) throw new Error("Microsoft PowerPoint: readPresentationText requires an id");
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
      return extractPptxText(bytes);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** List PowerPoint decks in the drive root. */
  async listPresentations(): Promise<any[]> {
    await this.ensureToken();
    const r = await this.client.get("/me/drive/root/children?$select=id,name,size,file,webUrl", this.headers);
    const items = (r.data?.value as any[]) || [];
    return items.filter((f) => /\.pptx$/i.test(f.name || ""));
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

export function createPowerPointClient(config: ConnectionConfig): MicrosoftPowerPointClient {
  return new MicrosoftPowerPointClient(
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
