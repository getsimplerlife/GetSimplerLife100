/**
 * providers-no-null.test.ts — #187 live customer crash fix.
 *
 * The admin Credentials page and the customer "All Integrations" page both
 * crashed with "Cannot read properties of null (reading 'category')" because
 * /api/integrations/providers could emit null/sparse entries (reproduced live
 * at indexes 15,17,26,... in a stale serving copy). The serving source file is
 * clean, but the handler now filters null / no-category entries before slicing,
 * so the API can never hand a consumer an entry whose `.category` read throws.
 *
 * This test proves the handler emits zero falsy and zero no-category entries
 * (and that it still returns a populated registry).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { ensureTestServer, testBaseUrl } from "./test-env";

const BASE_URL = testBaseUrl();

describe("/api/integrations/providers — no crashable entries", () => {
  beforeAll(async () => {
    await ensureTestServer();
  });

  it("returns no null / falsy / no-category provider entries", async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/providers?limit=200`);
    expect(res.status).toBe(200);
    const json = await res.json();
    const list = Array.isArray(json) ? json : json.data;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(p).toBeTruthy();
      expect(typeof p.category).toBe("string");
      expect(p.category.length).toBeGreaterThan(0);
    }
  });

  it("paginated slice also contains no crashable entries", async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/providers?page=0&limit=50`);
    expect(res.status).toBe(200);
    const json = await res.json();
    const list = Array.isArray(json) ? json : json.data;
    expect(Array.isArray(list)).toBe(true);
    for (const p of list) {
      expect(p).toBeTruthy();
      expect(typeof p.category).toBe("string");
    }
  });
});
