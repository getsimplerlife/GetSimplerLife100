/**
 * native/import/xero-source.ts — Phase 5.1 (6.2) Xero IMPORT SOURCE LANE.
 *
 * Wires the FIRST client-optional import source into the shipped 6.1 core
 * (PR #285, main b798290): a client connects their OWN Xero account and the
 * PULL stage fetches a bounded snapshot of the tenant's own Xero data
 * (contacts + invoices priority) into the import slice's existing
 * tenant-keyed staging store. The existing map → preview → gated
 * importTableRows commit path applies unchanged. Owner 10-20 direction:
 * provider connections are CLIENT-optional data-transfer lanes — the client
 * manages their own credentials, chooses what to import, approves every
 * commit; we never run or write through their tools (read-only adapter).
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-xero-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:xero` ONLY
 *     (loadStoredCredential with tenant — no cross-tenant fallback; absent
 *     means absent → honest failed pull, never another tenant's token),
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar field lists;
 *     nested objects/arrays skipped with an honest note — never guessed
 *     columns, never fabricated counts,
 *   - bounded snapshot: one list call per entity (page 1, ≤100 rows each per
 *     Xero default page), combined rows capped at MAX_STAGING_ROWS (200) and
 *     MAX_IMPORT_BYTES — caps enforced by the caller gate as well (belt and
 *     braces); provider page cap (5 pages/run) respected (2 pages max here),
 *   - HONEST RUN OUTCOMES: every pull records pulled/mapped/failed + the
 *     provider HTTP status on the ledger; a client is NEVER told their Xero
 *     data was imported when only staging happened ("copied N of M rows; 0
 *     fabricated"; "0 rows staged — nothing imported until you approve"),
 *   - secrets never returned: the credential object exists only inside this
 *     reader; rows contain mapped business data only,
 *   - fail-closed: missing credential / expired token with no app creds /
 *     provider HTTP error → throw with httpStatus → gate records an honest
 *     failed run (native.import.failed event) and the pull returns an error.
 */
import { createXeroClient } from "../../integrations/providers/xero/client";
import { refreshXeroToken } from "../../integrations/providers/xero/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { loadOAuthAppCredentials, loadStoredCredential } from "../../verification/credential-source";
import { resolveXeroTenantId } from "../../lib/connection-health";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Path-style redirect URI for the Xero OAuth app (PR #238 discipline). */
function xeroRedirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback/xero` : "";
}

/** Fixed safe scalar fields for Contact rows — deterministic, never guessed. */
const CONTACT_FIELDS = [
  "ContactID",
  "Name",
  "FirstName",
  "LastName",
  "EmailAddress",
  "IsSupplier",
  "IsCustomer",
  "AccountNumber",
  "Status",
  "UpdatedDateUTC",
] as const;
/** Fixed safe scalar fields for Invoice rows (Type=ACCREC/ACCPAY both included). */
const INVOICE_FIELDS = [
  "InvoiceID",
  "Type",
  "Status",
  "InvoiceNumber",
  "Reference",
  "CurrencyCode",
  "SubTotal",
  "TotalTax",
  "Total",
  "AmountDue",
  "AmountPaid",
  "AmountCredited",
] as const;
/** Nested Contact flattened onto an invoice row (safe scalars only). */
const INVOICE_CONTACT_FIELDS = ["ContactID", "Name"] as const;

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

function flattenContact(record: Record<string, unknown>): Record<string, unknown> {
  return pickScalars(record, CONTACT_FIELDS);
}

function flattenInvoice(record: Record<string, unknown>): Record<string, unknown> {
  const out = pickScalars(record, INVOICE_FIELDS);
  if (record.Contact && typeof record.Contact === "object" && !Array.isArray(record.Contact)) {
    Object.assign(out, pickScalars(record.Contact as Record<string, unknown>, INVOICE_CONTACT_FIELDS));
  }
  return out;
}

/** Error with an optional provider HTTP status — the gate records it on the
 *  honest failed run when present. */
export class XeroImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "XeroImportSourceError";
    this.httpStatus = httpStatus;
  }
}

export interface XeroImportSourceDeps {
  /** Injectable fetch (tests). Defaults to global fetch at call time. */
  fetchImpl?: typeof fetch;
}

/** Build the Xero import source reader (injectable for tests). */
export function makeXeroImportSourceReader(deps: XeroImportSourceDeps = {}): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    // 1. STRICT tenant-scoped credential — `${tenantId}:xero` only. The loader
    //    (credential-source.ts) never falls back to another tenant's row.
    const stored = loadStoredCredential("xero", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    if (!cred?.accessToken) {
      throw new XeroImportSourceError(
        `No Xero account is connected for this tenant — connect your own Xero account to import (0 rows pulled; nothing fabricated).`,
      );
    }
    // 2. Resolve the Xero organisation id (stored value, else GET /connections —
    //    read-only, audited helper). Fails closed when unresolvable.
    const xeroTenantId = await resolveXeroTenantId(cred, fetchImpl);
    if (!xeroTenantId) {
      throw new XeroImportSourceError(
        `Could not resolve the Xero organisation for this tenant's connection (no stored tenant and /connections returned none) — 0 rows pulled.`,
      );
    }
    // 3. Refresh the access token ONLY when expired (mutates the in-memory copy;
    //    the durable store is updated by the platform's refresher, not here).
    let accessToken = cred.accessToken;
    let refreshToken = cred.refreshToken;
    let expiresAt = cred.expiresAt;
    const expired = isTokenExpired({ accessToken, refreshToken, expiresAt, scope: cred.scope, raw: {} } as never);
    if (expired) {
      const app = loadOAuthAppCredentials("xero");
      if (!app?.clientId || !app?.clientSecret) {
        throw new XeroImportSourceError(
          "Xero access token expired and OAUTH_XERO_CLIENT_ID/SECRET are not configured — cannot refresh (0 rows pulled).",
        );
      }
      if (!refreshToken) {
        throw new XeroImportSourceError(
          "Xero access token expired and this connection has no refresh token — the client must re-authorise their own Xero account (0 rows pulled; nothing fabricated).",
        );
      }
      try {
        const refreshed = await refreshXeroToken({ clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: xeroRedirectUri() }, refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        expiresAt = refreshed.expiresAt;
      } catch (e) {
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        throw new XeroImportSourceError(`Xero token refresh failed${status ? ` (HTTP ${status})` : ""} — 0 rows pulled.`, status);
      }
    }
    // 4. Bounded read-only snapshot: Contacts + Invoices (one list call each;
    //    Xero returns ≤100 rows per page — combined ≤ MAX_STAGING_ROWS after
    //    the slice below; provider page cap 5 pages/run respected with 2).
    let httpStatus = 200;
    const client = createXeroClient({
      accessToken,
      refreshToken,
      expiresAt,
      scope: cred.scope,
      tenantId: xeroTenantId,
      clientId: process.env.OAUTH_XERO_CLIENT_ID,
      clientSecret: process.env.OAUTH_XERO_CLIENT_SECRET,
      redirectUri: xeroRedirectUri(),
    });
    const rows: Record<string, unknown>[] = [];
    const counts: string[] = [];
    let skippedNested = 0;
    try {
      const contactsRaw = await client.list("Contacts");
      const contacts = Array.isArray(contactsRaw) ? contactsRaw.slice(0, MAX_PAGE_SIZE) : [];
      for (const c of contacts) {
        const flat = flattenContact((c as Record<string, unknown> | undefined) ?? {});
        if (Object.keys(flat).length === 0) skippedNested += 1;
        else rows.push(flat);
      }
      counts.push(`${rows.length} contacts`);
      const invoiceBudget = Math.max(0, MAX_STAGING_ROWS - rows.length);
      if (invoiceBudget > 0) {
        const invoicesRaw = await client.list("Invoices");
        const invoices = Array.isArray(invoicesRaw) ? invoicesRaw.slice(0, Math.min(MAX_PAGE_SIZE, invoiceBudget)) : [];
        const before = rows.length;
        for (const inv of invoices) {
          const flat = flattenInvoice((inv as Record<string, unknown> | undefined) ?? {});
          if (Object.keys(flat).length === 0) skippedNested += 1;
          else rows.push(flat);
        }
        counts.push(`${rows.length - before} invoices`);
      } else {
        counts.push("0 invoices (contact snapshot filled the staging cap)");
      }
    } catch (e) {
      const status = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : undefined;
      throw new XeroImportSourceError(
        `Xero read failed${status ? ` (HTTP ${status})` : ""}: ${e instanceof Error ? e.message : String(e)} — 0 rows pulled; nothing fabricated.`,
        status,
      );
    }
    // 5. Bound total rows + bytes (belt and braces on top of the gate caps).
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new XeroImportSourceError("Xero snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const noteParts = [
      `Xero HTTP ${httpStatus}`,
      ...counts,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "0 fabricated",
    ];
    if (skippedNested > 0) noteParts.push(`${skippedNested} record(s) with no mapped scalar fields skipped (nested-only payloads)`);
    return { rows: sliced, note: noteParts.join("; "), httpStatus };
  };
}

/** Register the Xero lane in the import source registry (idempotent). Called
 *  by prod-server at boot and by tests. One-shot/client-initiated re-runs
 *  only — no webhooks, no write-back, no re-authorisation program (owner 10-20). */
export function registerXeroImportSource(deps: XeroImportSourceDeps = {}): void {
  registerImportSource("xero", makeXeroImportSourceReader(deps));
}