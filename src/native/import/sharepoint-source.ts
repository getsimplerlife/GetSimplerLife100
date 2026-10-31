/**
 * native/import/sharepoint-source.ts — Phase 5.1 (6.4-FILE) SHAREPOINT FILE
 * SOURCE LANE (109th publish slice) — LAST 6.4 sibling.
 *
 * Twin of the shipped Box/Dropbox/Google Drive lanes
 * (src/native/import/{box,dropbox,google-drive}-source.ts) with the same
 * real-live-provider-I/O pattern, backed by the existing verified SharePoint
 * read client (sharepoint/client.ts — Graph API base
 * https://graph.microsoft.com/v1.0/sites/{siteId}, methods listDrives() →
 * GET /drives and listItems(driveId) → GET /drives/{driveId}/root/children):
 * a client connects their OWN SharePoint account and the PULL stage fetches a
 * bounded snapshot of the tenant's own default document-library ROOT listing
 * (page 1, entries sliced to MAX_PAGE_SIZE) into the import slice's existing
 * tenant-keyed staging store. The existing map → preview → gated
 * importTableRows commit path applies unchanged. Owner 10-20 direction:
 * provider connections are CLIENT-optional data-transfer lanes — read-only
 * adapter, the client manages their own credentials, chooses what to import,
 * approves every commit; we never run or write through their tools.
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-sharepoint-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:sharepoint` ONLY
 *     (loadStoredCredential with tenant — no cross-tenant fallback; absent
 *     means absent → honest failed pull, never another tenant's token, zero
 *     API calls). The Graph calls are token-scoped (per-tenant Authorization
 *     header) and resolve against the tenant's own site (either the
 *     credential's captured `siteId` or Graph's documented default site
 *     "root" — a real Graph site identifier, scoped by the token's tenant).
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar field list
 *     (id/name/size/createdDateTime/lastModifiedDateTime/webUrl) + a derived
 *     kind "file"|"folder"|"unknown" from the Graph driveItem facets
 *     (folder objects have a "folder" facet, files a "file" facet — exactly
 *     what /root/children returns); nested-only records skipped with an
 *     honest note — never guessed columns, never fabricated counts.
 *   - bounded snapshot: TWO Graph calls total — listDrives() (page 1, drives
 *     sliced to MAX_PAGE_SIZE) then listItems(firstDrive) root/children
 *     (page 1, entries sliced to MAX_PAGE_SIZE) — then capped at
 *     MAX_STAGING_ROWS and the 512 KiB byte cap — caps enforced by the caller
 *     gate as well (belt and braces). No paging, no recursion into folders.
 *   - HONEST RUN OUTCOMES: every pull records pulled counts + the provider
 *     HTTP status on the ledger; a client is NEVER told their SharePoint
 *     files were imported when only metadata was staged ("file metadata only
 *     — file contents are NOT downloaded by this lane"; "0 fabricated"; "0
 *     rows staged — nothing imported until you approve"; "page 1" honest
 *     phrasing).
 *   - secrets never returned: the credential object exists only inside this
 *     reader; rows contain mapped file metadata only.
 *   - fail-closed: missing credential / expired token with no app creds /
 *     provider HTTP error → throw with httpStatus → gate records an honest
 *     failed run (native.import.failed event) and the pull returns an error.
 */
import { createSPClient } from "../../integrations/providers/sharepoint/client";
import { refreshOutlookToken } from "../../integrations/providers/outlook/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { loadOAuthAppCredentials, loadStoredCredential } from "../../verification/credential-source";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Path-style redirect URI for the SharePoint OAuth app (PR #238 discipline). */
function sharepointRedirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback/sharepoint` : "";
}

/** Fixed safe scalar fields from Graph driveItem rows — deterministic, never
 *  guessed. `kind` is derived below from the file/folder facet. */
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

/** Flatten one Graph driveItem: safe top-level scalars + a derived `kind`
 *  ("file" | "folder" | "unknown") from the facet objects (folder facet for
 *  folders, file facet for files — exactly the shape /root/children returns).
 *  Deterministic. */
function flattenDriveItem(record: Record<string, unknown>): Record<string, unknown> {
  const out = pickScalars(record, ITEM_FIELDS);
  const hasFolder = record.folder && typeof record.folder === "object" && !Array.isArray(record.folder);
  const hasFile = record.file && typeof record.file === "object" && !Array.isArray(record.file);
  out.kind = hasFolder ? "folder" : hasFile ? "file" : "unknown";
  return out;
}

/** Error with an optional provider HTTP status — the gate records it on the
 *  honest failed run when present. */
export class SharePointImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "SharePointImportSourceError";
    this.httpStatus = httpStatus;
  }
}

export interface SharePointImportSourceDeps {
  /** Injectable fetch (tests). Defaults to global fetch at call time. */
  fetchImpl?: typeof fetch;
}

/** Build the SharePoint import source reader (injectable for tests). */
export function makeSharePointImportSourceReader(deps: SharePointImportSourceDeps = {}): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    void fetchImpl;
    // 1. STRICT tenant-scoped credential — `${tenantId}:sharepoint` only.
    //    The loader (credential-source.ts) never falls back to another
    //    tenant's row; the Graph calls below are token-scoped (per-tenant
    //    Authorization header — no cross-tenant path exists).
    const stored = loadStoredCredential("sharepoint", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    if (!cred?.accessToken) {
      throw new SharePointImportSourceError(
        `No SharePoint account is connected for this tenant — connect your own SharePoint account to import (0 rows pulled; nothing fabricated).`,
      );
    }
    // Graph site to read: the site captured on the tenant's own connection
    // when available, else Graph's documented default site identifier "root"
    // (https://graph.microsoft.com/v1.0/sites/root — resolves within the
    // authenticated tenant, so it stays per-tenant by token).
    const siteId = typeof cred.siteId === "string" && cred.siteId.length > 0 ? cred.siteId : "root";
    // 2. Refresh the access token ONLY when expired (mutates the in-memory
    //    copy; the durable store is updated by the platform's own refresher,
    //    not here). One-shot / client-initiated — never a background loop.
    let accessToken = cred.accessToken;
    let refreshToken = cred.refreshToken;
    let expiresAt = cred.expiresAt;
    const expired = isTokenExpired({ accessToken, refreshToken, expiresAt, scope: cred.scope, raw: {} } as never);
    if (expired) {
      const app = loadOAuthAppCredentials("sharepoint");
      if (!app?.clientId || !app?.clientSecret) {
        throw new SharePointImportSourceError(
          "SharePoint access token expired and OAUTH_SHAREPOINT_CLIENT_ID/SECRET are not configured — cannot refresh (0 rows pulled).",
        );
      }
      if (!refreshToken) {
        throw new SharePointImportSourceError(
          "SharePoint access token expired and this connection has no refresh token — the client must re-authorise their own SharePoint account (0 rows pulled; nothing fabricated).",
        );
      }
      try {
        // SharePoint's OAuth app config is the Microsoft family convention
        // (outlook/auth.ts getSPOAuthConfig → same { tenantId, clientId,
        // clientSecret, redirectUri } shape; token exchange happens at
        // login.microsoftonline.com/{tenant}/oauth2/v2.0/token).
        const cfg = {
          clientId: app.clientId,
          clientSecret: app.clientSecret,
          redirectUri: sharepointRedirectUri(),
          tenantId: String(cred.tenantId ?? "common"),
        };
        const refreshed = await refreshOutlookToken(cfg, refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
      } catch (e) {
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        throw new SharePointImportSourceError(`SharePoint token refresh failed${status ? ` (HTTP ${status})` : ""} — 0 rows pulled.`, status);
      }
    }
    // 3. Bounded read-only snapshot: listDrives() then listItems(firstDrive)
    //    root/children — the exact calls the verified sharepoint read client
    //    makes (GET /drives and GET /drives/{driveId}/root/children; page 1
    //    only; no folder recursion). Drives and entries sliced to
    //    MAX_PAGE_SIZE, then to MAX_STAGING_ROWS below (belt and braces).
    const client = createSPClient({
      accessToken,
      refreshToken,
      expiresAt,
      scope: cred.scope,
      tenantId: String(cred.tenantId ?? "common"),
      clientId: process.env.OAUTH_SHAREPOINT_CLIENT_ID,
      clientSecret: process.env.OAUTH_SHAREPOINT_CLIENT_SECRET,
      redirectUri: sharepointRedirectUri(),
      siteId,
    });
    const rows: Record<string, unknown>[] = [];
    let skippedNested = 0;
    let driveName = "";
    try {
      const drivesRaw = await client.listDrives();
      const drives = Array.isArray(drivesRaw) ? (drivesRaw as unknown[]).slice(0, MAX_PAGE_SIZE) : [];
      if (drives.length === 0) {
        // A successful read with nothing to list — honest, not an error.
        return {
          rows: [],
          note: `SharePoint HTTP 200; 0 file(s), 0 folder(s) listed (site '${siteId}' — no document library (drive) found, page 1); file metadata only — file contents are NOT downloaded by this lane; 0 fabricated; 0 rows staged — nothing imported until you approve`,
          httpStatus: 200,
        };
      }
      const first = (drives[0] as Record<string, unknown> | undefined) ?? {};
      if (typeof first["name"] === "string" && String(first["name"]).length > 0) driveName = String(first["name"]);
      const itemsRaw = await client.listItems(String(first["id"]));
      const items = Array.isArray(itemsRaw) ? (itemsRaw as unknown[]).slice(0, MAX_PAGE_SIZE) : [];
      for (const it of items) {
        const flat = flattenDriveItem((it as Record<string, unknown> | undefined) ?? {});
        if (Object.keys(flat).length === 0) skippedNested += 1;
        else rows.push(flat);
      }
    } catch (e) {
      const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : undefined;
      throw new SharePointImportSourceError(
        `SharePoint read failed${status ? ` (HTTP ${status})` : ""}: ${e instanceof Error ? e.message : String(e)} — 0 rows pulled; nothing fabricated.`,
        status,
      );
    }
    // 4. Bound total rows + bytes (belt and braces on top of the gate caps).
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new SharePointImportSourceError("SharePoint snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const fileCount = sliced.filter((r) => r.kind === "file").length;
    const folderCount = sliced.filter((r) => r.kind === "folder").length;
    const sitePhrase = siteId === "root" ? "site 'root' (default)" : `site '${siteId}'`;
    const drivePhrase = driveName ? `document library '${driveName}'` : "default document library";
    const noteParts = [
      "SharePoint HTTP 200",
      `${fileCount} file(s), ${folderCount} folder(s) listed (${sitePhrase}, ${drivePhrase} root, page 1)`,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "file metadata only — file contents are NOT downloaded by this lane",
      "0 fabricated",
    ];
    if (skippedNested > 0) noteParts.push(`${skippedNested} item(s) with no mapped scalar fields skipped (nested-only payloads)`);
    return { rows: sliced, note: noteParts.join("; "), httpStatus: 200 };
  };
}

/** Register the SharePoint lane in the import source registry (idempotent).
 *  Called by prod-server at boot and by tests. One-shot/client-initiated
 *  re-runs only — no webhooks, no write-back, no re-authorisation program
 *  (owner 10-20). */
export function registerSharePointImportSource(deps: SharePointImportSourceDeps = {}): void {
  registerImportSource("sharepoint", makeSharePointImportSourceReader(deps));
}