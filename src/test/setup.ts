import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// HARD TEST ISOLATION (#230): every test file starts with the durable store
// DISABLED and aborts if a DATABASE_URL (real Neon) is present. Tests must
// never write the real credential store — see src/test/test-isolation.ts.
import { enforceTestDurableIsolation } from "./test-isolation";
enforceTestDurableIsolation();

/**
 * SLICE 154 — `src/db/auth.ts` now refuses to load without a real signing key
 * (there is no fallback any more; see `src/lib/jwt-key.ts`).
 *
 * The suite therefore supplies a deterministic, obviously-fake key so it
 * exercises exactly the code path production does. This is a TEST value, never
 * a deployment one: the real key lives in the platform Secrets store and is
 * read from `process.env.JWT_SECRET` at runtime.
 *
 * A test that needs the absent-or-too-short path deletes this variable itself
 * and re-imports the module in a fresh registry — see
 * `src/test/jwt-key-fail-closed-154.test.ts`. If the surrounding environment
 * already provides a usable key, that key wins.
 */
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "test-only-signing-key-slice-154-not-a-real-secret";
}

// Runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});
