import { hash, compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { readJwtSecret } from "../lib/jwt-key";

/**
 * SLICE 154 — no fallback key.
 *
 * This used to be `process.env.JWT_SECRET || "<a string published in this
 * repo>"`. The fallback is gone: `readJwtSecret()` throws a one-line error, so
 * a process with no usable key cannot get far enough to sign or verify a
 * session. See `src/lib/jwt-key.ts`.
 *
 * SLICE 166 — the key is read LAZILY, on first use, not while this module is
 * evaluated. This module is reachable from the browser bundle: `entry-client`
 * → `routeTree.gen` → every route file, and five routes import `db/queries`,
 * which imports this file. Reading the key at module scope therefore ran
 * `process.env.JWT_SECRET` (inside `readJwtSecret`) in a browser, where
 * `process` does not exist, and threw `ReferenceError: process is not defined`
 * while the client graph was being evaluated — before React had mounted, so
 * every route rendered blank in the dev/preview environment. The read belongs
 * where the key is actually used: on the server, at sign/verify time.
 *
 * Fail-closed is unchanged, and it is unchanged in two independent places:
 *   1. the boot gate (`vite.config.ts` and `prod-server.ts` call
 *      `requireJwtKey()`) still refuses to bring up a keyless process;
 *   2. the first `createSessionToken` / `verifySessionToken` in a keyless
 *      process still throws the same `FATAL: JWT_SECRET is missing …` error.
 * The key is cached after the first successful read, so a live process signs
 * every token with one key, and nothing here ever supplies a default.
 *
 * Nothing else about the token changes — same payload (`{ userId }`), same
 * HS256, same 2h expiry, same cookie. Only the source of the key, when it is
 * read, and what happens when it is absent.
 */
let _signingKey: Uint8Array | null = null;

function signingKey(): Uint8Array {
  if (!_signingKey) _signingKey = new TextEncoder().encode(readJwtSecret());
  return _signingKey;
}

export async function hashPassword(password: string) {
  return hash(password, 10);
}
export async function verifyPassword(password: string, hashed: string) {
  return compare(password, hashed);
}
export async function createSessionToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(signingKey());
}
export async function verifySessionToken(token: string) {
  // Read the key OUTSIDE the try: a keyless process must fail loudly here, not
  // answer "this token is not valid" for every token it is ever shown. Only a
  // genuine verification failure (bad signature, expired, malformed) is null.
  const key = signingKey();
  try {
    const { payload } = await jwtVerify(token, key);
    return payload.userId as string;
  } catch (_err) {
    return null;
  }
}
