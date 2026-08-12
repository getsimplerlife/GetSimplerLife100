import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

/**
 * OneDrive client — Microsoft Graph API.
 *
 * Canonical hosts (never guessed):
 *   - Graph: https://graph.microsoft.com/v1.0
 *
 * Base URL is /me/drive (the signed-in user's drive). All methods fail closed:
 * missing ids/names throw before any network call; unknown paths are never
 * guessed.
 */
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class OneDriveClient {
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
      const { refreshODToken } = await import("./auth");
      this.tokens = await refreshODToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  /** PUT raw content to a OneDrive path (binary-safe; HttpClient JSON-stringifies bodies). */
  private async putContent(path: string, content: Uint8Array | string, mimeType: string): Promise<any> {
    await this.ensureToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${GRAPH_BASE}${path}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": mimeType },
        body: content,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Microsoft Graph: PUT content failed HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ── Read ───────────────────────────────────────────────────────────── */
  async listRootItems(): Promise<any[]> {
    await this.ensureToken();
    const r = await this.client.get("/me/drive/root/children", this.headers);
    return r.data?.value || [];
  }

  async listItems(folderId: string): Promise<any[]> {
    await this.ensureToken();
    if (!folderId) throw new Error("OneDrive: listItems requires a folderId");
    const r = await this.client.get(`/me/drive/items/${encodeURIComponent(folderId)}/children`, this.headers);
    return r.data?.value || [];
  }

  async getItem(id: string): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("OneDrive: getItem requires an id");
    const r = await this.client.get(`/me/drive/items/${encodeURIComponent(id)}`, this.headers);
    return r.data;
  }

  async getItemByPath(path: string): Promise<any> {
    await this.ensureToken();
    if (!path) throw new Error("OneDrive: getItemByPath requires a path");
    const r = await this.client.get(`/me/drive/root:/${encodeURI(path)}`, this.headers);
    return r.data;
  }

  /** Download a file's raw content bytes (binary-safe). */
  async getFileContent(id: string): Promise<Uint8Array> {
    await this.ensureToken();
    if (!id) throw new Error("OneDrive: getFileContent requires an id");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${GRAPH_BASE}/me/drive/items/${encodeURIComponent(id)}/content`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.tokens.accessToken}` },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Microsoft Graph: content download failed HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ── Write ──────────────────────────────────────────────────────────── */
  async createFolder(name: string, parentId?: string): Promise<any> {
    await this.ensureToken();
    if (!name) throw new Error("OneDrive: createFolder requires a name");
    const p = parentId ? `/me/drive/items/${encodeURIComponent(parentId)}/children` : "/me/drive/root/children";
    const r = await this.client.post(p, { name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }, this.headers);
    return r.data;
  }

  /** Upload a file (any bytes) to a path under the drive root. */
  async uploadFile(path: string, content: Uint8Array | string, mimeType = "application/octet-stream"): Promise<any> {
    await this.ensureToken();
    if (!path) throw new Error("OneDrive: uploadFile requires a path");
    return this.putContent(`/me/drive/root:/${encodeURI(path)}:/content`, content, mimeType);
  }

  /** Copy a file to the drive root (or a folder) with a new name. */
  async copyFile(id: string, newName?: string, parentId?: string): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("OneDrive: copyFile requires an id");
    const body: Record<string, unknown> = {};
    if (newName) body.name = newName;
    if (parentId) body.parentReference = { id: parentId };
    const r = await this.client.post(`/me/drive/items/${encodeURIComponent(id)}/copy`, body, this.headers);
    // Graph returns 202 Accepted with a Location header for the async job.
    return { accepted: true, statusLocation: r.headers?.location || null };
  }

  /** Move a file into a folder (optionally renaming). */
  async moveFile(id: string, parentId: string, newName?: string): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("OneDrive: moveFile requires an id");
    if (!parentId) throw new Error("OneDrive: moveFile requires a parentId");
    const body: Record<string, unknown> = { parentReference: { id: parentId } };
    if (newName) body.name = newName;
    const r = await this.client.patch(`/me/drive/items/${encodeURIComponent(id)}`, body, this.headers);
    return r.data;
  }

  /** Delete a file/folder. Idempotent: a 404 is treated as already-deleted. */
  async deleteFile(id: string): Promise<{ deleted: boolean }> {
    await this.ensureToken();
    if (!id) throw new Error("OneDrive: deleteFile requires an id");
    const r = await this.client.delete(`/me/drive/items/${encodeURIComponent(id)}`, this.headers);
    if (r.status === 404) return { deleted: true };
    if (r.status !== 204 && r.status !== 200) throw new Error(`OneDrive: deleteFile failed HTTP ${r.status}`);
    return { deleted: true };
  }

  /* ── Monitor ────────────────────────────────────────────────────────── */
  /** Poll OneDrive delta for changes since a cursor/token (monitor slice). */
  async listChangesSince(deltaToken?: string): Promise<any[]> {
    await this.ensureToken();
    const url = deltaToken ? `/me/drive/root/delta(token='${encodeURIComponent(deltaToken)}')` : "/me/drive/root/delta";
    const r = await this.client.get(url, this.headers);
    const value = (r.data?.value as any[]) || [];
    return value.map((v) => ({ ...v, deltaToken: r.data?.["@odata.deltaLink"] || null }));
  }

  /* ── Search / share ─────────────────────────────────────────────────── */
  async searchFiles(query: string): Promise<any[]> {
    await this.ensureToken();
    if (!query) throw new Error("OneDrive: searchFiles requires a query");
    const r = await this.client.get(`/me/drive/root/search(q='${encodeURIComponent(query)}')`, this.headers);
    return r.data?.value || [];
  }

  async createShareLink(id: string, type = "view"): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("OneDrive: createShareLink requires an id");
    const r = await this.client.post(`/me/drive/items/${encodeURIComponent(id)}/createLink`, { type }, this.headers);
    return r.data;
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

export function createODClient(config: ConnectionConfig): OneDriveClient {
  return new OneDriveClient(
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
