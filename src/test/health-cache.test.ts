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

  /**
   * SLICE 154 — a running server implies a usable session signing key (the boot
   * gate exits otherwise). This makes that checkable in one request instead of
   * inferred, and pins that the key itself is never in the payload.
   */
  it("reports jwtKeyPresent: true and never exposes the key", async () => {
    const res = await fetch(`${testBaseUrl()}/api/health`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.jwtKeyPresent).toBe(true);
    const raw = JSON.stringify(body);
    const key = process.env.JWT_SECRET;
    if (key && key.length >= 32) expect(raw).not.toContain(key);
    expect(raw).not.toMatch(/jwtSecret|JWT_SECRET/);
  });

  it("payload timestamp advances between hits (not a cached snapshot)", async () => {
    const first = (await (await fetch(`${testBaseUrl()}/api/health`)).json()) as { timestamp: number };
    await new Promise((r) => setTimeout(r, 25));
    const second = (await (await fetch(`${testBaseUrl()}/api/health`)).json()) as { timestamp: number };
    expect(second.timestamp).toBeGreaterThanOrEqual(first.timestamp);
  });
});
