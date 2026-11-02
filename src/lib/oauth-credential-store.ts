/**
 * oauth-credential-store.ts — the ONE home for `tenant_oauth_credentials.json`
 * at-rest encryption (SLICE 177).
 *
 * WHY THIS EXISTS
 * ---------------
 * `tenant_oauth_credentials.json` is a single JSON object with two kinds of row:
 *
 *   1. Per-provider OAuth **app** credentials, keyed by the bare provider id
 *      (`xero`, `hubspot`, …) — `{ clientId, clientSecret }`, entered on
 *      Admin → OAuth Settings and read back to drive every OAuth exchange.
 *   2. Per-tenant **token** rows, keyed `${email}:${provider}` — `{ accessToken,
 *      refreshToken, apiToken, expiresAt, … }`, written by the OAuth callback
 *      and by the token refresher.
 *
 * Both kinds were written to disk in PLAINTEXT: the admin credentials route
 * (`prod-server.ts` PUT `/api/admin/credentials/<provider>`) stored the client
 * secret verbatim, and the OAuth callback stored access/refresh tokens verbatim.
 * The file is mirrored into the durable store and copied off-box by the hourly
 * backup, so a plaintext secret was copied everywhere we keep data. Tenant
 * Stripe keys already went through `integration-crypto`; this store did not.
 *
 * HOW IT WORKS
 * ------------
 * Encryption happens at the data-store BOUNDARY for this one file, not at each
 * of the ~20 call sites that read or write it. `data-store.ts` calls
 * `openCredentialStore` on every read of this basename and `sealCredentialStore`
 * on every write. Consequences, all deliberate:
 *
 *   - Every existing reader keeps working unchanged: it receives the same shape
 *     with the secret fields decrypted in memory.
 *   - Every writer seals automatically, including writers added later — there is
 *     no per-call-site discipline to forget.
 *   - The durable-store mirror (`durableSet`) receives the SEALED document,
 *     because sealing happens before the mirror is written.
 *
 * CRYPTO is `integration-crypto.ts` — the same module (and the same
 * `INTEGRATION_ENCRYPTION_KEY`) the tenant Stripe and transport-secret lanes use.
 * There is no second crypto path and no second key.
 *
 * LEGACY PLAINTEXT (no data loss — owner mandate)
 * ----------------------------------------------
 * A value that is not in the sealed form is returned to the reader AS-IS. A
 * secret stored before this slice therefore stays readable forever, and it is
 * upgraded to ciphertext the first time anything writes the store (connecting
 * the provider again, a token refresh, an admin save). Sealing is idempotent: a value already in
 * the sealed form is never re-encrypted, so a read → modify → write cycle
 * cannot double-encrypt.
 *
 * FAIL CLOSED
 * -----------
 * A WRITE that has a secret to store is refused (`IntegrationKeyError`, naming
 * `INTEGRATION_ENCRYPTION_KEY`) when the key is absent or shorter than 32
 * characters. We never fall back to plaintext. A store with nothing secret in
 * it (e.g. creating an empty `{}`) still writes, so a missing key cannot block
 * unrelated bookkeeping.
 *
 * A READ never throws: a sealed value that cannot be decrypted under the
 * configured key is returned as ciphertext and logged once. The connection is
 * still visibly present (it is), the operator is told why it cannot be used, and
 * a read path can never take the portal down. Callers that are about to USE a
 * secret (the OAuth exchange, a token refresh, a probe) call
 * `openCredentialStore(store, { strict: true })` instead, which throws with the
 * same operator-facing reason so the UI can say it out loud.
 */
import { basename } from "node:path";
import {
  INTEGRATION_KEY_ENV,
  INTEGRATION_KEY_MIN_LENGTH,
  IntegrationKeyError,
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  integrationKeyProblem,
} from "./integration-crypto";

/** Basename of the credential store this module owns. */
export const CREDENTIAL_STORE_BASENAME = "tenant_oauth_credentials.json";

/**
 * Entry fields that hold a secret. Everything else in a row (clientId, email,
 * provider, expiresAt, scope, accountId, …) stays in the clear: it is not a
 * credential, and keeping it readable is what lets an operator diagnose a
 * connection without the key.
 */
export const CREDENTIAL_SECRET_FIELDS = [
  "clientSecret",
  "accessToken",
  "refreshToken",
  "apiToken",
  "idToken",
  "accessTokenSecret",
] as const;

/**
 * The ciphertext shape produced by `encryptIntegrationSecret`:
 * `ivHex:authTagHex:bodyHex` (16-byte IV, 16-byte GCM tag).
 */
const SEALED_SECRET_RE = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]{2,}$/;

let warnedUnreadable = 0;

/** True when `path` is the credential store this module owns. */
export function isCredentialStorePath(path: string): boolean {
  return basename(path) === CREDENTIAL_STORE_BASENAME;
}

/** True when `value` is already in the sealed `iv:tag:body` form. */
export function isSealedSecret(value: unknown): boolean {
  return typeof value === "string" && SEALED_SECRET_RE.test(value);
}

/** The reason a secret cannot be sealed/opened right now, or `null`. */
export function credentialKeyProblem(): string | null {
  return integrationKeyProblem();
}

/** Operator-facing sentence used by the UI and by API error bodies. */
export function credentialKeyProblemSentence(): string {
  const problem = credentialKeyProblem() ?? "unknown";
  return (
    `Integration secrets cannot be stored because ${INTEGRATION_KEY_ENV} is not configured: ${problem}. ` +
    `Set ${INTEGRATION_KEY_ENV} to a random value of at least ${INTEGRATION_KEY_MIN_LENGTH} characters ` +
    `in the deployment secret store, then save the credentials again.`
  );
}

interface SecretSlot {
  rowKey: string;
  field: string;
  value: string;
}

/** Every secret field in `store`, with the row key that holds it. */
function secretSlots(store: unknown): SecretSlot[] {
  const slots: SecretSlot[] = [];
  if (!store || typeof store !== "object" || Array.isArray(store)) return slots;
  for (const [rowKey, row] of Object.entries(store as Record<string, unknown>)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const field of CREDENTIAL_SECRET_FIELDS) {
      const value = (row as Record<string, unknown>)[field];
      if (typeof value === "string" && value.length > 0) {
        slots.push({ rowKey, field, value });
      }
    }
  }
  return slots;
}

/** How many secret fields this store currently holds (sealed or plaintext). */
export function countCredentialSecrets(store: unknown): number {
  return secretSlots(store).length;
}

/** How many secret fields in this store are still PLAINTEXT (legacy). */
export function countPlaintextCredentialSecrets(store: unknown): number {
  return secretSlots(store).filter((s) => !isSealedSecret(s.value)).length;
}

/** True when the store holds at least one sealed secret. */
export function hasSealedSecrets(store: unknown): boolean {
  return secretSlots(store).some((s) => isSealedSecret(s.value));
}

/**
 * Decrypt every sealed secret field in a copy of `store`.
 *
 * `strict: false` (default, used by the data-store read boundary) never throws:
 * an undecryptable sealed value is returned as-is and logged once, so a display
 * page still shows the connection that genuinely exists.
 *
 * `strict: true` throws `IntegrationKeyError` — use it immediately before a
 * secret is actually going to be used (OAuth exchange, token refresh, probe) so
 * the failure is reported to the person who asked, naming the variable.
 */
export function openCredentialStore<T>(store: T, opts: { strict?: boolean } = {}): T {
  const strict = opts.strict === true;
  const sealed = secretSlots(store).filter((s) => isSealedSecret(s.value));
  if (sealed.length === 0) return store;
  const out: any = structuredClone(store);
  let unreadable = 0;
  let lastProblem = "";
  for (const slot of sealed) {
    try {
      out[slot.rowKey][slot.field] = decryptIntegrationSecret(slot.value);
    } catch (error) {
      unreadable += 1;
      lastProblem = error instanceof Error ? error.message : String(error);
      if (strict) throw error;
      // Keep the ciphertext: the row is still there, it just cannot be used.
    }
  }
  if (unreadable > 0 && warnedUnreadable !== unreadable) {
    warnedUnreadable = unreadable;
    console.error(
      `[oauth-credential-store] ${unreadable} sealed credential value(s) in ${CREDENTIAL_STORE_BASENAME} ` +
        `cannot be decrypted with the configured ${INTEGRATION_KEY_ENV}. They stay on disk (nothing was lost); ` +
        `connections that need them will report this until the key is restored or the secret is re-entered. ` +
        `Reason: ${lastProblem}`,
    );
  }
  return out as T;
}

/**
 * Encrypt every plaintext secret field in a copy of `store`, ready to persist.
 *
 * Throws `IntegrationKeyError` (naming the variable) when there is a secret to
 * seal and the key is unusable — the write is refused, no plaintext is stored.
 * Idempotent: already-sealed values are left exactly as they are.
 */
export function sealCredentialStore<T>(store: T): T {
  const plaintext = secretSlots(store).filter((s) => !isSealedSecret(s.value));
  if (plaintext.length === 0) return store;
  const out: any = structuredClone(store);
  for (const slot of plaintext) {
    out[slot.rowKey][slot.field] = encryptIntegrationSecret(slot.value);
  }
  return out as T;
}

/**
 * Seal-on-write for one entry value (used by callers that build a row
 * themselves and merge it into the store). Refuses with `IntegrationKeyError`
 * when the key is unusable.
 */
export function sealCredentialEntry<T extends Record<string, any>>(entry: T): T {
  const wrapped = sealCredentialStore({ __entry: entry } as any);
  return (wrapped as any).__entry;
}

/** Test-only: reset the once-per-process unreadable warning. */
export function resetCredentialStoreWarnings(): void {
  warnedUnreadable = 0;
}

export { IntegrationKeyError };
