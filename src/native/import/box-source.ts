/**
 * native/import/box-source.ts — Phase 5.1 (6.4) BOX FILE SOURCE LANE
 * (108th publish slice).
 *
 * Twin of the shipped Dropbox lane (src/native/import/dropbox-source.ts,
 * main da7ff1a) with the same real-live-provider-I/O pattern, backed by the
 * existing verified box read client (box/client.ts listFolder — GET
 * https://api.box.com/2.0/folders/0/items): a client connects their OWN Box
 * account (root_readwrite) and the PULL stage fetches a bounded snapshot of
 * the tenant's own Box root-folder listing (page 1, entries sliced to
 * MAX_PAGE_SIZE) into the import slice's existing tenant-keyed staging store.
 * The existing map → preview → gated importTableRows commit path applies
 * unchanged. Owner 10-20 direction: provider connections are CLIENT-optional
 * data-transfer lanes — read-only adapter, the client manages their own
 * credentials, chooses what to import, approves every commit; we never run or
 * write through their tools.
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-box-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:box` ONLY
 *     (loadStoredCredential with tenant — no cross-tenant fallback; absent
 *     means absent → honest failed pull, never another tenant's token, zero
 *     API calls),
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar field list
 *     (id/name/type/size/modified_at/created_at/item_status/sha1 +
 *     parent_id from the entry's parent.id) + a derived kind "file"|"folder"|
 *     "unknown" from the Box resource `type` discriminator; nested-only
 *     records skipped with an honest note — never guessed columns, never
 *     fabricated counts,
 *   - bounded snapshot: ONE listFolder("0") call (GET /folders/0/items,
 *     page 1 only — Box pages at 1000/request; paging is a follow-up slice),
 *     entries sliced to MAX_PAGE_SIZE then capped at MAX_STAGING_ROWS and the
 *     512 KiB byte cap — caps enforced by the caller gate as well (belt and
 *     braces),
 *   - HONEST RUN OUTCOMES: every pull records pulled counts + the provider
 *     HTTP status on the ledger; a client is NEVER told their Box files were
 *     imported when only metadata was staged ("file metadata only — file
 *     contents are NOT downloaded by this lane"; "0 fabricated"; "0 rows
 *     staged — nothing imported until you approve"; "page 1" honest phrasing),
 *   - secrets never returned: the credential object exists only inside this
 *     reader; rows contain mapped file metadata only,
 *   - fail-closed: missing credential / expired token with no app creds /
 *     provider HTTP error → throw with httpStatus → gate records an honest
 *     failed run (native.import.failed event) and the pull returns an error.
 */
import { createBoxClient } from "../../integrations/providers/box/client";
import { refreshBoxToken } from "../../integrations/providers/box/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { loadOAuthAppCredentials, loadStoredCredential } from "../../verification/credential-source";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Path-style redirect URI for the Box OAuth app (PR #238 discipline). */
function boxRedirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback/box` : "";
}

/** Fixed safe scalar fields from Box folder-listing entries — deterministic,
 *  never guessed. Folder entries may omit `size`/`sha1`; Box provides them
 *  only when the resource has them. */
const ENTRY_FIELDS = [
  "id",
  "name",
  "type",
  "size",
  "modified_at",
  "created_at",
  "item_status",
  "sha1",
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

/** Flatten one Box folder-listing entry: safe top-level scalars + a derived
 *  `kind` ("folder" | "file" | "unknown") from the Box `type` discriminator
 *  + `parent_id` from the entry's parent.id when present (fixed safe scalar).
 *  Deterministic. */
function flattenEntry(record: Record<string, unknown>): Record<string, unknown> {
  const out = pickScalars(record, ENTRY_FIELDS);
  const type = record["type"];
  out.kind = type === "folder" ? "folder" : type === "file" ? "file" : "unknown";
  const parent = record["parent"];
  if (parent && typeof parent === "object" && typeof (parent as Record<string, unknown>)["id"] === "string") {
    out["parent_id"] = (parent as Record<string, unknown>)["id"] as string;
  }
  return out;
}

/** Error with an optional provider HTTP status — the gate records it on the
 *  honest failed run when present. */
export class BoxImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "BoxImportSourceError";
    this.httpStatus = httpStatus;
  }
}

export interface BoxImportSourceDeps {
  /** Injectable fetch (tests). Defaults to global fetch at call time. */
  fetchImpl?: typeof fetch;
}

/** Build the Box import source reader (injectable for tests). */
export function makeBoxImportSourceReader(deps: BoxImportSourceDeps = {}): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    void fetchImpl;
    // 1. STRICT tenant-scoped credential — `${tenantId}:box` only.
    //    The loader (credential-source.ts) never falls back to another
    //    tenant's row; the Box call below is token-scoped.
    const stored = loadStoredCredential("box", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    if (!cred?.accessToken) {
      throw new BoxImportSourceError(
        `No Box account is connected for this tenant — connect your own Box account to import (0 rows pulled; nothing fabricated).`,
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
      const app = loadOAuthAppCredentials("box");
      if (!app?.clientId || !app?.clientSecret) {
        throw new BoxImportSourceError(
          "Box access token expired and OAUTH_BOX_CLIENT_ID/SECRET are not configured — cannot refresh (0 rows pulled).",
        );
      }
      if (!refreshToken) {
        throw new BoxImportSourceError(
          "Box access token expired and this connection has no refresh token — the client must re-authorise their own Box account (0 rows pulled; nothing fabricated).",
        );
      }
      try {
        // Box's OAuth config uses the standard clientId/clientSecret keys
        // (client.ts authConfig).
        const cfg = { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: boxRedirectUri() };
        const refreshed = await refreshBoxToken(cfg, refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
      } catch (e) {
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        throw new BoxImportSourceError(`Box token refresh failed${status ? ` (HTTP ${status})` : ""} — 0 rows pulled.`, status);
      }
    }
    // 3. Bounded read-only snapshot: ONE listFolder("0") call (GET /folders/0
    //    /items — page 1 only; Box pages at 1000/request; paging is a
    //    follow-up slice), then entries sliced to MAX_PAGE_SIZE and
    //    MAX_STAGING_ROWS below (belt and braces).
    const client = createBoxClient({
      accessToken,
      refreshToken,
      expiresAt,
      scope: cred.scope,
      clientId: process.env.OAUTH_BOX_CLIENT_ID,
      clientSecret: process.env.OAUTH_BOX_CLIENT_SECRET,
      redirectUri: boxRedirectUri(),
    });
    const rows: Record<string, unknown>[] = [];
    let skippedNested = 0;
    try {
      const raw = await client.listFolder("0");
      const entries = Array.isArray(raw?.entries) ? (raw.entries as unknown[]).slice(0, MAX_PAGE_SIZE) : [];
      for (const e of entries) {
        const flat = flattenEntry((e as Record<string, unknown> | undefined) ?? {});
        if (Object.keys(flat).length === 0) skippedNested += 1;
        else rows.push(flat);
      }
    } catch (e) {
      const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : undefined;
      throw new BoxImportSourceError(
        `Box read failed${status ? ` (HTTP ${status})` : ""}: ${e instanceof Error ? e.message : String(e)} — 0 rows pulled; nothing fabricated.`,
        status,
      );
    }
    // 4. Bound total rows + bytes (belt and braces on top of the gate caps).
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new BoxImportSourceError("Box snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const fileCount = sliced.filter((r) => r.kind === "file").length;
    const folderCount = sliced.filter((r) => r.kind === "folder").length;
    const noteParts = [
      "Box HTTP 200",
      `${fileCount} file(s), ${folderCount} folder(s) listed (root folder, page 1)`,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "file metadata only — file contents are NOT downloaded by this lane",
      "0 fabricated",
    ];
    if (skippedNested > 0) noteParts.push(`${skippedNested} item(s) with no mapped scalar fields skipped (nested-only payloads)`);
    return { rows: sliced, note: noteParts.join("; "), httpStatus: 200 };
  };
}

/** Register the Box lane in the import source registry (idempotent).
 *  Called by prod-server at boot and by tests. One-shot/client-initiated
 *  re-runs only — no webhooks, no write-back, no re-authorisation program
 *  (owner 10-20). */
export function registerBoxImportSource(deps: BoxImportSourceDeps = {}): void {
  registerImportSource("box", makeBoxImportSourceReader(deps));
}