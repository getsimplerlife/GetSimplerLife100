import { describe, expect, it, vi, beforeEach } from "vitest";
import { googleAdapter } from "../verification/adapters/google";
import type { AdapterContext } from "../verification/adapters";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

/** Recorded Google API calls (method + url). */
const calls: Array<{ method: string; url: string; body?: any }> = [];

function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    credentials: { accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 },
    allowWrites: true,
    ...overrides,
  } as AdapterContext;
}

const contract = (capabilityId: string, providerId = "google-drive") =>
  ({ capabilityId, providerId } as never);

function installFetch(handler: (method: string, url: string, body?: any) => Response) {
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
    return handler(method, u, body);
  }) as unknown as typeof fetch;
}

function defaultRoutes(method: string, url: string) {
  // Drive
  if (method === "GET" && url.includes("/drive/v3/files") && url.includes("trashed")) return jsonResponse({ files: [{ id: "f1", name: "x", mimeType: "text/plain" }] });
  if (method === "GET" && url.includes("/drive/v3/files") && url.includes("modifiedTime")) return jsonResponse({ files: [] });
  if (method === "POST" && url.includes("/drive/v3/files") && !url.includes("copy")) return jsonResponse({ id: "created-1", name: "Phase7-VERIFY-x", mimeType: "application/vnd.google-apps.folder" });
  if (method === "DELETE" && url.includes("/drive/v3/files")) return jsonResponse({});
  if (method === "POST" && url.includes("upload/drive/v3/files")) return jsonResponse({ id: "up-1", name: "report.txt" });
  // Docs
  if (method === "GET" && url.includes("/documents/")) return jsonResponse({ documentId: "doc-1", body: { content: [{ startIndex: 1, endIndex: 9, paragraph: { elements: [{ textRun: { content: "Phase7 verification body" } }] } }] } });
  if (method === "POST" && url.includes("/documents/") && url.includes(":batchUpdate")) return jsonResponse({ replies: [] });
  // Sheets
  if (method === "POST" && url.includes("/spreadsheets") && !url.includes("values")) return jsonResponse({ spreadsheetId: "s-1", properties: { title: "x" } });
  if (method === "PUT" && url.includes("/values/")) return jsonResponse({ updatedRange: "Sheet1!A1:C2", updatedCells: 6 });
  if (method === "GET" && url.includes("/values/")) return jsonResponse({ values: [["a", "b"], ["c", "d"]] });
  // Slides
  if (method === "POST" && url.includes("/presentations") && !url.includes(":batchUpdate")) return jsonResponse({ presentationId: "p-1", title: "x" });
  if (method === "POST" && url.includes("/presentations/") && url.includes(":batchUpdate")) return jsonResponse({ replies: [] });
  if (method === "GET" && url.includes("/presentations/")) return jsonResponse({ presentationId: "p-1", slides: [] });
  // Calendar
  if (method === "GET" && url.includes("/calendar/v3/users/me/calendarList")) return jsonResponse({ items: [{ id: "cal-1", summary: "Work", primary: true }] });
  if (method === "GET" && url.includes("/calendars/") && url.includes("/events?")) return jsonResponse({ items: [{ id: "ev-1", summary: "Standup", start: { dateTime: "2026-08-13T09:00:00Z" } }] });
  if (method === "GET" && url.includes("/calendars/") && url.includes("/events/")) return jsonResponse({ id: "ev-created", summary: "Phase7-VERIFY-x calendar event", status: "confirmed" });
  if (method === "POST" && url.includes("/calendars/") && url.includes("/events")) return jsonResponse({ id: "ev-created", summary: "Phase7-VERIFY-x calendar event", status: "confirmed" });
  return jsonResponse({});
}

describe("Google verification adapter (real clients, mocked transport)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch(defaultRoutes);
  });

  it("google-drive-read-files lists files (pure read)", async () => {
    const r = await googleAdapter(contract("google-drive-read-files"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).count).toBe(1);
    expect(calls.some((c) => c.url.includes("/drive/v3/files"))).toBe(true);
  });

  it("google-drive-monitor-folder-changes polls changes since timestamp", async () => {
    const r = await googleAdapter(contract("google-drive-monitor-folder-changes"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).since).toBeTruthy();
  });

  it("google-drive-write-files requires allowWrites (fail closed)", async () => {
    await expect(googleAdapter(contract("google-drive-write-files"), ctx({ allowWrites: false }))).rejects.toThrow("--writes");
  });

  it("google-drive-write-files creates a labeled folder and leaves it in place (non-destructive, owner directive)", async () => {
    const r = await googleAdapter(contract("google-drive-write-files"), ctx());
    expect((r.response as any).kept).toBe(true);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(calls.some((c) => c.url.includes("trashed"))).toBe(false);
  });

  it("google-docs-read-content with --writes creates, reads, and leaves the labeled doc in place", async () => {
    const r = await googleAdapter(contract("google-docs-read-content", "google-docs"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).chars).toBeGreaterThan(0);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("google-docs-read-content without docId and without --writes fails closed", async () => {
    await expect(
      googleAdapter(contract("google-docs-read-content", "google-docs"), ctx({ allowWrites: false })),
    ).rejects.toThrow("docId in credentials or --writes");
  });

  it("google-docs-create-from-template creates and reads back a doc", async () => {
    const r = await googleAdapter(contract("google-docs-create-from-template", "google-docs"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).chars).toBeGreaterThan(0);
  });

  it("google-sheets-read-ranges with --writes creates, writes, reads, leaves in place", async () => {
    const r = await googleAdapter(contract("google-sheets-read-ranges", "google-sheets"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).rows).toBeGreaterThan(0);
  });

  it("google-sheets-write-values writes and reads back", async () => {
    const r = await googleAdapter(contract("google-sheets-write-values", "google-sheets"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).rowsReadBack).toBe(2);
  });

  it("google-slides-read-presentation with --writes creates, reads, leaves in place", async () => {
    const r = await googleAdapter(contract("google-slides-read-presentation", "google-slides"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).slideCount).toBe(0);
  });

  it("google-slides-create-presentation creates and leaves in place", async () => {
    const r = await googleAdapter(contract("google-slides-create-presentation", "google-slides"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).slides).toBe(1);
  });

  it("google-calendar-list-calendars lists the tenant's calendars (pure read)", async () => {
    const r = await googleAdapter(contract("google-calendar-list-calendars", "google-calendar"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).count).toBe(1);
    expect(calls.some((c) => c.url.includes("/calendar/v3/users/me/calendarList"))).toBe(true);
  });

  it("google-calendar-list-events lists events with a time window", async () => {
    const r = await googleAdapter(contract("google-calendar-list-events", "google-calendar"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).count).toBe(1);
    expect(calls.some((c) => c.url.includes("/calendars/primary/events"))).toBe(true);
  });

  it("google-calendar-create-event requires allowWrites (fail closed)", async () => {
    await expect(googleAdapter(contract("google-calendar-create-event", "google-calendar"), ctx({ allowWrites: false }))).rejects.toThrow("--writes");
  });

  it("google-calendar-create-event creates a labeled event and leaves it in place (non-destructive, owner directive)", async () => {
    const r = await googleAdapter(contract("google-calendar-create-event", "google-calendar"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).kept).toBe(true);
    expect((r.response as any).eventId).toBe("ev-created");
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("unknown capability ids fail closed without network calls", async () => {
    await expect(googleAdapter(contract("google-made-up-capability"), ctx())).rejects.toThrow("no verification path");
    expect(calls.length).toBe(0);
  });

  it("missing access token fails closed before any network call", async () => {
    await expect(googleAdapter(contract("google-drive-read-files"), ctx({ credentials: { refreshToken: "rt" } as never }))).rejects.toThrow("no accessToken");
    expect(calls.length).toBe(0);
  });
});
