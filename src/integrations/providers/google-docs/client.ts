import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

/**
 * Google Docs client.
 *
 * Canonical hosts:
 *   - Docs API:  https://docs.googleapis.com/v1
 *   - Drive API: https://www.googleapis.com/drive/v3 (document file creation/copy)
 *
 * The Docs API cannot create documents directly — the backing file must be
 * created through the Drive API with mimeType application/vnd.google-apps.document,
 * then content is injected via Documents.batchUpdate. Both hosts are vetted
 * Google-owned domains; nothing is guessed.
 */
const DOCS_BASE = "https://docs.googleapis.com/v1";
const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

export class GoogleDocsClient {
  private docs: HttpClient;
  private drive: HttpClient;
  private tokens: OAuthTokens;
  private authConfig: any;

  constructor(tokens: OAuthTokens, authConfig: any) {
    this.docs = new HttpClient({
      baseUrl: DOCS_BASE,
      rateLimit: { maxRequestsPerSecond: 60 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
    this.drive = new HttpClient({
      baseUrl: DRIVE_BASE,
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
      const { refreshDocsToken } = await import("./auth");
      this.tokens = await refreshDocsToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  /* ── Create ─────────────────────────────────────────────────────────── */
  /** Create an empty Google Doc (via Drive API) and return the file. */
  async createDocument(title: string, parentFolderId?: string): Promise<any> {
    await this.ensureToken();
    const metadata: any = { name: title, mimeType: GOOGLE_DOC_MIME };
    if (parentFolderId) metadata.parents = [parentFolderId];
    const r = await this.drive.post("/files?supportsAllDrives=true", metadata, this.headers);
    return r.data;
  }

  /**
   * Create a Google Doc from an existing template doc by copying it (Drive API)
   * and then replacing placeholder tokens in the copy (Docs batchUpdate).
   * Replacements map e.g. { "{{ClientName}}": "Acme" }. Idempotent for a given
   * (templateId, title) since each call produces its own copy.
   */
  async createDocumentFromTemplate(templateId: string, title: string, replacements: Record<string, string> = {}): Promise<any> {
    await this.ensureToken();
    const copy = await this.drive.post(
      `/files/${encodeURIComponent(templateId)}/copy?supportsAllDrives=true`,
      { name: title },
      this.headers,
    );
    const docId = copy.data?.id;
    if (!docId) throw new Error("Google Docs: template copy returned no file id");
    if (Object.keys(replacements).length > 0) {
      await this.replaceAllText(docId, replacements);
    }
    return copy.data;
  }

  /* ── Read ───────────────────────────────────────────────────────────── */
  /** Fetch the full document resource (metadata + body content). */
  async getDocument(docId: string): Promise<any> {
    await this.ensureToken();
    const r = await this.docs.get(`/documents/${encodeURIComponent(docId)}`, this.headers);
    return r.data;
  }

  /** Extract plain text from the document body (understand/read slice). */
  async getDocumentText(docId: string): Promise<string> {
    const doc = await this.getDocument(docId);
    return extractTextFromDocument(doc);
  }

  /* ── Update ─────────────────────────────────────────────────────────── */
  /** Run a batch of Documents.batchUpdate requests against a doc. */
  async batchUpdate(docId: string, requests: any[]): Promise<any> {
    await this.ensureToken();
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error("Google Docs: batchUpdate requires a non-empty requests array");
    }
    const r = await this.docs.post(
      `/documents/${encodeURIComponent(docId)}:batchUpdate`,
      { requests },
      this.headers,
    );
    return r.data;
  }

  /** Insert plain text at a given 1-based index (default: end of body). */
  async insertText(docId: string, text: string, index?: number): Promise<any> {
    const resolvedIndex = index ?? await this.bodyEndIndex(docId);
    return this.batchUpdate(docId, [
      {
        insertText: {
          location: { index: resolvedIndex },
          text,
        },
      },
    ]);
  }

  /** Replace every occurrence of a placeholder token (e.g. {{Name}}) with a value. */
  async replaceAllText(docId: string, replacements: Record<string, string>): Promise<any> {
    const requests = Object.entries(replacements).map(([find, replace]) => ({
      replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replace },
    }));
    return this.batchUpdate(docId, requests);
  }

  /** Build the end-of-body index so insertText can append at the end. */
  private async bodyEndIndex(docId: string): Promise<number> {
    const doc = await this.getDocument(docId);
    return bodyEndIndexFromDocument(doc);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.drive.get("/about?fields=user", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

/** Extract the plain text of a Google Doc from a Documents.get response. */
export function extractTextFromDocument(doc: any): string {
  const body = doc?.body?.content;
  if (!Array.isArray(body)) return "";
  let out = "";
  for (const el of body) {
    const para = el.paragraph;
    if (!para) continue;
    for (const item of para.elements ?? []) {
      if (typeof item.textRun?.content === "string") out += item.textRun.content;
    }
    out += "\n";
  }
  return out;
}

/** Compute the end-of-body insertion index from a Documents.get response. */
export function bodyEndIndexFromDocument(doc: any): number {
  const body = doc?.body?.content;
  if (!Array.isArray(body) || body.length === 0) return 1;
  let max = 1;
  for (const el of body) {
    const end = el.endIndex;
    if (typeof end === "number" && end > max) max = end;
  }
  return Math.max(max - 1, 1);
}

export function createGDocsClient(config: ConnectionConfig): GoogleDocsClient {
  return new GoogleDocsClient(
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
