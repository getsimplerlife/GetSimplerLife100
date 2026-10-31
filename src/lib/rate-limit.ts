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
 * HONEST LIMITS (stated, not hidden)
 *  - Buckets are per process. Two processes do not share a budget.
 *  - A trusted-proxy deployment where the proxy is NOT loopback/private needs
 *    `TRUSTED_PROXY_ADDRESSES` set to that proxy address; otherwise every
 *    client collapses into the proxy's single bucket and the lane behaves as a
 *    global limit. The resolved configuration is logged at boot by both entry
 *    points so this is never a silent guess.
 *  - Eviction can forget a legitimate client's window early. That direction is
 *    deliberate: failing open is the only failure mode a limiter may have.
 */

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
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, this.windowMs - (now - hits[0])) };
    }

    hits.push(now);
    this.touch(key, hits);
    return {
      allowed: true,
      remaining: Math.max(0, this.max - hits.length),
      retryAfterMs: 0,
    };
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

// ── The gate every entry point calls ───────────────────────────────────────

export interface RateLimitRequestInput {
  method: string;
  pathname: string;
  /** Socket peer address (Bun: `server.requestIP(req)`, Node: `socket.remoteAddress`). */
  peerAddress?: string | null;
  /** Header getter — lower-case names, matching `Headers.get`. */
  header: (name: string) => string | null;
  trustedProxies?: string[];
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
  const client = resolveClientKey({
    peerAddress: input.peerAddress,
    forwardedFor: input.header("x-forwarded-for"),
    trustedProxies: input.trustedProxies,
  });
  const decision = limiterFor(lane).check(client.key);
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
