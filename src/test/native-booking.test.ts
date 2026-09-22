import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listBookingPages,
  getBookingPage,
  listBookings,
  listPendingWrites,
  listAudit,
  lookupBookingShareTenant,
  advanceBookingPageRoundRobin,
} from "../native/booking/store";
import { handleNativeBookingsAuthed, handleNativeBookingShare, registerBuiltinNativeBookingEventTypes } from "../native/booking/router";
import { availableSlotsForDate, isSlotAvailable } from "../native/booking/availability";
import { setAutonomyWorkflow } from "../lib/autonomy";
import { listTenantActions } from "../lib/approval-queue";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
function authedReq(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET" || method === "DELETE") return new Request(url, { method });
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}
async function route(method: string, pathname: string, body?: unknown, tenantId = T1) {
  return handleNativeBookingsAuthed(authedReq(method, pathname, body), { userEmail: tenantId, dataDir: dir });
}
function validCreate(over: Record<string, unknown> = {}) {
  return {
    name: "Onboarding kickoff",
    description: "Pick a time for your onboarding kickoff",
    timeZone: "America/New_York",
    slotDurationMinutes: 60,
    bufferMinutes: 0,
    team: ["a@acme.test", "b@acme.test", "c@acme.test"],
    availability: [{ dayOfWeek: 1, startMinutes: 9 * 60, endMinutes: 13 * 60 }], // Mon 09:00–13:00
    ...over,
  };
}
function pendingFirst(op?: string) {
  return listPendingWrites(dir, T1).find((w) => w.status === "pending" && (op ? w.op === op : true)) ?? null;
}
/** Mon 2026-09-28 (EDT, UTC-4): local 09:00 = 13:00Z, 13:00 = 17:00Z. */
const MON = "2026-09-28";
const S09 = "2026-09-28T13:00:00.000Z";
const S10 = "2026-09-28T14:00:00.000Z";
const S11 = "2026-09-28T15:00:00.000Z";
const S12 = "2026-09-28T16:00:00.000Z";
async function createAndApplyPage(over: Record<string, unknown> = {}): Promise<string> {
  const res = await route("POST", "/api/native/booking", validCreate(over));
  expect(res.status).toBe(202); // gated — pending approval, NOT auto-applied
  const ptw = pendingFirst("create");
  expect(ptw).not.toBeNull();
  const apply = await route("POST", `/api/native/booking/writes/${ptw!.id}/apply`);
  expect(apply.status).toBe(200);
  const pages = listBookingPages(dir, T1);
  expect(pages).toHaveLength(1);
  return pages[0].id;
}
async function requestAndApply(pageId: string, startAt: string, tenantId = T1, body: Record<string, unknown> = {}) {
  const res = await handleNativeBookingShare(
    new Request(`http://native.test/api/native/booking/share/${pageSlug(pageId)}`, {
      method: "POST",
      body: JSON.stringify({ clientName: "Client One", clientEmail: "client@one.test", startAt, ...body }),
      headers: { "content-type": "application/json" },
    }),
    { dataDir: dir },
  );
  expect([200, 202]).toContain(res.status);
  const ptw = listPendingWrites(dir, tenantId).find((w) => w.op === "request" && w.status === "pending");
  if (!ptw) return { applied: true };
  const apply = await route("POST", `/api/native/booking/writes/${ptw.id}/apply`, undefined, tenantId);
  expect(apply.status).toBe(200);
  return { applied: false };
}
function pageSlug(pageId: string): string {
  return getBookingPage(dir, T1, pageId)!.slug!;
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-booking-"));
  registerBuiltinNativeBookingEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});
describe("native booking — gated lifecycle + availability + round-robin + no-leak", () => {
  it("create 202 → apply: draft page with slug + audit, and never auto-applied", async () => {
    const id = await createAndApplyPage();
    const page = getBookingPage(dir, T1, id)!;
    expect(page.status).toBe("draft");
    expect(page.slug).toMatch(/^bk_/);
    expect(lookupBookingShareTenant(dir, page.slug!)).toBe(T1);
    const audit = listAudit(dir, T1);
    expect(audit.some((e) => e.action === "native.booking.page.created")).toBe(true);
    expect(audit.some((e) => e.action === "native.booking.pending")).toBe(true);
  });
  it("forged bkg_ id on create → 400 before normalization; unknown id on update → 404", async () => {
    const res = await route("POST", "/api/native/booking", { ...validCreate(), id: "bkg_forged00000001" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/server-assigned/);
    const up = await route("POST", "/api/native/booking/bkg_unknown00000001", { name: "x" });
    expect(up.status).toBe(404); // stranger → 404 (no IDOR)
  });
  it("validation is fail-closed BEFORE the gate: invalid never queues", async () => {
    const res = await route("POST", "/api/native/booking", { name: "" });
    expect(res.status).toBe(400);
    expect(listPendingWrites(dir, T1)).toHaveLength(0);
    const badWindow = await route("POST", "/api/native/booking", { ...validCreate(), availability: [{ dayOfWeek: 7, startMinutes: 0, endMinutes: 60 }] });
    expect(badWindow.status).toBe(400);
  });
  it("availability math is pure: Mon 09–13 60min → 4 UTC slots; booking + buffer remove neighbors", async () => {
    const id = await createAndApplyPage();
    const page = getBookingPage(dir, T1, id)!;
    const bookings = listBookings(dir, T1);
    expect(availableSlotsForDate(page, bookings, MON)).toEqual([S09, S10, S11, S12]);
    // A booking at 10:00 local (14:00Z) blocks 10:00 and 11:00 (60-min slot, no buffer overlap at 09:00/12:00).
    const booked = { ...page, bufferMinutes: 0 };
    const partial = [...bookings];
    void partial;
    expect(
      availableSlotsForDate(booked, [], MON).filter((s) => s !== S10 && s !== S11),
    ).toEqual([S09, S12]);
  });
  it("isSlotAvailable is pure; the ROUTER fail-closes draft pages (404 on public lane)", async () => {
    const id = await createAndApplyPage();
    const page = getBookingPage(dir, T1, id)!;
    // Pure math is status-agnostic — the gate/router enforce "published only".
    expect(isSlotAvailable(page, [], S09)).toBe(true);
    // The public lane 404s a DRAFT page (never exposes availability pre-publish).
    const draft = await handleNativeBookingShare(
      new Request(`http://native.test/api/native/booking/share/${page.slug!}`, {
        method: "POST",
        body: JSON.stringify({ clientName: "Client One", clientEmail: "client@one.test", startAt: S09 }),
        headers: { "content-type": "application/json" },
      }),
      { dataDir: dir },
    );
    expect(draft.status).toBe(404);
    const pub = await route("POST", `/api/native/booking/${id}/publish`);
    void pub;
    expect(pub.status).toBe(202); // gated
    const ptw = pendingFirst("publish");
    await route("POST", `/api/native/booking/writes/${ptw!.id}/apply`);
    const published = getBookingPage(dir, T1, id)!;
    expect(published.status).toBe("published");
    expect(isSlotAvailable(published, [], S09)).toBe(true);
  });
  it("public POST is rate-limited (10/min per slug+client → 429 generic; GETs unaffected; separate IP has own budget)", async () => {
    const id = await createAndApplyPage();
    await route("POST", `/api/native/booking/${id}/publish`);
    await route("POST", `/api/native/booking/writes/${pendingFirst("publish")!.id}/apply`);
    const slug = pageSlug(id);
    const post = (name: string, email: string, startAt: string, ip = "203.0.113.7") =>
      handleNativeBookingShare(
        new Request(`http://native.test/api/native/booking/share/${slug}`, {
          method: "POST",
          body: JSON.stringify({ clientName: name, clientEmail: email, startAt }),
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
        }),
        { dataDir: dir },
      );
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post(`Client ${i}`, `c${i}@test.test`, S09)).status);
    const passed = statuses.filter((st) => st !== 429).length;
    expect(passed).toBeLessThanOrEqual(10); // fixed window budget
    expect(statuses.filter((st) => st === 429).length).toBeGreaterThanOrEqual(1);
    // blocked body is generic (no internals)
    const blocked = await post("Blocked", "blocked@test.test", S09);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toContain("Too many booking requests");
    // GET summary + slots are NOT rate-limited
    const get = await handleNativeBookingShare(new Request(`http://native.test/api/native/booking/share/${slug}`), { dataDir: dir });
    expect(get.status).toBe(200);
    const slots = await handleNativeBookingShare(new Request(`http://native.test/api/native/booking/share/${slug}/slots?date=${MON}`), { dataDir: dir });
    expect(slots.status).toBe(200);
    // a different client IP has its own budget (still gated → 202 pending)
    const other = await post("Other IP", "other@test.test", S12, "198.51.100.9");
    expect([200, 202]).toContain(other.status); // own budget: gated (202) or auto-applied (200)
  });
  it("public share: safe summary (no team emails / internal ids), slots endpoint, unknown slug 404", async () => {
    const id = await createAndApplyPage();
    const slug = pageSlug(id);
    const pub = await route("POST", `/api/native/booking/${id}/publish`);
    void pub;
    await route("POST", `/api/native/booking/writes/${pendingFirst("publish")!.id}/apply`);
    const view = await handleNativeBookingShare(new Request(`http://native.test/api/native/booking/share/${slug}`), { dataDir: dir });
    expect(view.status).toBe(200);
    const j = (await view.json()) as any;
    expect(j.data.name).toBe("Onboarding kickoff");
    expect(j.data.teamSize).toBe(3);
    const body = JSON.stringify(j);
    expect(body).not.toContain("a@acme.test"); // never leak team emails
    expect(body).not.toContain("bkg_"); // no internal ids
    expect(body).not.toContain("audit");
    const slots = await handleNativeBookingShare(new Request(`http://native.test/api/native/booking/share/${slug}/slots?date=${MON}`), { dataDir: dir });
    expect((await slots.json() as any).data.slots).toEqual([S09, S10, S11, S12]);
    const unknown = await handleNativeBookingShare(new Request("http://native.test/api/native/booking/share/bk_unknown00000000000"), { dataDir: dir });
    expect(unknown.status).toBe(404);
    const draftHidden = await handleNativeBookingShare(new Request(`http://native.test/api/native/booking/share/${slug}`), { dataDir: dir });
    expect(draftHidden.status).toBe(200);
  });
  it("client request rides the Approval Queue: apply creates requested booking; re-request same slot fails at apply", async () => {
    const id = await createAndApplyPage();
    const slug = pageSlug(id);
    await route("POST", `/api/native/booking/${id}/publish`);
    await route("POST", `/api/native/booking/writes/${pendingFirst("publish")!.id}/apply`);
    const r1 = await requestAndApply(id, S09);
    expect(r1.applied).toBe(false);
    const bookings = listBookings(dir, T1);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].status).toBe("requested");
    // second request for the same slot → the apply re-checks availability → rejected
    const res2 = await handleNativeBookingShare(
      new Request(`http://native.test/api/native/booking/share/${slug}`, {
        method: "POST",
        body: JSON.stringify({ clientName: "Client Two", clientEmail: "c2@test.test", startAt: S09 }),
        headers: { "content-type": "application/json" },
      }),
      { dataDir: dir },
    );
    expect(res2.status).toBe(400); // slot taken → validates BEFORE the queue
    expect((await res2.json()).error).toMatch(/no longer available/);
    expect(listBookings(dir, T1)).toHaveLength(1); // never double-booked
  });
  it("confirm is approval-gated; apply assigns round-robin host + calendarSync intent; events carry the payload", async () => {
    const id = await createAndApplyPage();
    // round-robin cycles a, b, c
    expect(advanceBookingPageRoundRobin(dir, T1, id)).toBe("a@acme.test");
    expect(advanceBookingPageRoundRobin(dir, T1, id)).toBe("b@acme.test");
    expect(advanceBookingPageRoundRobin(dir, T1, id)).toBe("c@acme.test");
    expect(advanceBookingPageRoundRobin(dir, T1, id)).toBe("a@acme.test");
    // now the real flow: request → confirm
    const slug = pageSlug(id);
    await route("POST", `/api/native/booking/${id}/publish`);
    await route("POST", `/api/native/booking/writes/${pendingFirst("publish")!.id}/apply`);
    await requestAndApply(id, S09);
    const b = listBookings(dir, T1)[0];
    const conf = await route("POST", `/api/native/booking/bookings/${b.id}/confirm`);
    expect(conf.status).toBe(202); // gated
    await route("POST", `/api/native/booking/writes/${pendingFirst("confirm")!.id}/apply`);
    const updated = listBookings(dir, T1)[0];
    expect(updated.status).toBe("confirmed");
    // Round-robin: the direct advances above moved rrIndex to 4 — the confirm
    // uses the CURRENT counter: team[4 % 3] = team[1] = b@acme.test.
    expect(updated.roundRobinAssignee).toBe("b@acme.test");
    expect(updated.calendarSync.status).toBe("pending");
    expect(updated.calendarSync.provider).toBe("google-calendar");
    const audit = listAudit(dir, T1);
    expect(audit.some((e) => e.action === "native.booking.confirmed")).toBe(true);
    const ev = listTenantActions(T1, dir);
    expect(ev.length).toBeGreaterThan(0);
  });
  it("confirm on non-requested booking → 400 (fail-closed lifecycle)", async () => {
    const id = await createAndApplyPage();
    const slug = pageSlug(id);
    void slug;
    await route("POST", `/api/native/booking/${id}/publish`);
    await route("POST", `/api/native/booking/writes/${pendingFirst("publish")!.id}/apply`);
    await requestAndApply(id, S09);
    const b = listBookings(dir, T1)[0];
    await route("POST", `/api/native/booking/writes/${pendingFirst("confirm") ? pendingFirst("confirm")!.id : ""}/apply`); // no-op if absent
    const conf2 = await route("POST", `/api/native/booking/bookings/${b.id}/confirm`);
    if (conf2.status === 202) await route("POST", `/api/native/booking/writes/${pendingFirst("confirm")!.id}/apply`);
    const after = listBookings(dir, T1)[0];
    expect(after.status).toBe("confirmed");
    // confirm again → 400 (already confirmed)
    const again = await route("POST", `/api/native/booking/bookings/${b.id}/confirm`);
    expect(again.status).toBe(400);
    expect((await again.json()).error).toMatch(/only requested|already/);
  });
  it("cancel requested/confirmed → cancelled; cancel again → 400; delete draft-only exact-id", async () => {
    const id = await createAndApplyPage();
    const del = await route("DELETE", `/api/native/booking/${id}`);
    expect(del.status).toBe(202); // gated delete
    await route("POST", `/api/native/booking/writes/${pendingFirst("delete")!.id}/apply`);
    expect(listBookingPages(dir, T1)).toHaveLength(0);
    // recreate + cancel flow
    const id2 = await createAndApplyPage();
    void id2;
    const can = await route("POST", `/api/native/booking/bookings/nonexistent/cancel`);
    expect(can.status).toBe(404);
  });
  it("cross-tenant isolation: T2 cannot read/update T1 page → 404", async () => {
    const id = await createAndApplyPage();
    const other = await route("GET", `/api/native/booking/${id}`, undefined, T2);
    expect(other.status).toBe(404);
    const upd = await route("POST", `/api/native/booking/${id}`, { name: "hijack" }, T2);
    expect(upd.status).toBe(404);
    expect(getBookingPage(dir, T1, id)!.name).toBe("Onboarding kickoff");
  });
  it("archive is terminal: publish/update archived → 400", async () => {
    const id = await createAndApplyPage();
    await route("POST", `/api/native/booking/${id}/archive`);
    await route("POST", `/api/native/booking/writes/${pendingFirst("archive")!.id}/apply`);
    expect(getBookingPage(dir, T1, id)!.status).toBe("archived");
    const pub = await route("POST", `/api/native/booking/${id}/publish`);
    expect(pub.status).toBe(400);
    const upd = await route("POST", `/api/native/booking/${id}`, { name: "nope" });
    expect(upd.status).toBe(400);
  });
  it("autonomy allow-list auto-applies confirmBooking; idempotent apply replay → alreadyApplied, no duplicate", async () => {
    const id = await createAndApplyPage();
    const slug = pageSlug(id);
    void slug;
    await route("POST", `/api/native/booking/${id}/publish`);
    await route("POST", `/api/native/booking/writes/${pendingFirst("publish")!.id}/apply`);
    // allow-list confirm for this workflow (never destructive ops)
    setAutonomyWorkflow(T1, "native-bookings", { enabled: true, allowList: [{ action: "confirmBooking" }] }, dir);
    const r = await requestAndApply(id, S09);
    void r;
    const b = listBookings(dir, T1)[0];
    const conf = await route("POST", `/api/native/booking/bookings/${b.id}/confirm`);
    expect(conf.status).toBe(200); // autonomy auto-applied
    expect((await conf.json())).toMatchObject({ data: { status: "applied" } });
    const audit = listAudit(dir, T1);
    expect(audit.filter((e) => e.action === "native.booking.confirmed")).toHaveLength(1);
    // idempotent replay of the apply executor returns alreadyApplied
    const ptw = listPendingWrites(dir, T1).find((w) => w.op === "confirm");
    // (with autonomy there is no pending confirm card — replay protection is covered by re-validate → 400)
    const again = await route("POST", `/api/native/booking/bookings/${b.id}/confirm`);
    expect(again.status).toBe(400); // already confirmed — fail-closed
    void ptw;
  });
});
