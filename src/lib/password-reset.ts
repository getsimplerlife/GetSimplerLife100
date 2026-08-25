/**
 * password-reset.ts — proof-of-ownership OTP logic for password resets.
 *
 * Closes the owner-flagged security gap (08-25): `/api/set-password` used to
 * let anyone overwrite ANY account's password with just an email address — no
 * proof of control. An attacker who knew a victim's email could take over the
 * account (including admin).
 *
 * This module owns the OTP algorithm so both the server (prod-server.ts) and
 * the test suite share ONE canonical implementation (no drift, and tests can
 * seed store records with the same hashing the server verifies).
 *
 * Security properties enforced here:
 *   - Code is never stored in plaintext — only its SHA-256 hash (secret-salted).
 *   - Short TTL (10 minutes).
 *   - Single-use: a successful (or exhausted) code is marked `used` and can
 *     never be replayed.
 *   - Rate-limited: a fixed max number of codes per email per rolling window.
 *   - Brute-force guarded: a fixed max number of verification attempts per
 *     code before it is burnt.
 *   - Constant-time comparison of the stored hash vs the presented code.
 *
 * The module is intentionally file-store-agnostic: callers read/write the
 * store object (`Record<email, PasswordResetRecord>`) via their own durable
 * JSON store. Correctness is pure — easy to unit test and to seed in tests.
 */
import { createHash, randomInt, timingSafeEqual } from "crypto";

/** One-time reset code lifetime (ms). */
export const RESET_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** Rolling rate-limit window (ms). */
export const RESET_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
/** Max codes sent per email per window (abuse/spam guard). */
export const MAX_RESET_SENDS_PER_WINDOW = 3;
/** Max verification attempts before a code is burnt. */
export const MAX_RESET_VERIFY_ATTEMPTS = 5;

/**
 * Per-email stored reset record. `hash` is SHA-256 of the secret-salted code,
 * NEVER the plaintext code. `used` enforces single-use. `attempts` enforces
 * the brute-force cap. `sendCount` / `windowStart` enforce the send rate limit.
 */
export interface PasswordResetRecord {
  hash: string;
  expiresAt: number;
  createdAt: number;
  used: boolean;
  attempts: number;
  sendCount: number;
  windowStart: number;
}

/**
 * Secret salt for the code hash. A per-deployment override is allowed, but the
 * default is stable so tests reproducing the hash (and the standalone durable
 * store) match the server when no override is set. This is NOT the thing that
 * protects a code (a 6-digit code is brute-forced, not rainbow-tabled) — the
 * brute-force cap + TTL + rate-limit are the real protections. The salt just
 * keeps the stored value from being a bare digest of the code.
 */
const RESET_OTP_SECRET =
  process.env.RESET_OTP_SECRET || "simpler-life-100-password-reset-otp";

/** Hash a plaintext reset code for at-rest storage. */
export function hashResetCode(code: string): string {
  return createHash("sha256").update(`${RESET_OTP_SECRET}:${code}`).digest("hex");
}

/** Generate a cryptographically-random 6-digit code (CSPRNG). */
export function generateResetCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Constant-time compare of two hex digests. */
function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Returns true if `email` is currently over its send rate limit. */
export function isPasswordResetRateLimited(
  prev: PasswordResetRecord | undefined,
  now: number
): boolean {
  if (!prev) return false;
  if (now - prev.windowStart >= RESET_RATE_WINDOW_MS) return false;
  return prev.sendCount >= MAX_RESET_SENDS_PER_WINDOW;
}

/**
 * Build a fresh reset record for a newly issued code, carrying forward the
 * rate-limit window/count when the previous record is still inside its window.
 */
export function newPasswordResetRecord(
  code: string,
  now: number,
  prev?: PasswordResetRecord
): PasswordResetRecord {
  const inWindow = prev && now - prev.windowStart < RESET_RATE_WINDOW_MS;
  return {
    hash: hashResetCode(code),
    expiresAt: now + RESET_CODE_TTL_MS,
    createdAt: now,
    used: false,
    attempts: 0,
    sendCount: inWindow ? (prev!.sendCount + 1) : 1,
    windowStart: inWindow ? prev!.windowStart : now,
  };
}

export type ResetVerifyStatus =
  | "ok"
  | "missing" // no record
  | "burnt" // already used or attempts exhausted
  | "expired" // past TTL
  | "wrong"; // hash mismatch

/**
 * Verify a presented code against its stored record. Returns a status; the
 * caller is responsible for incrementing `attempts` / burning the record on a
 * non-`ok` result (kept here so both server and tests share the same rules).
 */
export function verifyPasswordReset(
  rec: PasswordResetRecord | undefined,
  code: string,
  now: number
): ResetVerifyStatus {
  if (!rec) return "missing";
  if (rec.used) return "burnt";
  if (now > rec.expiresAt) return "expired";
  if (rec.attempts >= MAX_RESET_VERIFY_ATTEMPTS) return "burnt";
  const a = Buffer.from(String(rec.hash), "utf8");
  const b = Buffer.from(hashResetCode(String(code)), "utf8");
  if (!safeEqual(a, b)) return "wrong";
  return "ok";
}
