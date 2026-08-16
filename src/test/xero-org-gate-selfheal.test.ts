/**
 * Unit tests for the runtime Xero org-gate self-heal (selfHealXeroOrgGate).
 *
 * Bug context: the PUBLIC webhook receiver rejected valid signed events with
 * "Tenant is not entitled to monitoring" because no persisted tenantId in
 * tenant_oauth_credentials.json matched the event's org UUID (the published
 * copy's boot never resolved it). selfHealXeroOrgGate resolves each entitled
 * tenant's org live via the canonical Xero Connections API on first miss,
 * configures the gate on match, and persists tenantId back (write-through).
 *
 * Fail-closed: only the canonical connections URL is contacted; a per-credential
 * resolve error skips that credential; nothing is mutated on failure; no match
 * -> false.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selfHealXeroOrgGate, XERO_CONNECTIONS_URL } from "../monitoring/xero-webhook";

const CREDS_FILE = "tenant_oauth_credentials.json";
const ORG_ID = "b6db9fd6-ce86-41e2-98ab-d52be61d1b04";

let dir: string;
let fetchMock: ReturnType<typeof import("vitest")["vi"]["fn"]>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "xero-org-gate-"));
  fetchMock = (globalThis.fetch = (async (url: string, init?: any) => {
    throw new Error(`unexpected fetch: ${url} ${JSON.stringify(init?.headers)}`);
  }) as any);
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ }
  globalThis.fetch = originalFetch;
});

function writeCreds(creds: Record<string, any>): void {
  writeFileSync(join(dir, CREDS_FILE), JSON.stringify(creds));
}

function readCreds(): Record<string, any> {
  return JSON.parse(readFileSync(join(dir, CREDS_FILE), "utf8"));
}

/** Simulate the canonical connections API response. */
function mockConnections(tenantId: string, status = 200): void {
  (globalThis.fetch as any) = (async (url: string, init?: any) => {
    expect(String(url)).toBe(XERO_CONNECTIONS_URL); // canonical host only — no guessed URLs
    expect((init?.headers as Record<string, string>)?.Authorization).toContain("Bearer ");
    if (status >= 400) return new Response("{}", { status });
    return new Response(JSON.stringify([{ tenantId }]), { status: 200 });
  }) as any;
}

function mockConnectionsSequence(handlers: Array<() => Response | Promise<Response>>): void {
  let call = 0;
  (globalThis.fetch as any) = (async (url: string, init?: any) => {
    expect(String(url)).toBe(XERO_CONNECTIONS_URL); // canonical host only — no guessed URLs
    expect((init?.headers as Record<string, string>)?.Authorization).toContain("Bearer ");
    const handler = handlers[Math.min(call, handlers.length - 1)];
    call++;
    return handler();
  }) as any;
}

describe("selfHealXeroOrgGate", () => {
  it("resolves the org live via Connections API, configures the gate, and persists tenantId", async () => {
    writeCreds({
      "mathew@test:xero": {
        provider: "xero",
        email: "mathew@test",
        accessToken: "token-abc",
        refreshToken: "refresh-abc",
        expiresAt: Date.now() + 60_000,
      },
    });
    mockConnections(ORG_ID);
    const configured: Array<{ orgId: string; gate: any }> = [];
    const ok = await selfHealXeroOrgGate({
      dataDir: dir,
      orgId: ORG_ID,
      canMonitor: () => true,
      configureTenant: (orgId, gate) => configured.push({ orgId, gate }),
    });
    expect(ok).toBe(true);
    expect(configured).toEqual([{ orgId: ORG_ID, gate: { purchased: true, status: "Active" } }]);
    // Persisted back into the credential record (write-through for future boots).
    const record = readCreds()["mathew@test:xero"];
    expect(record.tenantId).toBe(ORG_ID);
  });

  it("returns false and mutates NOTHING when the org does not match any credential", async () => {
    writeCreds({
      "mathew@test:xero": {
        provider: "xero",
        email: "mathew@test",
        accessToken: "token-abc",
        refreshToken: "refresh-abc",
        expiresAt: Date.now() + 60_000,
      },
    });
    mockConnections("11111111-1111-1111-1111-111111111111"); // different org
    const configured: any[] = [];
    const ok = await selfHealXeroOrgGate({
      dataDir: dir,
      orgId: ORG_ID,
      canMonitor: () => true,
      configureTenant: (orgId, gate) => configured.push({ orgId, gate }),
    });
    expect(ok).toBe(false);
    expect(configured).toHaveLength(0);
    expect(readCreds()["mathew@test:xero"].tenantId).toBeUndefined(); // no mutation on failure
  });

  it("fails closed on a fetch error: false, no gate, no mutation", async () => {
    writeCreds({
      "mathew@test:xero": { provider: "xero", email: "mathew@test", accessToken: "token-abc" },
    });
    (globalThis.fetch as any) = (async () => {
      throw new Error("network down");
    }) as any;
    const configured: any[] = [];
    const ok = await selfHealXeroOrgGate({
      dataDir: dir,
      orgId: ORG_ID,
      canMonitor: () => true,
      configureTenant: (orgId, gate) => configured.push({ orgId, gate }),
    });
    expect(ok).toBe(false);
    expect(configured).toHaveLength(0);
    expect(readCreds()["mathew@test:xero"].tenantId).toBeUndefined();
  });

  it("fails closed on an HTTP error from Connections (non-2xx)", async () => {
    writeCreds({
      "mathew@test:xero": { provider: "xero", email: "mathew@test", accessToken: "token-abc" },
    });
    mockConnections("whatever", 500);
    const ok = await selfHealXeroOrgGate({
      dataDir: dir,
      orgId: ORG_ID,
      canMonitor: () => true,
      configureTenant: () => {},
    });
    expect(ok).toBe(false);
    expect(readCreds()["mathew@test:xero"].tenantId).toBeUndefined();
  });

  it("uses the already-persisted matching tenantId WITHOUT any network I/O", async () => {
    writeCreds({
      "mathew@test:xero": {
        provider: "xero",
        email: "mathew@test",
        accessToken: "token-abc",
        tenantId: ORG_ID,
      },
    });
    // fetchMock throws if called — the fast path must not touch the network.
    const configured: any[] = [];
    const ok = await selfHealXeroOrgGate({
      dataDir: dir,
      orgId: ORG_ID,
      canMonitor: () => true,
      configureTenant: (orgId, gate) => configured.push({ orgId, gate }),
    });
    expect(ok).toBe(true);
    expect(configured).toEqual([{ orgId: ORG_ID, gate: { purchased: true, status: "Active" } }]);
    expect(globalThis.fetch).toBe(fetchMock); // fetch never replaced → never called
  });

  it("never grants a gate to a tenant that is not entitled to monitoring", async () => {
    writeCreds({
      "freeloader@test:xero": {
        provider: "xero",
        email: "freeloader@test",
        accessToken: "token-abc",
      },
    });
    const configured: any[] = [];
    const ok = await selfHealXeroOrgGate({
      dataDir: dir,
      orgId: ORG_ID,
      canMonitor: () => false, // not entitled
      configureTenant: (orgId, gate) => configured.push({ orgId, gate }),
    });
    expect(ok).toBe(false);
    expect(configured).toHaveLength(0);
    expect(readCreds()["freeloader@test:xero"].tenantId).toBeUndefined();
  });

  it("returns false when no credential file exists (fail-closed, no crash)", async () => {
    const ok = await selfHealXeroOrgGate({
      dataDir: dir,
      orgId: ORG_ID,
      canMonitor: () => true,
      configureTenant: () => {},
    });
    expect(ok).toBe(false);
  });

  it("skips a stale/expired credential and still matches a later valid one", async () => {
    writeCreds({
      "stale@test:xero": { provider: "xero", email: "stale@test", accessToken: "expired-tok" },
      "mathew@test:xero": { provider: "xero", email: "mathew@test", accessToken: "good-tok" },
    });
    mockConnectionsSequence([
      () => { throw new Error("401 from Connections — stale token"); },
      () => new Response(JSON.stringify([{ tenantId: ORG_ID }]), { status: 200 }),
    ]);
    const configured: any[] = [];
    const ok = await selfHealXeroOrgGate({
      dataDir: dir,
      orgId: ORG_ID,
      canMonitor: () => true,
      configureTenant: (orgId, gate) => configured.push({ orgId, gate }),
    });
    expect(ok).toBe(true);
    expect(configured).toEqual([{ orgId: ORG_ID, gate: { purchased: true, status: "Active" } }]);
    // Only the matching credential is mutated.
    expect(readCreds()["stale@test:xero"].tenantId).toBeUndefined();
    expect(readCreds()["mathew@test:xero"].tenantId).toBe(ORG_ID);
  });

  it("repairs a WRONG persisted tenantId (stale) when the live org matches", async () => {
    writeCreds({
      "mathew@test:xero": {
        provider: "xero",
        email: "mathew@test",
        accessToken: "token-abc",
        tenantId: "22222222-2222-2222-2222-222222222222", // stale/wrong org
      },
    });
    mockConnections(ORG_ID);
    const ok = await selfHealXeroOrgGate({
      dataDir: dir,
      orgId: ORG_ID,
      canMonitor: () => true,
      configureTenant: () => {},
    });
    expect(ok).toBe(true);
    expect(readCreds()["mathew@test:xero"].tenantId).toBe(ORG_ID); // repaired
  });
});
