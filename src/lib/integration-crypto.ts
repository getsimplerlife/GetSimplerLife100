/**
 * integration-crypto.ts — SLICE 173 (defect W6): ONE fail-closed home for the
 * AES-256-GCM key that protects integration secrets at rest (webhook sink and
 * subscription secrets, SFTP credentials, PGP key material, tenant Stripe keys).
 *
 * Before this module, `native/webhooks/store.ts` and `native/transport/store.ts`
 * each did this:
 *
 *     cachedKey = Buffer.from(env.length >= 32 ? env.slice(0, 32)
 *                                              : randomBytes(32).toString("hex").slice(0, 32));
 *
 * With `INTEGRATION_ENCRYPTION_KEY` unset — which was the real state of the
 * running process on this box (length 0) — every secret was encrypted under a
 * key generated fresh in each process, and became permanently unreadable at the
 * next restart. Nothing threw, nothing logged: silent, total data loss.
 *
 * The rules now:
 *   1. No fallback key exists. Absent or shorter than 32 characters → REFUSE,
 *      with an error naming the exact variable and what is wrong.
 *   2. The key is read from the environment on every call (never cached), so a
 *      rotated key takes effect immediately and a stale key is impossible.
 *   3. Nothing is ever written that cannot be read back: a write is refused
 *      before any ciphertext exists.
 *   4. Ciphertext that cannot be decrypted is reported as exactly what it is —
 *      typically a secret written under a throwaway key before the variable was
 *      configured — instead of a bare OpenSSL auth failure.
 *
 * Operator action when this refuses (also stated in the API error): set
 * `INTEGRATION_ENCRYPTION_KEY` to a random string of at least 32 characters in
 * the deployment's secret store, then re-enter any integration secret written
 * while it was missing (those bytes cannot be recovered — the key that
 * encrypted them no longer exists anywhere).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const INTEGRATION_KEY_ENV = "INTEGRATION_ENCRYPTION_KEY";
export const INTEGRATION_KEY_MIN_LENGTH = 32;
export const INTEGRATION_CIPHER = "aes-256-gcm";

/** Thrown whenever an integration secret cannot be encrypted or decrypted safely. */
export class IntegrationKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationKeyError";
  }
}

let warnedMissing = false;

/**
 * `null` when the key is usable, otherwise the exact problem in operator
 * language (always naming the variable).
 */
export function integrationKeyProblem(): string | null {
  const raw = process.env[INTEGRATION_KEY_ENV] ?? "";
  if (raw.length === 0) {
    return `${INTEGRATION_KEY_ENV} is not set (length 0)`;
  }
  if (raw.length < INTEGRATION_KEY_MIN_LENGTH) {
    return `${INTEGRATION_KEY_ENV} is only ${raw.length} characters (it must be at least ${INTEGRATION_KEY_MIN_LENGTH})`;
  }
  return null;
}

/** True when an encrypted secret can be written or read right now. */
export function integrationKeyUsable(): boolean {
  return integrationKeyProblem() === null;
}

function refuse(action: "write" | "read", problem: string): never {
  const message =
    `Refusing to ${action} an encrypted integration secret: ${problem}. ` +
    `Set ${INTEGRATION_KEY_ENV} to a random value of at least ${INTEGRATION_KEY_MIN_LENGTH} characters ` +
    `in the deployment secret store (slice 173 removed the per-process fallback key, because a key that ` +
    `exists only inside one process makes every stored secret unreadable after a restart).`;
  if (!warnedMissing) {
    warnedMissing = true;
    console.error(`[integration-crypto] ${message}`);
  }
  throw new IntegrationKeyError(message);
}

/**
 * The AES key. Same derivation the pre-173 code used when the variable was
 * present (UTF-8 bytes of the first 32 characters), so ciphertext written under
 * a correctly configured key stays readable.
 */
export function requireIntegrationKey(action: "write" | "read"): Buffer {
  const problem = integrationKeyProblem();
  if (problem) refuse(action, problem);
  return Buffer.from((process.env[INTEGRATION_KEY_ENV] ?? "").slice(0, INTEGRATION_KEY_MIN_LENGTH), "utf8");
}

export function encryptIntegrationSecret(plain: string): string {
  const key = requireIntegrationKey("write");
  const iv = randomBytes(16);
  const cipher = createCipheriv(INTEGRATION_CIPHER, key, iv);
  let enc = cipher.update(plain, "utf8", "hex");
  enc += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
}

export function decryptIntegrationSecret(encrypted: string): string {
  const key = requireIntegrationKey("read");
  const [ivHex, tagHex, body] = encrypted.split(":");
  if (!ivHex || !tagHex || !body) throw new IntegrationKeyError("Malformed encrypted secret");
  try {
    const decipher = createDecipheriv(INTEGRATION_CIPHER, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    let out = decipher.update(body, "hex", "utf8");
    out += decipher.final("utf8");
    return out;
  } catch (error) {
    // A GCM auth failure under a key that IS configured almost always means the
    // ciphertext was written under the old per-process throwaway key.
    const message =
      `This encrypted secret cannot be decrypted with the configured ${INTEGRATION_KEY_ENV}. ` +
      `It was most likely written under the per-process throwaway key that older builds used when ` +
      `${INTEGRATION_KEY_ENV} was unset — that key existed only in the process that wrote it and no ` +
      `longer exists, so these bytes are unrecoverable. Re-enter the secret to re-encrypt it under the ` +
      `configured key. (Underlying error: ${error instanceof Error ? error.message : String(error)})`;
    console.error(`[integration-crypto] ${message}`);
    throw new IntegrationKeyError(message);
  }
}
