import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { hash } from "bcryptjs";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";
import {
  generateResetCode,
  hashResetCode,
  newPasswordResetRecord,
  verifyPasswordReset,
  isPasswordResetRateLimited,
  RESET_CODE_TTL_MS,
  RESET_RATE_WINDOW_MS,
  MAX_RESET_SENDS_PER_WINDOW,
  MAX_RESET_VERIFY_ATTEMPTS,
} from "../lib/password-reset";

/**
 * password-reset.test.ts — closes the owner-flagged security gap (08-25):
 * password changes/resets must require PROOF of ownership (email OTP), never a
 * bare email. Covers:
 *   - the OTP library invariants (hash-at-rest, TTL, single-use, rate limit,
 *     brute-force cap) via direct unit tests;
 *   - the full wired HTTP flow against the self-hosted test server:
 *     reset without code rejected, wrong/expired/reused code rejected, correct
 *     code allows reset (and login succeeds after), rate limit kicks in, the
 *     owner's existing password keeps working.

 * The self-hosted test server has no SENDGRID_API_KEY, so sendEmailSMTP fails
 * closed (no real email) — the request-reset endpoint still issues + stores the
 * hashed code, which is all the server-side flow needs. Integration tests seed
 * reset records with the SAME hashing function the server verifies (shared
 * lib), so a known code can be exercised end-to-end.
 */
const TEST_DATA_DIR = testDataDir();
const USERS_FILE = join(TEST_DATA_DIR, "users.json");
const RESETS_FILE = join(TEST_DATA_DIR, "password_resets.json");
const BASE_URL = testBaseUrl();

const TS = Date.now();
const USER_EMAIL = "reset-user-" + TS + "@test.example";
const USER_PASSWORD = "original-pass-123";
const NEW_PASSWORD = "brand-new-pass-456";
const OWNER_EMAIL = "mathewortiz97@gmail.com";
const OWNER_PASSWORD = "Mdsl1234";

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}
async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}
async function login(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.status;
}
/** Seed a bcrypt-hashed user. */
async function seedUser(email: string, password: string, role = "user") {
  const users = readJSONFile(USERS_FILE);
  users[email] = { email, password: await hash(password, 4), role, createdAt: Date.now() };
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
/** Seed a valid (unused, unexpired) reset record for an email with a known code. */
function seedReset(email: string, code: string, opts?: { expiresAt?: number; used?: boolean; attempts?: number }) {
  const resets = readJSONFile(RESETS_FILE);
  const rec = newPasswordResetRecord(code, Date.now());
  if (opts?.expiresAt !== undefined) rec.expiresAt = opts.expiresAt;
  if (opts?.used) rec.used = true;
  if (opts?.attempts !== undefined) rec.attempts = opts.attempts;
  resets[email] = rec;
  writeFileSync(RESETS_FILE, JSON.stringify(resets, null, 2));
}
function cleanup() {
  for (const path of [USERS_FILE, RESETS_FILE]) {
    if (!existsSync(path)) continue;
    const data = readJSONFile(path);
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    let changed = false;
    for (const k of Object.keys(data)) {
      if (k === USER_EMAIL || k === OWNER_EMAIL) { delete data[k]; changed = true; }
    }
    if (changed) writeFileSync(path, JSON.stringify(data, null, 2));
  }
}

beforeAll(async () => {
  await ensureTestServer();
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  cleanup();
  await seedUser(USER_EMAIL, USER_PASSWORD);
  await seedUser(OWNER_EMAIL, OWNER_PASSWORD, "admin");
});
afterAll(cleanup);

describe("password-reset OTP library invariants", () => {
  it("stores only a hash — never the plaintext code", () => {
    const code = "654321";
    const h = hashResetCode(code);
    expect(h).not.toContain(code);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it("generates 6-digit numeric codes", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateResetCode();
      expect(c).toMatch(/^\d{6}$/);
    }
  });
  it("a fresh record has a TTL and is not yet used", () => {
    const now = Date.now();
    const rec = newPasswordResetRecord("123456", now);
    expect(rec.expiresAt - now).toBe(RESET_CODE_TTL_MS);
    expect(rec.used).toBe(false);
    expect(rec.attempts).toBe(0);
  });
  it("verifies a correct code as ok, wrong/missing/expired/used as not ok", () => {
    const now = Date.now();
    const rec = newPasswordResetRecord("123456", now);
    expect(verifyPasswordReset(rec, "123456", now)).toBe("ok");
    expect(verifyPasswordReset(rec, "000000", now)).toBe("wrong");
    expect(verifyPasswordReset(undefined, "123456", now)).toBe("missing");
    const expired = newPasswordResetRecord("123456", now - RESET_CODE_TTL_MS - 1);
    expect(verifyPasswordReset(expired, "123456", now)).toBe("expired");
    const used = newPasswordResetRecord("123456", now);
    used.used = true;
    expect(verifyPasswordReset(used, "123456", now)).toBe("burnt");
  });
  it("a code is burnt after the brute-force attempt cap", () => {
    const now = Date.now();
    const rec = newPasswordResetRecord("123456", now);
    rec.attempts = MAX_RESET_VERIFY_ATTEMPTS;
    expect(verifyPasswordReset(rec, "123456", now)).toBe("burnt");
  });
  it("send rate limit is enforced per window", () => {
    const now = Date.now();
    let prev: any = undefined;
    for (let i = 0; i < MAX_RESET_SENDS_PER_WINDOW; i++) {
      expect(isPasswordResetRateLimited(prev, now)).toBe(false);
      prev = newPasswordResetRecord("000000", now, prev);
    }
    expect(isPasswordResetRateLimited(prev, now)).toBe(true);
    // outside the window the limit resets
    expect(isPasswordResetRateLimited(prev, now + RESET_RATE_WINDOW_MS + 1)).toBe(false);
  });
});

describe("password reset requires proof of ownership (wired HTTP)", () => {
  it("rejects a reset with NO code (the reported gap): email alone cannot change a password", async () => {
    const { status } = await post("/api/set-password", { email: USER_EMAIL, password: NEW_PASSWORD });
    expect(status).toBe(400);
    // original password still valid
    expect(await login(USER_EMAIL, USER_PASSWORD)).toBe(200);
    expect(await login(USER_EMAIL, NEW_PASSWORD)).toBe(401);
  });

  it("rejects a WRONG code", async () => {
    seedReset(USER_EMAIL, "111111");
    const { status } = await post("/api/set-password", { email: USER_EMAIL, code: "999999", password: NEW_PASSWORD });
    expect(status).toBe(400);
    expect(await login(USER_EMAIL, USER_PASSWORD)).toBe(200);
  });

  it("rejects an EXPIRED code", async () => {
    seedReset(USER_EMAIL, "222222", { expiresAt: Date.now() - 1000 });
    const { status } = await post("/api/set-password", { email: USER_EMAIL, code: "222222", password: NEW_PASSWORD });
    expect(status).toBe(400);
    expect(await login(USER_EMAIL, USER_PASSWORD)).toBe(200);
  });

  it("a correct code allows the reset, and the new password then logs in", async () => {
    seedReset(USER_EMAIL, "333333");
    const { status } = await post("/api/set-password", { email: USER_EMAIL, code: "333333", password: NEW_PASSWORD });
    expect(status).toBe(200);
    expect(await login(USER_EMAIL, NEW_PASSWORD)).toBe(200);
    expect(await login(USER_EMAIL, USER_PASSWORD)).toBe(401);
    // restore for later tests
    await seedUser(USER_EMAIL, USER_PASSWORD);
  });

  it("a REUSED (already consumed) code is rejected", async () => {
    seedReset(USER_EMAIL, "444444");
    await post("/api/set-password", { email: USER_EMAIL, code: "444444", password: NEW_PASSWORD });
    // same code again — now used — must be rejected
    const { status } = await post("/api/set-password", { email: USER_EMAIL, code: "444444", password: "another-pass-789" });
    expect(status).toBe(400);
    await seedUser(USER_EMAIL, USER_PASSWORD);
  });

  it("request-password-reset issues + stores a hashed code and never advertises account existence for unknown emails", async () => {
    const known = await post("/api/request-password-reset", { email: USER_EMAIL });
    expect(known.status).toBe(200);
    expect(typeof known.json.sent).toBe("boolean");
    const knownRec = readJSONFile(RESETS_FILE)[USER_EMAIL];
    expect(knownRec).toBeTruthy();
    // stored value is a hex hash, never the plaintext code (see the unit test
    // "stores only a hash" — timestamps here legitimately contain digit runs,
    // so we assert the hash shape rather than scanning for a bare `\d{6}`).
    expect(knownRec.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(knownRec.used).toBe(false);
    // unknown email still returns a generic success (no enumeration)
    const unknown = await post("/api/request-password-reset", { email: "nobody-" + TS + "@test.example" });
    expect(unknown.status).toBe(200);
  });

  it("send rate-limit kicks in after MAX_RESET_SENDS_PER_WINDOW requests", async () => {
    // burn through the limit for this fresh window for USER_EMAIL
    let limited = false;
    for (let i = 0; i < MAX_RESET_SENDS_PER_WINDOW + 1; i++) {
      const r = await post("/api/request-password-reset", { email: USER_EMAIL });
      if (r.status === 429) { limited = true; break; }
    }
    expect(limited).toBe(true);
  });

  it("the owner's existing password still logs in (never locked out, never changed)", async () => {
    expect(await login(OWNER_EMAIL, OWNER_PASSWORD)).toBe(200);
    // the owner hash in the store is untouched by any of the above
    const ownerRec = readJSONFile(USERS_FILE)[OWNER_EMAIL];
    expect(await hash(OWNER_PASSWORD, 4).then(() => true)).toBe(true);
    const bcrypt = await import("bcryptjs");
    expect(await bcrypt.compare(OWNER_PASSWORD, ownerRec.password)).toBe(true);
  });
});
