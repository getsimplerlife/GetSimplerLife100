/**
 * same-origin-164.test.ts — SLICE 164. Both directions, deliberately.
 *
 * THE BUG: the live deployment's own "Run a backup now" button was refused with
 * `403 cross-origin request refused`. The check compared the Origin header's
 * host with `new URL(req.url).host`, and behind the platform's TLS edge those are
 * not the same string. So the first half of this file proves the ACCEPT side
 * (a real browser on the real host, with the edge's headers) and the second half
 * proves the REFUSE side (a genuine cross-site request) still fails closed.
 */
import { describe, expect, it } from "vitest";
import { checkSameOrigin, checkRequestSameOrigin, hostOfOrigin, normalizeHost } from "~/lib/same-origin";

describe("slice 164 — a same-origin POST from the deployed site is accepted", () => {
  it("accepts when the Origin matches the Host header even though req.url disagrees", () => {
    // The exact live shape: the browser sends Origin = the public host; the
    // process believes it is serving an internal address.
    const result = checkSameOrigin({
      origin: "https://simplerlife100.cto.site",
      host: "simplerlife100.cto.site",
      urlHost: "localhost:3000",
    });
    expect(result.ok).toBe(true);
    expect(result.originHost).toBe("simplerlife100.cto.site");
    expect(result.reason).toContain("matches");
  });

  it("accepts when the Origin matches the edge's X-Forwarded-Host", () => {
    const result = checkSameOrigin({
      origin: "https://simplerlife100.cto.site",
      host: "internal:3000",
      forwardedHost: "simplerlife100.cto.site",
      urlHost: "internal:3000",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts the first value of a comma-separated X-Forwarded-Host", () => {
    const result = checkSameOrigin({
      origin: "https://simplerlife100.cto.site",
      forwardedHost: "simplerlife100.cto.site, edge.internal",
      urlHost: "127.0.0.1:3000",
    });
    expect(result.ok).toBe(true);
  });

  it("still accepts the old comparison's case (Origin host === req.url host)", () => {
    const result = checkSameOrigin({
      origin: "http://localhost:3000",
      urlHost: "localhost:3000",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a host named by EXTRA_ALLOWED_ORIGINS", () => {
    const result = checkSameOrigin({
      origin: "https://www.simplerlife100.com",
      host: "simplerlife100.cto.site",
      extraAllowed: "https://www.simplerlife100.com",
    });
    expect(result.ok).toBe(true);
  });

  it("treats a missing Origin header as not-a-cross-site-request", () => {
    const result = checkSameOrigin({ origin: null, host: "simplerlife100.cto.site" });
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("no Origin header");
  });

  it("reads the headers off a real Request-shaped object", () => {
    const headers = new Headers({
      origin: "https://simplerlife100.cto.site",
      host: "simplerlife100.cto.site",
      "x-forwarded-host": "simplerlife100.cto.site",
    });
    const req = { headers } as any;
    const result = checkRequestSameOrigin(req, "http://127.0.0.1:3000/api/admin/data-health/backup", {});
    expect(result.ok).toBe(true);
  });
});

describe("slice 164 — a genuine cross-site POST is still refused", () => {
  it("refuses an Origin on another host", () => {
    const result = checkSameOrigin({
      origin: "https://evil.example",
      host: "simplerlife100.cto.site",
      forwardedHost: "simplerlife100.cto.site",
      urlHost: "internal:3000",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("evil.example");
    expect(result.reason).toContain("refused");
  });

  it("refuses a look-alike subdomain", () => {
    const result = checkSameOrigin({
      origin: "https://simplerlife100.cto.site.evil.example",
      host: "simplerlife100.cto.site",
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a different port on the same host", () => {
    const result = checkSameOrigin({ origin: "https://simplerlife100.cto.site:8443", host: "simplerlife100.cto.site" });
    expect(result.ok).toBe(false);
  });

  it("refuses a different scheme's host only when the port differs (scheme is not the comparison)", () => {
    // http://host and https://host share a host:port-less host string; the check
    // is a host comparison, and the cookie's Secure/SameSite flags are what cover
    // the scheme. Documented here so the behaviour is not a surprise later.
    const result = checkSameOrigin({ origin: "http://simplerlife100.cto.site", host: "simplerlife100.cto.site" });
    expect(result.ok).toBe(true);
  });

  it('refuses Origin: null (sandboxed iframe / file:// page)', () => {
    const result = checkSameOrigin({ origin: "null", host: "simplerlife100.cto.site" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("null");
  });

  it("refuses an unparseable Origin", () => {
    const result = checkSameOrigin({ origin: "not a url", host: "simplerlife100.cto.site" });
    // "not a url" normalises to a bare host that matches nothing.
    expect(result.ok).toBe(false);
  });

  it("refuses when the process knows no hosts at all", () => {
    const result = checkSameOrigin({ origin: "https://simplerlife100.cto.site" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("none known");
  });

  it("reads the headers off a real Request-shaped object", () => {
    const headers = new Headers({ origin: "https://evil.example", host: "simplerlife100.cto.site" });
    const result = checkRequestSameOrigin({ headers } as any, "https://simplerlife100.cto.site/api/admin/data-health/backup", {});
    expect(result.ok).toBe(false);
  });
});

describe("slice 164 — host normalisation", () => {
  it("lowercases, trims and drops a trailing dot", () => {
    expect(normalizeHost("  SimplerLife100.CTO.site. ")).toBe("simplerlife100.cto.site");
  });
  it("keeps a port", () => {
    expect(normalizeHost("localhost:3000")).toBe("localhost:3000");
  });
  it("returns null for empty input", () => {
    expect(normalizeHost("   ")).toBeNull();
    expect(normalizeHost(null)).toBeNull();
  });
  it("extracts the host of a full origin, and accepts a bare host", () => {
    expect(hostOfOrigin("https://simplerlife100.cto.site")).toBe("simplerlife100.cto.site");
    expect(hostOfOrigin("simplerlife100.cto.site")).toBe("simplerlife100.cto.site");
    expect(hostOfOrigin("")).toBeNull();
  });
});
