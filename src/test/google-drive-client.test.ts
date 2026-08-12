import { describe, expect, it } from "vitest";
import { createGDriveClient, FOLDER_MIME } from "../integrations/providers/google-drive/client";

function makeClient() {
  return createGDriveClient({ accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 } as never);
}

describe("Google Drive client (full capability surface)", () => {
  it("uses Bearer token and canonical host", () => {
    const c = makeClient();
    const headers = (c as any).headers;
    expect(headers["Authorization"]).toBe("Bearer tok-1");
    expect((c as any).client.baseUrl).toBe("https://www.googleapis.com/drive/v3");
  });

  it("listFiles builds a Drive query", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { files: [{ id: "f1", name: "a.txt" }] } };
    };
    await c.listFiles("trashed = false", 10);
    expect(calls[0]).toContain("/files?q=");
    expect(calls[0]).toContain("pageSize=10");
    expect(calls[0]).toContain("supportsAllDrives=true");
  });

  it("getFile requires an id (fail closed)", async () => {
    const c = makeClient();
    await expect(c.getFile("")).rejects.toThrow("requires a file id");
  });

  it("createFolder posts with folder mimeType", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; body: any }> = [];
    (c as any).client.post = async (path: string, body: any) => {
      calls.push({ path, body });
      return { data: { id: "folder-1", name: "NewFolder" } };
    };
    const folder = await c.createFolder("NewFolder", "parent-1");
    expect(folder.id).toBe("folder-1");
    expect(calls[0].path).toBe("/files?supportsAllDrives=true");
    expect(calls[0].body.mimeType).toBe(FOLDER_MIME);
    expect(calls[0].body.parents).toEqual(["parent-1"]);
  });

  it("listChangesSince builds a modifiedTime query (monitor slice)", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { files: [] } };
    };
    await c.listChangesSince("2026-08-01T00:00:00Z");
    expect(calls[0]).toContain("modifiedTime%20%3E%20'2026-08-01T00%3A00%3A00Z'");
    expect(calls[0]).toContain("trashed%20%3D%20false");
  });

  it("deleteFile uses DELETE and returns id (rollback path)", async () => {
    const c = makeClient();
    let deleted = false;
    (c as any).client.delete = async () => {
      deleted = true;
      return { ok: true };
    };
    const result = await c.deleteFile("file-9");
    expect(result).toEqual({ deleted: true, id: "file-9" });
    expect(deleted).toBe(true);
  });

  it("moveFile patches with addParents/removeParents", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.patch = async (path: string) => {
      calls.push(path);
      return { data: { id: "file-1", name: "x", parents: ["new-parent"] } };
    };
    await c.moveFile("file-1", "new-parent");
    expect(calls[0]).toContain("addParents=new-parent");
    expect(calls[0]).toContain("removeParents=new-parent");
  });

  it("uploadFile posts multipart to the upload host with metadata + content", async () => {
    const c = makeClient();
    let captured: { url: string; headers: any; body: string } | null = null;
    globalThis.fetch = (async (url: any, init: any) => {
      captured = { url: String(url), headers: init?.headers, body: String(init?.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "up-1", name: "report.txt" }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const file = await c.uploadFile("report.txt", "hello world", "text/plain", "parent-1");
    expect(file.id).toBe("up-1");
    expect(captured!.url).toContain("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart");
    expect(captured!.headers["Content-Type"]).toContain("multipart/related");
    expect(captured!.headers["Authorization"]).toBe("Bearer tok-1");
    expect(captured!.body).toContain('"name":"report.txt"');
    expect(captured!.body).toContain('"parents":["parent-1"]');
    expect(captured!.body).toContain("hello world");
  });

  it("uploadFile requires a name (fail closed)", async () => {
    const c = makeClient();
    await expect(c.uploadFile("", "x")).rejects.toThrow("requires a name");
  });
});
