/**
 * native/import/google-drive-source.ts — Phase 5.1 (6.4) Google Drive FILE
 * SOURCE LANE (106th publish slice).
 *
 * Twin of the shipped OneDrive lane (src/native/import/onedrive-source.ts,
 * main 6545259) but backed by the REAL verified google-workspace read client:
 * a client connects their OWN Google account (drive.readonly) and the PULL
 * stage fetches a bounded snapshot of the tenant's own Drive file listing
 * (page 1 of non-trashed files, ≤ MAX_PAGE_SIZE) into the import slice's
 * existing tenant-keyed staging store. The read uses the exact call the
 * verified `google-drive-read-files` capability makes
 * (drive.listFiles("trashed = false", pageSize) — canonical host
 * https://www.googleapis.com/drive/v3). The existing map → preview → gated
 * importTableRows commit path applies unchanged. Owner 10-20 direction:
 * provider connections are CLIENT-optional data-transfer lanes — read-only
 * adapter, the client manages their own credentials, chooses what to import,
 * approves every commit; we never run or write through their tools.
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-google-drive-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:google-drive` ONLY
 *     (loadStoredCredential with tenant — no cross-tenant fallback; absent
 *     means absent → honest failed pull, never another tenant's token, zero
 *     API calls),
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar field list
 *     (id/name/mimeType/size/createdTime/modifiedTime/trashed/webViewLink +
 *     a derived kind "file"|"folder"|"unknown" from the Drive folder mime
 *     type); nested-only records skipped with an honest note — never guessed
 *     columns, never fabricated counts,
 *   - bounded snapshot: ONE listFiles call (page 1, pageSize MAX_PAGE_SIZE)
 *     with the verified `trashed = false` filter, sliced to MAX_PAGE_SIZE
 *     then capped at MAX_STAGING_ROWS and the 512 KiB byte cap — caps
 *     enforced by the caller gate as well (belt and braces),
 *   - HONEST RUN OUTCOMES: every pull records pulled counts + the provider
 *     HTTP status on the ledger; a client is NEVER told their Drive files
 *     were imported when only metadata was staged ("file metadata only — file
 *     contents are NOT downloaded by this lane"; "0 fabricated"; "0 rows
 *     staged — nothing imported until you approve"),
 *   - secrets never returned: the credential object exists only inside this
 *     reader; rows contain mapped file metadata only,
 *   - fail-closed: missing credential / expired token with no app creds /
 *     provider HTTP error → throw with httpStatus → gate records an honest
 *     failed run (native.import.failed event) and the pull returns an error.
 */
import { createGDriveClient, FOLDER_MIME } from "../../integrations/providers/google-drive/client";
import { refreshGDriveToken } from "../../integrations/providers/google-drive/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { loadOAuthAppCredentials, loadStoredCredential } from "../../verification/credential-source";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Path-style redirect URI for the Google Drive OAuth app (PR #238 discipline). */
function googleDriveRedirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback/google-drive` : "";
}

/** Fixed safe scalar fields for Drive file rows — deterministic, never
 *  guessed. `kind` is derived from the folder mime type below. Drive `size`
 *  is a string (e.g. "1024"); pickScalars keeps it as-is. */
const ITEM_FIELDS = [
  "id",
  "name",
  "mimeType",
  "size",
  "createdTime",
  "modifiedTime",
  "trashed",
  "webViewLink",
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

/** Flatten one Drive file resource: safe top-level scalars + a derived
 *  `kind` ("folder" for the Google folder mime type, "file" for any other
 *  present mime type, "unknown" when mimeType is absent). Deterministic. */
function flattenDriveFile(record: Record<string, unknown>): Record<string, unknown> {
  const out = pickScalars(record, ITEM_FIELDS);
  const mime = record.mimeType;
  out.kind = mime === FOLDER_MIME ? "folder" : typeof mime === "string" && mime.length > 0 ? "file" : "unknown";
  return out;
}

/** Error with an optional provider HTTP status — the gate records it on the
 *  honest failed run when present. */
export class GoogleDriveImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "GoogleDriveImportSourceError";
    this.httpStatus = httpStatus;
  }
}

export interface GoogleDriveImportSourceDeps {
  /** Injectable fetch (tests). Defaults to global fetch at call time. */
  fetchImpl?: typeof fetch;
}

/** Build the Google Drive import source reader (injectable for tests). */
export function makeGoogleDriveImportSourceReader(deps: GoogleDriveImportSourceDeps = {}): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    // 1. STRICT tenant-scoped credential — `${tenantId}:google-drive` only.
    //    The loader (credential-source.ts) never falls back to another
    //    tenant's row; the Drive call below is token-scoped.
    void fetchImpl;
    const stored = loadStoredCredential("google-drive", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    if (!cred?.accessToken) {
      throw new GoogleDriveImportSourceError(
        `No Google Drive account is connected for this tenant — connect your own Google Drive account to import (0 rows pulled; nothing fabricated).`,
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
      const app = loadOAuthAppCredentials("google-drive");
      if (!app?.clientId || !app?.clientSecret) {
        throw new GoogleDriveImportSourceError(
          "Google Drive access token expired and OAUTH_GOOGLE_DRIVE_CLIENT_ID/SECRET are not configured — cannot refresh (0 rows pulled).",
        );
      }
      if (!refreshToken) {
        throw new GoogleDriveImportSourceError(
          "Google Drive access token expired and this connection has no refresh token — reconnect the client's Google Drive account (0 rows pulled).",
        );
      }
      try {
        const cfg = { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: googleDriveRedirectUri() };
        const refreshed = await refreshGDriveToken(cfg, refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
      } catch (e) {
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        throw new GoogleDriveImportSourceError(`Google Drive token refresh failed${status ? ` (HTTP ${status})` : ""} — 0 rows pulled.`, status);
      }
    }
    // 3. Bounded read-only snapshot: ONE listFiles call with the verified
    //    `trashed = false` filter (the exact call the verified
    //    google-drive-read-files capability makes) at pageSize MAX_PAGE_SIZE,
    //    then sliced to MAX_STAGING_ROWS below (belt and braces).
    const client = createGDriveClient({
      accessToken,
      refreshToken,
      expiresAt,
      scope: cred.scope,
      clientId: process.env.OAUTH_GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: process.env.OAUTH_GOOGLE_DRIVE_CLIENT_SECRET,
      redirectUri: googleDriveRedirectUri(),
    });
    const rows: Record<string, unknown>[] = [];
    let skippedNested = 0;
    try {
      const filesRaw = await client.listFiles("trashed = false", MAX_PAGE_SIZE);
      const files = Array.isArray(filesRaw) ? filesRaw.slice(0, MAX_PAGE_SIZE) : [];
      for (const f of files) {
        const flat = flattenDriveFile((f as Record<string, unknown> | undefined) ?? {});
        if (Object.keys(flat).length === 0) skippedNested += 1;
        else rows.push(flat);
      }
    } catch (e) {
      const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : undefined;
      throw new GoogleDriveImportSourceError(
        `Google Drive read failed${status ? ` (HTTP ${status})` : ""}: ${e instanceof Error ? e.message : String(e)} — 0 rows pulled; nothing fabricated.`,
        status,
      );
    }
    // 4. Bound total rows + bytes (belt and braces on top of the gate caps).
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new GoogleDriveImportSourceError("Google Drive snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const fileCount = sliced.filter((r) => r.kind === "file").length;
    const folderCount = sliced.filter((r) => r.kind === "folder").length;
    const noteParts = [
      "Google Drive HTTP 200",
      `${fileCount} file(s), ${folderCount} folder(s) listed (non-trashed, page 1)`,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "file metadata only — file contents are NOT downloaded by this lane",
      "0 fabricated",
    ];
    if (skippedNested > 0) noteParts.push(`${skippedNested} item(s) with no mapped scalar fields skipped (nested-only payloads)`);
    return { rows: sliced, note: noteParts.join("; "), httpStatus: 200 };
  };
}

/** Register the Google Drive lane in the import source registry (idempotent).
 *  Called by prod-server at boot and by tests. One-shot/client-initiated
 *  re-runs only — no webhooks, no write-back, no reconnect program
 *  (owner 10-20). */
export function registerGoogleDriveImportSource(deps: GoogleDriveImportSourceDeps = {}): void {
  registerImportSource("google-drive", makeGoogleDriveImportSourceReader(deps));
}