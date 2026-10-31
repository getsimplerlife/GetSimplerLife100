// @vitest-environment node
/**
 * site-404-156.test.ts — the page side tells the truth about unknown URLs.
 *
 * THE DEFECT (measured on the 156th publish): a path that matched no route
 * answered **200** with the SPA shell. A mistyped link looked like a working
 * page, search engines could index junk URLs, and a broken link never reported
 * a problem to us. The API namespace already answered 404; the page side did
 * not.
 *
 * WHAT THIS FILE PROVES, against the REAL HTTP path of the self-hosted server:
 *   1. An unknown path answers 404 and still serves the shell (so the client
 *      router can render the not-found page) — for GET and for POST.
 *   2. EVERY route the router declares still answers non-404 — the list is
 *      read from the router's own generated tree (`routesByPath`), never
 *      hand-copied, because a hand-copied list is what 404s a real page the day
 *      someone adds a route.
 *   3. A static asset that exists still answers 200 with its content type, and
 *      a missing file answers 404 as plain text rather than an HTML document.
 *   4. The not-found page really renders its destinations (router + SSR, the
 *      same path a visitor's browser takes).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ensureTestServer, testBaseUrl } from "./test-env";
import { loadDeclaredRoutePaths } from "~/lib/route-table";
import { compileRoutePattern, matchesDeclaredRoute, normalizeRoutePath } from "~/lib/route-match";

const BASE_URL = testBaseUrl();
const REPO = process.cwd(); // vitest runs from the repo root

/** Fetch without following redirects — a 302 to /login must not read as 200. */
async function probe(path: string, method = "GET") {
  return fetch(`${BASE_URL}${path}`, { method, redirect: "manual" });
}

/** Portal routes redirect an anonymous visitor to /login by design. */
const AUTH_GATED = /^\/portal(\/|$)/;

/** Turn a declared route path into a requestable URL (`$id` → a real segment). */
function requestable(declared: string): string {
  return declared.replace(/\$[A-Za-z0-9_]+/g, "sample-value");
}

beforeAll(async () => {
  await ensureTestServer();
}, 120_000);

// ── 0. The matcher itself (pure, no server) ────────────────────────────────
describe("156 — route matching rules mirror the router", () => {
  it("matches a literal route, with or without a trailing slash and in any case", () => {
    const patterns = [compileRoutePattern("/pricing")];
    expect(matchesDeclaredRoute("/pricing", patterns)).toBe(true);
    expect(matchesDeclaredRoute("/pricing/", patterns)).toBe(true);
    expect(matchesDeclaredRoute("/Pricing", patterns)).toBe(true);
    expect(matchesDeclaredRoute("/pricing/extra", patterns)).toBe(false);
    expect(matchesDeclaredRoute("/pricingg", patterns)).toBe(false);
  });

  it("treats $param as exactly one non-empty segment", () => {
    const patterns = [compileRoutePattern("/industries/$industryId")];
    expect(matchesDeclaredRoute("/industries/legal", patterns)).toBe(true);
    expect(matchesDeclaredRoute("/industries/legal/extra", patterns)).toBe(false);
    expect(matchesDeclaredRoute("/industries/", patterns)).toBe(false);
  });

  it("never lets a declared path's regex characters leak (a dot is a dot)", () => {
    const patterns = [compileRoutePattern("/a.b")];
    expect(matchesDeclaredRoute("/a.b", patterns)).toBe(true);
    expect(matchesDeclaredRoute("/axb", patterns)).toBe(false);
  });

  it("normalizes query strings, duplicate slashes and the root path", () => {
    expect(normalizeRoutePath("/pricing?x=1")).toBe("/pricing");
    expect(normalizeRoutePath("//pricing//")).toBe("/pricing");
    expect(normalizeRoutePath("/")).toBe("/");
    expect(normalizeRoutePath("")).toBe("/");
  });
});

// ── 1. An unknown path is a 404 that still serves the shell ────────────────
describe("156 — a path that matches no route answers 404, not 200", () => {
  it("returns 404 with the SPA shell for GET", async () => {
    const res = await probe("/definitely-not-a-page-xyz-156");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type") || "").toContain("text/html");
    const body = await res.text();
    // The shell, not a blank page: the client router hydrates and renders the
    // not-found component inside it.
    expect(body).toContain('<div id="root"');
    expect(body).toContain("/assets/");
    // Junk URLs must not be indexed (the other half of this slice).
    expect(res.headers.get("x-robots-tag") || "").toContain("noindex");
  });

  it("returns 404 for a deep unknown path and for POST, like the API side does", async () => {
    const deep = await probe("/docs/nope/even-deeper-156");
    expect(deep.status).toBe(404);
    const posted = await probe("/definitely-not-a-page-xyz-156", "POST");
    expect(posted.status).toBe(404);
  });

  it("still answers 404 JSON for the API namespace (unchanged)", async () => {
    const res = await probe("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type") || "").toContain("application/json");
  });
});

// ── 2. THE REGRESSION TEST: every declared route still works ───────────────
describe("156 — no declared route may be turned into a 404", () => {
  let declared: string[] = [];

  beforeAll(async () => {
    declared = await loadDeclaredRoutePaths();
  });

  it("reads a non-trivial route table from the router itself", () => {
    // If this ever reads 0 the table failed to load and the guard below would
    // pass vacuously — so the size is asserted, not assumed.
    expect(declared.length).toBeGreaterThan(50);
    expect(declared).toContain("/");
    expect(declared).toContain("/pricing");
  });

  it("every declared route answers something other than 404", async () => {
    const failures: string[] = [];
    for (const routePath of declared) {
      const url = requestable(routePath);
      const res = await probe(url);
      const allowed = AUTH_GATED.test(url) ? [200, 302] : [200];
      if (!allowed.includes(res.status)) {
        failures.push(`${routePath} → ${url} answered ${res.status} (expected ${allowed.join(" or ")})`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});

// ── 3. Static assets are untouched ────────────────────────────────────────
describe("156 — a static asset that exists still answers 200 with its content type", () => {
  it("serves a built hashed asset as JavaScript", async () => {
    const assetsDir = join(REPO, "dist", "assets");
    const script = readdirSync(assetsDir).find((f) => f.endsWith(".js"));
    expect(script, "the build must have produced dist/assets/*.js").toBeTruthy();
    const res = await probe(`/assets/${script}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("javascript");
  });

  it("serves the web manifest as JSON", async () => {
    const res = await probe("/manifest.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("json");
  });

  it("answers a missing file with 404 plain text, never an HTML document", async () => {
    const res = await probe("/assets/this-asset-does-not-exist-156.js");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type") || "").toContain("text/plain");
  });
});

// ── 4. The not-found page really renders ──────────────────────────────────
describe("156 — the not-found page renders its destinations", () => {
  it("renders the copy and the four destinations through the real router", async () => {
    const { renderPage } = await import("~/entry-server");
    const result = await renderPage("/definitely-not-a-page-xyz-156");
    expect(result.html).not.toContain("SSR fallback");
    expect(result.html).toContain("This page doesn\u2019t exist");
    for (const href of ["/pricing", "/features", "/integrations", "/contact", "/"]) {
      expect(result.html, `missing destination ${href}`).toContain(`href="${href}"`);
    }
    // No dead end, no fake search box.
    expect(result.html).not.toContain('type="search"');
  }, 60_000);
});
