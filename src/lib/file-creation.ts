/**
 * file-creation.ts — cross-workspace data-file creation for tenants.
 *
 * Owner directive 2026-08-13: "offer customers the option of making data
 * files within both Google apps and Microsoft apps based on what is being
 * done within all integrations/connections."
 *
 * `createDataFile` is the single entry point AI employees / chat / the
 * portal use to create a data file. It:
 *   1. reads the tenant's workspace preference (tenant_settings.json,
 *      default 'auto'),
 *   2. reads the tenant's connected integrations (tenant_integrations.json),
 *   3. resolves the target provider with `resolveWorkspaceProvider`
 *      (fail-closed — never a guessed provider),
 *   4. creates the file with the provider's own audited client (Google or
 *      Microsoft) using the tenant's per-tenant OAuth token,
 *   5. registers the artifact in the portal File Library registry
 *      (client_files.json) with workspace + nativeUrl + createdConnector,
 *   6. audits the creation.
 *
 * NON-DESTRUCTION: creation only. This module never deletes or modifies
 * existing provider files.
 *
 * Tenancy: every credential read uses the per-tenant key
 * `${tenantId}:${provider}` (owner mandate — no bare-provider fallback for
 * tenant tokens, exactly like portal-file-download.ts).
 */
import { join } from "path";
import { readJSON, writeJSON } from "./data-store";
import { getWorkspacePreference } from "./tenant-settings";
import {
  resolveWorkspaceProvider,
  workspaceForProvider,
  FILE_TYPE_TO_KIND,
  providerLabel,
  WORKSPACE_LABELS,
  fileTypeLabel,
  type FileType,
  type Workspace,
} from "./workspace-routing";
import { registerClientFile, buildEmbedUrl, listClientFiles, type ClientFile, type ClientFileKind } from "./client-files";
import { refreshProviderToken } from "./portal-file-download";
import { isTokenExpired, type OAuthTokens } from "../integrations/framework/oauth";

export const FILE_TYPES: readonly FileType[] = ["doc", "spreadsheet", "slides", "file"];

export interface CreateFileRequest {
  tenantId: string;
  fileType: FileType;
  title: string;
  /** Type-dependent payload (doc: paragraphs string[]; spreadsheet: rows; slides: slides; file: bytes). */
  content?: string | string[] | unknown[][] | Uint8Array;
  /** Optional explicit provider request (e.g. "google-sheets"). */
  requestedProvider?: string;
  /** Creator label stamped on the registered file. */
  connector?: string;
  dataDir: string;
  fetchImpl?: typeof fetch;
}

export type CreateFileOutcome =
  | {
      ok: true;
      workspace: Workspace;
      provider: string;
      file: ClientFile;
      message: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      connectHint?: string[];
    };

/** Registry kind per (provider, fileType) — mirrors provider capabilities. */
export function kindForCreate(provider: string, fileType: FileType): ClientFileKind {
  switch (provider) {
    case "microsoft-word": return "word";
    case "microsoft-excel": return "excel";
    case "microsoft-powerpoint": return "ppt";
    default: return (FILE_TYPE_TO_KIND[fileType] as ClientFileKind) || "file";
  }
}

/** OAuth app credentials for a provider (clientId/clientSecret/redirectUri). */
function authConfigForProvider(
  provider: string,
  tokenData: Record<string, any>,
): { clientId: string; clientSecret: string; redirectUri: string } {
  const envKey = `OAUTH_${provider.replace(/-/g, "_").toUpperCase()}`;
  const credEntry = tokenData[provider] || {};
  return {
    clientId: credEntry.clientId || process.env[`${envKey}_CLIENT_ID`] || "",
    clientSecret: credEntry.clientSecret || process.env[`${envKey}_CLIENT_SECRET`] || "",
    redirectUri: "http://localhost:3000/api/oauth/callback",
  };
}

interface RegistryInfo {
  providerFileId: string;
  name: string;
  url?: string;
}

/** Normalize a provider create response into registry info (fail closed). */
export function normalizeCreatedFile(
  provider: string,
  fileType: FileType,
  result: any,
  fallbackName: string,
): RegistryInfo {
  const r = result ?? {};
  if (provider === "google-sheets") {
    if (!r.spreadsheetId) throw new Error("Google Sheets create returned no spreadsheetId");
    return { providerFileId: r.spreadsheetId, name: r.properties?.title || fallbackName, url: r.spreadsheetUrl };
  }
  if (provider === "google-slides") {
    if (!r.presentationId) throw new Error("Google Slides create returned no presentationId");
    return { providerFileId: r.presentationId, name: r.title || fallbackName, url: r.presentationUrl };
  }
  // google-docs / google-drive / microsoft-* / onedrive all return {id,...}.
  if (!r.id) throw new Error(`${provider} create returned no id`);
  return {
    providerFileId: r.id,
    name: r.name || fallbackName,
    url: r.webUrl || r.webViewLink || r.alternateLink,
  };
}

/**
 * Thin dispatch: create a file with the provider's audited client.
 * Exported so tests can inject a fake via `createDataFile` deps.
 */
export async function createProviderFile(
  provider: string,
  tokens: OAuthTokens,
  authConfig: { clientId: string; clientSecret: string; redirectUri: string },
  input: { fileType: FileType; title: string; content?: CreateFileRequest["content"] },
): Promise<RegistryInfo> {
  const { fileType, title } = input;
  const content = input.content;
  switch (provider) {
    case "google-sheets": {
      const { createGSheetsClient } = await import("../integrations/providers/google-sheets/client");
      const r = await createGSheetsClient(tokens as any, authConfig).createSpreadsheet(title);
      return normalizeCreatedFile(provider, fileType, r, title);
    }
    case "google-docs": {
      const { createGDocsClient } = await import("../integrations/providers/google-docs/client");
      const r = await createGDocsClient(tokens as any, authConfig).createDocument(title);
      return normalizeCreatedFile(provider, fileType, r, title);
    }
    case "google-slides": {
      const { createGSlidesClient } = await import("../integrations/providers/google-slides/client");
      const r = await createGSlidesClient(tokens as any, authConfig).createPresentation(title);
      return normalizeCreatedFile(provider, fileType, r, title);
    }
    case "google-drive": {
      const { createGDriveClient } = await import("../integrations/providers/google-drive/client");
      const bytes = typeof content === "string" ? content : content instanceof Uint8Array ? content : String(content ?? "");
      const r = await createGDriveClient(tokens as any, authConfig).uploadFile(title, bytes);
      return normalizeCreatedFile(provider, fileType, r, title);
    }
    case "microsoft-word": {
      const { createWordClient } = await import("../integrations/providers/microsoft-word/client");
      const paragraphs = Array.isArray(content) ? (content as string[]) : [title];
      const r = await createWordClient(tokens as any, authConfig).createWordDocument(title, paragraphs);
      return normalizeCreatedFile(provider, fileType, r, title);
    }
    case "microsoft-excel": {
      const { createExcelClient } = await import("../integrations/providers/microsoft-excel/client");
      const rows = Array.isArray(content) ? (content as unknown[][]) : [[]];
      const r = await createExcelClient(tokens as any, authConfig).createExcelWorkbook(title, rows);
      return normalizeCreatedFile(provider, fileType, r, title);
    }
    case "microsoft-powerpoint": {
      const { createPowerPointClient } = await import("../integrations/providers/microsoft-powerpoint/client");
      const slides = Array.isArray(content)
        ? (content as Array<{ title: string; body?: string }>)
        : [{ title }];
      const r = await createPowerPointClient(tokens as any, authConfig).createPresentation(title, slides);
      return normalizeCreatedFile(provider, fileType, r, title);
    }
    case "onedrive": {
      const { createODClient } = await import("../integrations/providers/onedrive/client");
      const bytes = typeof content === "string" ? content : content instanceof Uint8Array ? content : String(content ?? "");
      const r = await createODClient(tokens as any, authConfig).uploadFile(`/${title}`, bytes);
      return normalizeCreatedFile(provider, fileType, r, title);
    }
    default:
      throw new Error(`No audited create path for provider ${provider} (fail closed)`);
  }
}

/** Best-effort audit of a file creation (never fails the create). */
function auditFileCreation(tenantId: string, file: ClientFile, dataDir: string): void {
  try {
    const auditPath = join(dataDir, "tenant_audit_logs.json");
    const all = readJSON(auditPath);
    const list = Array.isArray(all) ? all : all[tenantId] || [];
    const entry = {
      id: "log-" + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      user: tenantId,
      action: "portal.files.create",
      resource: file.id,
      detail: `Created ${file.name} (${file.provider}, ${file.workspace || "?"})`,
      ip: "127.0.0.1",
    };
    const next = Array.isArray(all) ? [...all, entry] : { ...all, [tenantId]: [...list, entry] };
    writeJSON(auditPath, next);
  } catch { /* audit is best-effort */ }
}

/** Connected provider ids for a tenant (status "Connected"), file providers only. */
export function connectedFileProviders(tenantId: string, dataDir: string): string[] {
  const all = readJSON(join(dataDir, "tenant_integrations.json"));
  const conns = (all || {})[tenantId] || [];
  const ids: string[] = [];
  for (const c of conns) {
    if (c && typeof c.providerId === "string" && (c.status === "Connected" || c.status === "connected")) {
      ids.push(c.providerId);
    }
  }
  return ids;
}

/**
 * Create a data file for a tenant, routed to the tenant's preferred
 * connected workspace. Fail-closed: any resolution/credential failure
 * returns an explicit error outcome — nothing is ever created in an
 * unconnected workspace or with a guessed provider.
 */
export async function createDataFile(
  req: CreateFileRequest,
  deps?: { createProviderFile?: typeof createProviderFile },
): Promise<CreateFileOutcome> {
  const { tenantId, dataDir } = req;
  const fetchImpl = req.fetchImpl || fetch;
  const createImpl = deps?.createProviderFile || createProviderFile;

  if (!tenantId?.trim()) return { ok: false, status: 400, error: "Tenant scope is required" };
  if (!FILE_TYPES.includes(req.fileType)) {
    return { ok: false, status: 400, error: `Invalid fileType "${String(req.fileType)}" — expected ${FILE_TYPES.join(", ")}` };
  }
  if (!req.title?.trim()) return { ok: false, status: 400, error: "A title is required to create a file" };

  // 1. Resolve the target provider (preference + connections + type).
  const preference = getWorkspacePreference(tenantId, dataDir);
  const connected = connectedFileProviders(tenantId, dataDir);
  const fileCounts: Partial<Record<string, number>> = {};
  for (const f of listClientFiles(tenantId, dataDir)) {
    fileCounts[f.provider] = (fileCounts[f.provider] || 0) + 1;
  }
  const resolved = resolveWorkspaceProvider({
    fileType: req.fileType,
    requestedProvider: req.requestedProvider,
    preference,
    connectedProviderIds: connected,
    fileCounts,
  });
  if (!resolved.ok) {
    // 409 = the tenant could create this file if they connect the right
    // workspace; the message tells them exactly what to connect.
    return { ok: false, status: 409, error: resolved.error, connectHint: resolved.connectHint };
  }
  const provider = resolved.provider;
  const workspace = workspaceForProvider(provider) as Workspace;

  // 2. Tenant OAuth token — per-tenant key ONLY (owner mandate).
  const tokenFile = join(dataDir, "tenant_oauth_credentials.json");
  const tokenData = readJSON(tokenFile) || {};
  const tokenKey = `${tenantId}:${provider}`;
  let entry = tokenData[tokenKey];
  if (!entry?.accessToken) {
    return {
      ok: false,
      status: 409,
      error: `No stored connection for ${providerLabel(provider)} — connect it first to create files there.`,
      connectHint: [provider],
    };
  }
  // 3. Refresh when expired (provider module's audited refresh fn).
  if (isTokenExpired(entry)) {
    try {
      const refreshed = await refreshProviderToken(provider, entry, dataDir, fetchImpl);
      const all = readJSON(tokenFile) || {};
      all[tokenKey] = refreshed;
      writeJSON(tokenFile, all);
      entry = refreshed;
    } catch (e: any) {
      return { ok: false, status: 502, error: `Token refresh failed: ${e?.message || String(e)}` };
    }
  }
  const tokens: OAuthTokens = entry;
  const authConfig = authConfigForProvider(provider, tokenData);

  // 4. Create the file with the provider's audited client.
  let info: RegistryInfo;
  try {
    info = await createImpl(provider, tokens, authConfig, {
      fileType: req.fileType,
      title: req.title.trim(),
      content: req.content,
    });
  } catch (e: any) {
    return { ok: false, status: 500, error: `${providerLabel(provider)} create failed: ${e?.message || String(e)}` };
  }

  // 5. Register in the portal File Library (workspace + nativeUrl + connector).
  const kind = kindForCreate(provider, req.fileType);
  const registered = registerClientFile(
    tenantId,
    {
      provider,
      providerFileId: info.providerFileId,
      name: info.name,
      kind,
      url: info.url,
      workspace,
      nativeUrl: info.url,
      createdConnector: req.connector || "chat",
    },
    dataDir,
  );
  // Embed URL is derivable from provider + id (best-effort, no network).
  try {
    const embed = buildEmbedUrl(registered);
    if (embed && embed !== registered.embedUrl) {
      registerClientFile(tenantId, { ...registered, embedUrl: embed }, dataDir);
    }
  } catch { /* embed is best-effort */ }

  // 6. Audit.
  auditFileCreation(tenantId, registered, dataDir);

  return {
    ok: true,
    workspace,
    provider,
    file: registered,
    message: `Created "${registered.name}" in ${providerLabel(provider)} (${WORKSPACE_LABELS[workspace]}) — ${fileTypeLabel(req.fileType)} ready in your File Library.`,
  };
}
