import { hash, compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { readJwtSecret } from "../lib/jwt-key";

/**
 * SLICE 154 — no fallback key.
 *
 * This used to be `process.env.JWT_SECRET || "<a string published in this
 * repo>"`. The fallback is gone: `readJwtSecret()` throws a one-line error
 * while this module is evaluated, so a process with no usable key cannot get
 * far enough to sign or verify a session. See `src/lib/jwt-key.ts`.
 *
 * Nothing else about the token changes — same payload (`{ userId }`), same
 * HS256, same 2h expiry, same cookie. Only the source of the key, and what
 * happens when it is absent.
 */
const JWT_SECRET = new TextEncoder().encode(readJwtSecret());

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
    .sign(JWT_SECRET);
}
export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.userId as string;
  } catch (_err) {
    return null;
  }
}
