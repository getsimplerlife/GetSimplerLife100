/**
 * SLICE 151 — rate limiting that actually limits (and does not leak memory).
 *
 * The old limiter in `prod-server.ts` keyed on the FIRST hop of `x-forwarded-for`
 * (client-supplied) and never pruned its Map. The tests below are the point of
 * the slice: they prove the spoofing hole is closed, the store is bounded, that
 * pruning works, that ordinary traffic is untouched, and that the guard is
 * actually wired into both entry points.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  RATE_LIMIT_LANES,
  RATE_LIMIT_MAX_KEYS,
  RATE_LIMIT_MESSAGE,
  RateLimiter,
  __resetRateLimits,
  guardRequest,
  inspectRateLimit,
  isTrustedProxy,
  laneForRequest,
  limiterFor,
  parseTrustedProxies,
  peerAddressFrom,
  rateLimitedResponse,
  resolveClientKey,
} from "../lib/rate-limit";
import { createDevRateLimitMiddleware } from "../lib/rate-limit-dev";

const REPO = join(__dirname, "..", "..");

function readSource(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8");
}

/** A guardRequest input for a request arriving on `peer` with `xff`. */
function req(pathname: string, method: string, peer: string | null, xff: string | null = null, trustedProxies?: string[]) {
  return {
    method,
    pathname,
    peerAddress: peer,
    header: (name: string) => (name.toLowerCase() === "x-forwarded-for" ? xff : null),
    trustedProxies,
  };
}

beforeEach(() => __resetRateLimits());

describe("rate-limit: the key comes from the connection, not the claim", () => {
  it("ignores x-forwarded-for when the peer is NOT a trusted proxy", () => {
    const resolved = resolveClientKey({
      peerAddress: "198.51.100.9",
      forwardedFor: "203.0.113.77",
      trustedProxies: ["loopback", "private"],
    });
    expect(resolved.source).toBe("peer");
    expect(resolved.key).toBe("198.51.100.9");
  });

  it("uses the LAST hop (proxy-appended), never the client-supplied first hop", () => {
    const resolved = resolveClientKey({
      peerAddress: "172.16.11.186", // platform proxy, private → trusted
      forwardedFor: "1.2.3.4, 52.12.147.227",
      trustedProxies: ["loopback", "private"],
    });
    expect(resolved.source).toBe("forwarded-last-hop");
    expect(resolved.key).toBe("52.12.147.227");
    expect(resolved.key).not.toBe("1.2.3.4");
  });

  it("trusts the loopback and private peers this deployment actually has (IPv4-mapped form included)", () => {
    const rules = parseTrustedProxies(undefined);
    expect(isTrustedProxy("::ffff:172.16.11.186", rules)).toBe(true); // measured on this box
    expect(isTrustedProxy("::1", rules)).toBe(true);
    expect(isTrustedProxy("127.0.0.1", rules)).toBe(true);
    expect(isTrustedProxy("52.12.147.227", rules)).toBe(false);
  });

  it("falls back to the peer when a trusted proxy sends no usable header", () => {
    const resolved = resolveClientKey({ peerAddress: "172.16.11.186", forwardedFor: null, trustedProxies: ["private"] });
    expect(resolved.key).toBe("172.16.11.186");
    expect(resolved.source).toBe("peer");
  });

  it("never lets header junk become a key", () => {
    for (const junk of ["not-an-ip", "<script>", "1.2.3.4, unknown", "  ", "999.1.1.1"]) {
      const resolved = resolveClientKey({ peerAddress: "172.16.11.186", forwardedFor: junk, trustedProxies: ["private"] });
      expect(resolved.key).toBe("172.16.11.186");
    }
  });

  it("honours an explicit TRUSTED_PROXY_ADDRESSES list, including a public proxy address", () => {
    const rules = parseTrustedProxies("203.0.113.10, 10.0.0.0/8");
    expect(rules).toEqual(["203.0.113.10", "10.0.0.0/8"]);
    expect(isTrustedProxy("203.0.113.10", rules)).toBe(true);
    expect(isTrustedProxy("10.4.5.6", rules)).toBe(true);
    expect(isTrustedProxy("10.4.5.6", ["loopback"])).toBe(false);
    expect(isTrustedProxy("198.51.100.9", rules)).toBe(false);
  });
});

describe("rate-limit: spoofing does not reset the budget (the original defect)", () => {
  it("30 requests from ONE peer, each with a DIFFERENT x-forwarded-for, still trips the limiter", () => {
    // Password-reset lane: 10/min. Spoofed headers must not buy extra requests.
    let blocked = 0;
    let allowed = 0;
    for (let i = 0; i < 30; i++) {
      const res = guardRequest(req("/api/request-password-reset", "POST", "198.51.100.9", `10.0.0.${i}`));
      if (res) blocked++;
      else allowed++;
    }
    expect(allowed).toBe(RATE_LIMIT_LANES.reset.max);
    expect(blocked).toBe(30 - RATE_LIMIT_LANES.reset.max);
    expect(blocked).toBeGreaterThan(0);
  });

  it("30 spoofed requests still trip a small limiter driven through the same key resolution", () => {
    const limiter = new RateLimiter({ max: 5, windowMs: 60_000, maxKeys: 100 });
    let blocked = 0;
    for (let i = 0; i < 30; i++) {
      const { key } = resolveClientKey({
        peerAddress: "198.51.100.9",
        forwardedFor: `10.0.${i}.1`,
        trustedProxies: ["loopback", "private"],
      });
      if (!limiter.check(key).allowed) blocked++;
    }
    // 5 allowed, 25 blocked — and crucially only ONE bucket exists.
    expect(blocked).toBe(25);
    expect(limiter.size).toBe(1);
  });

  it("a trusted proxy still cannot be spoofed into a fresh bucket, because the first hop is ignored", () => {
    let blocked = 0;
    for (let i = 0; i < 30; i++) {
      // Attacker prepends a random hop; the proxy appends the real client IP.
      const res = guardRequest(req("/api/request-password-reset", "POST", "172.16.11.186", `10.0.0.${i}, 52.12.147.227`));
      if (res) blocked++;
    }
    expect(blocked).toBe(30 - RATE_LIMIT_LANES.reset.max);
    expect(limiterFor("reset").size).toBe(1);
  });
});

describe("rate-limit: the store is bounded (no unbounded memory growth)", () => {
  it("20 000 distinct keys never grow a lane past its cap", () => {
    const limiter = limiterFor("invoice-share");
    for (let i = 0; i < 20_000; i++) limiter.check(`198.51.${Math.floor(i / 256)}.${i % 256}`);
    expect(limiter.size).toBeLessThanOrEqual(RATE_LIMIT_MAX_KEYS);
    expect(limiter.size).toBe(RATE_LIMIT_MAX_KEYS);
    expect(limiter.stats.evictions).toBeGreaterThan(0);
  });

  it("the same flood through guardRequest (spoofed peer addresses) stays capped", () => {
    for (let i = 0; i < 12_000; i++) {
      guardRequest(req("/api/native/invoice/share/si_probe", "GET", `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`));
    }
    expect(limiterFor("invoice-share").size).toBeLessThanOrEqual(RATE_LIMIT_MAX_KEYS);
  });

  it("a small cap evicts the oldest bucket rather than refusing new clients", () => {
    const limiter = new RateLimiter({ max: 3, windowMs: 60_000, maxKeys: 10 });
    for (let i = 0; i < 50; i++) limiter.check(`client-${i}`);
    expect(limiter.size).toBe(10);
    // A brand-new client is still served (fail-open on eviction).
    expect(limiter.check("client-fresh").allowed).toBe(true);
  });

  it("RATE_LIMIT_MAX_KEYS is a real, named ceiling (not 'whatever the attacker sends')", () => {
    expect(RATE_LIMIT_MAX_KEYS).toBeGreaterThan(0);
    expect(RATE_LIMIT_MAX_KEYS).toBeLessThanOrEqual(10_000);
  });
});

describe("rate-limit: pruning", () => {
  it("entries older than the window are removed, so a later burst is not permanently blocked", () => {
    let now = 1_000_000;
    const limiter = new RateLimiter({ max: 2, windowMs: 60_000, maxKeys: 100, now: () => now });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false); // burst trips

    now += 60_001; // quiet window passes
    limiter.prune(now);
    expect(limiter.size).toBe(0);
    expect(limiter.check("a").allowed).toBe(true); // fresh budget
  });

  it("sweeps expired buckets on write (amortised), without needing an external timer", () => {
    let now = 1_000_000;
    const limiter = new RateLimiter({ max: 5, windowMs: 1_000, maxKeys: 100, now: () => now });
    for (let i = 0; i < 50; i++) limiter.check(`k-${i}`);
    expect(limiter.size).toBe(50);
    now += 1_001;
    limiter.check("k-new"); // triggers the amortised sweep
    expect(limiter.size).toBe(1);
    expect(limiter.stats.sweeps).toBeGreaterThan(0);
  });

  it("a blocked client's window rolls forward instead of blocking forever", () => {
    let now = 0;
    const limiter = new RateLimiter({ max: 1, windowMs: 1_000, maxKeys: 10, now: () => now });
    expect(limiter.check("x").allowed).toBe(true);
    const decision = limiter.check("x");
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterMs).toBeGreaterThan(0);
    expect(decision.retryAfterMs).toBeLessThanOrEqual(1_000);
    now += 1_001;
    expect(limiter.check("x").allowed).toBe(true);
  });
});

describe("rate-limit: a genuine client is never blocked", () => {
  it("ordinary navigations are not guarded at all", () => {
    for (const path of ["/", "/features", "/pricing", "/how-it-works", "/portal", "/login", "/api/health", "/api/me", "/portal/billing"]) {
      expect(laneForRequest(path, "GET")).toBeNull();
      expect(guardRequest(req(path, "GET", "198.51.100.9"))).toBeNull();
    }
  });

  it("a client under the budget passes every lane, every time", () => {
    for (let i = 0; i < 5; i++) {
      expect(guardRequest(req("/api/login", "POST", "198.51.100.9", `10.0.0.${i}`))).toBeNull();
      expect(guardRequest(req("/api/native/invoice/share/si_x", "GET", "198.51.100.9"))).toBeNull();
      expect(guardRequest(req("/api/request-password-reset", "POST", "198.51.100.9"))).toBeNull();
    }
  });

  it("one client's flood does not block a different client", () => {
    for (let i = 0; i < 15; i++) guardRequest(req("/api/request-password-reset", "POST", "198.51.100.9"));
    expect(guardRequest(req("/api/request-password-reset", "POST", "198.51.100.9"))?.status).toBe(429);
    expect(guardRequest(req("/api/request-password-reset", "POST", "203.0.113.5"))).toBeNull();
  });

  it("keeps the documented 429 body and adds a bounded Retry-After", async () => {
    const direct = rateLimitedResponse(30_000);
    expect(direct.status).toBe(429);
    expect(await direct.json()).toEqual({ error: RATE_LIMIT_MESSAGE });
    expect(direct.headers.get("Retry-After")).toBe("30");

    let tripped: Response | null = null;
    for (let i = 0; i < 20 && !tripped; i++) tripped = guardRequest(req("/api/request-password-reset", "POST", "198.51.100.9"));
    expect(tripped?.status).toBe(429);
    expect(await tripped!.json()).toEqual({ error: "Too many requests. Please try again later." });
    expect(Number(tripped!.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("rate-limit: wiring — the lanes exist and both entry points use them", () => {
  it("maps login, password reset and the public invoice view lane to their lanes", () => {
    expect(laneForRequest("/api/login", "POST")).toBe("login");
    expect(laneForRequest("/login", "POST")).toBe("login"); // no-JS form fallback: same lane
    expect(laneForRequest("/api/request-password-reset", "POST")).toBe("reset");
    expect(laneForRequest("/api/set-password", "POST")).toBe("set-password");
    expect(laneForRequest("/api/register", "POST")).toBe("register");
    expect(laneForRequest("/api/check-user-exists", "POST")).toBe("check-user");
    expect(laneForRequest("/api/tools/capture-lead", "POST")).toBe("lead");
    expect(laneForRequest("/api/purchase/status", "GET")).toBe("purchase-status");
    expect(laneForRequest("/api/native/invoice/share/si_abc", "GET")).toBe("invoice-share");
    expect(laneForRequest("/api/native/survey/share/sv_abc", "GET")).toBe("survey-share");
    expect(laneForRequest("/api/native/booking/share/bk_abc", "GET")).toBe("booking-share");
    // Wrong verb is not a lane — and never a way around one.
    expect(laneForRequest("/api/native/invoice/share/si_abc", "POST")).toBeNull();
    expect(laneForRequest("/api/login", "GET")).toBeNull();
  });

  it("the login lane really trips, with the exact 429 body", async () => {
    const max = RATE_LIMIT_LANES.login.max;
    for (let i = 0; i < max; i++) {
      expect(guardRequest(req("/api/login", "POST", "198.51.100.9", `10.1.0.${i}`))).toBeNull();
    }
    const tripped = guardRequest(req("/api/login", "POST", "198.51.100.9", "10.1.0.99"));
    expect(tripped?.status).toBe(429);
    expect(await tripped!.json()).toEqual({ error: "Too many requests. Please try again later." });
  });

  it("the public invoice view lane really trips", () => {
    const max = RATE_LIMIT_LANES["invoice-share"].max;
    for (let i = 0; i < max; i++) {
      expect(guardRequest(req("/api/native/invoice/share/si_abc", "GET", "198.51.100.9", `10.2.0.${i}`))).toBeNull();
    }
    expect(guardRequest(req("/api/native/invoice/share/si_abc", "GET", "198.51.100.9"))?.status).toBe(429);
  });

  it("inspectRateLimit reports the lane + client source for diagnostics", () => {
    const info = inspectRateLimit(req("/api/native/invoice/share/si_abc", "GET", "172.16.11.186", "1.2.3.4, 52.12.147.227"));
    expect(info?.lane).toBe("invoice-share");
    expect(info?.client.source).toBe("forwarded-last-hop");
    expect(info?.client.key).toBe("52.12.147.227");
    expect(inspectRateLimit(req("/", "GET", "198.51.100.9"))).toBeNull();
  });

  it("prod-server.ts gates at ONE choke point, before the login and invoice branches", () => {
    const src = readSource("prod-server.ts");
    // The old, spoofable implementation is gone.
    expect(src).not.toContain("rateLimitBuckets");
    expect(src).not.toMatch(/x-forwarded-for[\s\S]{0,80}split\(","\)\[0\]/);
    expect(src).not.toMatch(/function clientIp\(/);
    // One gate, called with the SOCKET peer, not a header.
    const gateCalls = src.match(/guardRequest\(/g) || [];
    expect(gateCalls.length).toBe(1);
    expect(src).toContain("peerAddressFrom(server, req)");
    expect(src).toContain("async fetch(req, server)");
    const gateAt = src.indexOf("const blockedByRateLimit = guardRequest(");
    const loginBranch = src.indexOf('if (pathname === "/api/login" && req.method === "POST")');
    const invoiceBranch = src.indexOf('pathname.startsWith("/api/native/invoice/share/")');
    expect(gateAt).toBeGreaterThan(-1);
    expect(loginBranch).toBeGreaterThan(gateAt);
    expect(invoiceBranch).toBeGreaterThan(gateAt);
    // The old per-route calls were removed, so nothing double-counts.
    expect(src).not.toMatch(/\brateLimited\(req,/);
  });

  it("the dev listener installs the SAME limiter (vite config pin)", () => {
    const vite = readSource("vite.config.ts");
    expect(vite).toContain('from "./src/lib/rate-limit-dev"');
    expect(vite).toContain("devRateLimitPlugin()");
    const devSrc = readSource("src/lib/rate-limit-dev.ts");
    expect(devSrc).toContain("guardRequest(");
    expect(devSrc).toContain("req.socket?.remoteAddress");
  });
});

describe("rate-limit: the dev-listener middleware behaves like the published server", () => {
  function fakeReq(method: string, url: string, peer: string, headers: Record<string, string> = {}) {
    return { method, url, headers, socket: { remoteAddress: peer } } as any;
  }
  function fakeRes() {
    const state: { statusCode?: number; headers: Record<string, string>; body: string } = { headers: {}, body: "" };
    const res = {
      statusCode: 200,
      setHeader: (k: string, v: string) => {
        state.headers[k.toLowerCase()] = v;
      },
      end: (chunk?: string) => {
        state.body = chunk ?? "";
      },
    } as any;
    Object.defineProperty(res, "statusCode", {
      get: () => state.statusCode ?? 200,
      set: (v: number) => {
        state.statusCode = v;
      },
    });
    return { res, state };
  }

  it("passes ordinary navigations straight through", () => {
    const mw = createDevRateLimitMiddleware();
    let nexted = 0;
    for (const path of ["/", "/features", "/login"]) {
      mw(fakeReq("GET", path, "127.0.0.1"), fakeRes().res, () => nexted++);
    }
    expect(nexted).toBe(3);
  });

  it("trips on the login lane with the same 429 body, and spoofed headers do not help", async () => {
    const mw = createDevRateLimitMiddleware();
    const max = RATE_LIMIT_LANES.login.max;
    let nexted = 0;
    for (let i = 0; i < max; i++) {
      mw(fakeReq("POST", "/api/login", "198.51.100.9", { "x-forwarded-for": `10.9.${i}.1` }), fakeRes().res, () => nexted++);
    }
    expect(nexted).toBe(max);

    const { res, state } = fakeRes();
    let passed = false;
    mw(fakeReq("POST", "/api/login", "198.51.100.9", { "x-forwarded-for": "10.9.250.1" }), res, () => {
      passed = true;
    });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(JSON.parse(state.body)).toEqual({ error: "Too many requests. Please try again later." });
    expect(state.headers["content-type"]).toBe("application/json");
  });

  it("fails open if anything throws (a limiter must never take the listener down)", () => {
    const mw = createDevRateLimitMiddleware();
    const brokenReq = {
      method: "POST",
      get url() {
        throw new Error("boom");
      },
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    let nexted = 0;
    mw(brokenReq, fakeRes().res, () => nexted++);
    expect(nexted).toBe(1);
  });
});

describe("rate-limit: peerAddressFrom (Bun adapter)", () => {
  it("reads the socket address from the server object and never throws", () => {
    const request = new Request("http://localhost/api/login", { method: "POST" });
    expect(peerAddressFrom({ requestIP: () => ({ address: "198.51.100.9" }) }, request)).toBe("198.51.100.9");
    expect(peerAddressFrom({ requestIP: () => null }, request)).toBeNull();
    expect(peerAddressFrom(undefined, request)).toBeNull();
    expect(
      peerAddressFrom(
        {
          requestIP: () => {
            throw new Error("nope");
          },
        },
        request,
      ),
    ).toBeNull();
  });
});
