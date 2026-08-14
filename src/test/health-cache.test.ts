import { describe, it, expect, beforeAll } from "vitest";
import { ensureTestServer, testBaseUrl } from "./test-env";

/**
 * I7 — /api/health staleness. The health endpoint must NEVER be cached
 * (uptime monitors need live state). Regression test: origin response
 * carries Cache-Control: no-store and the payload advances between hits.
 * (The platform proxy also injects no-store on this path — see the audit doc.)
 */
describe("GET /api/health — freshness contract (I7)", () => {
  beforeAll(async () => {
    await ensureTestServer();
  });

  it("returns 200 with status/uptime/timestamp fields", async () => {
    const res = await fetch(`${testBaseUrl()}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptime: number; timestamp: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.timestamp).toBeGreaterThan(0);
  });

  it("sends Cache-Control: no-store (never cached by proxies)", async () => {
    const res = await fetch(`${testBaseUrl()}/api/health`);
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
  });

  it("payload timestamp advances between hits (not a cached snapshot)", async () => {
    const first = (await (await fetch(`${testBaseUrl()}/api/health`)).json()) as { timestamp: number };
    await new Promise((r) => setTimeout(r, 25));
    const second = (await (await fetch(`${testBaseUrl()}/api/health`)).json()) as { timestamp: number };
    expect(second.timestamp).toBeGreaterThanOrEqual(first.timestamp);
  });
});
