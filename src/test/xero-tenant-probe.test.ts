import { describe, it, expect } from "vitest";
import { probeProvider, resolveXeroTenantId } from "../lib/connection-health";

/**
 * P0 hotfix regression — Xero's /Organisation probe REQUIRES the Xero-tenant-id
 * header. The credential row may have no tenantId stored (as with the live
 * mathewortiz97@gmail.com:xero row). The old code sent the probe header-less,
 * which 403s on a perfectly valid token and wrongly rejected a freshly-rotated
 * token at validateToken time → cascade into "Refresh token has been consumed"
 * → RECONNECT REQUIRED.
 *
 * The fix resolves the tenant via GET /connections using the access token and
 * NEVER sends a header-less Xero probe (fail-closed when it cannot resolve).
 */

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function orgOk(): Response {
  return new Response(JSON.stringify({ Organisations: [{ Name: "ACME", OrganisationID: "b6db9fd6-0000-1111-2222-333344445555" }] }), { status: 200 });
}

describe("resolveXeroTenantId", () => {
  it("prefers a stored tenantId and does NOT call /connections", async () => {
    let called = false;
    const fetchImpl: typeof fetch = (async () => { called = true; return okJson([]); }) as any;
    const tid = await resolveXeroTenantId({ tenantId: "stored-tenant", accessToken: "tok" }, fetchImpl);
    expect(tid).toBe("stored-tenant");
    expect(called).toBe(false);
  });

  it("resolves via GET /connections when no tenantId is stored", async () => {
    const fetchImpl: typeof fetch = (async (url: any) => {
      expect(String(url)).toBe("https://api.xero.com/connections");
      return okJson([{ tenantId: "resolved-tenant", tenantName: "ACME" }]);
    }) as any;
    const tid = await resolveXeroTenantId({ accessToken: "tok" }, fetchImpl);
    expect(tid).toBe("resolved-tenant");
  });

  it("returns undefined when /connections fails or lists no tenant", async () => {
    const fetchImpl: typeof fetch = (async () => okJson([])) as any;
    expect(await resolveXeroTenantId({ accessToken: "tok" }, fetchImpl)).toBeUndefined();
    const failImpl: typeof fetch = (async () => new Response("nope", { status: 401 })) as any;
    expect(await resolveXeroTenantId({ accessToken: "tok" }, failImpl)).toBeUndefined();
  });
});

describe("xero probeProvider — tenant header resolution (P0 regression)", () => {
  it("resolves the tenant and sends the Xero-tenant-id header → passes with 200", async () => {
    let sentHeader: string | undefined;
    let connectionsCalled = false;
    const fetchImpl: typeof fetch = (async (url: any, init: any) => {
      if (String(url) === "https://api.xero.com/connections") { connectionsCalled = true; return okJson([{ tenantId: "resolved-tenant" }]); }
      sentHeader = (init?.headers as any)?.["Xero-tenant-id"];
      return orgOk();
    }) as any;
    // NO tenantId on the entry — exactly the live-row situation.
    const res = await probeProvider("xero", { accessToken: "tok" }, fetchImpl);
    expect(connectionsCalled).toBe(true);
    expect(sentHeader).toBe("resolved-tenant");
    expect(res.ok).toBe(true);
    expect(res.httpStatus).toBe(200);
  });

  it("fail-closed: when the tenant cannot be resolved the probe is NOT sent (no header-less 403)", async () => {
    let orgCalled = false;
    const fetchImpl: typeof fetch = (async (url: any) => {
      if (String(url) === "https://api.xero.com/connections") return okJson([]); // no tenant
      orgCalled = true; return orgOk();
    }) as any;
    const res = await probeProvider("xero", { accessToken: "tok" }, fetchImpl);
    expect(orgCalled).toBe(false); // Organisation probe must NOT be sent without header
    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain("not sent");
    expect(String(res.error)).toContain("could not resolve Xero tenantId");
  });

  it("uses a stored tenantId directly (no /connections call)", async () => {
    let connectionsCalled = false;
    let sentHeader: string | undefined;
    const fetchImpl: typeof fetch = (async (url: any, init: any) => {
      if (String(url) === "https://api.xero.com/connections") { connectionsCalled = true; return okJson([]); }
      sentHeader = (init?.headers as any)?.["Xero-tenant-id"];
      return orgOk();
    }) as any;
    const res = await probeProvider("xero", { accessToken: "tok", tenantId: "stored-tenant" }, fetchImpl);
    expect(connectionsCalled).toBe(false);
    expect(sentHeader).toBe("stored-tenant");
    expect(res.ok).toBe(true);
  });
});
