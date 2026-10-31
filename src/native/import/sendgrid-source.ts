/**
 * native/import/sendgrid-source.ts — Phase 5.1 (6.5) SENDGRID IMPORT SOURCE
 * LANE (110th publish slice, with google-calendar + slack).
 *
 * CONFIG-METADATA lane (the SFTP-lane pattern, src/native/import/sftp-source.ts)
 * — SendGrid is a send-side email integration in this platform
 * (src/integrations/email.ts: live path is an HTTP POST to /v3/mail/send with
 * the sender's own API key). There is NO verified SendGrid READ adapter and no
 * read client in-tree, so this lane NEVER claims live SendGrid I/O that did not
 * happen: a client connects their OWN SendGrid account (their API key stored
 * under `${tenantId}:sendgrid`) and the PULL stage stages an honest snapshot of
 * the CONNECTION CONFIG METADATA — that a sender is connected and when — with
 * ZERO provider API calls. Email CONTENT transfer is not part of this lane and
 * the ledger says so on every run.
 *
 * Honesty + safety contracts (each enforced here and exercised in
 * src/test/native-import-sendgrid-source.test.ts):
 *   - STRICT tenant-scoped credential lookup `${tenantId}:sendgrid` ONLY —
 *     absent means absent → honest failed pull, never another tenant's key,
 *     ZERO provider API calls,
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar fields
 *     (provider/email/connectedAt) + a derived hasApiKey boolean; the API key
 *     value itself NEVER leaves the credential store and never appears in
 *     rows or ledgers,
 *   - bounded snapshot: ONE config-metadata row (≤ MAX_STAGING_ROWS and the
 *     512 KiB byte cap trivially),
 *   - HONEST RUN OUTCOMES: the note says exactly what was read and what was
 *     not — "no live SendGrid API call was made by this lane — SendGrid is a
 *     send-side integration and this lane never claims email content was
 *     transferred", "0 fabricated", "nothing imported until you approve". No
 *     httpStatus is set: NO provider HTTP call happened (types.ts: absent
 *     when no provider call occurred),
 *   - secrets never returned: the apiKey exists only inside the credential
 *     store; this reader only ever derives hasApiKey,
 *   - fail-closed: absent connection → throw SendgridImportSourceError → the
 *     import gate records an honest FAILED run and the pull returns an error.
 */
import { loadStoredCredential } from "../../verification/credential-source";
import { registerImportSource, type ImportSourceReader } from "./gate";

/** Fixed safe scalar fields from the stored SendGrid connection credential —
 *  never includes the apiKey value. */
const CONNECTION_FIELDS = [
  "provider",
  "email",
  "connectedAt",
] as const;

/** Helper: keep only scalar values (string/number/boolean/null). */
function pickScalars(record: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = record[f];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[f] = v;
  }
  return out;
}

/** Error for the SendGrid lane. No httpStatus is ever set — this lane makes
 *  no provider HTTP call; the gate still records an honest FAILED run. */
export class SendgridImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string) {
    super(message);
    this.name = "SendgridImportSourceError";
  }
}

/** Build the SendGrid import source reader (no deps — this lane performs NO
 *  live network I/O; it reads the tenant's own stored connection credential
 *  metadata). */
export function makeSendgridImportSourceReader(): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    // 1. STRICT tenant-scoped credential — `${tenantId}:sendgrid` only. The
    //    loader (credential-source.ts) never falls back to another tenant's
    //    row; no provider call exists in this lane at all.
    const stored = loadStoredCredential("sendgrid", { tenant: tenantId, dataDir });
    const cred = stored.credential;
    if (!cred || (typeof cred.apiKey !== "string" && typeof cred.accessToken !== "string")) {
      throw new SendgridImportSourceError(
        `No SendGrid account is connected for this tenant — connect your own SendGrid API key to import (0 rows pulled; nothing fabricated).`,
      );
    }
    // 2. Bounded deterministic snapshot of the CONNECTION CONFIG metadata.
    //    The API key value itself is never staged — only hasApiKey.
    const out = pickScalars(cred as unknown as Record<string, unknown>, CONNECTION_FIELDS);
    out.kind = "sendgrid-connection";
    out.hasApiKey = typeof cred.apiKey === "string" && cred.apiKey.length > 0;
    const sliced = [out];
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new SendgridImportSourceError("SendGrid config snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const noteParts = [
      "SendGrid connection config metadata snapshot from the tenant's own stored credential",
      "1 row (sender connection metadata)",
      "1 row staged for review — nothing imported until you approve",
      "no live SendGrid API call was made by this lane — SendGrid is a send-side integration and this lane never claims email content was transferred",
      "0 fabricated",
    ];
    return { rows: sliced, note: noteParts.join("; ") };
  };
}

/** Register the SendGrid lane in the import source registry (idempotent).
 *  Called by prod-server at boot and by tests. One-shot/client-initiated
 *  re-runs only — no webhooks, no write-back, no re-authorisation program
 *  (owner 10-20). */
export function registerSendgridImportSource(): void {
  registerImportSource("sendgrid", makeSendgridImportSourceReader());
}