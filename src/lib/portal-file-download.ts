import { join } from "path";
import { readJSON, writeJSON } from "./data-store";
import { CLIENT_FILES_KEY, getClientFile, type ClientFile } from "./client-files";
import { isTokenExpired } from "../integrations/framework/oauth";
/**
 * portal-file-download.ts — server-side download proxy for the portal File
 * Library. Fetches file content from the owning provider using the tenant's
 * stored OAuth token (durable store), refreshing the token when expired via
 * the provider module's OWN audited refresh function (never a guessed URL),
 * and streams the bytes back so the client gets Content-Disposition: attachment.
 *
 * Fail-closed rules:
 *  - Missing/foreign fileId  → 404 (permission gating: only the owning tenant).
 *  - Missing tenant token    → 401 (auth required).
 *  - Unknown provider        → 400 (no guessed provider URL).
 *  - Provider refresh/fetch  → 502 with a clear error, never a crash.
 *
 * All provider URLs come from the audited provider modules in
 * src/integrations/providers/<id>/ — the download source map below mirrors the
 * canonical hosts those modules use.
 */

export type DownloadSource = {
  url: string;
  /** Default download file name when the provider gives no content-disposition. */
  fallbackName: string;
};

const GOOGLE_EXPORT_MIME: Record<string, string> = {
  doc: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  sheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  slides: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * Resolve the provider download URL for a registry file. Returns null for
 * providers without an audited download path (fail closed).
 * Canonical hosts (audited in provider modules):
 *  - Google Drive API:  https://www.googleapis.com/drive/v3
 *  - Microsoft Graph:   https://graph.microsoft.com/v1.0
 */
export function resolveDownloadSource(file: ClientFile): DownloadSource | null {
  const id = encodeURIComponent(file.providerFileId);
  if (file.provider.startsWith("google-")) {
    const exportMime = GOOGLE_EXPORT_MIME[file.kind];
    if (exportMime) {
      return {
        url: `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exportMime)}&supportsAllDrives=true`,
        fallbackName: `${file.name || "file"}.${file.kind === "doc" ? "docx" : file.kind === "sheet" ? "xlsx" : "pptx"}`,
      };
    }
    return {
      url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
      fallbackName: file.name || "file",
    };
  }
  if (
    file.provider === "onedrive" || file.provider === "microsoft-word" ||
    file.provider === "microsoft-excel" || file.provider === "microsoft-powerpoint"
  ) {
    return {
      url: `https://graph.microsoft.com/v1.0/me/drive/items/${id}/content`,
      fallbackName: file.name || "file",
    };
  }
  return null;
}

/** Refresh function name per provider module (audited in provider auth.ts). */
const PROVIDER_REFRESH_FN: Record<string, string> = {
  "google-drive": "refreshGDriveToken",
  "google-docs": "refreshDocsToken",
  "google-sheets": "refreshSheetsToken",
  "google-slides": "refreshSlidesToken",
  "onedrive": "refreshODToken",
  "microsoft-word": "refreshWordToken",
  "microsoft-excel": "refreshExcelToken",
  "microsoft-powerpoint": "refreshPowerPointToken",
};

/**
 * Refresh a stored tenant token entry for a provider using the provider
 * module's own audited refresh function. Returns the NEW entry (caller writes
 * it back through the durable path). Fails closed when the provider module
 * has no audited refresh fn.
 */
export async function refreshProviderToken(
  provider: string,
  entry: any,
  dataDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  const fnName = PROVIDER_REFRESH_FN[provider];
  if (!fnName || !entry?.refreshToken) {
    throw new Error(`No audited token refresh path for provider ${provider}`);
  }
  const modulePath = `../integrations/providers/${provider}/auth`;
  const authMod = await import(modulePath);
  const refreshFn = authMod[fnName];
  if (typeof refreshFn !== "function") {
    throw new Error(`Provider ${provider} auth module has no ${fnName} (fail closed)`);
  }
  const oauthCredsFile = join(dataDir, "tenant_oauth_credentials.json");
  const tokenData = readJSON(oauthCredsFile) || {};
  const credEntry = tokenData[provider] || {};
  const clientId = credEntry.clientId || process.env[`OAUTH_${provider.replace(/-/g, "_").toUpperCase()}_CLIENT_ID`] || "";
  const clientSecret = credEntry.clientSecret || process.env[`OAUTH_${provider.replace(/-/g, "_").toUpperCase()}_CLIENT_SECRET`] || "";
  if (!clientId || !clientSecret) {
    throw new Error(`OAuth client credentials missing for ${provider} (cannot refresh)`);
  }
  const tokens = await refreshFn(
    { clientId, clientSecret, redirectUri: "http://localhost:3000/api/oauth/callback" },
    entry.refreshToken,
    fetchImpl,
  );
  return {
    ...entry,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || entry.refreshToken,
    expiresAt: tokens.expiresAt ?? entry.expiresAt,
    tokenType: tokens.tokenType || entry.tokenType,
    scope: tokens.scope || entry.scope,
    updatedAt: new Date().toISOString(),
  };
}

export interface DownloadOutcome {
  status: number;
  headers: Record<string, string>;
  body?: BodyInit | null;
  error?: string;
}

/** Shared fetch for download streaming — returns text for error surfacing. */
async function fetchForDownload(
  url: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number; contentType: string; body: BodyInit | null; disposition?: string | null; text?: string }> {
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const contentType = res.headers?.get?.("content-type") || "application/octet-stream";
  const disposition = res.headers?.get?.("content-disposition");
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, contentType, body: null, text: text.slice(0, 300) };
  }
  return { ok: true, status: res.status, contentType, body: res.body, disposition };
}

/**
 * Execute a portal file download for a tenant. Pure of HTTP routing — returns
 * status/headers/body so prod-server can wrap it in a Response and tests can
 * assert without a live server.
 */
export async function handlePortalFileDownload(args: {
  tenantId: string;
  fileId: string;
  dataDir: string;
  fetchImpl?: typeof fetch;
}): Promise<DownloadOutcome> {
  const { tenantId, fileId, dataDir } = args;
  const fetchImpl = args.fetchImpl || fetch;
  // 1. Tenant-scoped registry lookup (permission gating).
  const file = getClientFile(tenantId, fileId, dataDir);
  if (!file) {
    return { status: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "File not found" }) };
  }
  // 2. Resolve the provider download source (fail closed for unknown providers).
  const source = resolveDownloadSource(file);
  if (!source) {
    return { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: `Download not supported for provider ${file.provider}` }) };
  }
  // 3. Tenant OAuth token from the durable store.
  const tokenFile = join(dataDir, "tenant_oauth_credentials.json");
  const tokenData = readJSON(tokenFile) || {};
  const tokenKey = `${tenantId}:${file.provider}`;
  let entry = tokenData[tokenKey] || tokenData[file.provider];
  if (!entry?.accessToken) {
    return { status: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: `No stored connection for ${file.provider} — connect it first` }) };
  }
  // 4. Refresh when expired (provider module's own audited refresh fn).
  if (isTokenExpired(entry)) {
    try {
      const refreshed = await refreshProviderToken(file.provider, entry, dataDir, fetchImpl);
      // Write back through the durable path (writeJSON → durable store).
      const all = readJSON(tokenFile) || {};
      all[tokenKey] = refreshed;
      if (tokenData[file.provider]) all[file.provider] = refreshed;
      writeJSON(tokenFile, all);
      entry = refreshed;
    } catch (e: any) {
      return { status: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: `Token refresh failed: ${e?.message || String(e)}` }) };
    }
  }
  // 5. Stream the provider content.
  try {
    const got = await fetchForDownload(source.url, entry.accessToken, fetchImpl);
    if (!got.ok) {
      return { status: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: `Provider download failed (${got.status}): ${got.text || "unknown error"}` }) };
    }
    const safeName = source.fallbackName.replace(/[^\w.\- ]/g, "_");
    return {
      status: 200,
      headers: {
        "Content-Type": got.contentType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": "",
        "Cache-Control": "no-store",
      },
      body: got.body,
    };
  } catch (e: any) {
    return { status: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: `Provider download failed: ${e?.message || String(e)}` }) };
  }
}

export { CLIENT_FILES_KEY };
