/**
 * SLICE 151 — rate limiting that actually limits (and does not leak memory).
 *
 * WHY THIS MODULE EXISTS
 * The limiter that lived inside `prod-server.ts` had three defects, all of them
 * real and all of them measured on 2026-10-31:
 *
 *  1. THE KEY WAS ATTACKER-CONTROLLED. It took the FIRST entry of
 *     `x-forwarded-for` — a request header the client writes. Sending a random
 *     value per request therefore produced a fresh bucket per request and the
 *     limit never fired. A limiter keyed on a value the caller chooses is
 *     decorative.
 *  2. THE MAP WAS NEVER PRUNED. Keys were only ever added, so the same
 *     attacker-driven key explosion grew memory for the life of the process.
 *  3. IT LIVED IN ONE FILE. Only `prod-server.ts` had any limiter; the dev
 *     listener had none, and a route added anywhere else silently had none.
 *
 * WHAT REPLACES IT
 *  - `resolveClientKey` trusts the CONNECTION. The peer address from the socket
 *    is the default key. A forwarding header is consulted ONLY when the peer is
 *    a configured trusted proxy, and then only its LAST hop (the one that proxy
 *    appended) is used — never the client-supplied first hop. If the peer is not
 *    a trusted proxy the header is ignored completely, which is the whole point:
 *    a remote attacker cannot make us believe a different source address.
 *  - `RateLimiter` is bounded: expired timestamps are swept on a timer-free,
 *    amortised schedule, and the number of live keys is capped with LRU
 *    eviction, so a spoofed-header flood cannot grow memory without bound. A
 *    bounded limiter that occasionally forgets an old key is strictly better
 *    than an unbounded one that remembers everything forever.
 *  - `guardRequest` is the ONE call every entry point makes. `prod-server.ts`
 *    calls it once at the top of its dispatcher; the dev listener installs
 *    `createDevRateLimitMiddleware()`. A route cannot be reached on either
 *    entry point without passing through this module.
 *
 * SLICE 151b — WHAT THE PROXY ACTUALLY DOES, MEASURED (2026-10-31)
 * The lead could not reconcile two live probes: no `x-forwarded-for` blocked,
 * a spoofed one never did. So the gate now logs its own decision behind
 * `RATE_LIMIT_DEBUG=1` (see `rateLimitDebugLine`), and a request sent through
 * the public dev host with a KNOWN spoofed header settled it:
 *
 *   curl -H 'x-forwarded-for: 198.51.100.77' -X POST https://<dev-host>/api/request-password-reset
 *   [rate-limit-debug] {"lane":"reset","method":"POST","pathname":"/api/request-password-reset",
 *                       "xff":"44.244.130.109","xffHops":1,"peer":"::ffff:172.16.11.186",
 *                       "key":"44.244.130.109","source":"forwarded-last-hop",...}
 *
 * The client asked to be 198.51.100.77 and the gate saw 44.244.130.109: ONE hop,
 * the address the proxy observed. So the platform proxy REPLACES
 * `x-forwarded-for` with what it saw; it does not append to the client's value,
 * and the client's value never reaches this module. Consequences, all of them
 * load-bearing:
 *   - the last hop is written by the proxy, so it cannot be forged by a client;
 *     the "last hop, and only from a trusted proxy" rule below is therefore the
 *     correct key selection and is kept;
 *   - the address the proxy reports is the client's EGRESS address, and a
 *     single client can egress from more than one address (measured: one
 *     sandbox, 20 requests, alternating 52.12.147.227 / 44.244.130.109 exactly
 *     10/10). One client's flood therefore splits across buckets and an
 *     IP-keyed budget is only a speed bump. That is why this slice adds the
 *     per-ACCOUNT dimension below: it is keyed on what the attacker is trying
 *     to guess, not on an address they can change.
 *   - a probe that does not fix the window state is not a measurement: the
 *     "0 of 16 blocked" reading is exactly 8+8 hits against two buckets with a
 *     budget of 10.
 *
 * HONEST LIMITS (stated, not hidden)
 *  - Buckets are per process. Two processes do not share a budget.
 *  - Every budget in this module is IN MEMORY: a restart forgets all of them.
 *    That is accepted deliberately — persisting them would put an attacker-
 *    controlled key space on disk, and the alternative (a durable store on the
 *    auth path) adds a failure mode to login. A restart therefore buys an
 *    attacker one fresh budget, and nothing more; it cannot be triggered from
 *    outside (no route restarts the process).
 *  - A trusted-proxy deployment where the proxy is NOT loopback/private needs
 *    `TRUSTED_PROXY_ADDRESSES` set to that proxy address; otherwise every
 *    client collapses into the proxy's single bucket and the lane behaves as a
 *    global limit. The resolved configuration is logged at boot by both entry
 *    points so this is never a silent guess.
 *  - Eviction can forget a legitimate client's window early. That direction is
 *    deliberate: failing open is the only failure mode a limiter may have.
 */

import { createHash } from "crypto";

export type RateLimitLane =
  | "login"
  | "register"
  | "check-user"
  | "reset"
  | "set-password"
  | "purchase-status"
  | "lead"
  | "invoice-share"
  | "survey-share"
  | "booking-share";

export interface LanePolicy {
  /** Requests allowed per window per client key. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

const MINUTE = 60_000;

/**
 * Per-lane budgets. Ordering rationale: the tighter the budget, the more the
 * lane costs an attacker — password reset and lead capture send email, login
 * verifies a password (bcrypt), set-password burns a reset code. The public
 * share lanes are read-only and slug-gated, so they get room for a real human
 * clicking around while still being bounded.
 */
export const RATE_LIMIT_LANES: Record<RateLimitLane, LanePolicy> = {
  login: { max: 60, windowMs: MINUTE },
  register: { max: 20, windowMs: MINUTE },
  "check-user": { max: 20, windowMs: MINUTE },
  reset: { max: 10, windowMs: MINUTE },
  "set-password": { max: 20, windowMs: MINUTE },
  "purchase-status": { max: 120, windowMs: MINUTE },
  lead: { max: 10, windowMs: MINUTE },
  "invoice-share": { max: 120, windowMs: MINUTE },
  "survey-share": { max: 120, windowMs: MINUTE },
  "booking-share": { max: 120, windowMs: MINUTE },
};

/** Default ceiling on live buckets PER LANE. 10 lanes × 5 000 keys is the worst
 *  case the process can ever hold (~50 000 small entries), which is a bounded,
 *  named cost rather than "whatever the attacker sends". */
export const RATE_LIMIT_MAX_KEYS = 5_000;

/** The 429 body is part of the API contract — keep it byte-identical. */
export const RATE_LIMIT_MESSAGE = "Too many requests. Please try again later.";

// ── Lane routing ────────────────────────────────────────────────────────────
// Mapping lives HERE, not scattered through the dispatcher, so "which routes are
// limited" is one readable table and can be asserted by a test.

const SHARE_PREFIXES: Array<[string, RateLimitLane]> = [
  ["/api/native/invoice/share/", "invoice-share"],
  ["/api/native/survey/share/", "survey-share"],
  ["/api/native/booking/share/", "booking-share"],
];

const EXACT_LANES: Array<[string, string, RateLimitLane]> = [
  // [pathname, method, lane]
  ["/api/login", "POST", "login"],
  // The no-JS form fallback on /login also verifies a password (bcrypt) and is
  // reachable without a session — it is the same lane, not a way around it.
  ["/login", "POST", "login"],
  ["/api/register", "POST", "register"],
  ["/api/check-user-exists", "POST", "check-user"],
  ["/api/request-password-reset", "POST", "reset"],
  ["/api/set-password", "POST", "set-password"],
  ["/api/purchase/status", "GET", "purchase-status"],
  ["/api/tools/capture-lead", "POST", "lead"],
];

/**
 * Which lane (if any) a request belongs to. Returns null for everything else —
 * ordinary navigations are never rate limited, by design.
 */
export function laneForRequest(pathname: string, method: string): RateLimitLane | null {
  const m = (method || "GET").toUpperCase();
  for (const [path, verb, lane] of EXACT_LANES) {
    if (pathname === path && m === verb) return lane;
  }
  for (const [prefix, lane] of SHARE_PREFIXES) {
    if (pathname.startsWith(prefix) && (m === "GET" || m === "HEAD")) return lane;
  }
  return null;
}

// ── Address handling ────────────────────────────────────────────────────────

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:.]+$/;

function isIpv4(ip: string): boolean {
  if (!IPV4.test(ip)) return false;
  return ip.split(".").every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function isIpv6(ip: string): boolean {
  // Deliberately structural, not a full validator: enough to reject header
  // junk ("unknown", "1.2.3.4,", "<script>") while accepting real addresses.
  return IPV6.test(ip) && ip.includes(":");
}

/** Strip a port / brackets from a hop, then keep it only if it is a real IP. */
function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;
  // "[::1]:443" → "::1"
  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) value = bracketed[1];
  // "203.0.113.9:51234" → "203.0.113.9" (single colon + dotted quad only)
  const v4Port = value.match(/^((?:\d{1,3}\.){3}\d{1,3}):\d+$/);
  if (v4Port) value = v4Port[1];
  if (isIpv4(value)) return value;
  if (isIpv6(value)) return value.toLowerCase();
  return null;
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inIpv4Cidr(ip: string, base: string, bits: number): boolean {
  if (!isIpv4(ip) || !isIpv4(base)) return false;
  if (bits <= 0) return true;
  if (bits > 32) bits = 32;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1) >>> 0);
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const PRIVATE_IPV4_CIDRS: Array<[string, number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
];

function isLoopback(ip: string): boolean {
  return ip === "::1" || ip === "0:0:0:0:0:0:0:1" || inIpv4Cidr(ip, "127.0.0.0", 8);
}

function isPrivateAddress(ip: string): boolean {
  if (isLoopback(ip)) return true;
  if (isIpv4(ip)) return PRIVATE_IPV4_CIDRS.some(([base, bits]) => inIpv4Cidr(ip, base, bits));
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10), plus IPv4-mapped.
  const v6 = ip.toLowerCase();
  if (v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb")) {
    return true;
  }
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice("::ffff:".length));
  return false;
}

export interface TrustedProxyRule {
  /** Exact address, CIDR, or the keyword "loopback" / "private". */
  raw: string;
}

/**
 * Parse `TRUSTED_PROXY_ADDRESSES` (comma separated). Entries may be an exact IP,
 * a CIDR (`10.0.0.0/8`), or the keywords `loopback` / `private`.
 *
 * DEFAULT (env unset): loopback + private ranges. Why that is safe: those are
 * source addresses a remote attacker cannot present to us and complete a
 * connection with. It is also why we do not default to "trust any peer" — that
 * is precisely the defect this slice removes.
 */
export function parseTrustedProxies(raw?: string | null): string[] {
  const value = (raw ?? "").trim();
  if (!value) return ["loopback", "private"];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isTrustedProxy(address: string | null | undefined, rules: string[]): boolean {
  const ip = normalizeAddress(address);
  if (!ip) return false;
  for (const rule of rules) {
    const r = rule.trim().toLowerCase();
    if (!r) continue;
    if (r === "loopback") {
      if (isLoopback(ip)) return true;
      continue;
    }
    if (r === "private") {
      if (isPrivateAddress(ip)) return true;
      continue;
    }
    const cidr = r.match(/^(.+)\/(\d{1,3})$/);
    if (cidr) {
      if (inIpv4Cidr(ip, cidr[1], Number(cidr[2]))) return true;
      continue;
    }
    if (normalizeAddress(r) === ip) return true;
  }
  return false;
}

export type ClientKeySource = "peer" | "forwarded-last-hop" | "unknown";

export interface ResolvedClientKey {
  key: string;
  source: ClientKeySource;
  /** The peer address as we saw it on the socket (never client-supplied). */
  peer: string | null;
}

export interface ResolveClientKeyInput {
  /** Socket peer address — the trustworthy value. */
  peerAddress?: string | null;
  /** Raw `x-forwarded-for` header, if any. NEVER trusted on its own. */
  forwardedFor?: string | null;
  /** Trusted-proxy rules; defaults to `parseTrustedProxies(process.env…)`. */
  trustedProxies?: string[];
}

/**
 * Resolve the limiter key.
 *
 * FIRST HOP IS UNSAFE: `x-forwarded-for` is written by the caller. With one
 * proxy the header is "client", but a client can send its own header and the
 * proxy appends to it, so a request can arrive as "spoofed, real-client". The
 * value the proxy appended — the LAST hop — is the only entry we can attribute
 * to the connection, and even that only when the connection itself came from a
 * proxy we chose to trust.
 */
export function resolveClientKey(input: ResolveClientKeyInput): ResolvedClientKey {
  const peer = normalizeAddress(input.peerAddress ?? null);
  const rules = input.trustedProxies ?? parseTrustedProxies(process.env.TRUSTED_PROXY_ADDRESSES);

  if (peer && isTrustedProxy(peer, rules)) {
    const hops = String(input.forwardedFor || "")
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const lastHop = hops.length ? normalizeAddress(hops[hops.length - 1]) : null;
    if (lastHop) return { key: lastHop, source: "forwarded-last-hop", peer };
    // Trusted proxy but no usable header: fall back to the proxy itself.
    return { key: peer, source: "peer", peer };
  }

  if (peer) return { key: peer, source: "peer", peer };
  // No socket information at all (e.g. a test harness or a non-Bun adapter).
  // One shared bucket is the honest choice: it bounds the lane instead of
  // pretending to know who is calling.
  return { key: "unknown-peer", source: "unknown", peer: null };
}

// ── The bounded limiter ─────────────────────────────────────────────────────

export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  maxKeys?: number;
  /** Injectable clock — tests drive time, production uses Date.now. */
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window after this one. */
  remaining: number;
  /** How long until the oldest hit falls out of the window. */
  retryAfterMs: number;
  /** Hits already counted in this bucket when the request arrived. */
  usedBefore: number;
  /** Hits counted in this bucket after the request (unchanged when refused). */
  usedAfter: number;
}

export class RateLimiter {
  readonly max: number;
  readonly windowMs: number;
  readonly maxKeys: number;
  private readonly buckets = new Map<string, number[]>();
  private readonly clock: () => number;
  private lastSweepAt: number;
  private evictions = 0;
  private sweeps = 0;

  constructor(opts: RateLimiterOptions) {
    this.max = Math.max(1, Math.floor(opts.max));
    this.windowMs = Math.max(1, Math.floor(opts.windowMs));
    this.maxKeys = Math.max(1, Math.floor(opts.maxKeys ?? RATE_LIMIT_MAX_KEYS));
    this.clock = opts.now ?? (() => Date.now());
    this.lastSweepAt = this.clock();
  }

  /** Live bucket count — exported for tests and the admin-facing snapshot. */
  get size(): number {
    return this.buckets.size;
  }

  get stats(): { size: number; maxKeys: number; max: number; windowMs: number; evictions: number; sweeps: number } {
    return {
      size: this.buckets.size,
      maxKeys: this.maxKeys,
      max: this.max,
      windowMs: this.windowMs,
      evictions: this.evictions,
      sweeps: this.sweeps,
    };
  }

  check(key: string): RateLimitDecision {
    const now = this.clock();
    this.maybeSweep(now);

    const existing = this.buckets.get(key);
    const hits = (existing ?? []).filter((t) => now - t < this.windowMs);

    if (hits.length >= this.max) {
      // Keep the pruned window (do not add a hit) and refresh LRU position so a
      // client that keeps hammering stays resident rather than being evicted
      // into a fresh bucket.
      this.touch(key, hits);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1, this.windowMs - (now - hits[0])),
        usedBefore: hits.length,
        usedAfter: hits.length,
      };
    }

    const usedBefore = hits.length;
    hits.push(now);
    this.touch(key, hits);
    return {
      allowed: true,
      remaining: Math.max(0, this.max - hits.length),
      retryAfterMs: 0,
      usedBefore,
      usedAfter: hits.length,
    };
  }

  /** How many live hits a key has right now — diagnostics only, no side effect. */
  peek(key: string, now = this.clock()): number {
    const hits = this.buckets.get(key);
    if (!hits) return 0;
    return hits.filter((t) => now - t < this.windowMs).length;
  }

  /** Drop every bucket whose newest hit is older than the window. */
  prune(now = this.clock()): number {
    let removed = 0;
    for (const [key, hits] of this.buckets) {
      const live = hits.filter((t) => now - t < this.windowMs);
      if (live.length === 0) {
        this.buckets.delete(key);
        removed++;
      } else if (live.length !== hits.length) {
        this.buckets.set(key, live);
      }
    }
    this.lastSweepAt = now;
    this.sweeps++;
    return removed;
  }

  reset(): void {
    this.buckets.clear();
    this.lastSweepAt = this.clock();
    this.evictions = 0;
    this.sweeps = 0;
  }

  /** Forget ONE key — used when a verification succeeds (see clearAccountBudget). */
  clear(key: string): void {
    this.buckets.delete(key);
  }

  /** Amortised sweep: at most once per window, so a flood cannot force a full
   *  scan on every request (that would be its own denial of service). */
  private maybeSweep(now: number): void {
    if (now - this.lastSweepAt >= this.windowMs) this.prune(now);
  }

  /** Write with LRU position refresh and hard cap enforcement. */
  private touch(key: string, hits: number[]): void {
    this.buckets.delete(key);
    this.buckets.set(key, hits);
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) break;
      this.buckets.delete(oldest.value);
      this.evictions++;
    }
  }
}

// ── Registry: one limiter per lane, shared by every entry point ─────────────

const limiters = new Map<RateLimitLane, RateLimiter>();

export function limiterFor(lane: RateLimitLane): RateLimiter {
  let limiter = limiters.get(lane);
  if (!limiter) {
    const policy = RATE_LIMIT_LANES[lane];
    limiter = new RateLimiter({
      max: policy.max,
      windowMs: policy.windowMs,
      maxKeys: RATE_LIMIT_MAX_KEYS,
    });
    limiters.set(lane, limiter);
  }
  return limiter;
}

/** Every lane's live state — used by boot logging and tests, no secrets in it. */
export function rateLimitSnapshot(): Array<{ lane: RateLimitLane; size: number; maxKeys: number; max: number; windowMs: number }> {
  return (Object.keys(RATE_LIMIT_LANES) as RateLimitLane[]).map((lane) => {
    const limiter = limiterFor(lane);
    return { lane, size: limiter.size, maxKeys: limiter.maxKeys, max: limiter.max, windowMs: limiter.windowMs };
  });
}

/** TEST HOOK — forget every bucket in every lane. */
export function __resetRateLimits(): void {
  for (const limiter of limiters.values()) limiter.reset();
}

// ── The per-ACCOUNT dimension (slice 151b) ──────────────────────────────────
//
// WHY: an IP-keyed budget is only as good as the address, and the address is
// not something we control — the proxy reports a client's EGRESS address, and
// one client was measured egressing from two of them, alternating per request
// (see the module comment). A password-guessing attacker who can present N
// addresses therefore gets N × the budget against one account. Keying on the
// ACCOUNT closes that: the attacker's requests all land in one bucket no matter
// what address they arrive from, because the bucket is named by what they are
// trying to guess.
//
// A request must pass BOTH dimensions: `guardRequest` (client) and, at the
// handler that knows the submitted address, `guardAccount`. Refusing on either
// one is enough, and the order matters — the client gate runs first because it
// is the cheaper one and it is the only one available before the body is read.

/**
 * Account budgets. Tighter than the client lanes on purpose: this bucket is
 * shared by every source address, so it is the one that actually stops a
 * distributed guess. Rationale for the numbers:
 *  - login 10 / 15 min: a human who fumbles a password does not exceed ten in
 *    fifteen minutes; a guesser gets ten tries per quarter hour per account.
 *  - reset 5 / hour: a reset sends mail to the account owner. Five per hour is
 *    more than any legitimate use and stops a mail-bomb / code-grind.
 *
 * THE TRADE-OFF, stated: an attacker who knows an address can spend that
 * account's budget and lock the real owner out of login for up to 15 minutes.
 * That is the price of an account budget that a distributed attacker cannot
 * escape. It is time-boxed, it never changes the password, it never reveals
 * whether the account exists, and a successful login CLEARS the bucket (see
 * `clearAccountBudget`) so a locked-out owner recovers on their next successful
 * attempt once the window drains.
 */
export const ACCOUNT_LANES: Partial<Record<RateLimitLane, LanePolicy>> = {
  login: { max: 10, windowMs: 15 * MINUTE },
  reset: { max: 5, windowMs: 60 * MINUTE },
};

/** Same ceiling as the client lanes, for the same reason: bounded memory. */
export const ACCOUNT_MAX_KEYS = 5_000;

const accountLimiters = new Map<RateLimitLane, RateLimiter>();

export function accountLimiterFor(lane: RateLimitLane): RateLimiter | null {
  const policy = ACCOUNT_LANES[lane];
  if (!policy) return null;
  let limiter = accountLimiters.get(lane);
  if (!limiter) {
    limiter = new RateLimiter({ max: policy.max, windowMs: policy.windowMs, maxKeys: ACCOUNT_MAX_KEYS });
    accountLimiters.set(lane, limiter);
  }
  return limiter;
}

/**
 * Normalise a submitted address the way the handlers do (trim + lower case), so
 * `Owner@Example.com ` and `owner@example.com` share one bucket.
 */
export function normalizeAccountSubject(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

/**
 * The bucket key for an account. The submitted address is NEVER stored or
 * logged raw — it is hashed with a domain-separated SHA-256 and only that hex
 * digest is used as a Map key.
 *
 * This is a pseudonym, not encryption: an attacker holding the map could
 * confirm a guessed address. What it buys is that the in-memory key space and
 * every diagnostic line contain no email addresses, so a log file or a heap
 * dump is not a customer list. Returns null when there is no address to key on
 * (an empty submission gets the client dimension only).
 */
export function accountSubjectKey(raw: unknown): string | null {
  const subject = normalizeAccountSubject(raw);
  if (!subject) return null;
  return createHash("sha256").update(`sl:rate-limit:account:v1:${subject}`).digest("hex");
}

export interface AccountGateInput {
  lane: RateLimitLane;
  /** The address as submitted (raw is fine — it is normalised and hashed here). */
  email: unknown;
  method?: string;
  pathname?: string;
}

/**
 * Second dimension: is THIS ACCOUNT over its budget? Returns the 429 to send
 * when it is, or null to proceed. Lanes without an account budget always pass.
 */
export function guardAccount(input: AccountGateInput): Response | null {
  const limiter = accountLimiterFor(input.lane);
  if (!limiter) return null;
  const key = accountSubjectKey(input.email);
  if (!key) return null;
  const decision = limiter.check(key);
  logRateLimitDebug({
    lane: input.lane,
    dimension: "account",
    method: input.method ?? "POST",
    pathname: input.pathname ?? "",
    xff: null,
    xffHops: null,
    peer: null,
    key: maskKey(key),
    source: "unknown",
    usedBefore: decision.usedBefore,
    usedAfter: decision.usedAfter,
    max: limiter.max,
    windowMs: limiter.windowMs,
    decision: decision.allowed ? "allowed" : "blocked",
    retryAfterMs: decision.retryAfterMs,
  });
  if (decision.allowed) return null;
  console.log(`[rate-limit] 429 lane=${input.lane} dimension=account key=${maskKey(key)}`);
  return rateLimitedResponse(decision.retryAfterMs);
}

/**
 * A successful verification clears the account's failure budget. Without this,
 * a legitimate owner who mistyped nine times would stay one attempt away from a
 * lockout for the rest of the window even after proving who they are.
 */
export function clearAccountBudget(lane: RateLimitLane, email: unknown): void {
  const limiter = accountLimiterFor(lane);
  const key = accountSubjectKey(email);
  if (!limiter || !key) return;
  limiter.clear(key);
}

/** TEST HOOK — forget every account bucket. */
export function __resetAccountLimits(): void {
  for (const limiter of accountLimiters.values()) limiter.reset();
}

// ── Debug observability (slice 151b) ────────────────────────────────────────
//
// The limiter was un-inspectable from outside: a 429 told you a decision had
// been made but not what it was made ON, which is how two honest probes ended
// up disagreeing. With `RATE_LIMIT_DEBUG=1` every guarded request emits ONE
// structured line carrying the raw `x-forwarded-for` as received, the peer, the
// resolved key and the bucket counts, so the answer is in the log rather than in
// an argument.
//
// SECURITY: the raw forwarding header is attacker-supplied text. It is logged
// ONLY when the flag is on, it is capped in length, and control characters are
// stripped so it cannot forge a second log line. Off by default, and the normal
// (unflagged) log line never contains it — see `logRateLimitDebug` callers.

export interface RateLimitDebugOptions {
  enabled?: boolean;
  sink?: (line: string) => void;
}

export interface RateLimitDebugEvent {
  lane: RateLimitLane;
  dimension: "client" | "account";
  method: string;
  pathname: string;
  /** Raw `x-forwarded-for` exactly as received; null when absent. Debug only. */
  xff: string | null;
  /** How many comma-separated hops that header had (null when absent). */
  xffHops: number | null;
  peer: string | null;
  /** The resolved bucket key — masked, never a full address list. */
  key: string;
  source: ClientKeySource;
  usedBefore: number;
  usedAfter: number;
  max: number;
  windowMs: number;
  decision: "allowed" | "blocked";
  retryAfterMs: number;
}

const DEBUG_MAX_HEADER_CHARS = 200;

/** `RATE_LIMIT_DEBUG=1` (also accepts true/on). Off unless explicitly set. */
export function rateLimitDebugEnabled(env: string | undefined = process.env.RATE_LIMIT_DEBUG): boolean {
  const value = String(env ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

/** Keep attacker-supplied header text to one safe, bounded line. */
function sanitizeForLog(raw: string | null, max = DEBUG_MAX_HEADER_CHARS): string | null {
  if (raw == null) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = String(raw).replace(/[\u0000-\u001f\u007f]/g, " ");
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

/** Build the one-line payload; exported so a test can assert its exact shape. */
export function rateLimitDebugLine(evt: RateLimitDebugEvent): string {
  return `[rate-limit-debug] ${JSON.stringify({
    lane: evt.lane,
    dimension: evt.dimension,
    method: evt.method,
    pathname: evt.pathname,
    xff: sanitizeForLog(evt.xff),
    xffHops: evt.xffHops,
    peer: evt.peer,
    key: evt.key,
    source: evt.source,
    usedBefore: evt.usedBefore,
    usedAfter: evt.usedAfter,
    max: evt.max,
    windowMs: evt.windowMs,
    decision: evt.decision,
    retryAfterMs: evt.retryAfterMs,
  })}`;
}

/** Emit the debug line when the flag is on. `sink` is injectable for tests. */
export function logRateLimitDebug(
  evt: RateLimitDebugEvent,
  opts: { enabled?: boolean; sink?: (line: string) => void } = {},
): boolean {
  const enabled = opts.enabled ?? rateLimitDebugEnabled();
  if (!enabled) return false;
  const sink = opts.sink ?? ((line: string) => console.log(line));
  try {
    sink(rateLimitDebugLine(evt));
    return true;
  } catch {
    return false;
  }
}


// ── The gate every entry point calls ───────────────────────────────────────

export interface RateLimitRequestInput {
  method: string;
  pathname: string;
  /** Socket peer address (Bun: `server.requestIP(req)`, Node: `socket.remoteAddress`). */
  peerAddress?: string | null;
  /** Header getter — lower-case names, matching `Headers.get`. */
  header: (name: string) => string | null;
  trustedProxies?: string[];
  /** Override the debug flag / sink — tests use this, production omits it. */
  debug?: RateLimitDebugOptions;
}

export interface RateLimitGateResult {
  lane: RateLimitLane;
  client: ResolvedClientKey;
  decision: RateLimitDecision;
}

/** The 429 every caller returns. Body shape is unchanged from before the slice. */
export function rateLimitedResponse(retryAfterMs = 0): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, must-revalidate",
  };
  if (retryAfterMs > 0) headers["Retry-After"] = String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
  return new Response(JSON.stringify({ error: RATE_LIMIT_MESSAGE }), { status: 429, headers });
}

/**
 * Evaluate the lane for this request. Returns null when the request may proceed
 * (unguarded route, or inside budget) and the 429 Response when it may not.
 *
 * This is the single choke point: `prod-server.ts` calls it once at the top of
 * its dispatcher, and the dev listener calls it from middleware.
 */
export function guardRequest(input: RateLimitRequestInput): Response | null {
  const lane = laneForRequest(input.pathname, input.method);
  if (!lane) return null;
  const rawXff = input.header("x-forwarded-for");
  const client = resolveClientKey({
    peerAddress: input.peerAddress,
    forwardedFor: rawXff,
    trustedProxies: input.trustedProxies,
  });
  const limiter = limiterFor(lane);
  const decision = limiter.check(client.key);
  // One line per GUARDED request (allowed or blocked) when the flag is on. The
  // raw header appears here and nowhere else; with the flag off this call
  // returns without touching a sink.
  logRateLimitDebug(
    {
      lane,
      dimension: "client",
      method: (input.method || "GET").toUpperCase(),
      pathname: input.pathname,
      xff: rawXff,
      xffHops: rawXff ? rawXff.split(",").filter((hop) => hop.trim()).length : null,
      peer: client.peer,
      key: maskKey(client.key),
      source: client.source,
      usedBefore: decision.usedBefore,
      usedAfter: decision.usedAfter,
      max: limiter.max,
      windowMs: limiter.windowMs,
      decision: decision.allowed ? "allowed" : "blocked",
      retryAfterMs: decision.retryAfterMs,
    },
    input.debug,
  );
  if (decision.allowed) return null;
  console.log(`[rate-limit] 429 lane=${lane} source=${client.source} key=${maskKey(client.key)}`);
  return rateLimitedResponse(decision.retryAfterMs);
}

/** Same evaluation, but returns the decision too — for tests and diagnostics. */
export function inspectRateLimit(input: RateLimitRequestInput): RateLimitGateResult | null {
  const lane = laneForRequest(input.pathname, input.method);
  if (!lane) return null;
  const client = resolveClientKey({
    peerAddress: input.peerAddress,
    forwardedFor: input.header("x-forwarded-for"),
    trustedProxies: input.trustedProxies,
  });
  return { lane, client, decision: limiterFor(lane).check(client.key) };
}

/** Never log a full address; enough to correlate, not enough to be a directory. */
function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Bun: `serve({ fetch(req, server) })` → `peerAddressFrom(server, req)`. */
export function peerAddressFrom(
  server: { requestIP?: (req: Request) => { address?: string | null } | null } | null | undefined,
  req: Request,
): string | null {
  try {
    const info = server?.requestIP?.(req);
    return info?.address ?? null;
  } catch {
    return null;
  }
}

/** One-line boot summary of the trust configuration, logged by both entry points. */
export function describeTrustedProxies(env = process.env.TRUSTED_PROXY_ADDRESSES): string {
  const rules = parseTrustedProxies(env);
  const source = (env ?? "").trim() ? "TRUSTED_PROXY_ADDRESSES" : "default(loopback,private)";
  return `[rate-limit] client key = socket peer; forwarding headers trusted only from ${rules.join("|")} (${source}); buckets capped at ${RATE_LIMIT_MAX_KEYS}/lane`;
}
