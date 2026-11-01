/**
 * SLICE 168 — D-20 (audit sweep A, MEDIUM).
 *
 * THE DEFECT THIS PINS. Three read-only routes had NO `req.method` check:
 *
 *     /api/purchases
 *     /api/audit-logs
 *     /api/integrations/providers
 *
 * so POST, PUT, PATCH and DELETE all answered 200 with a read body. No write
 * path existed at any of them, so this was not an escalation — but it made
 * "does this endpoint mutate?" unanswerable from outside, and a future write
 * would have hidden behind an already-200 status. Sweep A's 65-request matrix
 * recorded the 15 x 200 on mutating verbs; this file pins the fix: every verb
 * the route does not implement is a 405 with an `Allow` header.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { ensureTestServer, testBaseUrl } from "./test-env";

const BASE_URL = testBaseUrl();
const READ_ONLY_ROUTES = ["/api/purchases", "/api/audit-logs", "/api/integrations/providers"];
const UNIMPLEMENTED_VERBS = ["POST", "PUT", "PATCH", "DELETE"];

beforeAll(async () => {
  await ensureTestServer();
});

describe("D-20 — a read-only route answers an unimplemented verb with 405 + Allow", () => {
  for (const route of READ_ONLY_ROUTES) {
    for (const method of UNIMPLEMENTED_VERBS) {
      it(`${method} ${route} → 405 with an Allow header`, async () => {
        const res = await fetch(`${BASE_URL}${route}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "DELETE" ? undefined : JSON.stringify({ probe: true }),
          redirect: "manual",
        });

        expect(res.status, `${method} ${route} must be 405, not a 200 read`).toBe(405);

        // The Allow header names the verbs the route DOES implement.
        const allow = res.headers.get("allow") || "";
        expect(allow.toUpperCase()).toContain("GET");
        expect(allow.toUpperCase()).not.toContain("POST");

        // A JSON refusal, never an HTML page and never a read body.
        expect(res.headers.get("content-type") || "").toContain("application/json");
        const body: any = await res.json();
        expect(body?.error).toBe("Method not allowed");
      });
    }

    it(`GET ${route} is still a read (401 unauth / 200 auth), not a 405`, async () => {
      const res = await fetch(`${BASE_URL}${route}`, { redirect: "manual" });
      // Anonymous callers get the existing auth refusal on the two gated
      // routes; the provider catalog is public. Either way it is NOT a 405.
      expect(res.status).not.toBe(405);
      expect([200, 401]).toContain(res.status);
    });
  }
});
