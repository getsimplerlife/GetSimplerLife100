import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isDefaultIsolatedDataDir, TEST_DATA_DIR_DEFAULT } from "./test-env";

/**
 * test-env-hardening.test.ts — regression coverage for the flake fixes
 * (task 21f80636): the default isolated data dir is the only dir that may be
 * wiped at suite start; explicit TEST_DATA_DIR (live-dir verification mode)
 * must never be treated as wipable.
 */
describe("test-env flake hardening (unique/clean test state)", () => {
  it("treats ONLY the default isolated dir as wipable (never an explicit/live dir)", () => {
    expect(isDefaultIsolatedDataDir(TEST_DATA_DIR_DEFAULT)).toBe(true);
    // Explicit overrides — live dir and any custom dir — are never wiped.
    expect(isDefaultIsolatedDataDir("/var/lib/simplerlife100/.data")).toBe(false);
    expect(isDefaultIsolatedDataDir("/tmp/audit-data")).toBe(false);
    expect(isDefaultIsolatedDataDir("")).toBe(false);
    expect(isDefaultIsolatedDataDir("/tmp")).toBe(false);
  });

  it("points the default isolated dir under /tmp (never the repo or live data dir)", () => {
    expect(TEST_DATA_DIR_DEFAULT.startsWith("/tmp/")).toBe(true);
    expect(TEST_DATA_DIR_DEFAULT).not.toContain("simplerlife100/.data");
  });

  it("sanitizes a stale shared test dir the way the spawn path does (best-effort wipe then recreate)", () => {
    // Simulate what ensureTestServer's lock-winner does: wipe the default
    // isolated dir, then recreate it, leaving a clean slate for the run.
    const dir = mkdtempSync(join(tmpdir(), "sl100-hardening-"));
    writeFileSync(join(dir, "tenant_purchases.json"), JSON.stringify({ stale: true }));
    // Mirror the spawn-path wipe (rmSync recursive force) — only valid for the
    // default isolated dir; here we prove the recipe on a scratch dir works.
    rmSync(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);
    mkdirSync(dir, { recursive: true });
    expect(existsSync(dir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
