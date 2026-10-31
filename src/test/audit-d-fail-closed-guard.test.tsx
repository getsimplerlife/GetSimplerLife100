/**
 * AUDIT-D guard (10-26): the /api namespace fails CLOSED.
 *
 * Previously ANY unmatched /api/* request (any verb) fell through to the
 * SPA HTML fallback and returned 200 HTML (fail-open) — dead endpoints
 * looked alive. Since AUDIT-D the server returns 404 JSON for every
 * unmatched /api path (and /portal* stays 302-gated to /login).
 *
 * SLICE 156 CONTRACT CHANGE (deliberate): a non-API path that matches no
 * declared route now answers 404 as well. Until 156 the page side answered
 * 200 for any path it had no handler for, so a mistyped link looked like a
 * working page and junk URLs could be indexed. What does NOT change, and is
 * still asserted here: the body stays the SPA shell (text/html, a real
 * <html> document, the client router renders the not-found page inside it)
 * — a truthful status, never a hard error page.
 *
 * Guards:
 *  (a) behavioral — unknown /api paths (GET/POST/PUT, incl. the pre-D dead
 *      five) return 404 + application/json + {"error":"not found"}, never
 *      HTML; sampled real handlers keep their auth-gated codes; declared
 *      non-API pages still answer 200 HTML; an unknown non-API path answers
 *      404 HTML with the shell; /portal unknown pages (unauth) still
 *      302 → /login.
 *  (b) source — the fail-closed rule sits below every registered /api route
 *      in prod-server.ts (no real handler can be collateral below it) and
 *      above the SSR tail AND the 404/SPA fallback's CALL SITE. It is NOT
 *      asserted to sit above the shell helper's DEFINITION: slice 156 moved
 *      buildShellHtml()/notFoundResponse() above the rule on purpose so the
 *      200 and the 404 serve one identical shell. Line numbers of a helper
 *      are not the behaviour this guard exists to protect.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl } from "./test-env";

const REPO = process.cwd();
const BASE_URL = testBaseUrl();

async function probe(path: string, init?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, { redirect: "manual", ...init });
}

/** Fail-closed 404 check shared by the unknown-path tests. */
async function expectApi404(path: string, method = "GET") {
  const res = await probe(path, { method });
  expect(res.status, `${method} ${path} must be 404`).toBe(404);
  const ct = res.headers.get("content-type") || "";
  expect(ct).toContain("application/json");
  const body = await res.json();
  expect(body.error).toBe("not found");
}

/**
 * Namespace paths that sit under AUTH-GATED catch-alls (/api/data/*,
 * /api/native/*) legitimately answer 401 for an anonymous caller BEFORE
 * the unknown-subPath 404 tail runs. The fail-closed contract for them is:
 * never 200 HTML; either the auth 401 or the 404 JSON. An authenticated
 * caller gets the 404 (live-probed at publish).
 */
async function expectApiJson(path: string, method = "GET") {
  const res = await probe(path, { method });
  expect([401, 404]).toContain(res.status);
  const ct = res.headers.get("content-type") || "";
  expect(ct).toContain("application/json");
  expect(ct).not.toContain("text/html");
  const body = await res.json();
  expect(body.error).toBeTruthy();
}

describe("AUDIT-D — unknown /api/* fails closed (404 JSON, no HTML)", () => {
  beforeAll(async () => {
    await ensureTestServer();
  });

  describe("unknown /api paths → 404 JSON for every verb", () => {
    it.each([
      ["/api/zzz-does-not-exist", "GET"],
      ["/api/zzz-does-not-exist", "POST"],
      ["/api/zzz-does-not-exist", "PUT"],
      ["/api/zzz-does-not-exist", "DELETE"],
      ["/api", "GET"],
      ["/api/zzz/with/nested/path", "GET"],
    ])("%s %s → 404 JSON", (path, method) => {
      return expectApi404(path as string, method as string);
    });
  });

  describe("unknown paths under auth-gated catch-alls → JSON, never HTML", () => {
    it.each([
      ["/api/data/zzz-unmatched-subpath", "GET"],
      ["/api/native/zzz-unmatched-subpath", "GET"],
      ["/api/data/workflows/generate", "POST"],
      ["/api/data/zzz/with/nested", "GET"],
    ])("%s %s → 401 (unauth auth-gate) or 404 JSON", (path, method) => {
      return expectApiJson(path as string, method as string);
    });
  });

  describe("pre-D dead endpoints + a2-retired persistent-connect flip to 404 JSON automatically", () => {
    it.each([
      ["/api/audit-logs/stats", "GET"],
      ["/api/connect-ai/mapping", "GET"],
      ["/api/connect-ai/mapping/abc123", "DELETE"],
      ["/api/v1/trigger", "POST"],
      ["/api/portal/files/view", "POST"],
      ["/api/integrations", "GET"],
      ["/api/integrations/connect", "POST"],
      ["/api/integrations/disconnect", "POST"],
    ])("%s %s → 404 JSON (no HTML)", (path, method) => {
      return expectApi404(path as string, method as string);
    });
  });

  describe("real /api handlers keep their auth-gated codes (no collateral)", () => {
    it.each([
      ["GET /api/health", "GET", "/api/health", 200],
      ["GET /api/me (unauth)", "GET", "/api/me", 401],
      ["GET /api/data/analytics (unauth)", "GET", "/api/data/analytics", 401],
      ["POST /api/data/workflows (unauth)", "POST", "/api/data/workflows", 401],
      ["GET /api/portal/files (unauth)", "GET", "/api/portal/files", 401],
      ["POST /api/admin/backup (unauth)", "POST", "/api/admin/backup", 401],
      ["GET /api/audit-logs (unauth)", "GET", "/api/audit-logs", 401],
      ["GET /api/native/billing (unauth)", "GET", "/api/native/billing", 401],
    ])("%s %s → %i (unchanged)", async (_label, method, path, expected) => {
      const res = await probe(path as string, { method: method as string });
      const ct = res.headers.get("content-type") || "";
      // auth-gated 401s are JSON, not HTML; the endpoint must still exist.
      expect(ct).not.toContain("text/html");
      expect([200, 400, 401]).toContain(res.status);
      if (expected === 400 || expected === 401) expect(res.status).toBe(expected);
      else expect(res.status).toBe(200);
    });
  });

  describe("non-API paths: declared pages still serve, an unknown path is now a real 404", () => {
    it("GET / → 200 HTML", async () => {
      const res = await probe("/");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") || "").toContain("text/html");
    });
    // SLICE 156 — DELIBERATE CONTRACT CHANGE. This assertion used to require
    // 200 for an unknown path (the pre-156 "SPA fallback for everything"
    // behaviour). That 200 was the defect: a mistyped link looked like a
    // working page and search engines could index junk URLs. The status is now
    // truthful (404). The other half of the old contract still holds and is
    // still asserted: the response is not a hard error page — it is the SPA
    // shell (text/html, a real <html> document) so the client router renders
    // the not-found page and navigation still works from there.
    it("unknown non-API path → 404 HTML with the SPA shell (slice 156 contract change)", async () => {
      const res = await probe("/definitely-not-a-real-page-xyz");
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type") || "").toContain("text/html");
      const text = await res.text();
      expect(text.toLowerCase()).toContain("<html");
    });
    it("unknown /portal page (unauth) → 302 → /login (unchanged)", async () => {
      const res = await probe("/portal/definitely-not-a-real-page-xyz");
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/login");
    });
  });

  describe("source ordering: the rule sits after every real /api route", () => {
    // SLICE 156 — this guard used to compare the rule's position against the
    // first `join(DIST_CLIENT, "index.html")` in the file, which was the SPA
    // fallback's own read. Slice 156 factored that read into buildShellHtml()
    // so the 200 page and the 404 page are built by ONE function, and that
    // helper now sits above the rule. The old assertion therefore failed on
    // correct code while the behaviour it exists to protect — "no /api
    // request can reach the HTML tail" — was untouched.
    //
    // It now tests that intent: the rule must come before the SSR tail and
    // before the fallback's CALL SITE (where an unmatched non-API request is
    // actually handed the HTML), not before a helper's DEFINITION. That is
    // strictly harder to satisfy by accident than a line-number check: moving
    // the rule below the /api handlers still fails the companion test that
    // pins every route literal above it, and a rule that stopped failing
    // closed still fails the JSON-404 assertion below.
    it("server places the fail-closed rule above the SSR tail and the fallback's call site", () => {
      const src = readFileSync(join(REPO, "prod-server.ts"), "utf8");
      const rule = src.indexOf('pathname === "/api" || pathname.startsWith("/api/")');
      const ssr = src.indexOf("// SSR mode: try server-side rendering first");
      const fallbackCallSite = src.indexOf("return notFoundResponse(pathname)");
      expect(rule).toBeGreaterThan(0);
      expect(ssr).toBeGreaterThan(0);
      expect(fallbackCallSite).toBeGreaterThan(0);
      expect(rule).toBeLessThan(ssr);
      expect(rule).toBeLessThan(fallbackCallSite);
      expect(src).toContain('Response.json({ error: "not found" }, { status: 404 })');
      // One definition of each helper: a second copy is how the 200 shell and
      // the 404 shell would silently drift apart again.
      expect(src.match(/function buildShellHtml\(/g) ?? []).toHaveLength(1);
      expect(src.match(/function notFoundResponse\(/g) ?? []).toHaveLength(1);
    });
    it("every registered /api route literal sits ABOVE the rule (no collateral)", () => {
      const src = readFileSync(join(REPO, "prod-server.ts"), "utf8");
      const rule = src.indexOf('pathname === "/api" || pathname.startsWith("/api/")');
      const re = /pathname === ?"\/api\/[a-zA-Z0-9/_.-]+"|pathname\.startsWith\("\/api\/(admin|data|native|vault)|pathname\.startsWith\("\/portal/g;
      const lits = src.match(re) ?? [];
      expect(lits.length).toBeGreaterThan(20);
      for (const lit of lits) {
        const idx = src.indexOf(lit);
        expect(idx, `${lit} must be registered above the fail-closed rule`).toBeGreaterThan(0);
        expect(idx, `${lit} must be registered above the fail-closed rule`).toBeLessThan(rule);
      }
    });
  });
});