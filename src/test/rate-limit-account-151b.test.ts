/**
 * SLICE 151b — the limiter made observable, and the lane header games cannot
 * evade.
 *
 * Two things are being proved here:
 *
 *  1. THE DECISION IS OBSERVABLE. With `RATE_LIMIT_DEBUG=1` every guarded
 *     request emits exactly one structured line carrying the raw
 *     `x-forwarded-for` as received, the socket peer, the resolved key and the
 *     bucket counts — because two honest live probes disagreed about whether the
 *     limiter was working, and neither could say what key it had used. With the
 *     flag OFF there is no such line, and no header value reaches the normal log.
 *
 *  2. THE ACCOUNT IS THE BUDGET. The IP dimension is only as good as the address
 *     the proxy reports, and one client was measured egressing from two addresses
 *     alternately. So `login` and `reset` also key on the submitted address
 *     (hashed, never stored raw): thirty requests spread over thirty different
 *     client keys against ONE account are refused once that account's budget is
 *     spent. That is the bypass test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ACCOUNT_LANES,
  ACCOUNT_MAX_KEYS,
  __resetAccountLimits,
  __resetRateLimits,
  accountLimiterFor,
  accountSubjectKey,
  clearAccountBudget,
  guardAccount,
  guardRequest,
  normalizeAccountSubject,
  rateLimitDebugEnabled,
  rateLimitDebugLine,
  type RateLimitDebugEvent,
} from "../lib/rate-limit";

const REPO = join(__dirname, "..", "..");
function readSource(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8");
}

/** A guarded request from a distinct, untrusted peer (so the peer IS the key). */
function fromPeer(pathname: string, method: string, peer: string, xff: string | null = null) {
  return {
    method,
    pathname,
    peerAddress: peer,
    header: (name: string) => (name.toLowerCase() === "x-forwarded-for" ? xff : null),
  };
}

beforeEach(() => {
  __resetRateLimits();
  __resetAccountLimits();
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RATE_LIMIT_DEBUG;
});

// ── The bypass test ─────────────────────────────────────────────────────────

describe("151b: one account, thirty client keys — the account budget is what stops it", () => {
  it("reset: 30 requests from 30 different client addresses are refused after 5", () => {
    const email = "victim@example.com";
    const max = ACCOUNT_LANES.reset!.max;
    expect(max).toBe(5);

    const allowed: number[] = [];
    const blocked: number[] = [];
    for (let i = 0; i < 30; i++) {
      // A DIFFERENT client key on every request: the IP dimension never trips,
      // because each request is the first one its address has ever made.
      const clientBlocked = guardRequest(fromPeer("/api/request-password-reset", "POST", `198.51.100.${i + 1}`));
      expect(clientBlocked).toBeNull();
      const accountBlocked = guardAccount({ lane: "reset", email });
      if (accountBlocked) blocked.push(i);
      else allowed.push(i);
    }

    expect(allowed.length).toBe(max);
    expect(blocked.length).toBe(30 - max);
    // The first five go through, and everything from the sixth on is refused.
    expect(allowed).toEqual([0, 1, 2, 3, 4]);
  });

  it("login: 30 requests from 30 different client addresses are refused after 10", () => {
    const email = "victim@example.com";
    const max = ACCOUNT_LANES.login!.max;
    expect(max).toBe(10);

    let refused = 0;
    for (let i = 0; i < 30; i++) {
      expect(guardRequest(fromPeer("/api/login", "POST", `203.0.113.${i + 1}`))).toBeNull();
      if (guardAccount({ lane: "login", email })) refused++;
    }
    expect(refused).toBe(30 - max);
  });

  it("the refusal is a 429 with the contract body and a Retry-After", async () => {
    for (let i = 0; i < ACCOUNT_LANES.reset!.max; i++) guardAccount({ lane: "reset", email: "a@b.co" });
    const res = guardAccount({ lane: "reset", email: "a@b.co" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("Content-Type")).toBe("application/json");
    expect(Number(res!.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await res!.json()).toEqual({ error: "Too many requests. Please try again later." });
  });

  it("the budget is per ACCOUNT: another address has its own", () => {
    for (let i = 0; i < ACCOUNT_LANES.reset!.max; i++) guardAccount({ lane: "reset", email: "one@example.com" });
    expect(guardAccount({ lane: "reset", email: "one@example.com" })).not.toBeNull();
    expect(guardAccount({ lane: "reset", email: "two@example.com" })).toBeNull();
  });

  it("normalises the address so case/whitespace cannot buy a fresh bucket", () => {
    expect(normalizeAccountSubject("  Victim@Example.COM ")).toBe("victim@example.com");
    for (let i = 0; i < ACCOUNT_LANES.reset!.max; i++) guardAccount({ lane: "reset", email: "victim@example.com" });
    // Same account, different spelling — still refused.
    expect(guardAccount({ lane: "reset", email: " VICTIM@example.com " })).not.toBeNull();
  });

  it("a proven login clears that account's failure budget", () => {
    for (let i = 0; i < ACCOUNT_LANES.login!.max; i++) guardAccount({ lane: "login", email: "owner@example.com" });
    expect(guardAccount({ lane: "login", email: "owner@example.com" })).not.toBeNull();
    clearAccountBudget("login", "owner@example.com");
    expect(guardAccount({ lane: "login", email: "owner@example.com" })).toBeNull();
  });

  it("lanes without an account budget are untouched", () => {
    expect(accountLimiterFor("register")).toBeNull();
    for (let i = 0; i < 50; i++) expect(guardAccount({ lane: "register", email: "x@y.z" })).toBeNull();
  });

  it("an empty submission gets the client dimension only, never a shared bucket", () => {
    expect(accountSubjectKey("")).toBeNull();
    expect(accountSubjectKey("   ")).toBeNull();
    for (let i = 0; i < 50; i++) expect(guardAccount({ lane: "reset", email: "" })).toBeNull();
  });
});

// ── The account key is a pseudonym, not the address ─────────────────────────

describe("151b: the account key never holds the submitted address", () => {
  it("is a domain-separated sha256 hex digest, stable across case/whitespace", () => {
    const key = accountSubjectKey("Victim@Example.com");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("victim");
    expect(key).not.toContain("@");
    expect(accountSubjectKey("  victim@example.COM ")).toBe(key);
    expect(accountSubjectKey("other@example.com")).not.toBe(key);
  });

  it("the account bucket map is bounded, like the client lanes", () => {
    const limiter = accountLimiterFor("reset")!;
    expect(limiter.maxKeys).toBe(ACCOUNT_MAX_KEYS);
    for (let i = 0; i < ACCOUNT_MAX_KEYS + 50; i++) limiter.check(accountSubjectKey(`flood-${i}@example.com`)!);
    expect(limiter.size).toBeLessThanOrEqual(ACCOUNT_MAX_KEYS);
  });
});

// ── The debug line ──────────────────────────────────────────────────────────

describe("151b: RATE_LIMIT_DEBUG emits one line per guarded request, and nothing when off", () => {
  it("carries lane, method, pathname, raw xff, peer, key and bucket counts", () => {
    const lines: string[] = [];
    const sink = (line: string) => lines.push(line);

    guardRequest({
      ...fromPeer("/api/request-password-reset", "POST", "172.16.11.186", "198.51.100.77"),
      debug: { enabled: true, sink },
    });

    expect(lines.length).toBe(1);
    expect(lines[0].startsWith("[rate-limit-debug] ")).toBe(true);
    expect(lines[0]).not.toContain("\n");
    const payload = JSON.parse(lines[0].slice("[rate-limit-debug] ".length));
    expect(payload).toMatchObject({
      lane: "reset",
      dimension: "client",
      method: "POST",
      pathname: "/api/request-password-reset",
      xff: "198.51.100.77",
      xffHops: 1,
      peer: "172.16.11.186",
      source: "forwarded-last-hop",
      usedBefore: 0,
      usedAfter: 1,
      decision: "allowed",
    });
    // The key is the proxy-written hop, masked — not the raw header line.
    expect(payload.key).toBe("198.…0.77");
    expect(typeof payload.max).toBe("number");
    expect(typeof payload.windowMs).toBe("number");
    expect(typeof payload.retryAfterMs).toBe("number");
  });

  it("reports the account block itself, with the counts that caused it", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.RATE_LIMIT_DEBUG = "1";
    const max = ACCOUNT_LANES.reset!.max;
    for (let i = 0; i <= max; i++) guardAccount({ lane: "reset", email: "a@b.co" });

    const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[rate-limit-debug]"));
    expect(lines.length).toBe(max + 1);
    const last = JSON.parse(lines[lines.length - 1].slice("[rate-limit-debug] ".length));
    expect(last).toMatchObject({
      lane: "reset",
      dimension: "account",
      method: "POST",
      decision: "blocked",
      usedBefore: max,
      usedAfter: max,
      max,
    });
    expect(last.retryAfterMs).toBeGreaterThan(0);
  });

  it("emits NOTHING when the flag is off", () => {
    const sink = vi.fn();
    guardRequest({ ...fromPeer("/api/login", "POST", "198.51.100.9"), debug: { enabled: false, sink } });
    expect(sink).not.toHaveBeenCalled();
  });

  it("reads the flag from the environment, and is off by default", () => {
    expect(rateLimitDebugEnabled(undefined)).toBe(false);
    expect(rateLimitDebugEnabled("")).toBe(false);
    expect(rateLimitDebugEnabled("0")).toBe(false);
    expect(rateLimitDebugEnabled("1")).toBe(true);
    expect(rateLimitDebugEnabled("true")).toBe(true);
    expect(rateLimitDebugEnabled("ON")).toBe(true);
  });

  it("honours process.env.RATE_LIMIT_DEBUG for a real request, and stays silent otherwise", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    guardRequest(fromPeer("/api/login", "POST", "198.51.100.9"));
    expect(spy.mock.calls.filter((c) => String(c[0]).startsWith("[rate-limit-debug]")).length).toBe(0);

    process.env.RATE_LIMIT_DEBUG = "1";
    guardRequest(fromPeer("/api/login", "POST", "198.51.100.9"));
    const debugLines = spy.mock.calls.filter((c) => String(c[0]).startsWith("[rate-limit-debug]"));
    expect(debugLines.length).toBe(1);
  });
});

// ── No header leakage into normal logs ──────────────────────────────────────

describe("151b: header values never reach the normal log", () => {
  it("a blocked request's ordinary line carries the lane/source/key and no header text", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const spoof = "203.0.113.201";
    // Trip the lane from a trusted peer whose header is the only source of a key.
    for (let i = 0; i < 15; i++) {
      guardRequest(fromPeer("/api/request-password-reset", "POST", "172.16.11.186", spoof));
    }
    const ordinary = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[rate-limit] 429"));
    expect(ordinary.length).toBeGreaterThan(0);
    for (const line of ordinary) {
      expect(line).not.toContain(spoof);
      expect(line).not.toContain("x-forwarded-for");
    }
    // And with the flag off, no debug line was written at all.
    expect(spy.mock.calls.some((c) => String(c[0]).startsWith("[rate-limit-debug]"))).toBe(false);
  });

  it("the debug line masks the account key and never contains the raw address", () => {
    const evt: RateLimitDebugEvent = {
      lane: "reset",
      dimension: "account",
      method: "POST",
      pathname: "/api/request-password-reset",
      xff: null,
      xffHops: null,
      peer: null,
      key: accountSubjectKey("victim@example.com")!.slice(0, 4) + "…" + accountSubjectKey("victim@example.com")!.slice(-4),
      source: "unknown",
      usedBefore: 4,
      usedAfter: 5,
      max: 5,
      windowMs: 3_600_000,
      decision: "allowed",
      retryAfterMs: 0,
    };
    const line = rateLimitDebugLine(evt);
    expect(line).not.toContain("victim@example.com");
    expect(line).not.toContain("victim");
  });

  it("strips control characters and caps the header so it cannot forge a second line", () => {
    const lines: string[] = [];
    guardRequest({
      ...fromPeer("/api/login", "POST", "198.51.100.9", `1.2.3.4\nINJECTED-LINE-${"x".repeat(500)}`),
      debug: { enabled: true, sink: (l) => lines.push(l) },
    });
    // Exactly one line: the embedded newline did not start a second one.
    expect(lines.length).toBe(1);
    expect(lines[0]).not.toContain("\n");
    const payload = JSON.parse(lines[0].slice("[rate-limit-debug] ".length));
    expect(payload.xff.startsWith("1.2.3.4 ")).toBe(true);
    expect(payload.xff.length).toBeLessThanOrEqual(201); // 200 + the ellipsis
  });
});

// ── Wiring: the gate is reachable on the real server, at the real handlers ──

describe("151b: prod-server.ts wires the account dimension at every secret-verifying handler", () => {
  const src = readSource("prod-server.ts");

  it("still has exactly ONE client-dimension choke point", () => {
    expect((src.match(/guardRequest\(/g) || []).length).toBe(1);
  });

  it("gates the reset lane before anything is minted or mailed", () => {
    const branch = src.indexOf('if (pathname === "/api/request-password-reset" && req.method === "POST")');
    const gate = src.indexOf('guardAccount({ lane: "reset"', branch);
    const mint = src.indexOf("newPasswordResetRecord", branch);
    const mail = src.indexOf("sendEmailSMTP", branch);
    expect(branch).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(branch);
    expect(mint).toBeGreaterThan(gate);
    expect(mail).toBeGreaterThan(gate);
  });

  it("gates the login lane before the password is verified", () => {
    const apiBranch = src.indexOf('if (pathname === "/api/login" && req.method === "POST")');
    const apiGate = src.indexOf('guardAccount({ lane: "login"', apiBranch);
    const handleCall = src.indexOf("handleLogin(body)", apiBranch);
    expect(apiGate).toBeGreaterThan(apiBranch);
    expect(handleCall).toBeGreaterThan(apiGate);

    // The no-JS form fallback verifies the same secret and carries the same gate.
    const formBranch = src.indexOf('if (pathname === "/login" && req.method === "POST")');
    const formGate = src.indexOf('guardAccount({ lane: "login"', formBranch);
    const compare = src.indexOf("await compare(password, user.password)", formBranch);
    expect(formGate).toBeGreaterThan(formBranch);
    expect(compare).toBeGreaterThan(formGate);
  });

  it("clears the login budget on success, so a proven user is not held at the edge", () => {
    expect(src).toContain('clearAccountBudget("login", email)');
    expect((src.match(/clearAccountBudget\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
