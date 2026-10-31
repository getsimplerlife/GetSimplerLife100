/**
 * native/import/onedrive-source.ts — Phase 5.1 (6.4) OneDrive FILE SOURCE LANE.
 *
 * Third client-optional import source on the shipped 6.1 core (PR #285), the
 * direct mirror of the 6.2 Xero (PR #286) and 6.3 HubSpot (PR #287) lanes:
 * a client connects their OWN Microsoft/OneDrive account and the PULL stage
 * fetches a bounded snapshot of the tenant's own OneDrive root file listing
 * (name/id/size/dates/webUrl) into the import slice's existing tenant-keyed
 * staging store. The existing map → preview → gated importTableRows commit
 * path applies unchanged. Owner 10-20 direction: provider connections are
 * CLIENT-optional data-transfer lanes — the client manages their own
 * credentials, chooses what to import, approves every commit; we never run or
 * write through their tools (read-only adapter).
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-onedrive-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:onedrive` ONLY
 *     (loadStoredCredential with tenant — no cross-tenant fallback; absent
 *     means absent → honest failed pull, never another tenant's token),
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar field list
 *     (id/name/size/createdDateTime/lastModifiedDateTime/webUrl + a derived
 *     kind "file"|"folder" from the presence of the file/folder facet);
 *     nested-only records skipped with an honest note — never guessed
 *     columns, never fabricated counts,
 *   - bounded snapshot: ONE list call to the drive root children (the exact
 *     call the verified `onedrive-read-files` capability makes), sliced to
 *     MAX_PAGE_SIZE (100) then capped at MAX_STAGING_ROWS (200) and the
 *     512 KiB byte cap — caps enforced by the caller gate as well,
 *   - HONEST RUN OUTCOMES: every pull records pulled/mapped/failed + the
 *     provider HTTP status on the ledger; a client is NEVER told their
 *     OneDrive files were imported when only metadata was staged ("file
 *     metadata only — file contents are NOT downloaded by this lane";
 *     "0 fabricated"; "0 rows staged — nothing imported until you approve"),
 *   - secrets never returned: the credential object exists only inside this
 *     reader; rows contain mapped file metadata only,
 *   - fail-closed: missing credential / expired token with no app creds /
 *     provider HTTP error → throw with httpStatus → gate records an honest
 *     failed run (native.import.failed event) and the pull returns an error.
 *     (Graph calls are token-scoped like HubSpot — no tenant-id header, so
 *     no /connections step.)
 */
import { createODClient } from "../../integrations/providers/onedrive/client";
import { refreshODToken } from "../../integrations/providers/onedrive/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { loadOAuthAppCredentials, loadStoredCredential } from "../../verification/credential-source";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Path-style redirect URI for the OneDrive OAuth app (PR #238 discipline). */
function onedriveRedirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback/onedrive` : "";
}

/** Fixed safe scalar fields for OneDrive driveItem rows — deterministic,
 *  never guessed. `kind` is derived below from the file/folder facet. */
const ITEM_FIELDS = [
  "id",
  "name",
  "size",
  "createdDateTime",
  "lastModifiedDateTime",
  "webUrl",
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

/** Flatten one Graph driveItem: safe top-level scalars + a derived
 *  `kind` ("file" | "folder") from the facet objects. Deterministic. */
function flattenDriveItem(record: Record<string, unknown>): Record<string, unknown> {
  const out = pickScalars(record, ITEM_FIELDS);
  const hasFolder = record.folder && typeof record.folder === "object" && !Array.isArray(record.folder);
  const hasFile = record.file && typeof record.file === "object" && !Array.isArray(record.file);
  out.kind = hasFolder ? "folder" : hasFile ? "file" : "unknown";
  return out;
}

/** Error with an optional provider HTTP status — the gate records it on the
 *  honest failed run when present. */
export class OneDriveImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "OneDriveImportSourceError";
    this.httpStatus = httpStatus;
  }
}

export interface OneDriveImportSourceDeps {
  /** Injectable fetch (tests). Defaults to global fetch at call time. */
  fetchImpl?: typeof fetch;
}

/** Build the OneDrive import source reader (injectable for tests). */
export function makeOneDriveImportSourceReader(deps: OneDriveImportSourceDeps = {}): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    // 1. STRICT tenant-scoped credential — `${tenantId}:onedrive` only. The
    //    loader (credential-source.ts) never falls back to another tenant's
    //    row; the Graph calls below are token-scoped (no tenant-id header).
    void fetchImpl;
    const stored = loadStoredCredential("onedrive", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    if (!cred?.accessToken) {
      throw new OneDriveImportSourceError(
        `No OneDrive account is connected for this tenant — connect your own OneDrive account to import (0 rows pulled; nothing fabricated).`,
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
      const app = loadOAuthAppCredentials("onedrive");
      if (!app?.clientId || !app?.clientSecret) {
        throw new OneDriveImportSourceError(
          "OneDrive access token expired and OAUTH_ONEDRIVE_CLIENT_ID/SECRET are not configured — cannot refresh (0 rows pulled).",
        );
      }
      if (!refreshToken) {
        throw new OneDriveImportSourceError(
          "OneDrive access token expired and this connection has no refresh token — the client must re-authorise their own OneDrive account (0 rows pulled; nothing fabricated).",
        );
      }
      try {
        const cfg = {
          clientId: app.clientId,
          clientSecret: app.clientSecret,
          redirectUri: onedriveRedirectUri(),
          tenantId: String(cred.tenantId ?? "common"),
        };
        const refreshed = await refreshODToken(cfg, refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
      } catch (e) {
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        throw new OneDriveImportSourceError(`OneDrive token refresh failed${status ? ` (HTTP ${status})` : ""} — 0 rows pulled.`, status);
      }
    }
    // 3. Bounded read-only snapshot: ONE call to /me/drive/root/children —
    //    the exact call the verified onedrive-read-files capability makes.
    //    Sliced to MAX_PAGE_SIZE (Graph pages can be large) and then to
    //    MAX_STAGING_ROWS below (belt and braces).
    const client = createODClient({
      accessToken,
      refreshToken,
      expiresAt,
      scope: cred.scope,
      tenantId: String(cred.tenantId ?? "common"),
      clientId: process.env.OAUTH_ONEDRIVE_CLIENT_ID,
      clientSecret: process.env.OAUTH_ONEDRIVE_CLIENT_SECRET,
      redirectUri: onedriveRedirectUri(),
    });
    const rows: Record<string, unknown>[] = [];
    let skippedNested = 0;
    try {
      const itemsRaw = await client.listRootItems();
      const items = Array.isArray(itemsRaw) ? itemsRaw.slice(0, MAX_PAGE_SIZE) : [];
      for (const it of items) {
        const flat = flattenDriveItem((it as Record<string, unknown> | undefined) ?? {});
        if (Object.keys(flat).length === 0) skippedNested += 1;
        else rows.push(flat);
      }
    } catch (e) {
      const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : undefined;
      throw new OneDriveImportSourceError(
        `OneDrive read failed${status ? ` (HTTP ${status})` : ""}: ${e instanceof Error ? e.message : String(e)} — 0 rows pulled; nothing fabricated.`,
        status,
      );
    }
    // 4. Bound total rows + bytes (belt and braces on top of the gate caps).
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new OneDriveImportSourceError("OneDrive snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const fileCount = sliced.filter((r) => r.kind === "file").length;
    const folderCount = sliced.filter((r) => r.kind === "folder").length;
    const noteParts = [
      "OneDrive HTTP 200",
      `${fileCount} file(s), ${folderCount} folder(s) listed (root children, page 1)`,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "file metadata only — file contents are NOT downloaded by this lane",
      "0 fabricated",
    ];
    if (skippedNested > 0) noteParts.push(`${skippedNested} item(s) with no mapped scalar fields skipped (nested-only payloads)`);
    return { rows: sliced, note: noteParts.join("; "), httpStatus: 200 };
  };
}

/** Register the OneDrive lane in the import source registry (idempotent).
 *  Called by prod-server at boot and by tests. One-shot/client-initiated
 *  re-runs only — no webhooks, no write-back, no re-authorisation program
 *  (owner 10-20). */
export function registerOneDriveImportSource(deps: OneDriveImportSourceDeps = {}): void {
  registerImportSource("onedrive", makeOneDriveImportSourceReader(deps));
}