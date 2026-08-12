import { describe, expect, it } from "vitest";
import { createGCalendarClient } from "../integrations/providers/google-calendar/client";

function makeClient() {
  return createGCalendarClient({ accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 } as never);
}

describe("Google Calendar client (list calendars, list events, create event)", () => {
  it("uses Bearer token and canonical host (no guessed URLs)", () => {
    const c = makeClient();
    const headers = (c as any).headers;
    expect(headers["Authorization"]).toBe("Bearer tok-1");
    expect((c as any).http.baseUrl).toBe("https://www.googleapis.com/calendar/v3");
  });

  it("listCalendars GETs /users/me/calendarList and returns items", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; headers: any }> = [];
    (c as any).http.get = async (path: string, headers: any) => {
      calls.push({ path, headers });
      return { data: { items: [{ id: "cal-1", summary: "Work", primary: true }] } };
    };
    const items = await c.listCalendars(10);
    expect(items).toHaveLength(1);
    expect(calls[0].path).toContain("/users/me/calendarList");
    expect(calls[0].path).toContain("maxResults=10");
    expect(calls[0].headers["Authorization"]).toBe("Bearer tok-1");
  });

  it("listEvents builds events.list query (singleEvents, orderBy startTime, timeMin)", async () => {
    const c = makeClient();
    const calls: Array<{ path: string }> = [];
    (c as any).http.get = async (path: string) => {
      calls.push({ path });
      return { data: { items: [{ id: "ev-1", summary: "Standup", start: { dateTime: "2026-08-13T09:00:00Z" } }] } };
    };
    const events = await c.listEvents("primary", "2026-08-01T00:00:00Z", undefined, 5);
    expect(events).toHaveLength(1);
    expect(calls[0].path).toContain("/calendars/primary/events");
    expect(calls[0].path).toContain("singleEvents=true");
    expect(calls[0].path).toContain("orderBy=startTime");
    expect(calls[0].path).toContain("timeMin=2026-08-01T00%3A00%3A00Z");
    expect(calls[0].path).toContain("maxResults=5");
  });

  it("createEvent POSTs to /calendars/primary/events with Authorization header and event body", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; body: any; headers: any }> = [];
    (c as any).http.post = async (path: string, body: any, headers: any) => {
      calls.push({ path, body, headers });
      return { data: { id: "ev-9", summary: "Phase7-VERIFY-x", start: { dateTime: "2026-08-13T09:00:00Z" } } };
    };
    const ev = await c.createEvent({
      summary: "Phase7-VERIFY-x",
      start: "2026-08-13T09:00:00Z",
      end: "2026-08-13T10:00:00Z",
      description: "verification",
    });
    expect(ev.id).toBe("ev-9");
    expect(calls[0].path).toBe("/calendars/primary/events");
    expect(calls[0].headers["Authorization"]).toBe("Bearer tok-1");
    expect(calls[0].body.summary).toBe("Phase7-VERIFY-x");
    expect(calls[0].body.start.dateTime).toBe("2026-08-13T09:00:00Z");
    expect(calls[0].body.end.dateTime).toBe("2026-08-13T10:00:00Z");
    expect(calls[0].body.description).toBe("verification");
  });

  it("createEvent uses the given calendarId when provided", async () => {
    const c = makeClient();
    let path = "";
    (c as any).http.post = async (p: string) => {
      path = p;
      return { data: { id: "ev-1" } };
    };
    await c.createEvent({ summary: "s", start: "2026-08-13T09:00:00Z", end: "2026-08-13T10:00:00Z", calendarId: "secondary@group.calendar.google.com" });
    expect(path).toContain("/calendars/secondary%40group.calendar.google.com/events");
  });

  it("getEvent fails closed without an event id (no network call)", async () => {
    const c = makeClient();
    let called = false;
    (c as any).http.get = async () => {
      called = true;
      return { data: {} };
    };
    await expect(c.getEvent("primary", "")).rejects.toThrow("event id");
    expect(called).toBe(false);
  });

  it("createEvent fails closed without summary, start or end (no network call)", async () => {
    const c = makeClient();
    let called = false;
    (c as any).http.post = async () => {
      called = true;
      return { data: {} };
    };
    await expect(c.createEvent({ summary: " ", start: "2026-08-13T09:00:00Z", end: "2026-08-13T10:00:00Z" } as never)).rejects.toThrow("summary");
    await expect(c.createEvent({ summary: "x", end: "2026-08-13T10:00:00Z" } as never)).rejects.toThrow("start and end");
    expect(called).toBe(false);
  });

  it("healthCheck hits calendarList and reports token validity", async () => {
    const c = makeClient();
    (c as any).http.get = async () => ({ ok: true });
    expect(await c.healthCheck()).toBe(true);
    (c as any).http.get = async () => {
      throw new Error("401");
    };
    expect(await c.healthCheck()).toBe(false);
  });
});
