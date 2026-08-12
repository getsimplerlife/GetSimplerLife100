import { describe, expect, it } from "vitest";
import { createPowerPointClient } from "../integrations/providers/microsoft-powerpoint/client";

function makeClient() {
  return createPowerPointClient({ accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 } as never);
}

describe("Microsoft PowerPoint client (Graph)", () => {
  it("uses Bearer token and the canonical graph host", () => {
    const c = makeClient();
    expect((c as any).headers["Authorization"]).toBe("Bearer tok-1");
    expect((c as any).client.baseUrl).toBe("https://graph.microsoft.com/v1.0");
  });

  it("createPresentation builds a valid pptx and PUTs to OneDrive", async () => {
    const c = makeClient();
    let captured: { url: string; body: Uint8Array; headers: Record<string, string> } | undefined;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      captured = { url, body: opts.body, headers: opts.headers };
      return { ok: true, json: async () => ({ id: "deck-1", name: "Deck.pptx" }) };
    };
    const r = await c.createPresentation("Deck", [{ title: "Slide 1", body: "body" }]);
    expect(captured!.url).toBe("https://graph.microsoft.com/v1.0/me/drive/root/children/Deck.pptx:/content");
    expect(captured!.headers["Content-Type"]).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    const bodyText = new TextDecoder().decode(captured!.body);
    expect(bodyText).toContain("PK");
    expect(bodyText).toContain("slideMasters");
    expect(r.id).toBe("deck-1");
    delete (globalThis as any).fetch;
  });

  it("createPresentation fails closed on empty name or empty slides", async () => {
    const c = makeClient();
    await expect(c.createPresentation("", [{ title: "x" }])).rejects.toThrow(/requires a name/);
    await expect(c.createPresentation("Deck", [])).rejects.toThrow(/at least one slide/);
  });

  it("readPresentationText extracts a:t runs from every slide", async () => {
    const c = makeClient();
    const { buildMinimalPptx } = await import("../integrations/providers/microsoft-office/ooxml");
    const zip = buildMinimalPptx([
      { title: "Title A", body: "Body A" },
      { title: "Title B" },
    ]);
    (globalThis as any).fetch = async (url: string, opts: any) => {
      expect(url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/deck-1/content");
      return new Response(zip);
    };
    const text = await c.readPresentationText("deck-1");
    expect(text).toContain("Title A");
    expect(text).toContain("Body A");
    expect(text).toContain("Title B");
    delete (globalThis as any).fetch;
  });

  it("listPresentations filters to .pptx files", async () => {
    const c = makeClient();
    (c as any).client.get = async () => ({
      data: { value: [{ id: "1", name: "a.pptx" }, { id: "2", name: "b.pptx" }, { id: "3", name: "c.doc" }] },
    });
    const items = await c.listPresentations();
    expect(items.map((i) => i.name)).toEqual(["a.pptx", "b.pptx"]);
  });

  it("readPresentationText fails closed on empty id", async () => {
    const c = makeClient();
    await expect(c.readPresentationText("")).rejects.toThrow(/requires an id/);
  });
});
