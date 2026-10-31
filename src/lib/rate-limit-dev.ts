/**
 * SLICE 151 — the dev listener gets the SAME limiter as the published server.
 *
 * The defect this closes: the old limiter lived only in `prod-server.ts`, so the
 * `vite dev` listener (the one this box actually serves the working site from)
 * had no limiter at all, and any handler added there inherited nothing. Rather
 * than copy the logic, the dev listener installs a middleware that calls the
 * shared `guardRequest` from `src/lib/rate-limit.ts` — one implementation, two
 * entry points, so the two cannot drift.
 *
 * The peer address here is the real socket (`req.socket.remoteAddress`), exactly
 * as `server.requestIP(req)` is on the Bun side. The client's own
 * `x-forwarded-for` is only consulted when the socket peer is a trusted proxy —
 * see `resolveClientKey`.
 *
 * SLICE 151b — what this middleware deliberately does NOT do: the per-account
 * budget. That dimension needs the submitted address, which lives in the request
 * BODY, and a connect middleware cannot read a body without consuming the stream
 * a downstream handler still needs. It is enforced in `prod-server.ts` at the
 * three handlers that parse an address (`/api/login`, the no-JS `/login` POST and
 * `/api/request-password-reset`), which is also the only place it can be checked
 * BEFORE a password is verified or a reset code is minted. The client dimension
 * below still applies on this listener, and the debug line (RATE_LIMIT_DEBUG=1)
 * is emitted here exactly as it is there.
 *
 * Deliberately inert in tests (the middleware is unit-tested directly) and
 * unable to break the dev server: any unexpected error calls `next()`.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { RATE_LIMIT_MESSAGE, describeTrustedProxies, guardRequest } from "./rate-limit";

type Next = (err?: unknown) => void;

/** Minimal structural types so this file can be imported from `vite.config.ts`
 *  without pulling Vite's plugin type into the app's type graph. */
export interface ViteMiddlewareServer {
  middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: Next) => void) => void };
  config?: { logger?: { info?: (msg: string) => void } };
}

export function createDevRateLimitMiddleware() {
  return function rateLimitMiddleware(req: IncomingMessage, res: ServerResponse, next: Next): void {
    try {
      const rawUrl = req.url || "/";
      const pathname = rawUrl.split("?")[0].split("#")[0];
      const headerValue = (name: string): string | null => {
        const raw = req.headers[name.toLowerCase()];
        if (Array.isArray(raw)) return raw.join(",");
        return raw ?? null;
      };
      const blocked = guardRequest({
        method: req.method || "GET",
        pathname,
        peerAddress: req.socket?.remoteAddress ?? null,
        header: headerValue,
      });
      if (!blocked) {
        next();
        return;
      }
      const body = JSON.stringify({ error: RATE_LIMIT_MESSAGE });
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store, must-revalidate");
      const retryAfter = blocked.headers.get("Retry-After");
      if (retryAfter) res.setHeader("Retry-After", retryAfter);
      res.end(body);
    } catch (err) {
      // A limiter must never be able to take the listener down.
      try {
        console.log("[rate-limit] dev middleware error (fail-open): " + (err as any)?.message);
      } catch {
        /* ignore */
      }
      next();
    }
  };
}

/** Vite plugin wrapper — keeps `vite.config.ts` to a single line. */
export function devRateLimitPlugin() {
  return {
    name: "rate-limit-dev-middleware",
    apply: "serve" as const,
    configureServer(server: ViteMiddlewareServer) {
      if (process.env.VITEST || process.env.RATE_LIMIT_DEV_DISABLE === "1") return;
      server.middlewares.use(createDevRateLimitMiddleware());
      try {
        console.log(describeTrustedProxies());
        console.log("[rate-limit] dev listener wired (login, reset, public share lanes)");
      } catch {
        /* never break the server over a log line */
      }
    },
  };
}
