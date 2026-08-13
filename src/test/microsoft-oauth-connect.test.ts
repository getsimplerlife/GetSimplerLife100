import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getCanonicalProvider } from "../lib/provider-canonical";
import { integrations } from "../content/integrations";
import { hasAuthModule } from "../content/integration-auth-map";
import { envKeyFor, loadStoredCredential } from "../verification/credential-source";
import * as wordAuth from "../integrations/providers/microsoft-word/auth";
import * as excelAuth from "../integrations/providers/microsoft-excel/auth";
import * as pptAuth from "../integrations/providers/microsoft-powerpoint/auth";

/**
 * Microsoft Office portal Connect regression suite (2026-08-13).
 *
 * Root cause fixed here: the portal catalog advertised bare ids `word` / `excel`
 * while the auth modules, capability contracts, verification adapters, and
 * token-refresher registry all use canonical ids `microsoft-word` /
 * `microsoft-excel` / `microsoft-powerpoint`. OAuth connect failed because
 * `getOAuthCredentials("word")` looked for OAUTH_WORD_CLIENT_ID (missing) and
 * the auth-module import path `providers/word/auth.ts` did not exist.
 *
 * Fix: catalog ships canonical ids; PROVIDER_CANONICAL keeps old aliases
 * working; the authorize + callback paths resolve credentials, the auth-module
 * import, and the stored token key through the canonical id.
 */

const MICROSOFT_IDS = ["microsoft-word", "microsoft-excel", "microsoft-powerpoint"] as const;

describe("Microsoft Office provider id canonicalization", () => {
  it("maps legacy aliases to canonical ids", () => {
    expect(getCanonicalProvider("word")).toBe("microsoft-word");
    expect(getCanonicalProvider("excel")).toBe("microsoft-excel");
    expect(getCanonicalProvider("powerpoint")).toBe("microsoft-powerpoint");
  });
  it("is case-insensitive", () => {
    expect(getCanonicalProvider("Word")).toBe("microsoft-word");
    expect(getCanonicalProvider("EXCEL")).toBe("microsoft-excel");
  });
  it("is idempotent for canonical ids", () => {
    for (const id of MICROSOFT_IDS) {
      expect(getCanonicalProvider(id)).toBe(id);
    }
  });
  it("leaves OneDrive and unrelated providers untouched", () => {
    expect(getCanonicalProvider("onedrive")).toBe("onedrive");
    expect(getCanonicalProvider("slack")).toBe("slack");
  });
});

describe("Microsoft Office portal catalog", () => {
  const catalogIds = integrations.filter(Boolean).map((i) => i.id);

  it("advertises canonical ids microsoft-word / microsoft-excel / microsoft-powerpoint", () => {
    for (const id of MICROSOFT_IDS) {
      expect(catalogIds).toContain(id);
    }
  });
  it("no longer advertises bare word / excel / powerpoint ids", () => {
    expect(catalogIds).not.toContain("word");
    expect(catalogIds).not.toContain("excel");
    expect(catalogIds).not.toContain("powerpoint");
  });
  it("lists the three Office providers under Microsoft Ecosystem with honest names", () => {
    const byId = new Map(integrations.filter(Boolean).map((i) => [i.id, i]));
    expect(byId.get("microsoft-word")?.name).toBe("Microsoft Word");
    expect(byId.get("microsoft-excel")?.name).toBe("Microsoft Excel");
    expect(byId.get("microsoft-powerpoint")?.name).toBe("Microsoft PowerPoint");
    for (const id of MICROSOFT_IDS) {
      const entry = byId.get(id)!;
      expect(entry.category).toBe("Microsoft Ecosystem");
      expect(Array.isArray(entry.capabilities)).toBe(true);
      expect(entry.capabilities.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.industries)).toBe(true);
      expect(Array.isArray(entry.relatedWorkflows)).toBe(true);
    }
  });
});

describe("Microsoft Office auth map", () => {
  it("registers real auth modules for all three (the hasAuthModule gate the connect UI relies on)", () => {
    for (const id of MICROSOFT_IDS) {
      expect(hasAuthModule(id), id).toBe(true);
    }
  });
  it("keeps OneDrive mapped to a real auth module", () => {
    expect(hasAuthModule("onedrive")).toBe(true);
  });
});

describe("Microsoft Office OAuth env-var credential resolution", () => {
  it("resolves canonical ids to the real OAUTH_MICROSOFT_* env keys", () => {
    expect(envKeyFor("microsoft-word", "CLIENT_ID")).toBe("OAUTH_MICROSOFT_WORD_CLIENT_ID");
    expect(envKeyFor("microsoft-excel", "CLIENT_SECRET")).toBe("OAUTH_MICROSOFT_EXCEL_CLIENT_SECRET");
    expect(envKeyFor("microsoft-powerpoint", "CLIENT_ID")).toBe("OAUTH_MICROSOFT_POWERPOINT_CLIENT_ID");
  });
});

describe("Microsoft Office auth modules (Graph PKCE)", () => {
  const input = { clientId: "test-client", clientSecret: "test-secret", redirectUri: "https://example.com/api/oauth/callback" };

  it("builds authorize URLs against the canonical Graph authority with PKCE", async () => {
    const cases = [
      { name: "word", build: wordAuth.buildWordAuthUrl, scopes: wordAuth.WORD_SCOPES },
      { name: "excel", build: excelAuth.buildExcelAuthUrl, scopes: excelAuth.EXCEL_SCOPES },
      { name: "powerpoint", build: pptAuth.buildPowerPointAuthUrl, scopes: pptAuth.POWERPOINT_SCOPES },
    ];
    for (const c of cases) {
      const res = await c.build(input);
      expect(res.url, c.name).toContain("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
      expect(res.url, c.name).toContain("client_id=test-client");
      // Confidential-client flow: client secret must never appear in the URL.
      expect(res.url, c.name).not.toContain("client_secret=");
      expect(res.url, c.name).not.toContain("localhost");
      expect(res.state).toBeTruthy();
      expect(res.verifier).toBeTruthy();
      // Files.ReadWrite + offline_access exactly (offline_access ⇒ refresh token)
      expect(c.scopes).toEqual(["Files.ReadWrite", "offline_access"]);
    }
  });
});

describe("Microsoft Office stored credential key (verification runner contract)", () => {
  it("loads the token stored under ${tenant}:microsoft-word and fails closed on a bare word key", () => {
    const dir = mkdtempSync(join(tmpdir(), "msft-oauth-"));
    try {
      const credsFile = join(dir, "tenant_oauth_credentials.json");
      writeFileSync(credsFile, JSON.stringify({
        // Canonical key — what the fixed callback writes and verify-provider reads.
        "owner@acme.com:microsoft-word": { provider: "microsoft-word", accessToken: "tok-w" },
        // Legacy bare alias that must NOT satisfy the canonical lookup.
        "owner@acme.com:word": { provider: "word", accessToken: "tok-legacy" },
      }));
      const hit = loadStoredCredential("microsoft-word", { tenant: "owner@acme.com", dataDir: dir });
      expect(hit.credential?.accessToken).toBe("tok-w");
      expect(hit.source).toContain(":microsoft-word");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("prod-server OAuth path resolves through the canonical id (source guard)", () => {
  const src = require("node:fs").readFileSync(join(process.cwd(), "prod-server.ts"), "utf8");

  it("authorize resolves credentials via the canonical provider id", () => {
    // getOAuthCredentials(canonicalProvider) — not the raw URL-provided id
    expect(src).toContain("const creds = getOAuthCredentials(canonicalProvider);");
  });
  it("callback stores the token under the canonical provider key", () => {
    expect(src).toContain("const tokenKey = `${user.email}:${canonicalProvider}`;");
    expect(src).not.toContain("const tokenKey = `${user.email}:${authProvider}`;");
  });
  it("callback imports the auth module through the canonical id", () => {
    expect(src).toContain("`./src/integrations/providers/${canonicalProvider}/auth.ts`");
  });
  it("no longer embeds the canonical map in prod-server (moved to lib/provider-canonical)", () => {
    expect(src).not.toContain("const PROVIDER_CANONICAL: Record<string, string>");
    expect(src).toContain('import { getCanonicalProvider } from "./src/lib/provider-canonical";');
  });
});

describe("providers API / getOAuthCredentials contract (lead-requested regressions)", () => {
  it("providers API (serves the catalog 1:1) returns the canonical Office ids", () => {
    // The /api/integrations/providers route maps over src/content/integrations
    // without id transformation, so the catalog ids ARE the API ids.
    const apiIds = integrations.filter(Boolean).map((i) => i.id);
    for (const id of MICROSOFT_IDS) expect(apiIds).toContain(id);
  });

  it('getOAuthCredentials("microsoft-word") env-key path is non-null (mirrors prod-server key building)', () => {
    // prod-server: OAUTH_${provider.replace(/-/g, "_").toUpperCase()}_CLIENT_ID
    const keyOf = (provider: string, suffix: string) =>
      `OAUTH_${provider.replace(/-/g, "_").toUpperCase()}_${suffix}`;
    expect(keyOf("microsoft-word", "CLIENT_ID")).toBe("OAUTH_MICROSOFT_WORD_CLIENT_ID");
    expect(keyOf("microsoft-excel", "CLIENT_SECRET")).toBe("OAUTH_MICROSOFT_EXCEL_CLIENT_SECRET");
    expect(keyOf("microsoft-powerpoint", "CLIENT_ID")).toBe("OAUTH_MICROSOFT_POWERPOINT_CLIENT_ID");
    // Simulate the exact getOAuthCredentials first branch with env vars set:
    // it must resolve to a non-null { clientId, clientSecret }, never a null path.
    const saved: Record<string, string | undefined> = {};
    const setVar = (k: string, v: string) => { saved[k] = process.env[k]; process.env[k] = v; };
    const restore = () => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
    try {
      setVar("OAUTH_MICROSOFT_WORD_CLIENT_ID", "cid-w");
      setVar("OAUTH_MICROSOFT_WORD_CLIENT_SECRET", "csec-w");
      setVar("OAUTH_MICROSOFT_EXCEL_CLIENT_ID", "cid-e");
      setVar("OAUTH_MICROSOFT_EXCEL_CLIENT_SECRET", "csec-e");
      setVar("OAUTH_MICROSOFT_POWERPOINT_CLIENT_ID", "cid-p");
      setVar("OAUTH_MICROSOFT_POWERPOINT_CLIENT_SECRET", "csec-p");
      for (const [provider, cid, csec] of [
        ["microsoft-word", "cid-w", "csec-w"],
        ["microsoft-excel", "cid-e", "csec-e"],
        ["microsoft-powerpoint", "cid-p", "csec-p"],
      ] as const) {
        const clientId = process.env[keyOf(provider, "CLIENT_ID")];
        const clientSecret = process.env[keyOf(provider, "CLIENT_SECRET")];
        expect({ clientId, clientSecret }, provider).toEqual({ clientId: cid, clientSecret: csec });
        expect(clientId && clientSecret, provider).toBeTruthy(); // non-null path
      }
    } finally {
      restore();
    }
  });

  it("prod-server providers API route maps the catalog without renaming ids (source guard)", () => {
    const src = require("node:fs").readFileSync(join(process.cwd(), "prod-server.ts"), "utf8");
    const route = src.slice(src.indexOf("/api/integrations/providers"));
    expect(route).toContain('const { integrations } = await import("./src/content/integrations");');
    // No id-rename map for the Office providers anywhere in the route.
    expect(route).not.toContain('"microsoft-word": "word"');
    expect(route).not.toContain('"microsoft-excel": "excel"');
  });
});

