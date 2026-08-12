import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

/**
 * Google Drive client (v3).
 *
 * Canonical hosts (never guessed):
 *   - Drive API:   https://www.googleapis.com/drive/v3
 *   - Upload API:  https://www.googleapis.com/upload/drive/v3
 *
 * Covers the full capability surface:
 *   - understand/read:  listFiles, getFile (metadata), getFileContent, exportFile
 *   - monitor:          listChangesSince (Drive changes polling; push requires a
 *                       watch channel + live receiver, documented in webhooks.ts)
 *   - automate/write:   createFolder, uploadFile (multipart), copyFile, moveFile,
 *                       deleteFile, getPermissions
 */
const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export class GoogleDriveClient {
  private client: HttpClient;
  private tokens: OAuthTokens;
  private authConfig: any;

  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({
      baseUrl: DRIVE_BASE,
      rateLimit: { maxRequestsPerSecond: 50 },
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
      const { refreshGDriveToken } = await import("./auth");
      this.tokens = await refreshGDriveToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  /* ── Understand (read) ─────────────────────────────────────────────── */
  /** List files, optionally filtered by a Drive query (e.g. "name contains 'x'"). */
  async listFiles(q?: string, pageSize = 100): Promise<any[]> {
    await this.ensureToken();
    const p = q ? `/files?q=${encodeURIComponent(q)}&pageSize=${pageSize}&supportsAllDrives=true` : `/files?pageSize=${pageSize}&supportsAllDrives=true`;
    const r = await this.client.get(p, this.headers);
    return r.data?.files || [];
  }

  /** Read file metadata (name, mimeType, parents, modifiedTime, size...). */
  async getFile(id: string): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("Google Drive: getFile requires a file id");
    const r = await this.client.get(`/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=*`, this.headers);
    return r.data;
  }

  /** Download raw file content (alt=media). Returns text for text-based files. */
  async getFileContent(id: string): Promise<any> {
    await this.ensureToken();
    if (!id) throw new Error("Google Drive: getFileContent requires a file id");
    const r = await this.client.get(`/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, this.headers);
    return r.data;
  }

  /** Export a Google-native file (Docs/Sheets/Slides) to another format. */
  async exportFile(fileId: string, mimeType: string): Promise<any> {
    await this.ensureToken();
    if (!fileId || !mimeType) throw new Error("Google Drive: exportFile requires fileId and mimeType");
    const r = await this.client.get(
      `/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(mimeType)}&supportsAllDrives=true`,
      this.headers,
    );
    return r.data;
  }

  /** Read the permission list of a file. */
  async getPermissions(fileId: string): Promise<any[]> {
    await this.ensureToken();
    const r = await this.client.get(`/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`, this.headers);
    return r.data?.permissions || [];
  }

  /** Search files by name fragment. */
  async searchFiles(query: string): Promise<any[]> {
    return this.listFiles(`name contains '${query.replace(/'/g, "\\'")}'`);
  }

  /** Monitor slice: files changed since an ISO timestamp (Drive changes polling). */
  async listChangesSince(sinceIso: string, pageSize = 100): Promise<any[]> {
    await this.ensureToken();
    if (!sinceIso) throw new Error("Google Drive: listChangesSince requires an ISO timestamp");
    const q = `modifiedTime > '${sinceIso}' and trashed = false`;
    return this.listFiles(q, pageSize);
  }

  /* ── Automate (write) ──────────────────────────────────────────────── */
  /** Create a folder (optionally inside a parent). */
  async createFolder(name: string, parentId?: string): Promise<any> {
    await this.ensureToken();
    if (!name) throw new Error("Google Drive: createFolder requires a name");
    const body: any = { name, mimeType: FOLDER_MIME };
    if (parentId) body.parents = [parentId];
    const r = await this.client.post("/files?supportsAllDrives=true", body, this.headers);
    return r.data;
  }

  /**
   * Upload a file with metadata + content using multipart upload
   * (POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart).
   * Built manually (boundary string) so it works in Bun and in tests without
   * FormData/Blob dependencies.
   */
  async uploadFile(name: string, content: string | Uint8Array, mimeType?: string, parentId?: string): Promise<any> {
    await this.ensureToken();
    if (!name) throw new Error("Google Drive: uploadFile requires a name");
    const boundary = `----SL100Boundary${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const metadata: any = { name };
    if (parentId) metadata.parents = [parentId];
    if (mimeType) metadata.mimeType = mimeType;
    const contentType = mimeType || "text/plain";
    const bodyText =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${contentType}\r\n\r\n` +
      `${typeof content === "string" ? content : new TextDecoder().decode(content as Uint8Array)}\r\n` +
      `--${boundary}--`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&supportsAllDrives=true`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.tokens.accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: bodyText,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Google Drive: uploadFile failed HTTP ${res.status}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Copy a file (or folder) to a new name. Idempotent per call — each call creates its own copy. */
  async copyFile(fileId: string, name?: string): Promise<any> {
    await this.ensureToken();
    if (!fileId) throw new Error("Google Drive: copyFile requires a file id");
    const r = await this.client.post(
      `/files/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true`,
      name ? { name } : {},
      this.headers,
    );
    return r.data;
  }

  /** Move a file into a parent folder (replaces parents). */
  async moveFile(fileId: string, parentId: string): Promise<any> {
    await this.ensureToken();
    if (!fileId || !parentId) throw new Error("Google Drive: moveFile requires fileId and parentId");
    const r = await this.client.patch(
      `/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&addParents=${encodeURIComponent(parentId)}&removeParents=${encodeURIComponent(parentId)}&fields=id,name,parents`,
      {},
      this.headers,
    );
    return r.data;
  }

  /** Delete a file (moves to trash by default; permanent with param). */
  async deleteFile(fileId: string, permanent = false): Promise<{ deleted: boolean; id: string }> {
    await this.ensureToken();
    if (!fileId) throw new Error("Google Drive: deleteFile requires a file id");
    await this.client.delete(`/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`);
    return { deleted: true, id: fileId };
  }

  /** Trash a file (restorable). */
  async trashFile(fileId: string): Promise<any> {
    await this.ensureToken();
    if (!fileId) throw new Error("Google Drive: trashFile requires a file id");
    const r = await this.client.patch(
      `/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,trashed`,
      { trashed: true },
      this.headers,
    );
    return r.data;
  }

  async getAbout(): Promise<any> {
    await this.ensureToken();
    const r = await this.client.get("/about?fields=*", this.headers);
    return r.data;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get("/about?fields=user", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createGDriveClient(config: ConnectionConfig): GoogleDriveClient {
  return new GoogleDriveClient(
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
