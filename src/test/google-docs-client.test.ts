import { describe, expect, it } from "vitest";
import { HttpClientError } from "../integrations/framework/client";
import { createGDocsClient, extractTextFromDocument, bodyEndIndexFromDocument, GOOGLE_DOC_MIME } from "../integrations/providers/google-docs/client";

function makeClient() {
  return createGDocsClient({ accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 } as never);
}

describe("Google Docs client (create/read/update)", () => {
  it("uses Bearer token and canonical hosts", () => {
    const c = makeClient();
    const headers = (c as any).headers;
    expect(headers["Authorization"]).toBe("Bearer tok-1");
    expect((c as any).docs.baseUrl).toBe("https://docs.googleapis.com/v1");
    expect((c as any).drive.baseUrl).toBe("https://www.googleapis.com/drive/v3");
  });

  it("createDocument posts to Drive API with docs mimeType", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; body: any }> = [];
    (c as any).drive.post = async (path: string, body: any) => {
      calls.push({ path, body });
      return { data: { id: "doc-1", name: "My Doc" } };
    };
    const doc = await c.createDocument("My Doc", "folder-1");
    expect(doc.id).toBe("doc-1");
    expect(calls[0].path).toBe("/files?supportsAllDrives=true");
    expect(calls[0].body.mimeType).toBe(GOOGLE_DOC_MIME);
    expect(calls[0].body.parents).toEqual(["folder-1"]);
  });

  it("getDocumentText extracts plain text from body content", async () => {
    const c = makeClient();
    (c as any).docs.get = async () => ({
      data: {
        documentId: "doc-1",
        body: {
          content: [
            { startIndex: 1, endIndex: 6, paragraph: { elements: [{ startIndex: 1, endIndex: 6, textRun: { content: "Hello" } }] } },
            { startIndex: 6, endIndex: 7, paragraph: { elements: [{ startIndex: 6, endIndex: 7, textRun: { content: "!" } }] } },
          ],
        },
      },
    });
    const text = await c.getDocumentText("doc-1");
    expect(text).toContain("Hello");
    expect(text).toContain("!");
  });

  it("extractTextFromDocument handles missing body (fail soft, empty string)", () => {
    expect(extractTextFromDocument({})).toBe("");
    expect(extractTextFromDocument({ body: {} })).toBe("");
  });

  it("bodyEndIndexFromDocument returns end-of-body index", () => {
    const doc = { body: { content: [{ startIndex: 1, endIndex: 10 }, { startIndex: 10, endIndex: 25 }] } };
    expect(bodyEndIndexFromDocument(doc)).toBe(24);
    expect(bodyEndIndexFromDocument({})).toBe(1);
  });

  it("batchUpdate posts requests to :batchUpdate and requires non-empty requests", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; body: any }> = [];
    (c as any).docs.post = async (path: string, body: any) => {
      calls.push({ path, body });
      return { data: { replies: [] } };
    };
    await c.batchUpdate("doc-1", [{ insertText: { location: { index: 1 }, text: "x" } }]);
    expect(calls[0].path).toBe("/documents/doc-1:batchUpdate");
    expect(calls[0].body.requests).toHaveLength(1);
    await expect(c.batchUpdate("doc-1", [])).rejects.toThrow("non-empty requests");
  });

  it("createDocumentFromTemplate copies then replaces tokens", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).drive.post = async (path: string) => {
      calls.push(path);
      return { data: { id: "doc-copy", name: "Copy" } };
    };
    (c as any).docs.post = async (path: string) => {
      calls.push(path);
      return { data: { replies: [] } };
    };
    const copy = await c.createDocumentFromTemplate("tpl-1", "Copy", { "{{Name}}": "Acme" });
    expect(copy.id).toBe("doc-copy");
    expect(calls[0]).toContain("/files/tpl-1/copy");
    expect(calls[1]).toContain(":batchUpdate");
  });

  it("healthCheck probes the Docs API (not drive) and reports token validity", async () => {
    const c = makeClient();
    const paths: string[] = [];
    (c as any).docs.get = async (path: string) => {
      paths.push(path);
      throw new HttpClientError("GET probe failed (404)", 404, "Not Found");
    };
    expect(await c.healthCheck()).toBe(true); // 404 on a bogus id = auth OK
    expect(paths[0]).toMatch(/^\/documents\//); // docs client, NOT the drive sub-client
    (c as any).docs.get = async () => {
      throw new HttpClientError("GET probe failed (401)", 401, "Unauthorized");
    };
    expect(await c.healthCheck()).toBe(false); // rejected token = fail
    (c as any).docs.get = async () => {
      throw new HttpClientError("GET probe failed (403)", 403, "Forbidden");
    };
    expect(await c.healthCheck()).toBe(false);
    (c as any).docs.get = async () => {
      throw new HttpClientError("GET probe failed (400)", 400, "Bad Request");
    };
    expect(await c.healthCheck()).toBe(true); // malformed id = auth OK
    (c as any).docs.get = async () => {
      throw new Error("network down");
    };
    expect(await c.healthCheck()).toBe(false);
  });

  it("healthCheck refreshes an expired token before probing (refresh path)", async () => {
    const c = createGDocsClient({
      accessToken: "tok-expired",
      refreshToken: "rt-1",
      expiresAt: Date.now() / 1000 - 60,
    } as never);
    let refreshed = false;
    const seenHeaders: any[] = [];
    (c as any).ensureToken = async () => {
      refreshed = true;
      // Simulate a successful refresh: the client's next request must use the new token.
      (c as any).tokens = { accessToken: "tok-fresh", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 };
    };
    (c as any).docs.get = async (_path: string, headers: any) => {
      seenHeaders.push(headers);
      throw new HttpClientError("GET probe failed (404)", 404, "Not Found");
    };
    expect(await c.healthCheck()).toBe(true);
    expect(refreshed).toBe(true);
    expect(seenHeaders[0]["Authorization"]).toBe("Bearer tok-fresh");
  });
});
