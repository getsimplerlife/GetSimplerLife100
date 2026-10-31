/**
 * SLICE 154 — the session signing key is REQUIRED. There is no fallback.
 *
 * Before this, `src/db/auth.ts` read `process.env.JWT_SECRET || "<a string
 * published in this repo>"`. Anyone who knew that string and a real user id
 * could mint a token that `verifySessionToken` accepted — and that guard sits
 * in front of the admin credential routes (`/api/admin/credentials*`), which
 * read, write and delete provider API keys. The string is gone from the source.
 *
 * The rule is now: a missing or too-short key is a *startup* failure, not a
 * runtime surprise. `src/db/auth.ts` throws while its module is evaluated, so
 * every entry point that can sign or verify a session — `prod-server.ts` and
 * the dev server — refuses to come up without a real key instead of serving a
 * site whose logins are signed with a key an attacker already has.
 *
 * What this module deliberately does NOT do:
 *   - it never logs the key, or any prefix/suffix/length-derived value;
 *   - it never supplies a default — `jwtKeyPresent()` reports the state, it
 *     does not paper over it;
 *   - it does not change the token payload, expiry, algorithm or cookie name.
 *     The key itself is unchanged, so existing sessions stay valid.
 */

/** Minimum length. 32 chars of a random secret is the floor, not a target. */
export const MIN_JWT_SECRET_LENGTH = 32;

const REMEDY = `set JWT_SECRET to a random string of at least ${MIN_JWT_SECRET_LENGTH} characters (e.g. \`openssl rand -base64 48\`) in the environment before starting`;

/**
 * Returns a one-line, operator-readable error describing why `secret` cannot
 * be used as the session signing key, or `null` when it is acceptable.
 *
 * The message names the variable and says exactly what to set, because the
 * only reader of it is someone looking at a log with no other context.
 */
export function jwtKeyProblem(secret: string | undefined | null): string | null {
  if (!secret) {
    return `FATAL: JWT_SECRET is missing — ${REMEDY}. The server will not start: without it, sessions cannot be signed or verified.`;
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    return `FATAL: JWT_SECRET is too short (${secret.length} characters, ${MIN_JWT_SECRET_LENGTH} required) — ${REMEDY}. The server will not start.`;
  }
  return null;
}

/**
 * The validated signing key, or a throw. Callers that want the bytes pass the
 * result through a TextEncoder; callers that want a boot-time gate call this
 * and let it propagate.
 */
export function readJwtSecret(secret: string | undefined = process.env.JWT_SECRET): string {
  const problem = jwtKeyProblem(secret);
  if (problem) throw new Error(problem);
  return secret as string;
}

/**
 * Boot gate. Throws the one-line message above when the key is unusable.
 * Exported so `prod-server.ts` can run it as its first statement and print a
 * message with no stack noise.
 */
export function requireJwtKey(): void {
  readJwtSecret();
}

/**
 * Non-secret observability for `/api/health`: is a usable key present?
 *
 * In a running server this is always `true` — the process could not have
 * started otherwise, which is the whole point. It is computed rather than
 * hard-coded so the endpoint tells the truth if the environment ever changes
 * under a live process. The key, its length and any digest of it never leave
 * this module.
 */
export function jwtKeyPresent(): boolean {
  return jwtKeyProblem(process.env.JWT_SECRET) === null;
}
