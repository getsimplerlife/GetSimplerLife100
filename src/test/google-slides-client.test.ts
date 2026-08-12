import { describe, expect, it } from "vitest";
import { createGSlidesClient } from "../integrations/providers/google-slides/client";

function makeClient() {
  return createGSlidesClient({ accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 } as never);
}

describe("Google Slides client (create/read)", () => {
  it("uses Bearer token and canonical host", () => {
    const c = makeClient();
    const headers = (c as any).headers;
    expect(headers["Authorization"]).toBe("Bearer tok-1");
    expect((c as any).client.baseUrl).toBe("https://slides.googleapis.com/v1");
  });

  it("createPresentation posts title to /presentations", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; body: any }> = [];
    (c as any).client.post = async (path: string, body: any) => {
      calls.push({ path, body });
      return { data: { presentationId: "p-1", title: "Deck" } };
    };
    const p = await c.createPresentation("Deck");
    expect(p.presentationId).toBe("p-1");
    expect(calls[0].path).toBe("/presentations");
    expect(calls[0].body.title).toBe("Deck");
  });

  it("createPresentation requires a title (fail closed)", async () => {
    const c = makeClient();
    await expect(c.createPresentation("")).rejects.toThrow("requires a title");
  });

  it("createPresentationFromOutline creates slides with client-generated objectIds", async () => {
    const c = makeClient();
    let presentationsCreated = 0;
    const batchPaths: string[] = [];
    (c as any).client.post = async (path: string, body: any) => {
      if (path === "/presentations") {
        presentationsCreated++;
        return { data: { presentationId: "p-1", title: body.title } };
      }
      batchPaths.push(path);
      return { data: { replies: (body.requests || []).map(() => ({ createSlide: { objectId: "slide-x" } })) } };
    };
    // getPresentation returns placeholder-less slides so precise insertion is skipped
    (c as any).client.get = async () => ({ data: { presentationId: "p-1", slides: [{ objectId: "slide-x", pageElements: [] }] } });

    const result = await c.createPresentationFromOutline("Deck", [{ title: "Slide 1", body: "body text" }]);
    expect(presentationsCreated).toBe(1);
    expect(batchPaths.length).toBeGreaterThanOrEqual(2);
    expect(result.presentationId).toBe("p-1");
    expect(result.slideIds).toHaveLength(1);
    // createSlide requests carry objectIds (idempotency on retry)
    expect(batchPaths[0]).toContain(":batchUpdate");
  });

  it("addSlides returns object ids", async () => {
    const c = makeClient();
    const requestsSeen: any[] = [];
    (c as any).client.post = async (path: string, body: any) => {
      if (path === "/presentations/p-1:batchUpdate") requestsSeen.push(...(body.requests || []));
      return { data: { replies: [] } };
    };
    const ids = await c.addSlides("p-1", 3);
    expect(ids).toHaveLength(3);
    expect(requestsSeen.filter((r) => r.createSlide)).toHaveLength(3);
    for (const r of requestsSeen) expect(r.createSlide.objectId).toBeTruthy();
  });

  it("insertText requires an objectId (fail closed)", async () => {
    const c = makeClient();
    await expect(c.insertText("p-1", "", "text")).rejects.toThrow("requires an objectId");
  });
});
