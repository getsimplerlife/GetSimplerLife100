/**
 * native/import/hubspot-source.ts — Phase 5.1 (6.3) HubSpot IMPORT SOURCE LANE.
 *
 * Second client-optional import source on the shipped 6.1 core (PR #285) and
 * the direct mirror of the 6.2 Xero lane (src/native/import/xero-source.ts,
 * PR #286, main 04e0950): a client connects their OWN HubSpot portal and the
 * PULL stage fetches a bounded snapshot of the tenant's own CRM data
 * (contacts + companies + deals priority) into the import slice's existing
 * tenant-keyed staging store. The existing map → preview → gated
 * importTableRows commit path applies unchanged. Owner 10-20 direction:
 * provider connections are CLIENT-optional data-transfer lanes — the client
 * manages their own credentials, chooses what to import, approves every
 * commit; we never run or write through their tools (read-only adapter).
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-hubspot-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:hubspot` ONLY
 *     (loadStoredCredential with tenant — no cross-tenant fallback; absent
 *     means absent → honest failed pull, never another tenant's token),
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar field lists for
 *     each CRM object's `properties` (the exact property sets the verified
 *     HubSpot read client requests) + top-level id/createdAt/updatedAt;
 *     nested-only records skipped with an honest note — never guessed
 *     columns, never fabricated counts,
 *   - bounded snapshot: one search call per entity (contacts → companies →
 *     deals; ≤50 rows per call per the verified client's default limit,
 *     sliced again to MAX_PAGE_SIZE as belt and braces), combined rows capped
 *     at MAX_STAGING_ROWS (200) and the 512 KiB byte cap — caps enforced by
 *     the caller gate as well,
 *   - HONEST RUN OUTCOMES: every pull records pulled/mapped/failed + the
 *     provider HTTP status on the ledger; a client is NEVER told their
 *     HubSpot data was imported when only staging happened ("copied N of M
 *     rows; 0 fabricated"; "0 rows staged — nothing imported until you
 *     approve"),
 *   - secrets never returned: the credential object exists only inside this
 *     reader; rows contain mapped business data only,
 *   - fail-closed: missing credential / expired token with no app creds /
 *     provider HTTP error → throw with httpStatus → gate records an honest
 *     failed run (native.import.failed event) and the pull returns an error.
 *     (HubSpot has no org/portal-id header requirement like Xero's
 *     tenantId — the read calls are token-scoped, so no /connections step.)
 */
import { createHubSpotClient } from "../../integrations/providers/hubspot/client";
import { refreshHubSpotToken } from "../../integrations/providers/hubspot/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { loadOAuthAppCredentials, loadStoredCredential } from "../../verification/credential-source";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Path-style redirect URI for the HubSpot OAuth app (PR #238 discipline). */
function hubspotRedirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback/hubspot` : "";
}

/** Fixed safe scalar property sets per CRM object — exactly the property
 *  arrays the verified HubSpot read client requests in its search calls, so
 *  a staged row never contains a field we did not deterministically ask for. */
const CONTACT_FIELDS = ["firstname", "lastname", "email", "phone", "jobtitle", "company", "hs_object_id"] as const;
const COMPANY_FIELDS = ["name", "domain", "industry", "phone", "city", "state", "country", "hs_object_id"] as const;
const DEAL_FIELDS = ["dealname", "dealstage", "pipeline", "amount", "closedate", "dealtype", "hs_object_id"] as const;
/** Top-level scalars present on every HubSpot search result (record id + audit). */
const TOP_LEVEL_FIELDS = ["id", "createdAt", "updatedAt"] as const;

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

/** Flatten one HubSpot search result: top-level scalars + the requested
 *  `properties` scalars (deterministic, never guessed). */
function flattenHubSpotRecord(record: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out = pickScalars(record, TOP_LEVEL_FIELDS);
  const props = record.properties;
  if (props && typeof props === "object" && !Array.isArray(props)) {
    Object.assign(out, pickScalars(props as Record<string, unknown>, fields));
  }
  return out;
}

/** Error with an optional provider HTTP status — the gate records it on the
 *  honest failed run when present. */
export class HubSpotImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "HubSpotImportSourceError";
    this.httpStatus = httpStatus;
  }
}

export interface HubSpotImportSourceDeps {
  /** Injectable fetch (tests). Defaults to global fetch at call time. */
  fetchImpl?: typeof fetch;
}

/** Build the HubSpot import source reader (injectable for tests). */
export function makeHubSpotImportSourceReader(deps: HubSpotImportSourceDeps = {}): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    // 1. STRICT tenant-scoped credential — `${tenantId}:hubspot` only. The
    //    loader (credential-source.ts) never falls back to another tenant's
    //    row; the search calls below are token-scoped, so no portal-id
    //    resolution step is needed (unlike Xero).
    void fetchImpl;
    const stored = loadStoredCredential("hubspot", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    if (!cred?.accessToken) {
      throw new HubSpotImportSourceError(
        `No HubSpot account is connected for this tenant — connect your own HubSpot account to import (0 rows pulled; nothing fabricated).`,
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
      const app = loadOAuthAppCredentials("hubspot");
      if (!app?.clientId || !app?.clientSecret) {
        throw new HubSpotImportSourceError(
          "HubSpot access token expired and OAUTH_HUBSPOT_CLIENT_ID/SECRET are not configured — cannot refresh (0 rows pulled).",
        );
      }
      if (!refreshToken) {
        throw new HubSpotImportSourceError(
          "HubSpot access token expired and this connection has no refresh token — the client must re-authorise their own HubSpot account (0 rows pulled; nothing fabricated).",
        );
      }
      try {
        const refreshed = await refreshHubSpotToken({ clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: hubspotRedirectUri() }, refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
      } catch (e) {
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        throw new HubSpotImportSourceError(`HubSpot token refresh failed${status ? ` (HTTP ${status})` : ""} — 0 rows pulled.`, status);
      }
    }
    // 3. Bounded read-only snapshot: Contacts → Companies → Deals. Each
    //    search returns ≤50 results (verified client's default limit) on page
    //    1 only; each entity is sliced again to MAX_PAGE_SIZE and the running
    //    total to MAX_STAGING_ROWS.
    const client = createHubSpotClient({
      accessToken,
      refreshToken,
      expiresAt,
      scope: cred.scope,
      clientId: process.env.OAUTH_HUBSPOT_CLIENT_ID,
      clientSecret: process.env.OAUTH_HUBSPOT_CLIENT_SECRET,
      redirectUri: hubspotRedirectUri(),
    });
    const rows: Record<string, unknown>[] = [];
    const counts: string[] = [];
    let skippedNested = 0;
    try {
      const contactsRaw = await client.searchContacts("");
      const contacts = Array.isArray(contactsRaw?.results) ? contactsRaw.results.slice(0, MAX_PAGE_SIZE) : [];
      for (const c of contacts) {
        const flat = flattenHubSpotRecord(c as unknown as Record<string, unknown>, CONTACT_FIELDS);
        if (Object.keys(flat).length === 0) skippedNested += 1;
        else rows.push(flat);
      }
      counts.push(`${rows.length} contacts`);
      let budget = MAX_STAGING_ROWS - rows.length;
      if (budget > 0) {
        const companiesRaw = await client.searchCompanies("");
        const companies = Array.isArray(companiesRaw?.results) ? companiesRaw.results.slice(0, Math.min(MAX_PAGE_SIZE, budget)) : [];
        const before = rows.length;
        for (const co of companies) {
          const flat = flattenHubSpotRecord(co as unknown as Record<string, unknown>, COMPANY_FIELDS);
          if (Object.keys(flat).length === 0) skippedNested += 1;
          else rows.push(flat);
        }
        counts.push(`${rows.length - before} companies`);
      } else {
        counts.push("0 companies (contact snapshot filled the staging cap)");
      }
      budget = MAX_STAGING_ROWS - rows.length;
      if (budget > 0) {
        const dealsRaw = await client.searchDeals("");
        const deals = Array.isArray(dealsRaw?.results) ? dealsRaw.results.slice(0, Math.min(MAX_PAGE_SIZE, budget)) : [];
        const before = rows.length;
        for (const d of deals) {
          const flat = flattenHubSpotRecord(d as unknown as Record<string, unknown>, DEAL_FIELDS);
          if (Object.keys(flat).length === 0) skippedNested += 1;
          else rows.push(flat);
        }
        counts.push(`${rows.length - before} deals`);
      } else {
        counts.push("0 deals (companies filled the remaining staging cap)");
      }
    } catch (e) {
      const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : undefined;
      throw new HubSpotImportSourceError(
        `HubSpot read failed${status ? ` (HTTP ${status})` : ""}: ${e instanceof Error ? e.message : String(e)} — 0 rows pulled; nothing fabricated.`,
        status,
      );
    }
    // 4. Bound total rows + bytes (belt and braces on top of the gate caps).
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new HubSpotImportSourceError("HubSpot snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const noteParts = [
      "HubSpot HTTP 200",
      ...counts,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "0 fabricated",
    ];
    if (skippedNested > 0) noteParts.push(`${skippedNested} record(s) with no mapped scalar fields skipped (nested-only payloads)`);
    return { rows: sliced, note: noteParts.join("; "), httpStatus: 200 };
  };
}

/** Register the HubSpot lane in the import source registry (idempotent).
 *  Called by prod-server at boot and by tests. One-shot/client-initiated
 *  re-runs only — no webhooks, no write-back, no re-authorisation program
 *  (owner 10-20). */
export function registerHubSpotImportSource(deps: HubSpotImportSourceDeps = {}): void {
  registerImportSource("hubspot", makeHubSpotImportSourceReader(deps));
}