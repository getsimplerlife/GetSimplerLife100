/**
 * file-creation-routing.test.ts — end-to-end routing of a data-file creation
 * request through createDataFile. Covers fail-closed paths (invalid input,
 * nothing connected, preference not connected, explicit request not
 * connected, missing token, refresh failure) and the success path (routes to
 * the tenant's preferred workspace, registers the artifact with workspace +
 * nativeUrl + createdConnector, and reports the workspace used).
 *
 * Network provider clients are injected via the createProviderFile seam —
 * the real dispatch is thin and already covered by provider client tests.
 */
import { describe, expect, it, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync as fsReadFileSync } from "fs";
import { tmpdir } from "os";
import { createDataFile, type CreateFileRequest } from "../lib/file-creation";
import { listClientFiles } from "../lib/client-files";

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "file-creation-"));
  return dir;
}
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function connectProvider(dir: string, tenantId: string, providerId: string): void {
  const file = join(dir, "tenant_integrations.json");
  let all: Record<string, any[]> = {};
  try {
    all = JSON.parse(fsReadFileSync(file, "utf-8"));
  } catch { /* first write */ }
  const conns = all[tenantId] || [];
  conns.push({ id: "int-x", provider: providerId, providerId, category: "Productivity", status: "Connected", connectedAt: new Date().toISOString() });
  all[tenantId] = conns;
  writeFileSync(file, JSON.stringify(all));
}

function storeToken(dir: string, tenantId: string, providerId: string, entry: any): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let all: Record<string, any> = {};
  try {
    all = JSON.parse(fsReadFileSync(file, "utf-8"));
  } catch { /* first write */ }
  all[`${tenantId}:${providerId}`] = entry;
  writeFileSync(file, JSON.stringify(all));
}

const NOW_S = Math.floor(Date.now() / 1000);
const FRESH_TOKEN = { accessToken: "tok-1", refreshToken: "rf-1", expiresAt: NOW_S + 3600, tokenType: "Bearer", scope: "x" };

function baseReq(dir: string, tenantId = "acme@test.com"): CreateFileRequest {
  return { tenantId, fileType: "spreadsheet", title: "Unpaid Invoices", dataDir: dir };
}

describe("createDataFile — fail-closed input validation", () => {
  it("rejects an unknown fileType (400)", async () => {
    const dir = freshDir();
    dirs.push(dir);
    const out = await createDataFile({ ...baseReq(dir), fileType: "word" as any });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });
  it("rejects an empty title (400)", async () => {
    const dir = freshDir();
    dirs.push(dir);
    const out = await createDataFile({ ...baseReq(dir), title: "   " });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });
  it("rejects an empty tenant (400)", async () => {
    const dir = freshDir();
    dirs.push(dir);
    const out = await createDataFile({ ...baseReq(dir, "") });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });
});

describe("createDataFile — routing fail-closed (no network)", () => {
  it("no file workspace connected → 409 with connectHint naming both workspaces", async () => {
    const dir = freshDir();
    dirs.push(dir);
    connectProvider(dir, "acme@test.com", "slack"); // connected, but not a file workspace
    const out = await createDataFile(baseReq(dir));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(409);
      expect(out.error).toContain("No file workspace is connected");
      expect(out.connectHint).toContain("google-sheets");
      expect(out.connectHint).toContain("microsoft-excel");
    }
  });
  it("preference google but only Microsoft connected → 409 with hint", async () => {
    const dir = freshDir();
    dirs.push(dir);
    connectProvider(dir, "acme@test.com", "microsoft-excel");
    const settings = join(dir, "tenant_settings.json");
    writeFileSync(settings, JSON.stringify({ "acme@test.com": { workspacePreference: "google" } }));
    const out = await createDataFile(baseReq(dir));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(409);
      expect(out.connectHint).toEqual(["google-sheets"]);
    }
  });
  it("explicit requested provider not connected → 409 (fail closed, no fallback)", async () => {
    const dir = freshDir();
    dirs.push(dir);
    connectProvider(dir, "acme@test.com", "microsoft-excel");
    const out = await createDataFile({ ...baseReq(dir), requestedProvider: "google-sheets" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(409);
      expect(out.error).toContain("Google Sheets is not connected");
    }
  });
  it("connected but no stored tenant token → 409 connect-first message", async () => {
    const dir = freshDir();
    dirs.push(dir);
    connectProvider(dir, "acme@test.com", "google-sheets");
    // no token stored
    const out = await createDataFile(baseReq(dir));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(409);
      expect(out.error).toContain("No stored connection");
      expect(out.connectHint).toEqual(["google-sheets"]);
    }
  });
  it("expired token with no refresh token → 502 refresh failure (no silent create)", async () => {
    const dir = freshDir();
    dirs.push(dir);
    connectProvider(dir, "acme@test.com", "google-sheets");
    storeToken(dir, "acme@test.com", "google-sheets", { accessToken: "old", expiresAt: NOW_S - 1000 }); // expired, no refreshToken
    const out = await createDataFile(baseReq(dir));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(502);
  });
});

describe("createDataFile — success path (injected create)", () => {
  it("routes auto to the only connected workspace and registers the artifact", async () => {
    const dir = freshDir();
    dirs.push(dir);
    connectProvider(dir, "acme@test.com", "google-sheets");
    storeToken(dir, "acme@test.com", "google-sheets", FRESH_TOKEN);
    let seenProvider = "";
    const out = await createDataFile(baseReq(dir), {
      createProviderFile: async (provider, _tokens, _auth, input) => {
        seenProvider = provider;
        expect(input.fileType).toBe("spreadsheet");
        return { providerFileId: "spreadsheet-1", name: input.title, url: "https://docs.google.com/spreadsheets/d/spreadsheet-1/edit" };
      },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(seenProvider).toBe("google-sheets");
      expect(out.workspace).toBe("google");
      expect(out.provider).toBe("google-sheets");
      expect(out.message).toContain("Google Sheets");
      expect(out.message).toContain("Google Workspace");
      // Registered artifact carries workspace + nativeUrl + connector.
      expect(out.file.providerFileId).toBe("spreadsheet-1");
      expect(out.file.workspace).toBe("google");
      expect(out.file.nativeUrl).toContain("docs.google.com");
      expect(out.file.createdConnector).toBe("chat");
    }
    // Registry persisted under the tenant key only.
        expect(listClientFiles("acme@test.com", dir)).toHaveLength(1);
    expect(listClientFiles("other@test.com", dir)).toHaveLength(0);
  });
  it("routes to the tenant's preference when both workspaces are connected", async () => {
    const dir = freshDir();
    dirs.push(dir);
    connectProvider(dir, "acme@test.com", "google-sheets");
    connectProvider(dir, "acme@test.com", "microsoft-excel");
    storeToken(dir, "acme@test.com", "microsoft-excel", FRESH_TOKEN);
    const settings = join(dir, "tenant_settings.json");
    writeFileSync(settings, JSON.stringify({ "acme@test.com": { workspacePreference: "microsoft" } }));
    let seenProvider = "";
    const out = await createDataFile(baseReq(dir), {
      createProviderFile: async (provider, _t, _a, input) => {
        seenProvider = provider;
        return { providerFileId: "wb-1", name: input.title, url: "https://1drv.ms/wb-1" };
      },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(seenProvider).toBe("microsoft-excel");
      expect(out.workspace).toBe("microsoft");
      expect(out.file.workspace).toBe("microsoft");
      expect(out.file.kind).toBe("excel");
    }
  });
  it("explicit request overrides preference when connected", async () => {
    const dir = freshDir();
    dirs.push(dir);
    connectProvider(dir, "acme@test.com", "google-sheets");
    connectProvider(dir, "acme@test.com", "microsoft-excel");
    storeToken(dir, "acme@test.com", "google-sheets", FRESH_TOKEN);
    const settings = join(dir, "tenant_settings.json");
    writeFileSync(settings, JSON.stringify({ "acme@test.com": { workspacePreference: "microsoft" } }));
    let seenProvider = "";
    const out = await createDataFile({ ...baseReq(dir), requestedProvider: "google-sheets" }, {
      createProviderFile: async (provider, _t, _a, input) => {
        seenProvider = provider;
        return { providerFileId: "gs-2", name: input.title, url: "https://docs.google.com/spreadsheets/d/gs-2/edit" };
      },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(seenProvider).toBe("google-sheets");
      expect(out.workspace).toBe("google");
    }
  });
  it("provider create failure surfaces as 500 with no registry entry", async () => {
    const dir = freshDir();
    dirs.push(dir);
    connectProvider(dir, "acme@test.com", "google-sheets");
    storeToken(dir, "acme@test.com", "google-sheets", FRESH_TOKEN);
    const out = await createDataFile(baseReq(dir), {
      createProviderFile: async () => { throw new Error("HTTP 403 from provider"); },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(500);
      expect(out.error).toContain("create failed");
    }
        expect(listClientFiles("acme@test.com", dir)).toHaveLength(0);
  });
});
