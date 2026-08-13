/**
 * workspace-routing.ts — cross-workspace file-creation routing (owner
 * directive 2026-08-13: "offer customers the option of making data files
 * within both Google apps and Microsoft apps based on what is being done
 * within all integrations/connections").
 *
 * When an AI employee creates a data file, we route it to the tenant's
 * chosen workspace (Google OR Microsoft) based on:
 *   (a) the tenant's workspace preference ('google' | 'microsoft' | 'auto'),
 *   (b) which workspace(s) the tenant has actually connected,
 *   (c) the file type (doc / spreadsheet / slides / file).
 *
 * FAIL-CLOSED: every resolution path that cannot pick a real, connected,
 * type-compatible provider returns `{ ok: false, error, connectHint }` —
 * never a guessed provider, never a fallback to an unconnected workspace.
 *
 * This module is PURE (no I/O) so the resolution rules are unit-testable.
 */
export type Workspace = "google" | "microsoft";
export type WorkspacePreference = Workspace | "auto";
/** Requested file kind for creation (maps 1:1 to a provider create path). */
export type FileType = "doc" | "spreadsheet" | "slides" | "file";

/** The eight file-creation provider ids (Google + Microsoft). */
export const WORKSPACE_PROVIDERS: Record<Workspace, readonly string[]> = {
  google: ["google-docs", "google-sheets", "google-slides", "google-drive"],
  microsoft: ["microsoft-word", "microsoft-excel", "microsoft-powerpoint", "onedrive"],
};

/** Deterministic per-file-type provider per workspace. */
export const FILE_TYPE_TO_PROVIDERS: Record<FileType, Record<Workspace, string>> = {
  doc: { google: "google-docs", microsoft: "microsoft-word" },
  spreadsheet: { google: "google-sheets", microsoft: "microsoft-excel" },
  slides: { google: "google-slides", microsoft: "microsoft-powerpoint" },
  file: { google: "google-drive", microsoft: "onedrive" },
};

/** Registry kind for each file type (matches ClientFileKind). */
export const FILE_TYPE_TO_KIND: Record<FileType, string> = {
  doc: "doc",
  spreadsheet: "sheet",
  slides: "slides",
  file: "file",
};

const ALL_FILE_PROVIDERS = new Set<string>(
  Object.values(WORKSPACE_PROVIDERS).flat(),
);

const PROVIDER_LABELS: Record<string, string> = {
  "google-docs": "Google Docs",
  "google-sheets": "Google Sheets",
  "google-slides": "Google Slides",
  "google-drive": "Google Drive",
  "microsoft-word": "Microsoft Word",
  "microsoft-excel": "Microsoft Excel",
  "microsoft-powerpoint": "Microsoft PowerPoint",
  onedrive: "OneDrive",
};

export const WORKSPACE_LABELS: Record<Workspace, string> = {
  google: "Google Workspace",
  microsoft: "Microsoft 365",
};

/** Workspace a provider belongs to ('google-docs' → 'google'). Null for unknown. */
export function workspaceForProvider(providerId: string): Workspace | null {
  for (const ws of Object.keys(WORKSPACE_PROVIDERS) as Workspace[]) {
    if ((WORKSPACE_PROVIDERS[ws] as readonly string[]).includes(providerId)) return ws;
  }
  return null;
}

/** Human label for a provider (falls back to the raw id). */
export function providerLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] || providerId;
}

/** Whether a provider id is a known file-creation provider. */
export function isFileProvider(providerId: string): boolean {
  return ALL_FILE_PROVIDERS.has(providerId);
}

/** Whether a provider can produce a given file type. */
export function providerSupportsType(providerId: string, fileType: FileType): boolean {
  const ws = workspaceForProvider(providerId);
  return ws !== null && FILE_TYPE_TO_PROVIDERS[fileType][ws] === providerId;
}

export interface ResolveWorkspaceInput {
  fileType: FileType;
  /** Explicit provider the caller asked for (optional). */
  requestedProvider?: string;
  /** Tenant workspace preference; default 'auto'. */
  preference?: WorkspacePreference;
  /** Provider ids the tenant has connected (status Connected). */
  connectedProviderIds: string[];
  /** Created-file counts per provider (least-loaded tie-break for 'auto'). */
  fileCounts?: Partial<Record<string, number>>;
}

export type ResolveWorkspaceResult =
  | { ok: true; workspace: Workspace; provider: string; reason: string }
  | { ok: false; error: string; connectHint: string[] };

function connectedSet(ids: string[]): Set<string> {
  return new Set(ids.filter((p) => isFileProvider(p)));
}

/** Least-loaded provider: min fileCounts; ties fall to the canonical order. */
function pickLeastLoaded(
  candidates: string[],
  fileCounts: Partial<Record<string, number>> | undefined,
): string {
  const counts = fileCounts || {};
  let best = candidates[0];
  let bestCount = counts[best] || 0;
  for (const c of candidates.slice(1)) {
    const n = counts[c] || 0;
    if (n < bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Resolve the target provider for a file-creation request.
 *
 * Priority (fail-closed at every step):
 *   1. requestedProvider — must be a known file provider, connected, and
 *      capable of the file type; otherwise an explicit error.
 *   2. preference (google|microsoft) — the tenant's chosen workspace must be
 *      connected and capable; otherwise an error naming what to connect.
 *   3. 'auto' — only one connected workspace → it wins; both connected →
 *      least-loaded provider for the file type (tie → Google, documented
 *      deterministic rule); none connected → error listing both workspaces.
 */
export function resolveWorkspaceProvider(input: ResolveWorkspaceInput): ResolveWorkspaceResult {
  const { fileType, preference = "auto" } = input;
  const connected = connectedSet(input.connectedProviderIds);

  // 1. Explicit provider request.
  if (input.requestedProvider) {
    const req = input.requestedProvider;
    if (!isFileProvider(req)) {
      return {
        ok: false,
        error: `"${req}" is not a supported file workspace. Choose Google Workspace or Microsoft 365.`,
        connectHint: Object.values(WORKSPACE_PROVIDERS).flat(),
      };
    }
    if (!connected.has(req)) {
      return {
        ok: false,
        error: `${providerLabel(req)} is not connected — connect it first to create files there.`,
        connectHint: [req],
      };
    }
    if (!providerSupportsType(req, fileType)) {
      return {
        ok: false,
        error: `${providerLabel(req)} cannot create a ${fileType}. Use one of: ${FILE_TYPE_TO_PROVIDERS[fileType].google}, ${FILE_TYPE_TO_PROVIDERS[fileType].microsoft}.`,
        connectHint: [FILE_TYPE_TO_PROVIDERS[fileType].google, FILE_TYPE_TO_PROVIDERS[fileType].microsoft],
      };
    }
    const ws = workspaceForProvider(req) as Workspace;
    return { ok: true, workspace: ws, provider: req, reason: `explicit request for ${providerLabel(req)}` };
  }

  // 2. Tenant preference (google | microsoft).
  if (preference === "google" || preference === "microsoft") {
    const provider = FILE_TYPE_TO_PROVIDERS[fileType][preference];
    if (!connected.has(provider)) {
      return {
        ok: false,
        error: `Your workspace preference is ${WORKSPACE_LABELS[preference]}, but ${providerLabel(provider)} is not connected — connect it (or switch the preference to auto).`,
        connectHint: [provider],
      };
    }
    return {
      ok: true,
      workspace: preference,
      provider,
      reason: `tenant preference ${preference} (${WORKSPACE_LABELS[preference]})`,
    };
  }

  // 3. Auto — resolve from the connected workspaces.
  const googleProvider = FILE_TYPE_TO_PROVIDERS[fileType].google;
  const msProvider = FILE_TYPE_TO_PROVIDERS[fileType].microsoft;
  const googleConnected = connected.has(googleProvider);
  const msConnected = connected.has(msProvider);

  if (!googleConnected && !msConnected) {
    return {
      ok: false,
      error:
        `No file workspace is connected — connect ${providerLabel(googleProvider)} (Google) or ${providerLabel(msProvider)} (Microsoft) to let AI employees create files for you.`,
      connectHint: [googleProvider, msProvider],
    };
  }
  if (googleConnected && !msConnected) {
    return { ok: true, workspace: "google", provider: googleProvider, reason: "only Google Workspace connected (auto)" };
  }
  if (!googleConnected && msConnected) {
    return { ok: true, workspace: "microsoft", provider: msProvider, reason: "only Microsoft 365 connected (auto)" };
  }
  // Both connected → least-loaded provider for the file type; tie → google
  // (deterministic; documented in the PR).
  const chosen = pickLeastLoaded([googleProvider, msProvider], input.fileCounts);
  const workspace = workspaceForProvider(chosen) as Workspace;
  return {
    ok: true,
    workspace,
    provider: chosen,
    reason: `auto (both workspaces connected, least-loaded → ${providerLabel(chosen)})`,
  };
}

/** Human phrase describing a file type for chat replies. */
export function fileTypeLabel(fileType: FileType): string {
  switch (fileType) {
    case "doc": return "document";
    case "spreadsheet": return "spreadsheet";
    case "slides": return "presentation";
    case "file": return "file";
  }
}
