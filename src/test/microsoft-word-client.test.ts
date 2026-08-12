import { describe, expect, it } from "vitest";
import { createWordClient } from "../integrations/providers/microsoft-word/client";

function makeClient() {
  return createWordClient({ accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 } as never);
}

describe("Microsoft Word client (Graph)", () => {
  it("uses Bearer token and the canonical graph host", () => {
    const c = makeClient();
    expect((c as any).headers["Authorization"]).toBe("Bearer tok-1");
    expect((c as any).client.baseUrl).toBe("https://graph.microsoft.com/v1.0");
  });

  it("createWordDocument appends .docx, builds OOXML, PUTs to OneDrive content endpoint", async () => {
    const c = makeClient();
    let captured: { url: string; body: Uint8Array; headers: Record<string, string> } | undefined;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      captured = { url, body: opts.body, headers: opts.headers };
      return { ok: true, json: async () => ({ id: "doc-1", name: "My Doc.docx" }) };
    };
    const r = await c.createWordDocument("My Doc", ["Hello", "World"]);
    expect(captured!.url).toBe("https://graph.microsoft.com/v1.0/me/drive/root/children/My%20Doc.docx:/content");
    expect(captured!.headers["Content-Type"]).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const bodyText = new TextDecoder().decode(captured!.body);
    expect(bodyText).toContain("PK"); // zip magic
    expect(r.id).toBe("doc-1");
    delete (globalThis as any).fetch;
  });

  it("createWordDocument fails closed on empty name", async () => {
    const c = makeClient();
    await expect(c.createWordDocument("", ["x"])).rejects.toThrow(/requires a name/);
  });

  it("readWordDocumentText downloads content and extracts w:t text", async () => {
    const c = makeClient();
    const { buildMinimalDocx } = await import("../integrations/providers/microsoft-office/ooxml");
    const zip = buildMinimalDocx(["Round trip", "works"]);
    (globalThis as any).fetch = async (url: string, opts: any) => {
      expect(url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/doc-1/content");
      return new Response(zip);
    };
    const text = await c.readWordDocumentText("doc-1");
    expect(text).toContain("Round trip");
    expect(text).toContain("works");
    delete (globalThis as any).fetch;
  });

  it("listWordDocuments filters to .docx files", async () => {
    const c = makeClient();
    (c as any).client.get = async () => ({
      data: { value: [{ id: "1", name: "a.docx" }, { id: "2", name: "b.pdf" }, { id: "3", name: "c.DOCX" }] },
    });
    const items = await c.listWordDocuments();
    expect(items.map((i) => i.name)).toEqual(["a.docx", "c.DOCX"]);
  });

  it("readWordDocumentText fails closed on empty id", async () => {
    const c = makeClient();
    await expect(c.readWordDocumentText("")).rejects.toThrow(/requires an id/);
  });
});
