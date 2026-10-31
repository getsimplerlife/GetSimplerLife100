// @vitest-environment node
// ^ node, not jsdom: jose checks `instanceof Uint8Array`, and jsdom's own
//   TextEncoder produces a cross-realm array that fails that check. The code
//   under test runs in the Bun server, so node is the faithful environment.
import { describe, it, expect, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SLICE 154 — the session signing key fails closed.
 *
 * The defect this pins: `src/db/auth.ts` used to read
 * `process.env.JWT_SECRET || "<a string published in this repo>"`. Anyone who
 * knew that string and a real user id could mint a token `verifySessionToken`
 * accepted — and that guard sits in front of the admin credential routes
 * (`/api/admin/credentials*`), which read, write and delete provider API keys.
 *
 * The attack itself is a test here, not a claim: a token signed with the old
 * published fallback must be rejected by a server running on a real key.
 *
 * Nothing in this file statically imports `src/db/auth.ts` or anything that
 * pulls it in — every import of it is dynamic and behind `vi.resetModules()`,
 * because the whole point is what happens while that module is being evaluated.
 */

const REAL_KEY = "unit-test-real-key-slice-154-abcdefghijklmnop";
const SHORT_KEY = "a".repeat(31);
const EXACT_KEY = "b".repeat(32);
const PUBLISHED_FALLBACK = "default_secret_for_simpler_life_100";
const ORIGINAL_SECRET = process.env.JWT_SECRET;
const USER_ID = "6f1a4f2c-1d3e-4a5b-8c7d-9e0f1a2b3c4d";
const REPO = process.cwd();
const THIS_FILE = basename(fileURLToPath(import.meta.url));

/** Re-evaluate `src/db/auth.ts` in a fresh registry under a given key. */
async function importAuth(secret: string | undefined) {
  vi.resetModules();
  if (secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secret;
  return import("../db/auth");
}

/** Re-evaluate `src/lib/jwt-key.ts` in a fresh registry. */
async function importJwtKey() {
  vi.resetModules();
  return import("../lib/jwt-key");
}

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
  vi.resetModules();
});

describe("SLICE 154 — auth.ts refuses to load without a real signing key", () => {
  it("throws while being imported when JWT_SECRET is absent", async () => {
    await expect(importAuth(undefined)).rejects.toThrow(/FATAL: JWT_SECRET is missing/);
  });

  it("the failure message is a single readable line that says what to set", async () => {
    const err = await importAuth(undefined).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    const message = String(err?.message ?? "");
    // One line, readable from a log with no other context.
    expect(message).not.toContain("\n");
    expect(message).toContain("JWT_SECRET");
    expect(message).toContain("at least 32 characters");
    // …and it never echoes the value it was given.
    expect(message).not.toContain(REAL_KEY);
  });

  it("throws for a 31-character key and names the length", async () => {
    await expect(importAuth(SHORT_KEY)).rejects.toThrow(
      /JWT_SECRET is too short \(31 characters, 32 required\)/,
    );
  });

  it("throws for an empty-string key (not treated as absent-but-fine)", async () => {
    await expect(importAuth("")).rejects.toThrow(/FATAL: JWT_SECRET is missing/);
  });

  it("loads with exactly 32 characters", async () => {
    const auth = await importAuth(EXACT_KEY);
    expect(typeof auth.createSessionToken).toBe("function");
    expect(typeof auth.verifySessionToken).toBe("function");
  });

  it("loads with a real key and still signs/verifies the same payload", async () => {
    expect(REAL_KEY.length).toBeGreaterThanOrEqual(32);
    const auth = await importAuth(REAL_KEY);
    const token = await auth.createSessionToken(USER_ID);
    expect(await auth.verifySessionToken(token)).toBe(USER_ID);
  });
});

describe("SLICE 154 — a token signed with the published fallback is rejected", () => {
  it("verifySessionToken returns null for a fallback-signed token on a real key", async () => {
    const auth = await importAuth(REAL_KEY);
    const forged = await new SignJWT({ userId: USER_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(PUBLISHED_FALLBACK));

    expect(await auth.verifySessionToken(forged)).toBeNull();
  });

  it("positive control: the same token signed with the real key IS accepted", async () => {
    const auth = await importAuth(REAL_KEY);
    const userId = USER_ID;
    const good = await new SignJWT({ userId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(REAL_KEY));

    expect(await auth.verifySessionToken(good)).toBe(userId);
  });

  it("a token signed with a different real key is also rejected", async () => {
    const auth = await importAuth(REAL_KEY);
    const other = await new SignJWT({ userId: USER_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode("a-completely-different-key-32-chars-plus"));
    expect(await auth.verifySessionToken(other)).toBeNull();
  });
});

describe("SLICE 154 — jwt-key is the single source of truth", () => {
  it("reports presence without ever exposing the key", async () => {
    process.env.JWT_SECRET = REAL_KEY;
    const { jwtKeyPresent, jwtKeyProblem } = await importJwtKey();
    expect(jwtKeyPresent()).toBe(true);
    expect(jwtKeyProblem(REAL_KEY)).toBeNull();
    expect(jwtKeyProblem(undefined)).toMatch(/JWT_SECRET is missing/);
    expect(jwtKeyProblem(SHORT_KEY)).toMatch(/too short/);
    // The problem string is about the variable, never the value.
    expect(String(jwtKeyProblem(undefined))).not.toContain(REAL_KEY);
  });

  it("jwtKeyPresent() is false when the key is absent or too short", async () => {
    const { jwtKeyPresent } = await importJwtKey();
    delete process.env.JWT_SECRET;
    expect(jwtKeyPresent()).toBe(false);
    process.env.JWT_SECRET = SHORT_KEY;
    expect(jwtKeyPresent()).toBe(false);
    process.env.JWT_SECRET = EXACT_KEY;
    expect(jwtKeyPresent()).toBe(true);
  });
});

describe("SLICE 154 — the fallback literal is gone from the source", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it("appears nowhere under src/ (except this test), prod-server.ts or vite.config.ts", () => {
    const files = [
      ...walk(join(REPO, "src")),
      join(REPO, "prod-server.ts"),
      join(REPO, "vite.config.ts"),
    ];
    const offenders = files.filter((f) => {
      if (basename(f) === THIS_FILE) return false; // this file is the rejection test
      try {
        return readFileSync(f, "utf8").includes(PUBLISHED_FALLBACK);
      } catch {
        return false;
      }
    });
    expect(offenders).toEqual([]);
  });

  it("src/db/auth.ts has no `||` fallback on JWT_SECRET", () => {
    const source = readFileSync(join(REPO, "src/db/auth.ts"), "utf8");
    // Strip comments first: the docstring in auth.ts *describes* the removed
    // fallback, and a guard that matches prose pins nothing (R86 lesson).
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).toMatch(/readJwtSecret\(\)/);
    expect(code).not.toMatch(/process\.env\.JWT_SECRET\s*\|\|/);
    expect(code).not.toMatch(/\|\|\s*["'`]/);
  });
});
