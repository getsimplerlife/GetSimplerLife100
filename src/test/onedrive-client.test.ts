import { describe, expect, it } from "vitest";
import { createODClient } from "../integrations/providers/onedrive/client";

function makeClient() {
  return createODClient({ accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 } as never);
}

describe("OneDrive client (Graph)", () => {
  it("uses Bearer token and the canonical graph host", () => {
    const c = makeClient();
    expect((c as any).headers["Authorization"]).toBe("Bearer tok-1");
    expect((c as any).client.baseUrl).toBe("https://graph.microsoft.com/v1.0");
  });

  it("listRootItems GETs /me/drive/root/children", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { value: [{ id: "f1" }, { id: "f2" }] } };
    };
    const items = await c.listRootItems();
    expect(calls[0]).toBe("/me/drive/root/children");
    expect(items.length).toBe(2);
  });

  it("getItem and listItems fail closed on empty ids", async () => {
    const c = makeClient();
    await expect(c.getItem("")).rejects.toThrow(/requires an id/);
    await expect(c.listItems("")).rejects.toThrow(/requires a folderId/);
  });

  it("uploadFile PUTs to /me/drive/root:/{path}:/content via raw fetch (binary-safe)", async () => {
    const c = makeClient();
    let captured: { url: string; method: string; headers: Record<string, string>; body: any } | undefined;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      captured = { url, method: opts.method, headers: opts.headers, body: opts.body };
      return { ok: true, json: async () => ({ id: "file-1", name: "x.txt" }) };
    };
    const r = await c.uploadFile("folder/x.txt", new TextEncoder().encode("hi"), "text/plain");
    expect(captured!.url).toBe("https://graph.microsoft.com/v1.0/me/drive/root:/folder/x.txt:/content");
    expect(captured!.method).toBe("PUT");
    expect(captured!.headers["Content-Type"]).toBe("text/plain");
    expect(captured!.headers["Authorization"]).toBe("Bearer tok-1");
    expect(r.id).toBe("file-1");
    delete (globalThis as any).fetch;
  });

  it("getFileContent downloads raw bytes via fetch", async () => {
    const c = makeClient();
    (globalThis as any).fetch = async (url: string, opts: any) => {
      expect(url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/file-1/content");
      expect(opts.headers["Authorization"]).toBe("Bearer tok-1");
      return new Response(new TextEncoder().encode("bytes"));
    };
    const bytes = await c.getFileContent("file-1");
    expect(new TextDecoder().decode(bytes)).toBe("bytes");
    delete (globalThis as any).fetch;
  });

  it("deleteFile treats 404 as already-deleted (idempotent)", async () => {
    const c = makeClient();
    (c as any).client.delete = async () => ({ status: 404 });
    expect(await c.deleteFile("gone")).toEqual({ deleted: true });
  });

  it("moveFile PATCHes parentReference", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; body: any }> = [];
    (c as any).client.patch = async (path: string, body: any) => {
      calls.push({ path, body });
      return { data: { id: "file-1" } };
    };
    await c.moveFile("file-1", "folder-9", "new-name");
    expect(calls[0].path).toBe("/me/drive/items/file-1");
    expect(calls[0].body.parentReference).toEqual({ id: "folder-9" });
    expect(calls[0].body.name).toBe("new-name");
  });

  it("listChangesSince polls the delta endpoint", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { value: [{ id: "x" }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc" } };
    };
    const changes = await c.listChangesSince("tok");
    expect(calls[0]).toBe("/me/drive/root/delta(token='tok')");
    expect(changes[0].deltaToken).toContain("token=abc");
  });

  it("searchFiles and createFolder require non-empty params", async () => {
    const c = makeClient();
    await expect(c.searchFiles("")).rejects.toThrow(/requires a query/);
    await expect(c.createFolder("")).rejects.toThrow(/requires a name/);
  });
});
