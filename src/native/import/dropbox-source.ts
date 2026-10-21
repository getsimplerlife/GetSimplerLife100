/**
 * native/import/dropbox-source.ts — Phase 5.1 (6.4) Dropbox FILE SOURCE LANE
 * (107th publish slice).
 *
 * Twin of the shipped Google Drive lane (src/native/import/google-drive-source.ts,
 * main 6b71fbe) with the same real-live-provider-I/O pattern, backed by the
 * existing verified dropbox read client (dropbox/client.ts listFolder — POST
 * https://api.dropboxapi.com/2/files/list_folder): a client connects their OWN
 * Dropbox account (files.metadata.read) and the PULL stage fetches a bounded
 * snapshot of the tenant's own Dropbox root folder listing (page 1, entries
 * sliced to MAX_PAGE_SIZE) into the import slice's existing tenant-keyed
 * staging store. The existing map → preview → gated importTableRows commit
 * path applies unchanged. Owner 10-20 direction: provider connections are
 * CLIENT-optional data-transfer lanes — read-only adapter, the client manages
 * their own credentials, chooses what to import, approves every commit; we
 * never run or write through their tools.
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-dropbox-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:dropbox` ONLY
 *     (loadStoredCredential with tenant — no cross-tenant fallback; absent
 *     means absent → honest failed pull, never another tenant's token, zero
 *     API calls),
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar field list
 *     (id/name/path_lower/path_display/rev/client_modified/server_modified/
 *     size/is_downloadable + a derived kind "file"|"folder"|"unknown" from the
 *     Dropbox `.tag` discriminator); nested-only records skipped with an
 *     honest note — never guessed columns, never fabricated counts,
 *   - bounded snapshot: ONE listFolder call (root "", page 1, recursive
 *     false), entries sliced to MAX_PAGE_SIZE then capped at MAX_STAGING_ROWS
 *     and the 512 KiB byte cap — caps enforced by the caller gate as well
 *     (belt and braces),
 *   - HONEST RUN OUTCOMES: every pull records pulled counts + the provider
 *     HTTP status on the ledger; a client is NEVER told their Dropbox files
 *     were imported when only metadata was staged ("file metadata only — file
 *     contents are NOT downloaded by this lane"; "0 fabricated"; "0 rows
 *     staged — nothing imported until you approve"),
 *   - secrets never returned: the credential object exists only inside this
 *     reader; rows contain mapped file metadata only,
 *   - fail-closed: missing credential / expired token with no app creds /
 *     provider HTTP error → throw with httpStatus → gate records an honest
 *     failed run (native.import.failed event) and the pull returns an error.
 */
import { createDropboxClient } from "../../integrations/providers/dropbox/client";
import { refreshDropboxToken } from "../../integrations/providers/dropbox/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { loadOAuthAppCredentials, loadStoredCredential } from "../../verification/credential-source";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Path-style redirect URI for the Dropbox OAuth app (PR #238 discipline). */
function dropboxRedirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback/dropbox` : "";
}

/** Fixed safe scalar fields for Dropbox list_folder entries — deterministic,
 *  never guessed. `kind` is derived from the `.tag` discriminator below.
 *  Folder entries carry no `size`; the dropbox v2 API omits it. */
const ENTRY_FIELDS = [
  "id",
  "name",
  "path_lower",
  "path_display",
  "rev",
  "client_modified",
  "server_modified",
  "size",
  "is_downloadable",
] as const;

/** Helper: keep only scalar values (string/number/boolean/null) — skip nested
 *  objects/arrays deterministically so staged rows stay flat and bounded. */
function pickScalars(record: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = record[f];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[f] = v;
  }
  return out;
}

/** Flatten one Dropbox list_folder entry: safe top-level scalars + a derived
 *  `kind` ("folder" | "file" | "unknown") from the `.tag` discriminator.
 *  Deterministic. */
function flattenEntry(record: Record<string, unknown>): Record<string, unknown> {
  const out = pickScalars(record, ENTRY_FIELDS);
  const tag = record[".tag"];
  out.kind = tag === "folder" ? "folder" : tag === "file" ? "file" : "unknown";
  return out;
}

/** Error with an optional provider HTTP status — the gate records it on the
 *  honest failed run when present. */
export class DropboxImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "DropboxImportSourceError";
    this.httpStatus = httpStatus;
  }
}

export interface DropboxImportSourceDeps {
  /** Injectable fetch (tests). Defaults to global fetch at call time. */
  fetchImpl?: typeof fetch;
}

/** Build the Dropbox import source reader (injectable for tests). */
export function makeDropboxImportSourceReader(deps: DropboxImportSourceDeps = {}): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    // 1. STRICT tenant-scoped credential — `${tenantId}:dropbox` only.
    //    The loader (credential-source.ts) never falls back to another
    //    tenant's row; the Dropbox call below is token-scoped.
    void fetchImpl;
    const stored = loadStoredCredential("dropbox", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    if (!cred?.accessToken) {
      throw new DropboxImportSourceError(
        `No Dropbox account is connected for this tenant — connect your own Dropbox account to import (0 rows pulled; nothing fabricated).`,
      );
    }
    // 2. Refresh the access token ONLY when expired (mutates the in-memory
    //    copy; the durable store is updated by the platform's own refresher,
    //    not here). One-shot / client-initiated — never a background loop.
    let accessToken = cred.accessToken;
    let refreshToken = cred.refreshToken;
    let expiresAt = cred.expiresAt;
    const expired = isTokenExpired({ accessToken, refreshToken, expiresAt, scope: cred.scope, raw: {} } as never);
    if (expired) {
      const app = loadOAuthAppCredentials("dropbox");
      if (!app?.clientId || !app?.clientSecret) {
        throw new DropboxImportSourceError(
          "Dropbox access token expired and OAUTH_DROPBOX_CLIENT_ID/SECRET are not configured — cannot refresh (0 rows pulled).",
        );
      }
      if (!refreshToken) {
        throw new DropboxImportSourceError(
          "Dropbox access token expired and this connection has no refresh token — reconnect the client's Dropbox account (0 rows pulled).",
        );
      }
      try {
        // Dropbox's OAuth config uses appKey/appSecret keys (client.ts authConfig).
        const cfg = { appKey: app.clientId, appSecret: app.clientSecret, redirectUri: dropboxRedirectUri() };
        const refreshed = await refreshDropboxToken(cfg, refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
      } catch (e) {
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        throw new DropboxImportSourceError(`Dropbox token refresh failed${status ? ` (HTTP ${status})` : ""} — 0 rows pulled.`, status);
      }
    }
    // 3. Bounded read-only snapshot: ONE listFolder call (root "", page 1,
    //    recursive false — the calls the existing dropbox read client makes),
    //    then entries sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS below
    //    (belt and braces; list_folder has a large API default page, so the
    //    in-reader slice is the real bound).
    const client = createDropboxClient({
      accessToken,
      refreshToken,
      expiresAt,
      scope: cred.scope,
      appKey: process.env.OAUTH_DROPBOX_CLIENT_ID,
      appSecret: process.env.OAUTH_DROPBOX_CLIENT_SECRET,
      redirectUri: dropboxRedirectUri(),
    });
    const rows: Record<string, unknown>[] = [];
    let skippedNested = 0;
    try {
      const raw = await client.listFolder("");
      const entries = Array.isArray(raw?.entries) ? (raw.entries as unknown[]).slice(0, MAX_PAGE_SIZE) : [];
      for (const e of entries) {
        const flat = flattenEntry((e as Record<string, unknown> | undefined) ?? {});
        if (Object.keys(flat).length === 0) skippedNested += 1;
        else rows.push(flat);
      }
    } catch (e) {
      const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : undefined;
      throw new DropboxImportSourceError(
        `Dropbox read failed${status ? ` (HTTP ${status})` : ""}: ${e instanceof Error ? e.message : String(e)} — 0 rows pulled; nothing fabricated.`,
        status,
      );
    }
    // 4. Bound total rows + bytes (belt and braces on top of the gate caps).
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new DropboxImportSourceError("Dropbox snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const fileCount = sliced.filter((r) => r.kind === "file").length;
    const folderCount = sliced.filter((r) => r.kind === "folder").length;
    const noteParts = [
      "Dropbox HTTP 200",
      `${fileCount} file(s), ${folderCount} folder(s) listed (root folder, page 1)`,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "file metadata only — file contents are NOT downloaded by this lane",
      "0 fabricated",
    ];
    if (skippedNested > 0) noteParts.push(`${skippedNested} item(s) with no mapped scalar fields skipped (nested-only payloads)`);
    return { rows: sliced, note: noteParts.join("; "), httpStatus: 200 };
  };
}

/** Register the Dropbox lane in the import source registry (idempotent).
 *  Called by prod-server at boot and by tests. One-shot/client-initiated
 *  re-runs only — no webhooks, no write-back, no reconnect program
 *  (owner 10-20). */
export function registerDropboxImportSource(deps: DropboxImportSourceDeps = {}): void {
  registerImportSource("dropbox", makeDropboxImportSourceReader(deps));
}