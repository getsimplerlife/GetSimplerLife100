// @vitest-environment node
/**
 * security-hardening.test.ts — OWASP-informed hardening regression suite
 * (owner hard bar 09-10, WORKFLOW.md "Security Hard Guarantee").
 *
 * Drives the REAL HTTP path against the self-hosted prod server and proves:
 *   1. Every response carries hardening headers (nosniff, frame DENY,
 *      referrer-policy, CSP, permissions-policy, no-store unless explicit).
 *   2. Session cookie is HttpOnly + SameSite=Lax; `Secure` and HSTS are added
 *      on https (x-forwarded-proto), never forced on plain http (local smokes).
 *   3. Registration validates email — XSS-shaped emails (`</script>`) are
 *      rejected instead of being stored and reflected into SSR inline JS.
 *   4. Auth/lead-adjacent endpoints are rate limited (429 on excess).
 *   5. Error bodies are generic — no stack traces / internal paths leak.
 *   6. Fail-closed auth: /api/me without a session is 401.
 *
 * SECURITY HARD BAR: per-PR security test for the hardening slice.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ensureTestServer, testBaseUrl } from "./test-env";

const BASE_URL = testBaseUrl();

async function api(
  path: string,
  opts: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; json: any; setCookie?: string; headers: Headers }> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  let body: string | undefined;
  if (opts.rawBody !== undefined) {
    headers["content-type"] = "application/json";
    body = opts.rawBody;
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method || "GET",
    headers,
    body,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  const setCookie = res.headers.get("set-cookie") || undefined;
  return { status: res.status, json, setCookie, headers: res.headers };
}

const ALWAYS_HEADERS: Array<[string, (v: string | null) => boolean]> = [
  ["x-content-type-options", (v) => v === "nosniff"],
  ["x-frame-options", (v) => v === "DENY"],
  ["referrer-policy", (v) => v === "strict-origin-when-cross-origin"],
  ["content-security-policy", (v) => !!v && v.includes("default-src 'self'") && v.includes("object-src 'none'") && v.includes("base-uri 'self'") && v.includes("frame-ancestors") === false],
  ["permissions-policy", (v) => !!v && v.includes("geolocation=()")],
  ["cache-control", (v) => !!v && v.includes("no-store")],
];

describe("security hardening (headers / cookies / validation / rate limits)", () => {
  beforeAll(async () => {
    await ensureTestServer();
  });
  afterAll(async () => {
    // test-env teardown handled by the suite harness.
  });

  it("serves hardening headers on API, SPA HTML, and 404 responses", async () => {
    const paths = ["/api/health", "/", "/api/definitely-not-a-route"];
    for (const p of paths) {
      const r = await api(p);
      for (const [name, ok] of ALWAYS_HEADERS) {
        expect(ok(r.headers.get(name)), `${p} → ${name}`).toBe(true);
      }
    }
  });

  it("sets HttpOnly + SameSite=Lax session cookie; adds Secure + HSTS on https", async () => {
    const email = `cookie-${Date.now()}@sec-harden.test`;
    const plain = await api("/api/register", { method: "POST", body: { email, password: "HardenPass2026!" } });
    expect(plain.status).toBe(200);
    const c = plain.setCookie || "";
    expect(c).toMatch(/^session=/);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
    // Plain http: Secure must NOT be forced, so local curl smokes keep working.
    expect(c).not.toMatch(/;\s*Secure/i);
    expect(plain.headers.get("strict-transport-security")).toBeNull();

    // https edge (x-forwarded-proto): Secure flag + HSTS appear.
    const tlsEmail = `tls-${Date.now()}@sec-harden.test`;
    const tls = await api("/api/register", {
      method: "POST",
      body: { email: tlsEmail, password: "HardenPass2026!" },
      headers: { "x-forwarded-proto": "https" },
    });
    expect(tls.status).toBe(200);
    expect(tls.setCookie || "").toMatch(/;\s*Secure/i);
    expect(tls.headers.get("strict-transport-security")).toMatch(/^max-age=31536000/);
  });

  it("rejects XSS/`</script>` and malformed emails at registration (no stored-XSS input)", async () => {
    const evil = `a</script><script>alert(1)</script>@sec-harden.test`;
    const r1 = await api("/api/register", { method: "POST", body: { email: evil, password: "HardenPass2026!" } });
    expect(r1.status).toBe(400);
    expect(r1.json?.error).toBeTruthy();

    const bad = await api("/api/register", { method: "POST", body: { email: "not-an-email", password: "HardenPass2026!" } });
    expect(bad.status).toBe(400);

    // Uppercase + whitespace normalizes to lowercase; account then logs in.
    const upEmail = `Mixed${Date.now()}@Sec-Harden.Test`;
    const ok = await api("/api/register", { method: "POST", body: { email: upEmail, password: "HardenPass2026!" } });
    expect(ok.status).toBe(200);
    const login = await api("/api/login", { method: "POST", body: { email: upEmail, password: "HardenPass2026!" } });
    expect(login.status).toBe(200);
    expect(login.setCookie).toMatch(/^session=/);
  });

  it("rate limits auth/lead-adjacent endpoints (check-user-exists → 429)", async () => {
    let saw429 = false;
    for (let i = 0; i < 25; i++) {
      const r = await api("/api/check-user-exists", {
        method: "POST",
        body: { email: `probe-${i}-${Date.now()}@sec-harden.test` },
      });
      if (r.status === 429) { saw429 = true; break; }
      expect([200, 400]).toContain(r.status);
    }
    expect(saw429).toBe(true);
  });

  it("returns generic error bodies (no stack traces or internal paths)", async () => {
    // Validation 400: generic message, zero internal leakage.
    const missingFields = await api("/api/register", { method: "POST", body: {} });
    expect(missingFields.status).toBe(400);
    let body = JSON.stringify(missingFields.json);
    expect(body).toContain("\"error\"");
    expect(body).not.toMatch(/prod-server|at\s+\w|\.ts:\d+|\/home\//);

    // Malformed JSON hits the catch handler: still 400 + generic body.
    const malformed = await api("/api/register", { method: "POST", rawBody: "{\"email\":" });
    expect(malformed.status).toBe(400);
    body = JSON.stringify(malformed.json);
    expect(body).not.toMatch(/prod-server|at\s+\w|\.ts:\d+|\/home\//);
  });

  it("fail-closed: /api/me without a session is 401", async () => {
    const r = await api("/api/me");
    expect(r.status).toBe(401);
    expect(r.json?.error).toBeTruthy();
  });
});