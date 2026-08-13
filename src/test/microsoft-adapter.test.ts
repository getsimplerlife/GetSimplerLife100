import { describe, expect, it, vi, beforeEach } from "vitest";
import { microsoftAdapter } from "../verification/adapters/microsoft";
import type { AdapterContext } from "../verification/adapters";
import { buildMinimalDocx, buildMinimalPptx } from "../integrations/providers/microsoft-office/ooxml";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

const calls: Array<{ method: string; url: string; body?: any }> = [];

function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    credentials: { accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 },
    allowWrites: true,
    ...overrides,
  } as AdapterContext;
}

const contract = (capabilityId: string, providerId = "onedrive") => ({ capabilityId, providerId } as never);

function installFetch(handler: (method: string, url: string, body?: any, headers?: Record<string, string>) => Response) {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    const method = (init?.method || "GET") as string;
    let body: any;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = String(init.body);
      }
    }
    calls.push({ method, url: u, body });
    return handler(method, u, body, (init?.headers as Record<string, string>) || {});
  }) as unknown as typeof fetch;
}

// Track what kind of artifact the last PUT created so content downloads serve
// the matching real binary (docx/pptx/text) for read-back.
let createdKind: "docx" | "pptx" | "text" = "text";

function defaultRoutes(method: string, url: string, body?: any, headers: Record<string, string> = {}) {
  // OneDrive listing / delta
  if (method === "GET" && url.endsWith("/me/drive/root/children")) return jsonResponse({ value: [{ id: "f1", name: "x.txt" }] });
  if (method === "GET" && url.includes("/me/drive/root/delta")) return jsonResponse({ value: [{ id: "change-1" }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc" });
  // Uploads (text file, docx, xlsx, pptx) → remember the kind, return an item id.
  if (method === "PUT" && url.includes(":/content")) {
    const ct = headers["Content-Type"] || headers["content-type"] || "";
    if (ct.includes("wordprocessingml")) createdKind = "docx";
    else if (ct.includes("presentationml")) createdKind = "pptx";
    else createdKind = "text";
    return jsonResponse({ id: "created-1", name: "x" });
  }
  // Excel workbook API (must precede the generic items route — range URLs contain /items/)
  // The excel client reads/writes the RANGE OBJECT (Graph's /values navigation is
  // unreliable on some accounts — verified live 2026-08-13), so respond with the
  // Graph range-object shape { values: [...] } for both GET and PATCH.
  if (url.includes("/workbook/worksheets/")) {
    if (method === "GET") return jsonResponse({ values: [["Phase7", "verify"], ["a", "b"]] });
    if (method === "PATCH") return jsonResponse({ values: [["Phase7", "verify"]] });
  }
  // Content download — serve the real binary for the created artifact kind.
  if (method === "GET" && url.includes("/content")) {
    if (createdKind === "docx") return new Response(buildMinimalDocx(["Phase7", "verification", "write"])) as unknown as Response;
    if (createdKind === "pptx") return new Response(buildMinimalPptx([{ title: "Phase7", body: "verification" }, { title: "Slide two", body: "payload" }])) as unknown as Response;
    return new Response(new TextEncoder().encode("Phase7 payload")) as unknown as Response;
  }
  if (method === "GET" && url.includes("/items/")) return jsonResponse({ id: "f1", name: "x.txt" });
  if (method === "POST" && url.includes("/copy")) return { ok: true, status: 202, headers: new Headers({ location: "https://graph.microsoft.com/v1.0/me/drive/items/job1" }), json: async () => ({}), text: async () => "" } as unknown as Response;
  if (method === "DELETE" && url.includes("/items/")) return { ok: true, status: 204, headers: new Headers(), json: async () => ({}), text: async () => "" } as unknown as Response;
  if (method === "POST" && url.includes("/children")) return jsonResponse({ id: "folder-1", name: "x" });
  return jsonResponse({});
}

describe("Microsoft verification adapter (real clients, mocked transport)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch(defaultRoutes);
  });

  it("onedrive-read-files lists the drive root", async () => {
    const r = await microsoftAdapter(contract("onedrive-read-files"), ctx());
    expect(r.response).toMatchObject({ items: 1 });
  });

  it("onedrive-monitor-changes polls delta and surfaces a cursor", async () => {
    const r = await microsoftAdapter(contract("onedrive-monitor-changes"), ctx());
    expect(r.response).toMatchObject({ changes: 1, deltaCursorAvailable: true });
  });

  it("onedrive-write-files uploads a labeled file and leaves it in place (non-destructive, owner directive)", async () => {
    const r = await microsoftAdapter(contract("onedrive-write-files"), ctx());
    expect((r.response as any).kept).toBe(true);
    expect((r.response as any).bytes).toBe(14); // "Phase7 payload" = 14 bytes
    const methods = calls.map((c) => c.method);
    expect(methods).toContain("PUT");
    expect(methods).not.toContain("DELETE");
  });

  it("onedrive-write-files fails closed without --writes", async () => {
    await expect(microsoftAdapter(contract("onedrive-write-files"), ctx({ allowWrites: false }))).rejects.toThrow(/requires --writes/);
  });

  it("microsoft-word-read-content creates+reads+keeps a labeled doc without a fileId", async () => {
    const r = await microsoftAdapter(contract("microsoft-word-read-content", "microsoft-word"), ctx());
    expect(r.response).toMatchObject({ fileId: "created-1", kept: true });
    expect((r.response as any).chars).toBeGreaterThan(0);
    expect(calls.map((c) => c.method)).not.toContain("DELETE");
  });

  it("microsoft-word-read-content uses a provided fileId without writes", async () => {
    const r = await microsoftAdapter(
      contract("microsoft-word-read-content", "microsoft-word"),
      ctx({ credentials: { accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600, fileId: "existing-1" }, allowWrites: false }),
    );
    expect(r.response).toMatchObject({ fileId: "existing-1" });
    expect(calls.map((c) => c.method)).not.toContain("DELETE");
  });

  it("microsoft-word-read-content fails closed with no fileId and no --writes", async () => {
    await expect(microsoftAdapter(contract("microsoft-word-read-content", "microsoft-word"), ctx({ allowWrites: false }))).rejects.toThrow(/requires a fileId/);
  });

  it("microsoft-word-create-document writes and round-trips text, leaves it in place", async () => {
    const r = await microsoftAdapter(contract("microsoft-word-create-document", "microsoft-word"), ctx());
    expect((r.response as any).roundTrip).toBe(true);
    expect((r.response as any).kept).toBe(true);
    expect(calls.map((c) => c.method)).toContain("PUT");
    expect(calls.map((c) => c.method)).not.toContain("DELETE");
  });

  it("microsoft-excel-read-ranges reads via the workbook API", async () => {
    const r = await microsoftAdapter(contract("microsoft-excel-read-ranges", "microsoft-excel"), ctx());
    expect(r.response).toMatchObject({ fileId: "created-1", rows: 2, kept: true });
    expect(calls.some((c) => c.url.includes("/workbook/worksheets/"))).toBe(true);
    expect(calls.map((c) => c.method)).not.toContain("DELETE");
  });

  it("microsoft-excel-write-values creates, writes a range, reads back, keeps", async () => {
    const r = await microsoftAdapter(contract("microsoft-excel-write-values", "microsoft-excel"), ctx());
    expect((r.response as any).cells).toBeGreaterThan(0);
    expect((r.response as any).kept).toBe(true);
    const methods = calls.map((c) => c.method);
    expect(methods).toContain("PATCH");
    expect(methods).not.toContain("DELETE");
  });

  it("microsoft-powerpoint-read-presentation uses a provided fileId", async () => {
    const r = await microsoftAdapter(
      contract("microsoft-powerpoint-read-presentation", "microsoft-powerpoint"),
      ctx({ credentials: { accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600, powerpointId: "deck-9" }, allowWrites: false }),
    );
    expect(r.response).toMatchObject({ fileId: "deck-9" });
  });

  it("microsoft-powerpoint-read-presentation with --writes creates+reads+keeps a labeled deck", async () => {
    const r = await microsoftAdapter(contract("microsoft-powerpoint-read-presentation", "microsoft-powerpoint"), ctx());
    expect(r.response).toMatchObject({ fileId: "created-1", kept: true });
    expect((r.response as any).chars).toBeGreaterThan(0);
    expect(calls.map((c) => c.method)).not.toContain("DELETE");
  });

  it("microsoft-powerpoint-create-presentation creates, reads back, keeps", async () => {
    const r = await microsoftAdapter(contract("microsoft-powerpoint-create-presentation", "microsoft-powerpoint"), ctx());
    expect((r.response as any).chars).toBeGreaterThan(0);
    expect((r.response as any).kept).toBe(true);
    expect(calls.map((c) => c.method)).not.toContain("DELETE");
  });

  it("fails closed on missing accessToken before any network call", async () => {
    calls.length = 0;
    await expect(microsoftAdapter(contract("onedrive-read-files"), ctx({ credentials: { refreshToken: "rt" } as never }))).rejects.toThrow(/no accessToken/);
    expect(calls.length).toBe(0);
  });

  it("fails closed on unknown capability ids", async () => {
    await expect(microsoftAdapter(contract("microsoft-word-hypothetical"), ctx())).rejects.toThrow(/no verification path/);
  });
});
