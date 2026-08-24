import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { renderToString } from "react-dom/server";
// PR #196 route-level split moved the page component to src/lazy/*.page.tsx;
// the route file now only exports the Route (no component). Render the lazy
// page directly so this SSR guard exercises the real component.
import FileLibrary from "../lazy/portal.files.index.page";
import {
  CLIENT_FILES_KEY,
  listClientFiles,
  getClientFile,
  registerClientFile,
  removeClientFile,
  buildEmbedUrl,
  buildEditUrl,
  kindForProvider,
} from "../lib/client-files";
import {
  resolveDownloadSource,
  refreshProviderToken,
  handlePortalFileDownload,
} from "../lib/portal-file-download";

function tmpDataDir(): string {
  return mkdtempSync(join(tmpdir(), "client-files-"));
}

function jsonResponse(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ "content-type": "application/json", ...extra }),
    json: async () => data,
    text: async () => JSON.stringify(data),
    body: new Blob([JSON.stringify(data)]),
  } as unknown as Response;
}

describe("client-files registry (client_files.json — coordinated key)", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDataDir(); });

  it("uses the exact coordinated durable key", () => {
    expect(CLIENT_FILES_KEY).toBe("client_files.json");
  });

  it("registers and lists files for a tenant", () => {
    const f = registerClientFile("acme@test.com", {
      provider: "google-docs",
      providerFileId: "doc-1",
      name: "Q3 Report",
      kind: "doc",
      url: "https://docs.google.com/document/d/doc-1/edit",
    }, dir);
    expect(f.id).toContain("cf-google-docs-doc-1");
    const files = listClientFiles("acme@test.com", dir);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("Q3 Report");
    expect(files[0].providerFileId).toBe("doc-1");
  });

  it("upserts idempotently by providerFileId (no duplicates on retry)", () => {
    registerClientFile("acme@test.com", { provider: "google-sheets", providerFileId: "s1", name: "A", kind: "sheet" }, dir);
    registerClientFile("acme@test.com", { provider: "google-sheets", providerFileId: "s1", name: "A", kind: "sheet" }, dir);
    expect(listClientFiles("acme@test.com", dir)).toHaveLength(1);
  });

  it("permission-gates: a tenant never sees another tenant's files", () => {
    registerClientFile("acme@test.com", { provider: "google-docs", providerFileId: "d1", name: "Private", kind: "doc" }, dir);
    expect(listClientFiles("other@test.com", dir)).toHaveLength(0);
    expect(getClientFile("other@test.com", "cf-google-docs-d1", dir)).toBeUndefined();
  });

  it("getClientFile returns the tenant's own file and undefined for foreign ids", () => {
    registerClientFile("acme@test.com", { provider: "google-docs", providerFileId: "d1", name: "X", kind: "doc" }, dir);
    expect(getClientFile("acme@test.com", "cf-google-docs-d1", dir)?.name).toBe("X");
    expect(getClientFile("acme@test.com", "nope", dir)).toBeUndefined();
  });

  it("removeClientFile deletes only the tenant's entry", () => {
    registerClientFile("acme@test.com", { provider: "google-docs", providerFileId: "d1", name: "X", kind: "doc" }, dir);
    expect(removeClientFile("other@test.com", "cf-google-docs-d1", dir)).toBe(false);
    expect(removeClientFile("acme@test.com", "cf-google-docs-d1", dir)).toBe(true);
    expect(listClientFiles("acme@test.com", dir)).toHaveLength(0);
  });

  it("persists to the JSON file (durable-store write path)", () => {
    registerClientFile("acme@test.com", { provider: "google-docs", providerFileId: "d1", name: "X", kind: "doc" }, dir);
    const raw = JSON.parse(readFileSync(join(dir, CLIENT_FILES_KEY), "utf-8"));
    expect(raw["acme@test.com"]).toHaveLength(1);
  });

  it("validates required fields", () => {
    expect(() => registerClientFile("t", { provider: "", providerFileId: "x", name: "n", kind: "doc" }, dir)).toThrow();
    expect(() => registerClientFile("", { provider: "p", providerFileId: "x", name: "n", kind: "doc" }, dir)).toThrow();
  });
});

describe("client-files URL builders", () => {
  it("builds Google embed/edit URLs per kind", () => {
    expect(buildEmbedUrl({ provider: "google-docs", providerFileId: "abc", url: "" })).toBe("https://docs.google.com/document/d/abc/preview");
    expect(buildEditUrl({ provider: "google-sheets", providerFileId: "abc", url: "" })).toBe("https://docs.google.com/spreadsheets/d/abc/edit");
    expect(buildEmbedUrl({ provider: "google-slides", providerFileId: "abc", url: "" })).toBe("https://docs.google.com/presentation/d/abc/preview");
  });
  it("builds Microsoft embed from the file webUrl (no auth token in iframe)", () => {
    const url = "https://tenant-my.sharepoint.com/personal/u/Documents/x.docx";
    expect(buildEmbedUrl({ provider: "microsoft-word", providerFileId: "item-1", url })).toContain("officeapps.live.com/op/embed.aspx");
    expect(buildEditUrl({ provider: "onedrive", providerFileId: "item-1", url })).toBe(url);
  });
  it("returns null embed for unknown providers (fail closed)", () => {
    expect(buildEmbedUrl({ provider: "weird", providerFileId: "x", url: "" })).toBeNull();
  });
  it("maps providers to kinds", () => {
    expect(kindForProvider("google-docs")).toBe("doc");
    expect(kindForProvider("google-sheets")).toBe("sheet");
    expect(kindForProvider("google-slides")).toBe("slides");
    expect(kindForProvider("microsoft-word")).toBe("word");
    expect(kindForProvider("microsoft-excel")).toBe("excel");
    expect(kindForProvider("microsoft-powerpoint")).toBe("ppt");
    expect(kindForProvider("unknown")).toBe("file");
  });
});

describe("portal file download proxy", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDataDir(); });

  function seedToken(provider: string, over: any = {}) {
    const tokenFile = join(dir, "tenant_oauth_credentials.json");
    const data = existsSync(tokenFile) ? JSON.parse(readFileSync(tokenFile, "utf-8")) : {};
    data[`acme@test.com:${provider}`] = {
      provider,
      email: "acme@test.com",
      accessToken: "tok-valid",
      refreshToken: "rt-1",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      ...over,
    };
    writeFileSync(tokenFile, JSON.stringify(data, null, 2));
  }

  it("resolves Google export URLs for native kinds", () => {
    expect(resolveDownloadSource({ id: "i", provider: "google-docs", providerFileId: "abc", name: "r", kind: "doc", createdAt: 1, updatedAt: 1 })?.url).toContain("/drive/v3/files/abc/export?mimeType=application%2Fvnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(resolveDownloadSource({ id: "i", provider: "google-sheets", providerFileId: "abc", name: "r", kind: "sheet", createdAt: 1, updatedAt: 1 })?.url).toContain("spreadsheetml.sheet");
    expect(resolveDownloadSource({ id: "i", provider: "google-slides", providerFileId: "abc", name: "r", kind: "slides", createdAt: 1, updatedAt: 1 })?.url).toContain("presentationml.presentation");
  });

  it("resolves Microsoft Graph content URL", () => {
    const src = resolveDownloadSource({ id: "i", provider: "onedrive", providerFileId: "item-1", name: "x.docx", kind: "word", createdAt: 1, updatedAt: 1 });
    expect(src?.url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/item-1/content");
  });

  it("returns null for unknown providers (fail closed, no guessed URL)", () => {
    expect(resolveDownloadSource({ id: "i", provider: "mystery", providerFileId: "x", name: "x", kind: "file", createdAt: 1, updatedAt: 1 })).toBeNull();
  });

  it("download streams provider content with Content-Disposition and tenant-scoped lookup", async () => {
    registerClientFile("acme@test.com", { provider: "google-drive", providerFileId: "f1", name: "file.pdf", kind: "file" }, dir);
    seedToken("google-drive");
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      body: new Blob(["%PDF-1.4"]),
      text: async () => "",
    })) as unknown as typeof fetch;
    const out = await handlePortalFileDownload({ tenantId: "acme@test.com", fileId: "cf-google-drive-f1", dataDir: dir, fetchImpl });
    expect(out.status).toBe(200);
    expect(out.headers["Content-Disposition"]).toContain("attachment; filename=\"file.pdf\"");
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/drive/v3/files/f1?alt=media");
  });

  it("404s for foreign/unknown files (permission gating)", async () => {
    const out = await handlePortalFileDownload({ tenantId: "other@test.com", fileId: "cf-google-drive-f1", dataDir: dir });
    expect(out.status).toBe(404);
  });

  it("401s when the tenant has no stored token for the provider", async () => {
    registerClientFile("acme@test.com", { provider: "google-drive", providerFileId: "f1", name: "file.pdf", kind: "file" }, dir);
    const out = await handlePortalFileDownload({ tenantId: "acme@test.com", fileId: "cf-google-drive-f1", dataDir: dir });
    expect(out.status).toBe(401);
  });

  it("fails closed (400) for providers without a download path", async () => {
    registerClientFile("acme@test.com", { provider: "mystery", providerFileId: "x", name: "x", kind: "file" }, dir);
    const out = await handlePortalFileDownload({ tenantId: "acme@test.com", fileId: "cf-mystery-x", dataDir: dir });
    expect(out.status).toBe(400);
  });

  it("refreshes an expired token through the provider's audited refresh fn", async () => {
    registerClientFile("acme@test.com", { provider: "google-drive", providerFileId: "f1", name: "file.pdf", kind: "file" }, dir);
    seedToken("google-drive", { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    // Credentials for the refresh call (from tenant_oauth_credentials.json provider key or env).
    const tokenFile = join(dir, "tenant_oauth_credentials.json");
    const data = JSON.parse(readFileSync(tokenFile, "utf-8"));
    data["google-drive"] = { clientId: "cid", clientSecret: "csec" };
    writeFileSync(tokenFile, JSON.stringify(data, null, 2));
    const fetchImpl = vi.fn(async (url: any) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return jsonResponse({ access_token: "tok-new", refresh_token: "rt-new", expires_in: 3600 });
      }
      return { ok: true, status: 200, headers: new Headers({ "content-type": "application/pdf" }), body: new Blob(["%PDF"]), text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;
    // The provider auth module's refreshToken uses the global fetch — stub it.
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    let out: any;
    try {
      out = await handlePortalFileDownload({ tenantId: "acme@test.com", fileId: "cf-google-drive-f1", dataDir: dir, fetchImpl });
      expect(out.status).toBe(200);
    } finally {
      globalThis.fetch = origFetch;
    }
    // The refreshed token was written back through the durable path.
    const after = JSON.parse(readFileSync(join(dir, "tenant_oauth_credentials.json"), "utf-8"));
    expect(after["acme@test.com:google-drive"].accessToken).toBe("tok-new");
  });

  it("surfaces provider download failure as 502 with a clear error", async () => {
    registerClientFile("acme@test.com", { provider: "google-drive", providerFileId: "f1", name: "file.pdf", kind: "file" }, dir);
    seedToken("google-drive");
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, 403)) as unknown as typeof fetch;
    const out = await handlePortalFileDownload({ tenantId: "acme@test.com", fileId: "cf-google-drive-f1", dataDir: dir, fetchImpl });
    expect(out.status).toBe(502);
    expect(JSON.parse(String(out.body)).error).toContain("Provider download failed (403)");
  });
});

describe("portal files page SSR", () => {
  it("renders the File Library shell server-side without crashing", () => {
    const html = renderToString(createElement(FileLibrary));
    expect(html).toContain("File Library");
    expect(html.length).toBeGreaterThan(100);
  });
});
