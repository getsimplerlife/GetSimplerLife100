import { describe, expect, it } from "vitest";
import { pickDefaultAccount, resolveDocuSignDefaultAccount, docusignApiBaseUrl, DOCUSIGN_USERINFO_HOSTS } from "../integrations/providers/docusign/auth";
import { createDocuSignClient } from "../integrations/providers/docusign/client";

describe("DocuSign account id resolution", () => {
  it("picks the default account and falls back to the first", () => {
    expect(pickDefaultAccount([])).toBeUndefined();
    expect(pickDefaultAccount([{ account_id: "a1" }])).toEqual({ accountId: "a1", baseUri: "" });
    expect(pickDefaultAccount([
      { account_id: "a1", is_default: false, base_uri: "https://demo.docusign.net/restapi" },
      { account_id: "a2", is_default: true, base_uri: "https://demo.docusign.net/restapi" },
    ])).toEqual({ accountId: "a2", baseUri: "https://demo.docusign.net/restapi" });
  });

  it("uses the stored token account_id before any userinfo call", async () => {
    const client = createDocuSignClient({
      accessToken: "tok",
      accountId: "",
      account_id: "raw-account-123",
    } as never);
    const requested: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      requested.push(String(url));
      return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ envelopes: [] }) } as Response;
    }) as typeof fetch;
    try {
      await client.listEnvelopes();
      expect((client as any).accountId).toBe("raw-account-123");
      expect(requested.some((u) => u.includes("/v2.1/accounts/raw-account-123/envelopes"))).toBe(true);
      expect(requested.some((u) => u.includes("userinfo"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves the default account via canonical userinfo hosts only", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      calls.push(String(url));
      if (String(url).includes("account-d.docusign.com")) {
        return { ok: true, json: async () => ({ accounts: [{ account_id: "ui-9", is_default: true, base_uri: "https://demo.docusign.net/restapi" }] }) } as Response;
      }
      return { ok: false } as Response;
    }) as typeof fetch;
    try {
      const resolved = await resolveDocuSignDefaultAccount({ accessToken: "tok" });
      expect(resolved).toEqual({ accountId: "ui-9", baseUri: "https://demo.docusign.net/restapi" });
      for (const url of calls) expect(DOCUSIGN_USERINFO_HOSTS.some((h) => url.includes(h))).toBe(true);
      expect(calls.some((c) => c.includes("account-d.docusign.com/oauth/userinfo"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("builds the API base URL from a userinfo base_uri without guessing hosts", () => {
    expect(docusignApiBaseUrl("https://demo.docusign.net")).toBe("https://demo.docusign.net/restapi");
    expect(docusignApiBaseUrl("demo.docusign.net")).toBe("https://demo.docusign.net/restapi");
    expect(docusignApiBaseUrl("https://demo.docusign.net/restapi")).toBe("https://demo.docusign.net/restapi");
    expect(docusignApiBaseUrl("")).toBe("https://demo.docusign.net/restapi");
    expect(docusignApiBaseUrl(undefined)).toBe("https://demo.docusign.net/restapi");
    expect(docusignApiBaseUrl("https://na2.docusign.net")).toBe("https://na2.docusign.net/restapi");
  });
  it("fails closed with a clear error when no account can be resolved", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false }) as Response) as typeof fetch;
    try {
      await expect(resolveDocuSignDefaultAccount({ accessToken: "tok" })).rejects.toThrow("no usable account");
      await expect(resolveDocuSignDefaultAccount({})).rejects.toThrow("access token is required");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
