import { join } from "path";
import { readJSON, writeJSON, resolveDataDir } from "./data-store";
import { workspaceForProvider, type Workspace } from "./workspace-routing";
/**
 * client-files.ts — the client portal File Library registry.
 *
 * WHY (owner directive 2026-08-12): AI employees create Google productivity
 * files (Docs/Sheets/Slides/Drive) and Microsoft Office files
 * (Word/Excel/PowerPoint in OneDrive), and those files must be "ready within
 * clients portals ready for clients to view, edit or print/download".
 *
 * This module is the SINGLE registry for those files. The durable store key
 * is `client_files.json` — provider modules (google-*, microsoft-*, onedrive)
 * MUST register created files here via `registerClientFile` so the portal can
 * surface them. The key and shape below are the coordination contract between
 * the provider work (PRs #128/#129) and the portal File Library (this PR).
 *
 * Shape: { [tenantEmail]: ClientFile[] } — tenant-scoped; a client only ever
 * sees their own files (permission gating is enforced at read time by
 * `listClientFiles`/`getClientFile`, which are keyed by tenant).
 */
export const CLIENT_FILES_KEY = "client_files.json";

export type ClientFileKind =
  | "doc"      // Google Doc
  | "sheet"    // Google Sheet
  | "slides"   // Google Slides
  | "word"     // Microsoft Word (.docx)
  | "excel"    // Microsoft Excel (.xlsx)
  | "ppt"      // Microsoft PowerPoint (.pptx)
  | "file";    // generic file (Drive upload, OneDrive file)

export interface ClientFile {
  /** Stable registry id (generated at registration; used by portal routes). */
  id: string;
  /** Provider module id, e.g. "google-docs", "google-sheets", "microsoft-word", "onedrive". */
  provider: string;
  /** Workspace family ('google' | 'microsoft') — computed from provider at registration. */
  workspace?: Workspace;
  /** Id of the file inside the provider (Drive fileId / Graph item id / etc). */
  providerFileId: string;
  /** Human-friendly file name. */
  name: string;
  kind: ClientFileKind;
  /** Provider web URL for this file (open/edit in provider). */
  url?: string;
  /** Native provider URL alias (same as url — explicit for unified delivery). */
  nativeUrl?: string;
  /** Who created this file ('employee' | 'chat' | 'portal' | 'verification' | ...). */
  createdConnector?: string;
  /** iframe embed URL (View/Print in portal). */
  embedUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export type ClientFilesIndex = Record<string, ClientFile[]>;

function defaultDataDir(): string {
  return resolveDataDir(
    process.env.DATA_DIR,
    typeof import.meta?.dir !== "undefined" ? import.meta.dir : process.cwd(),
  );
}

export function clientFilesPath(dataDir?: string): string {
  return join(dataDir ?? defaultDataDir(), CLIENT_FILES_KEY);
}

function readIndex(dataDir?: string): ClientFilesIndex {
  const raw = readJSON(clientFilesPath(dataDir));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as ClientFilesIndex;
  return {};
}

function writeIndex(index: ClientFilesIndex, dataDir?: string): void {
  writeJSON(clientFilesPath(dataDir), index);
}

/**
 * Normalize a stored record at read time: legacy entries (registered before
 * the workspace/nativeUrl fields existed) get their workspace derived from
 * the provider module id so the portal always shows a badge.
 */
function normalizeClientFile(file: ClientFile): ClientFile {
  if (file.workspace) return file;
  const workspace = workspaceForProvider(file.provider) || undefined;
  if (!workspace) return file;
  return { ...file, workspace };
}

/** All files visible to a tenant (their own only — never another tenant's). */
export function listClientFiles(tenantId: string, dataDir?: string): ClientFile[] {
  if (!tenantId) return [];
  return (readIndex(dataDir)[tenantId] || []).map(normalizeClientFile);
}

/** One file, only if the tenant owns it (permission gating at read time). */
export function getClientFile(tenantId: string, fileId: string, dataDir?: string): ClientFile | undefined {
  if (!tenantId || !fileId) return undefined;
  const found = listClientFiles(tenantId, dataDir).find((f) => f.id === fileId);
  return found ? normalizeClientFile(found) : undefined;
}

function genId(provider: string, providerFileId: string): string {
  return `cf-${provider}-${providerFileId}`;
}

/**
 * Register (upsert) a created file for a tenant. Provider modules call this
 * after a successful create so the portal can list/view/edit/print/download
 * the file. Upserting by providerFileId keeps retries idempotent.
 */
export function registerClientFile(
  tenantId: string,
  file: Omit<ClientFile, "id" | "createdAt" | "updatedAt"> & { id?: string },
  dataDir?: string,
): ClientFile {
  if (!tenantId?.trim()) throw new Error("registerClientFile requires a tenant id");
  if (!file.provider?.trim() || !file.providerFileId?.trim() || !file.name?.trim()) {
    throw new Error("registerClientFile requires provider, providerFileId and name");
  }
  const index = readIndex(dataDir);
  const list = index[tenantId] || [];
  const id = file.id || genId(file.provider, file.providerFileId);
  const now = Date.now();
  const entry: ClientFile = {
    id,
    provider: file.provider,
    // Workspace family derived from the provider module id (never guessed).
    workspace: file.workspace || workspaceForProvider(file.provider) || undefined,
    providerFileId: file.providerFileId,
    name: file.name,
    kind: file.kind,
    url: file.url,
    // Unified delivery: nativeUrl mirrors the provider's native open URL.
    nativeUrl: file.nativeUrl || file.url || undefined,
    createdConnector: file.createdConnector || undefined,
    embedUrl: file.embedUrl,
    createdAt: now,
    updatedAt: now,
  };
  const existingIdx = list.findIndex((f) => f.id === id || f.providerFileId === entry.providerFileId);
  if (existingIdx >= 0) {
    entry.createdAt = list[existingIdx].createdAt || now;
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }
  index[tenantId] = list;
  writeIndex(index, dataDir);
  return entry;
}

/** Remove a file from a tenant's library (true when it existed). */
export function removeClientFile(tenantId: string, fileId: string, dataDir?: string): boolean {
  if (!tenantId || !fileId) return false;
  const index = readIndex(dataDir);
  const list = index[tenantId] || [];
  const next = list.filter((f) => f.id !== fileId);
  if (next.length === list.length) return false;
  index[tenantId] = next;
  writeIndex(index, dataDir);
  return true;
}

// ── URL builders (embed / edit / print) ──────────────────────────────────────
// Canonical embed/edit URL patterns (never guessed; documented provider URLs).
const GOOGLE_PREVIEW: Record<string, (id: string) => string> = {
  "google-docs": (id) => `https://docs.google.com/document/d/${encodeURIComponent(id)}/preview`,
  "google-sheets": (id) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/preview`,
  "google-slides": (id) => `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/preview`,
  "google-drive": (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`,
};
const GOOGLE_EDIT: Record<string, (id: string) => string> = {
  "google-docs": (id) => `https://docs.google.com/document/d/${encodeURIComponent(id)}/edit`,
  "google-sheets": (id) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`,
  "google-slides": (id) => `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/edit`,
  "google-drive": (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`,
};

/** Embed URL for a file (View/Print). Null when the provider has no embed path. */
export function buildEmbedUrl(file: Pick<ClientFile, "provider" | "providerFileId" | "url">): string | null {
  const google = GOOGLE_PREVIEW[file.provider];
  if (google) return google(file.providerFileId);
  // Microsoft/OneDrive-hosted Office files embed via Office Web Apps using
  // the file's webUrl (no auth token in the iframe).
  if (
    (file.provider === "onedrive" || file.provider === "microsoft-word" ||
      file.provider === "microsoft-excel" || file.provider === "microsoft-powerpoint") &&
    file.url
  ) {
    return `https://officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.url)}`;
  }
  return null;
}

/** Edit URL (open in the provider's native editor). Falls back to the stored url. */
export function buildEditUrl(file: Pick<ClientFile, "provider" | "providerFileId" | "url">): string | null {
  const google = GOOGLE_EDIT[file.provider];
  if (google) return google(file.providerFileId);
  return file.url || null;
}

/** Print URL — same as embed; the portal renders it in a print-friendly view. */
export function buildPrintUrl(file: Pick<ClientFile, "provider" | "providerFileId" | "url">): string | null {
  return buildEmbedUrl(file);
}

/** Provider → kind default for a file (used by executors when creating). */
export function kindForProvider(provider: string): ClientFileKind {
  switch (provider) {
    case "google-docs": return "doc";
    case "google-sheets": return "sheet";
    case "google-slides": return "slides";
    case "microsoft-word": return "word";
    case "microsoft-excel": return "excel";
    case "microsoft-powerpoint": return "ppt";
    default: return "file";
  }
}
