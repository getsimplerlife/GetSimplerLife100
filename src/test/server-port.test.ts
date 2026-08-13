/**
 * server-port.test.ts — resolveServerPort matrix.
 *
 * Covers the port-resolution rules that fix the publish PORT quirk:
 * - undefined / "" / non-numeric → 3000 (fail-closed)
 * - "80" → 3000 (platform default exported by the host shell — ignored)
 * - any other numeric string ("3000", "3100", "3999", ...) → that number
 *   (explicit overrides for isolated test instances keep working)
 */
import { describe, expect, it } from "vitest";
import { resolveServerPort, CANONICAL_SERVER_PORT, PLATFORM_DEFAULT_PORT } from "../lib/server-port";

describe("resolveServerPort", () => {
  it("undefined env → canonical 3000 (fail-closed)", () => {
    expect(resolveServerPort(undefined)).toBe(CANONICAL_SERVER_PORT);
  });

  it('empty string env → canonical 3000 (fail-closed)', () => {
    expect(resolveServerPort("")).toBe(CANONICAL_SERVER_PORT);
  });

  it('whitespace-only env → canonical 3000 (fail-closed)', () => {
    expect(resolveServerPort("   ")).toBe(CANONICAL_SERVER_PORT);
  });

  it('explicit "3000" → 3000', () => {
    expect(resolveServerPort("3000")).toBe(3000);
  });

  it('platform default "80" → 3000 (ignored, not an explicit override)', () => {
    expect(PLATFORM_DEFAULT_PORT).toBe(80);
    expect(resolveServerPort("80")).toBe(CANONICAL_SERVER_PORT);
  });

  it('explicit "3100" → 3100 (isolated instance override preserved)', () => {
    expect(resolveServerPort("3100")).toBe(3100);
  });

  it('explicit "3999" → 3999 (purchase e2e TEST_BASE_URL port preserved)', () => {
    expect(resolveServerPort("3999")).toBe(3999);
  });

  it('non-numeric "abc" → canonical 3000 (fail-closed)', () => {
    expect(resolveServerPort("abc")).toBe(CANONICAL_SERVER_PORT);
  });

  it('non-numeric "80abc" → canonical 3000 (fail-closed)', () => {
    expect(resolveServerPort("80abc")).toBe(CANONICAL_SERVER_PORT);
  });

  it('negative "-1" → canonical 3000 (fail-closed)', () => {
    expect(resolveServerPort("-1")).toBe(CANONICAL_SERVER_PORT);
  });

  it('zero "0" → canonical 3000 (fail-closed — 0 would make the OS pick a random port)', () => {
    expect(resolveServerPort("0")).toBe(CANONICAL_SERVER_PORT);
  });

  it('"3000" with surrounding whitespace → 3000 (trimmed)', () => {
    expect(resolveServerPort(" 3000 ")).toBe(3000);
  });
});
