/**
 * same-origin.ts — SLICE 164. Is this request from our own page?
 *
 * WHY THIS EXISTS. The owner pressed "Run a backup now" on the LIVE deployment
 * and got `403 cross-origin request refused` — on the deployment's own page, from
 * its own browser, on its own host. The check that refused it was one line:
 *
 *     new URL(origin).host === new URL(req.url).host
 *
 * `req.url` is whatever the process was told it was serving, and behind the
 * platform's TLS edge that is not the host the browser used. So the check
 * compared `simplerlife100.cto.site` (the Origin header the browser sends) with
 * the edge's internal address and refused a perfectly same-site POST. A security
 * control that fires on legitimate traffic is not a security control — it is a
 * broken feature, and the one thing it achieved was hiding the backup failure
 * the owner was trying to diagnose.
 *
 * WHAT IT DOES INSTEAD. It compares the Origin header's host against every host
 * this process has been told it is:
 *   1. the `X-Forwarded-Host` the TLS edge set (first value — the edge appends),
 *   2. the `Host` header of the request itself,
 *   3. the host inside `req.url` (what the one-line check used),
 *   4. our OWN public hostnames (`DEFAULT_ALLOWED_HOSTS`, slice 165 — the edge
 *      can rewrite `Host` and send no `X-Forwarded-Host`, so the request cannot
 *      always tell us what the browser called us),
 *   5. any host the operator names in `EXTRA_ALLOWED_ORIGINS`.
 * A match against ANY of them is same-origin. Nothing else changes: a request
 * whose Origin names a host in none of those is refused exactly as before, and
 * `Origin: null` (a sandboxed iframe / file:// page) is refused outright.
 *
 * WHY ACCEPTING X-FORWARDED-HOST IS NOT A HOLE. The only threat this check
 * guards against is a *browser* being made to POST here from another site. A
 * cross-site `fetch` cannot add a custom header without a CORS preflight, and we
 * never answer a preflight with an allow-origin, so such a request never reaches
 * this code; a cross-site HTML form can send a POST but cannot set
 * `X-Forwarded-Host`. On top of that the route is owner-session-gated and the
 * session cookie is `SameSite=Lax`, which a cross-site POST does not carry. The
 * origin check is defence in depth, and it now fails only where it should.
 *
 * Pure: no I/O, no clock, no environment read. Every decision is returned with
 * the reason, so the 403 body can say WHY instead of leaving the owner guessing.
 */

/**
 * SLICE 165 — THE HOSTS THIS BUSINESS ACTUALLY SERVES FROM.
 *
 * Slice 164 compared `Origin` against `Host`, `X-Forwarded-Host` and `req.url`.
 * On the live deployment that was still not enough, and the owner's page said so
 * in its own words:
 *
 *   `Origin host simplerlife100.ctonew.app matches none of this request's hosts
 *    (5ace135fcf2e81341c199d376a2bd8d8.preview.bl.run,
 *     ip-10-110-111-6.us-west-2.prod.aws.beamlit.net) — refused`
 *
 * The edge rewrote `Host` to a preview hostname, sent no `X-Forwarded-Host`, and
 * the browser's `Origin` named the public hostname the process had never been
 * told about. So the check has to know our own names, not just the ones a
 * particular edge chose to pass through.
 *
 * Exact host strings, never suffixes: `simplerlife100.cto.site.evil.com` and
 * `evil-simplerlife100.cto.site` match none of these, and a host carrying a port
 * (`simplerlife100.cto.site:8443`) is a different origin and is still refused.
 * `EXTRA_ALLOWED_ORIGINS` still extends the list.
 */
export const DEFAULT_ALLOWED_HOSTS: readonly string[] = [
  // the published site
  "simplerlife100.cto.site",
  // the host the live page's Origin header actually carried on 2026-11-01
  "simplerlife100.ctonew.app",
  // the working site (a different hostname, same deployment family)
  "simplerlife100-dev.cto.site",
];

export interface SameOriginInput {
  /** The `Origin` request header, verbatim (null when absent). */
  origin: string | null | undefined;
  /** The `Host` request header. */
  host?: string | null;
  /** The `X-Forwarded-Host` request header (may be a comma-separated list). */
  forwardedHost?: string | null;
  /** The host inside `req.url`. */
  urlHost?: string | null;
  /** Hosts the operator explicitly trusts (`EXTRA_ALLOWED_ORIGINS`, comma list). */
  extraAllowed?: string | null;
}

export interface SameOriginResult {
  ok: boolean;
  /** Plain words, safe to return to the caller in a 403 body. */
  reason: string;
  /** The host the Origin header named (null when absent/unparseable). */
  originHost: string | null;
  /** Every host this request was compared against, for the log line. */
  comparedHosts: string[];
}

/** Lowercase, trim, drop a trailing dot. Host may include a port. */
export function normalizeHost(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  // `X-Forwarded-Host` may carry a list; the first value is the client-facing one.
  const first = v.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  return first.replace(/\.$/, "");
}

/** The host:port of an absolute URL/origin string, or null when it is not one. */
export function hostOfOrigin(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  // A bare host ("example.com:443") is accepted as-is; a scheme-bearing value is parsed.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return normalizeHost(raw);
  try {
    const url = new URL(raw);
    if (!url.host) return null;
    return url.host.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/**
 * Decide whether a request is same-origin. Absent Origin = not a cross-site
 * browser request (curl, a server-to-server call, a same-origin navigation) and
 * is allowed — the caller keeps its own auth gate, which is the real control.
 */
export function checkSameOrigin(input: SameOriginInput): SameOriginResult {
  const compared = new Set<string>();
  const addHost = (h: string | null) => {
    if (h) compared.add(h);
  };
  // SLICE 165 — our own public hostnames first: the edge may rewrite `Host` and
  // may not send `X-Forwarded-Host` at all, so the request itself cannot always
  // tell us what the browser called us.
  for (const own of DEFAULT_ALLOWED_HOSTS) addHost(normalizeHost(own));
  addHost(normalizeHost(input.forwardedHost));
  addHost(normalizeHost(input.host));
  addHost(normalizeHost(input.urlHost));
  for (const entry of String(input.extraAllowed ?? "").split(",")) {
    const h = hostOfOrigin(entry);
    if (h) compared.add(h);
  }
  const comparedHosts = [...compared];

  const rawOrigin = String(input.origin ?? "").trim();
  if (!rawOrigin) {
    return {
      ok: true,
      reason: "no Origin header — not a cross-site browser request",
      originHost: null,
      comparedHosts,
    };
  }
  if (rawOrigin.toLowerCase() === "null") {
    return {
      ok: false,
      reason: "Origin is \"null\" (a sandboxed or file:// page) — refused",
      originHost: null,
      comparedHosts,
    };
  }
  const originHost = hostOfOrigin(rawOrigin);
  if (!originHost) {
    return { ok: false, reason: `Origin "${rawOrigin}" is not a valid origin — refused`, originHost: null, comparedHosts };
  }
  if (comparedHosts.includes(originHost)) {
    const own = DEFAULT_ALLOWED_HOSTS.includes(originHost);
    return {
      ok: true,
      reason:
        `Origin host ${originHost} matches this request's host` +
        (own ? " — it is one of this deployment's own public hostnames" : ""),
      originHost,
      comparedHosts,
    };
  }
  return {
    ok: false,
    reason:
      `Origin host ${originHost} matches none of this request's hosts` +
      (comparedHosts.length ? ` (${comparedHosts.join(", ")})` : " (none known)") +
      " — refused",
    originHost,
    comparedHosts,
  };
}

/** The `Origin` header a Request carried, or null. */
export function originOf(req: { headers: { get(name: string): string | null } }): string | null {
  return req.headers.get("origin");
}

/**
 * Convenience for a server route: reads the four sources off a Request and
 * decides. `urlHost` comes from the request URL the runtime built.
 */
export function checkRequestSameOrigin(
  req: { headers: { get(name: string): string | null } },
  reqUrl: string,
  env: Record<string, string | undefined> = process.env,
): SameOriginResult {
  let urlHost: string | null = null;
  try {
    urlHost = new URL(reqUrl).host;
  } catch {
    urlHost = null;
  }
  return checkSameOrigin({
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
    forwardedHost: req.headers.get("x-forwarded-host"),
    urlHost,
    extraAllowed: env.EXTRA_ALLOWED_ORIGINS ?? null,
  });
}
