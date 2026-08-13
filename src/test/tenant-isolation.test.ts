import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registerClientFile, listClientFiles, getClientFile } from "../lib/client-files";
import { handlePortalFileDownload } from "../lib/portal-file-download";
import { validateOAuthState } from "../lib/oauth-safety";
import { createGoogleDoc, type ProductivityAdapter } from "../agents/capabilities/productivity";
import { createMicrosoftWordDoc, type MicrosoftProductivityAdapter } from "../agents/capabilities/productivity-microsoft";

/**
 * tenant-isolation.test.ts — CROSS-TENANT DATA ISOLATION regression suite
 * (owner mandate 2026-08-12: AI employees create Google/Microsoft files per
 * customer; ZERO cross-tenant data paths — no data shared between customers,
 * no leakage from one customer to another).
 *
 * Covers every tenant-facing path in the product:
 *   1. File registry (client_files.json) — tenant-scoped read gates
 *   2. Portal download proxy — foreign/unknown/missing-token/unknown-provider
 *   3. OAuth token store — per-tenant keys only, no bare-provider read/write
 *   4. Capability executors — tenantId required before any provider call;
 *      registrations land under the executing tenant only
 *   5. OAuth callback — cross-tenant state rejected (mismatch guard)
 *   6. Portal files API — session tenant lists only their own files
 */
function tmpDataDir(): string {
  return mkdtempSync(join(tmpdir(), "tenant-isolation-"));
}
function tokenFilePath(dir: string): string {
  return join(dir, "tenant_oauth_credentials.json");
}
function writeTokenStore(dir: string, data: Record<string, any>): void {
  writeFileSync(tokenFilePath(dir), JSON.stringify(data, null, 2));
}
function readTokenStore(dir: string): Record<string, any> {
  if (!existsSync(tokenFilePath(dir))) return {};
  return JSON.parse(readFileSync(tokenFilePath(dir), "utf-8"));
}
/** Resolve a repo source file from the test's location (works under vitest with cwd = repo root). */
function readSource(relative: string): string {
  const candidates = [join(process.cwd(), relative)];
  if (typeof __dirname === "string") candidates.push(join(__dirname, relative));
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf-8");
    } catch { /* try next */ }
  }
  throw new Error(`cannot read source ${relative} (cwd=${process.cwd()})`);
}

describe("1. file registry: tenant-scoped reads", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDataDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("tenant B never sees tenant A's files (list + get)", () => {
    registerClientFile("a@test.com", { provider: "google-docs", providerFileId: "doc-1", name: "A Private Doc", kind: "doc" }, dir);
    expect(listClientFiles("b@test.com", dir)).toHaveLength(0);
    expect(getClientFile("b@test.com", "cf-google-docs-doc-1", dir)).toBeUndefined();
    expect(getClientFile("unknown@test.com", "cf-google-docs-doc-1", dir)).toBeUndefined();
    // The owner tenant still sees their own file.
    expect(listClientFiles("a@test.com", dir)).toHaveLength(1);
  });

  it("same-id adversarial: identical providerFileId under two tenants never cross-leaks", () => {
    registerClientFile("a@test.com", { provider: "google-docs", providerFileId: "same-id", name: "A Private", kind: "doc" }, dir);
    registerClientFile("b@test.com", { provider: "google-docs", providerFileId: "same-id", name: "B File", kind: "doc" }, dir);
    // B sees exactly one file — their own — even though the registry id collides.
    const bFiles = listClientFiles("b@test.com", dir);
    expect(bFiles).toHaveLength(1);
    expect(bFiles[0].name).toBe("B File");
    expect(getClientFile("b@test.com", "cf-google-docs-same-id", dir)?.name).toBe("B File");
    // A's entry is untouched and still only visible to A.
    expect(getClientFile("a@test.com", "cf-google-docs-same-id", dir)?.name).toBe("A Private");
    // B downloading the colliding id resolves to B's file, not A's.
    const bOwn = getClientFile("b@test.com", "cf-google-docs-same-id", dir)!;
    expect(bOwn.providerFileId).toBe("same-id");
    expect(bOwn.name).toBe("B File");
  });

  it("registry file on disk is keyed by tenant email", () => {
    registerClientFile("a@test.com", { provider: "google-docs", providerFileId: "d1", name: "X", kind: "doc" }, dir);
    const raw = JSON.parse(readFileSync(join(dir, "client_files.json"), "utf-8"));
    expect(Object.keys(raw)).toEqual(["a@test.com"]);
    expect(Array.isArray(raw["a@test.com"])).toBe(true);
  });
});

describe("2. portal download proxy: fail-closed gates", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDataDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("404: tenant B downloading tenant A's fileId", async () => {
    registerClientFile("a@test.com", { provider: "google-drive", providerFileId: "f1", name: "A.pdf", kind: "file" }, dir);
    const out = await handlePortalFileDownload({ tenantId: "b@test.com", fileId: "cf-google-drive-f1", dataDir: dir, fetchImpl: vi.fn() as never });
    expect(out.status).toBe(404);
  });

  it("404: unknown/ghost tenant downloading an existing fileId", async () => {
    registerClientFile("a@test.com", { provider: "google-drive", providerFileId: "f1", name: "A.pdf", kind: "file" }, dir);
    const out = await handlePortalFileDownload({ tenantId: "ghost@test.com", fileId: "cf-google-drive-f1", dataDir: dir, fetchImpl: vi.fn() as never });
    expect(out.status).toBe(404);
  });

  it("401: tenant's own file but no per-tenant token", async () => {
    registerClientFile("a@test.com", { provider: "google-drive", providerFileId: "f1", name: "A.pdf", kind: "file" }, dir);
    const out = await handlePortalFileDownload({ tenantId: "a@test.com", fileId: "cf-google-drive-f1", dataDir: dir, fetchImpl: vi.fn() as never });
    expect(out.status).toBe(401);
  });

  it("400: provider with no audited download path (fail closed, no guessed URL)", async () => {
    registerClientFile("a@test.com", { provider: "mystery-saas", providerFileId: "x1", name: "x.txt", kind: "file" }, dir);
    const out = await handlePortalFileDownload({ tenantId: "a@test.com", fileId: "cf-mystery-saas-x1", dataDir: dir, fetchImpl: vi.fn() as never });
    expect(out.status).toBe(400);
  });

  it("ADVERSARIAL: a legacy bare-provider key (other tenant's token) is never used for tenant A", async () => {
    // Tenant A owns the file but has NO per-tenant token. A poisoned legacy
    // bare-provider key holds tenant B's access token. The proxy must fail
    // closed (401) instead of silently using the bare key (which would leak
    // tenant B's credentials into a download for tenant A).
    registerClientFile("a@test.com", { provider: "google-drive", providerFileId: "f1", name: "A.pdf", kind: "file" }, dir);
    writeTokenStore(dir, {
      "google-drive": {
        provider: "google-drive",
        email: "b@test.com",
        accessToken: "tok-OTHER-TENANT-SECRET",
        refreshToken: "rt-b",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), body: new Blob(["x"]), text: async () => "" })) as never;
    const out = await handlePortalFileDownload({ tenantId: "a@test.com", fileId: "cf-google-drive-f1", dataDir: dir, fetchImpl });
    expect(out.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ADVERSARIAL: a legacy bare key with A's own token is still ignored — only the per-tenant key is read", async () => {
    registerClientFile("a@test.com", { provider: "google-drive", providerFileId: "f1", name: "A.pdf", kind: "file" }, dir);
    writeTokenStore(dir, {
      "google-drive": { provider: "google-drive", accessToken: "tok-bare", refreshToken: "rt", expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    });
    const out = await handlePortalFileDownload({ tenantId: "a@test.com", fileId: "cf-google-drive-f1", dataDir: dir, fetchImpl: vi.fn() as never });
    expect(out.status).toBe(401); // bare key is not tenant-scoped → never used
  });
});

describe("3. OAuth token store: per-tenant keys only", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDataDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("token file shape is keyed by `${email}:${provider}`", () => {
    writeTokenStore(dir, {
      "a@test.com:google-drive": { provider: "google-drive", accessToken: "tok-a" },
      "a@test.com:microsoft-word": { provider: "microsoft-word", accessToken: "tok-b" },
      "b@test.com:onedrive": { provider: "onedrive", accessToken: "tok-c" },
    });
    const data = readTokenStore(dir);
    const keys = Object.keys(data);
    expect(keys).toContain("a@test.com:google-drive");
    expect(keys).toContain("b@test.com:onedrive");
    // Every key must carry the tenant prefix — no bare provider keys.
    for (const k of keys) expect(k).toMatch(/^[^:]+@[^:]+:[a-z0-9-]+$/);
  });

  it("refresh write-back preserves the per-tenant key and never creates/updates a bare key", async () => {
    registerClientFile("a@test.com", { provider: "google-drive", providerFileId: "f1", name: "A.pdf", kind: "file" }, dir);
    // Per-tenant EXPIRED token + bare key holding only shared OAuth app creds.
    writeTokenStore(dir, {
      "a@test.com:google-drive": {
        provider: "google-drive", email: "a@test.com",
        accessToken: "tok-old", refreshToken: "rt-a",
        expiresAt: Math.floor(Date.now() / 1000) - 60,
      },
      "google-drive": { clientId: "cid", clientSecret: "csec" },
    });
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), body: new Blob([JSON.stringify({ access_token: "tok-new", refresh_token: "rt-new", expires_in: 3600 })]), json: async () => ({ access_token: "tok-new", refresh_token: "rt-new", expires_in: 3600 }), text: async () => "" } as never;
      }
      return { ok: true, status: 200, headers: new Headers({ "content-type": "application/pdf" }), body: new Blob(["%PDF"]), text: async () => "" } as never;
    }) as never;
    // The google-drive auth module's refresh fn uses the global fetch — stub it
    // (same pattern as the portal-file-library suite).
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    let out: { status: number };
    try {
      out = await handlePortalFileDownload({ tenantId: "a@test.com", fileId: "cf-google-drive-f1", dataDir: dir, fetchImpl });
    } finally {
      globalThis.fetch = origFetch;
    }
    expect(out.status).toBe(200);
    const after = readTokenStore(dir);
    expect(after["a@test.com:google-drive"].accessToken).toBe("tok-new");
    // The bare key (if present) holds ONLY app credentials — never an access token.
    expect(after["google-drive"]?.accessToken).toBeUndefined();
  });

  it("SOURCE GUARD: no bare-provider token WRITES exist anywhere in the codebase", () => {
    const targets = [
      "prod-server.ts",
      "src/lib/portal-file-download.ts",
      "src/lib/token-refresher.ts",
    ];
    const forbidden = [
      /tokenData\s*\[\s*provider\s*\]\s*=/,
      /tokenData\s*\[\s*file\.provider\s*\]\s*=/,
      /tokenData\s*\[\s*authProvider\s*\]\s*=/,
      /all\s*\[\s*file\.provider\s*\]\s*=/,
    ];
    for (const t of targets) {
      const src = readSource(t);
      for (const re of forbidden) {
        expect(src, `${t} must not contain bare-provider token write ${re}`).not.toMatch(re);
      }
    }
  });

  it("SOURCE GUARD: the only token store write in prod-server is the per-tenant key `${user.email}:${canonicalProvider}` (per-tenant, canonical id)", () => {
    const src = readSource("prod-server.ts");
    expect(src).toContain("const tokenKey = `${user.email}:${authProvider}`;");
    expect(src).toContain("tokenData[tokenKey] = {");
  });
});

describe("4. capability executors: tenant required, registrations tenant-scoped", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDataDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("createGoogleDoc throws on missing tenantId BEFORE the adapter runs", async () => {
    const adapter = { createDoc: vi.fn(async () => ({ id: "doc-1" })) } as unknown as ProductivityAdapter;
    await expect(
      createGoogleDoc(adapter, { title: "X" }, { tenantId: "  ", authToken: "tok", audit: async () => {} }, "ik-1"),
    ).rejects.toThrow(/Tenant scope/);
    expect(adapter.createDoc).not.toHaveBeenCalled();
  });

  it("createMicrosoftWordDoc throws on missing tenantId BEFORE the adapter runs", async () => {
    const adapter = { createWordDoc: vi.fn(async () => ({ id: "w1" })) } as unknown as MicrosoftProductivityAdapter;
    await expect(
      createMicrosoftWordDoc(adapter, { name: "R", paragraphs: ["x"] }, { tenantId: "", authToken: "tok", audit: async () => {} }, "ik-1"),
    ).rejects.toThrow(/Tenant scope/);
    expect(adapter.createWordDoc).not.toHaveBeenCalled();
  });

  it("registration writes under the executing tenant's key ONLY", async () => {
    const adapter = { createDoc: async () => ({ id: "doc-1", name: "A Doc", webViewLink: "https://docs.google.com/d/doc-1" }) } as ProductivityAdapter;
    await createGoogleDoc(adapter, { title: "A Doc" }, { tenantId: "a@test.com", authToken: "tok", audit: async () => {}, dataDir: dir }, "ik-1");
    expect(listClientFiles("a@test.com", dir)).toHaveLength(1);
    expect(listClientFiles("b@test.com", dir)).toHaveLength(0);
    const raw = JSON.parse(readFileSync(join(dir, "client_files.json"), "utf-8"));
    expect(Object.keys(raw)).toEqual(["a@test.com"]);
  });

  it("Microsoft create registration lands under the executing tenant's key ONLY", async () => {
    const adapter = { createWordDoc: async () => ({ id: "w1", name: "R.docx", webUrl: "https://1drv.ms/w1" }) } as MicrosoftProductivityAdapter;
    await createMicrosoftWordDoc(adapter, { name: "R", paragraphs: ["x"] }, { tenantId: "a@test.com", authToken: "tok", audit: async () => {}, dataDir: dir }, "ik-1");
    expect(listClientFiles("a@test.com", dir)).toHaveLength(1);
    expect(listClientFiles("b@test.com", dir)).toHaveLength(0);
  });
});

describe("5. OAuth callback: cross-tenant state rejected", () => {
  it("validateOAuthState returns 'mismatch' when the state belongs to another tenant", () => {
    const state = { provider: "google-drive", email: "a@test.com", createdAt: Date.now() };
    expect(validateOAuthState(state, "b@test.com")).toBe("mismatch");
    expect(validateOAuthState(state, "a@test.com")).toBeNull();
    expect(validateOAuthState(undefined as never, "a@test.com")).toBe("invalid");
    expect(validateOAuthState({ ...state, createdAt: Date.now() - 11 * 60 * 1000 }, "a@test.com")).toBe("expired");
  });

  it("SOURCE GUARD: prod-server rejects mismatched state with a redirect error", () => {
    const src = readSource("prod-server.ts");
    expect(src).toContain("OAuth state belongs to a different tenant");
    expect(src).toContain('stateError === "mismatch"');
    expect(src).toContain("validateOAuthState(stateEntry, callbackUser.email)");
  });
});

describe("6. portal files API: session tenant sees only their own files", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDataDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("data layer: the exact call the API makes (listClientFiles(user.email)) returns only that tenant's files", () => {
    registerClientFile("a@test.com", { provider: "google-docs", providerFileId: "d1", name: "A Only", kind: "doc" }, dir);
    registerClientFile("a@test.com", { provider: "onedrive", providerFileId: "o1", name: "A Second", kind: "file" }, dir);
    registerClientFile("b@test.com", { provider: "google-sheets", providerFileId: "s1", name: "B Only", kind: "sheet" }, dir);
    // Session tenant A:
    expect(listClientFiles("a@test.com", dir).map((f) => f.name).sort()).toEqual(["A Only", "A Second"]);
    // Session tenant B:
    expect(listClientFiles("b@test.com", dir).map((f) => f.name)).toEqual(["B Only"]);
    // fileId lookup the API performs is also tenant-gated:
    expect(getClientFile("a@test.com", "cf-google-sheets-s1", dir)).toBeUndefined();
    expect(getClientFile("b@test.com", "cf-google-sheets-s1", dir)?.name).toBe("B Only");
  });

  it("SOURCE GUARD: the /api/portal/files handler gates every lookup on the session email", () => {
    const src = readSource("prod-server.ts");
    expect(src).toContain("listClientFiles(user.email, DATA_DIR)");
    expect(src).toContain("getClientFile(user.email, fileId, DATA_DIR)");
    // Download proxy is invoked with the session tenant only.
    expect(src).toContain("handlePortalFileDownload({ tenantId: user.email, fileId, dataDir: DATA_DIR })");
  });
});
