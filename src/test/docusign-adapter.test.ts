import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docusignAdapter } from "../verification/adapters/priority";
import type { CapabilityContext } from "../verification/adapters/priority";
import { createDocuSignClient } from "../integrations/providers/docusign/client";
import { durableClose, durableFlush, durableGet, initDurableStore, MemoryKvDriver } from "../lib/durable-store";
import { loadProviderCredentials, persistRefreshedCredential } from "../verification/credential-source";

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => data } as unknown as Response;
}
/** Recorded DocuSign API calls (method + url + parsed body). */
const calls: Array<{ method: string; url: string; body?: any }> = [];

function ctx(overrides: Partial<CapabilityContext> = {}): CapabilityContext {
  return {
    credentials: { accessToken: "tok", accountId: "acct-1", email: "verify@example.invalid" },
    allowWrites: true,
    ...overrides,
  } as CapabilityContext;
}
const sendContract = { capabilityId: "docusign-send-document" } as never;
const voidContract = { capabilityId: "docusign-void-envelope" } as never;
const readContract = { capabilityId: "docusign-read-envelopes" } as never;

describe("DocuSign verification adapter (real client, mocked transport)", () => {
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      const method = (init?.method || "GET") as string;
      let body: any;
      if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { body = String(init.body); } }
      calls.push({ method, url: u, body });
      if (method === "POST" && u.includes("/envelopes")) return jsonResponse({ envelopeId: "env-adapter-1" });
      if (method === "PUT" && u.includes("/envelopes/")) return jsonResponse({});
      if (method === "GET" && u.includes("/envelopes")) return jsonResponse({ envelopes: [] });
      return { ok: false, status: 404 } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  it("fails closed for writes without --writes (no API calls made)", async () => {
    await expect(docusignAdapter(sendContract, ctx({ allowWrites: false }))).rejects.toThrow("write verification disabled");
    await expect(docusignAdapter(voidContract, ctx({ allowWrites: false }))).rejects.toThrow("write verification disabled");
    expect(calls.filter((c) => c.method !== "GET" && !c.url.includes("userinfo")).length).toBe(0);
  });

  it("send-document creates a labeled draft and leaves it in place (non-destructive)", async () => {
    const out = await docusignAdapter(sendContract, ctx());
    expect(out).toMatchObject({ httpStatus: 201, response: { created: true, kept: true, envelopeId: "env-adapter-1" } });
    const created = calls.find((c) => c.method === "POST" && c.url.includes("/envelopes"));
    expect(created?.body).toMatchObject({ status: "created", emailSubject: expect.stringContaining("Phase7-VERIFY") });
    expect(created?.body.recipients.signers[0].email).toBe("verify@example.invalid");
    // No void (no PUT status=voided) — the draft envelope is left in place (owner mandate).
    expect(calls.filter((c) => c.method === "PUT" && String(c.body?.status) === "voided")).toEqual([]);
  });
  it("void-envelope creates a draft and voids it (action + inherent rollback)", async () => {
    const out = await docusignAdapter(voidContract, ctx());
    expect(out).toMatchObject({ httpStatus: 200, response: { voided: true, envelopeId: "env-adapter-1" } });
    const created = calls.find((c) => c.method === "POST" && c.url.includes("/envelopes"));
    expect(created?.body.status).toBe("created");
    expect(calls.some((c) => c.method === "PUT" && c.url.includes("/envelopes/env-adapter-1"))).toBe(true);
  });

  it("fails closed when the credential has no accessToken", async () => {
    await expect(docusignAdapter(readContract, ctx({ credentials: { accountId: "acct-1" } }))).rejects.toThrow("no accessToken");
  });

  it("resolves the account at runtime via canonical userinfo when the stored credential lacks accountId", async () => {
    // The owner's token only answers on the developer-sandbox host
    // (account-d.docusign.com); the resolver must try BOTH canonical hosts
    // and build the API base URL from the returned base_uri.
    const fetchMock = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      const method = (init?.method || "GET") as string;
      calls.push({ method, url: u });
      if (u.includes("account-d.docusign.com/oauth/userinfo")) {
        return jsonResponse({ accounts: [{ account_id: "ui-runtime-42", is_default: true, base_uri: "https://demo.docusign.net" }] });
      }
      if (u.includes("account.docusign.com/oauth/userinfo")) return { ok: false, status: 401 } as unknown as Response;
      if (method === "GET" && u.includes("/envelopes")) return jsonResponse({ envelopes: [] });
      return { ok: false, status: 404 } as unknown as Response;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const out = await docusignAdapter(readContract, ctx({ credentials: { accessToken: "tok", email: "verify@example.invalid" } }));
    expect(out).toMatchObject({ httpStatus: 200 });
    // Both canonical hosts are probed; the sandbox host resolves.
    expect(calls.some((c) => c.url.includes("account.docusign.com/oauth/userinfo"))).toBe(true);
    expect(calls.some((c) => c.url.includes("account-d.docusign.com/oauth/userinfo"))).toBe(true);
    // The envelope call is made against the resolved account with /restapi.
    expect(calls.some((c) => c.url.includes("demo.docusign.net/restapi/v2.1/accounts/ui-runtime-42/envelopes"))).toBe(true);
  });
});

describe("DocuSign refresh-token rotation persistence (#173)", () => {
  beforeEach(() => {
    // This describe is independent of the first one — reset shared state and
    // fail closed by default so leaked calls/fetch from prior tests can't
    // pollute assertions (each test installs its own recording stub).
    calls.length = 0;
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response) as unknown as typeof fetch;
  });
  /** Token endpoint that rotates the refresh token + fresh envelopes endpoint. */
  function rotationFetch() {
    return vi.fn(async (url: any, init: any) => {
      const u = String(url);
      calls.push({ method: (init?.method || "GET") as string, url: u, body: init?.body ? String(init.body).slice(0, 120) : undefined });
      if (u.includes("/oauth/token")) {
        return jsonResponse({ access_token: "new-at", refresh_token: "rotated-rt", expires_in: 3600, token_type: "Bearer", scope: "signature" });
      }
      if (u.includes("/envelopes")) return jsonResponse({ envelopes: [] });
      return { ok: false, status: 404 } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it("adapter refreshes an expired token up-front and mutates the credential with the ROTATED refresh token (runner persistence works)", async () => {
    globalThis.fetch = rotationFetch();
    const cred: any = {
      accessToken: "expired-at",
      refreshToken: "old-rt",
      expiresAt: Math.floor(Date.now() / 1000) - 60, // expired
      accountId: "acct-1",
      email: "verify@example.invalid",
    };
    const out = await docusignAdapter(readContract, ctx({ credentials: cred, app: { clientId: "cid", clientSecret: "csec" } }));
    expect(out).toMatchObject({ httpStatus: 200 });
    expect(calls.filter((c) => c.url.includes("/oauth/token")).length).toBe(1);
    // The rotated refresh token lands on the credential object the runner holds,
    // so the runner's post-run persistRefreshedCredential keeps the store alive.
    expect(cred.accessToken).toBe("new-at");
    expect(cred.refreshToken).toBe("rotated-rt");
    expect(cred.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    // Stored accountId is preferred — no userinfo round-trip happened.
    expect(calls.some((c) => c.url.includes("userinfo"))).toBe(false);
  });

  it("client fires onTokensRefreshed with the rotated tokens on a mid-run refresh", async () => {
    globalThis.fetch = rotationFetch();
    let captured: { accessToken: string; refreshToken?: string; expiresAt?: number } | null = null;
    const client = createDocuSignClient({
      accessToken: "expired-at",
      refreshToken: "old-rt",
      expiresAt: Math.floor(Date.now() / 1000) - 60,
      accountId: "acct-1",
      clientId: "cid",
      clientSecret: "csec",
      onTokensRefreshed: (t) => { captured = t; },
    } as never);
    await client.listEnvelopes();
    expect(captured).not.toBeNull();
    expect(captured!.accessToken).toBe("new-at");
    expect(captured!.refreshToken).toBe("rotated-rt");
    // The envelopes call used the fresh token and the callback saw the rotation.
    expect(calls.some((c) => c.url.includes("/envelopes"))).toBe(true);
  });

  it("end-to-end: expired DocuSign credential refreshes via the adapter and the ROTATED token persists to the store (refresh_token_mismatch regression)", async () => {
    await durableClose();
    const dir = mkdtempSync(join(tmpdir(), "verify-docusign-"));
    try {
      const driver = new MemoryKvDriver({
        "tenant_oauth_credentials.json": {
          "owner@example.com:docusign": {
            provider: "docusign",
            email: "owner@example.com",
            accessToken: "expired-at",
            refreshToken: "old-rt",
            expiresAt: Math.floor(Date.now() / 1000) - 60,
            accountId: "acct-1",
          },
        },
      });
      await initDurableStore(dir, driver);
      const loaded = loadProviderCredentials("docusign", { tenant: "owner@example.com", dataDir: dir });
      expect(loaded.credential?.accessToken).toBe("expired-at");
      const loadedExpiresAt = loaded.credential!.expiresAt;

      globalThis.fetch = rotationFetch();
      await docusignAdapter(readContract, {
        credentials: loaded.credential!,
        app: { clientId: "cid", clientSecret: "csec" },
        allowWrites: false,
      } as never);

      // The adapter mutated the loaded credential (expiry moved forward)…
      expect(loaded.credential!.expiresAt).not.toBe(loadedExpiresAt);
      expect(loaded.credential!.refreshToken).toBe("rotated-rt");
      // …so the runner's post-run persistence (same condition as scripts/verify-provider.ts)
      // saves the rotation and accountId survives the merge.
      persistRefreshedCredential("docusign", loaded.credential!, { tenant: "owner@example.com", dataDir: dir });
      await durableFlush();
      const stored = durableGet("tenant_oauth_credentials.json") as Record<string, any>;
      const entry = stored["owner@example.com:docusign"];
      expect(entry.accessToken).toBe("new-at");
      expect(entry.refreshToken).toBe("rotated-rt");
      expect(entry.accountId).toBe("acct-1");
    } finally {
      await durableClose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
