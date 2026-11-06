/**
 * SLICE 192b-3 — the public write lanes cannot flood or destroy a store.
 *
 * Every test here was written from the DEFECT, not from the fix, and each was
 * watched failing against the code at `fad130f` before the change landed:
 *   (a) #10 a corrupt `tenant_approvals.json` must survive a public decision
 *           byte-for-byte, and the POST must not answer 200/202;
 *   (b) #9  two identical decisions make ONE card (positive control: two
 *           different decisions make two);
 *   (c) #9  the proposals decision POST is rate-limited, and the 429 names a
 *           wait;
 *   (d) #20 a spoofed `x-forwarded-for` does not reset the budget — the key is
 *           the trusted peer, and a different peer really does get its own;
 *   (e) #16 a past instant is refused by the server, not only hidden by the page.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  handleNativeProposalsAuthed,
  handleNativeProposalShare,
  registerBuiltinNativeProposalEventTypes,
} from "../native/proposals/router";
import { getProposal, listPendingWrites } from "../native/proposals/store";
import { listTenantActions, APPROVAL_QUEUE_KEY } from "../lib/approval-queue";
import { handleNativeBookingShare, registerBuiltinNativeBookingEventTypes } from "../native/booking/router";
import { insertBookingPage, registerBookingSlug, listPendingWrites as listBookingPendingWrites } from "../native/booking/store";
import { availableSlotsForDate, isSlotAvailable } from "../native/booking/availability";
import { createBookingPostLimiter } from "../native/booking/ratelimit";
import { PROPOSAL_POST_LIMIT, PROPOSAL_POST_WINDOW_MS } from "../native/proposals/ratelimit";
import type { BookingPageRecord } from "../native/booking/types";

const T1 = "tenant-a@acme.test";
let dir: string;

function jsonReq(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET") return new Request(url);
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function authed(method: string, pathname: string, body?: unknown): Promise<Response> {
  return handleNativeProposalsAuthed(jsonReq(method, pathname, body), { userEmail: T1, dataDir: dir });
}
function proposalShare(method: string, slug: string, body?: unknown, peer?: string | null): Promise<Response> {
  return handleNativeProposalShare(jsonReq(method, `/api/native/proposals/share/${slug}`, body), {
    dataDir: dir,
    peerAddress: peer,
  });
}
function pendingFirst(op: string) {
  return listPendingWrites(dir, T1).find((w) => w.status === "pending" && w.op === op) ?? null;
}
/** A proposal the client can actually open: create → apply → open → apply. */
async function shareableProposal(): Promise<{ id: string; slug: string }> {
  const created = await authed("POST", "/api/native/proposals", {
    title: "Acme Q3 Automation",
    clientName: "Pat Owner",
    clientEmail: "pat@acme.test",
    clientCompany: "Acme Corp",
    lineItems: [{ description: "Discovery workshop", qty: 2, unitPrice: 49.99 }],
    currency: "USD",
    terms: "Net 30",
    validityDays: 30,
  });
  expect(created.status).toBe(202);
  expect((await authed("POST", `/api/native/proposals/writes/${pendingFirst("create")!.id}/apply`)).status).toBe(200);
  const id = getProposal(dir, T1, (await listProposalId())!)!.id;
  expect((await authed("POST", `/api/native/proposals/${id}/open`)).status).toBe(202);
  expect((await authed("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`)).status).toBe(200);
  const slug = getProposal(dir, T1, id)!.shareSlug!;
  expect(slug).toMatch(/^sp_/);
  return { id, slug };
}
async function listProposalId(): Promise<string | null> {
  const res = await authed("GET", "/api/native/proposals");
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  const list = body.data ?? [];
  return list.length ? list[list.length - 1].id : null;
}

/** A published booking page, inserted directly so the test owns its clock. */
function publishedPage(): BookingPageRecord {
  const now = new Date().toISOString();
  const page: BookingPageRecord = {
    id: "bkg_192b3testpage01",
    tenantId: T1,
    name: "Onboarding kickoff",
    description: "Pick a time",
    slug: "bk_192b3testslug01",
    timeZone: "America/New_York",
    slotDurationMinutes: 60,
    bufferMinutes: 0,
    team: ["a@acme.test"],
    availability: [{ dayOfWeek: 1, startMinutes: 9 * 60, endMinutes: 13 * 60 }], // Mon 09:00–13:00
    rrIndex: 0,
    status: "published",
    version: 1,
    createdAt: now,
    createdBy: T1,
    updatedAt: now,
    updatedBy: T1,
  };
  insertBookingPage(dir, page);
  registerBookingSlug(dir, page.slug!, T1);
  return page;
}

function bookingPost(startAt: string, ctx: { peerAddress?: string | null; limiter?: ReturnType<typeof createBookingPostLimiter> }, spoofedFor?: string) {
  return handleNativeBookingShare(
    new Request(`http://native.test/api/native/booking/share/bk_192b3testslug01`, {
      method: "POST",
      body: JSON.stringify({ clientName: "Client One", clientEmail: "client@one.test", startAt }),
      headers: {
        "content-type": "application/json",
        ...(spoofedFor ? { "x-forwarded-for": spoofedFor } : {}),
      },
    }),
    { dataDir: dir, ...ctx },
  );
}

/** Mon 2027-01-04 (EST, UTC-5): 09:00 local = 14:00Z … 12:00 local = 17:00Z. */
const MON = "2027-01-04";
const S09 = "2027-01-04T14:00:00.000Z";
const S12 = "2027-01-04T17:00:00.000Z";
/** A Monday that is safely in the past relative to any run of this suite. */
const PAST_MON = "2026-09-28";
const PAST_S09 = "2026-09-28T13:00:00.000Z";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "slice-192b-3-"));
  registerBuiltinNativeProposalEventTypes();
  registerBuiltinNativeBookingEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("192b-3 #10 — a public POST cannot overwrite an unparseable approval store", () => {
  it("leaves a corrupt tenant_approvals.json byte-identical and answers 503, not 200", async () => {
    const { slug } = await shareableProposal();
    const path = join(dir, APPROVAL_QUEUE_KEY);
    // A file that EXISTS and does not parse — recoverable bytes, if nothing
    // overwrites them. This is the state 193 exists to protect.
    const corrupt = '{"tenant-a@acme.test":[{"actionId":"act-recoverable","tenantEmail":"tenant-a@acme.test"';
    writeFileSync(path, corrupt);
    const before = readFileSync(path);

    const res = await proposalShare("POST", slug, { decision: "approve", signerName: "Pat Owner" });

    // Not 200, not 202: the card was NOT queued and the client must not be told
    // it was.
    expect(res.status).toBe(503);
    expect([200, 202]).not.toContain(res.status);
    const body = (await res.json()) as { error?: string; reason?: string };
    expect(body.reason).toBe("approval-store-unavailable");
    // Nothing about our internals reaches an unauthenticated caller.
    expect(body.error).not.toContain(dir);
    expect(body.error).not.toContain("tenant_approvals.json");
    // THE POINT: the bytes on disk are exactly what they were.
    expect(readFileSync(path).equals(before)).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe(corrupt);
    // And nothing was mirrored as a pending write either.
    expect(listPendingWrites(dir, T1).filter((w) => w.op === "approve")).toHaveLength(0);
  });
});

describe("192b-3 #9 — one decision produces ONE approval card", () => {
  it("two identical decisions reuse one card; two different decisions make two", async () => {
    const { id, slug } = await shareableProposal();
    const cardsFor = (actionType: string) => listTenantActions(T1, dir).filter((a) => a.actionType === actionType);
    expect(cardsFor("approveProposal")).toHaveLength(0);

    const first = await proposalShare("POST", slug, { decision: "approve", signerName: "Pat Owner" });
    expect(first.status).toBe(202);
    const firstBody = (await first.json()) as { data?: { approvalActionId?: string } };
    const firstCard = cardsFor("approveProposal");
    expect(firstCard).toHaveLength(1);
    expect(firstBody.data?.approvalActionId).toBe(firstCard[0].actionId);

    const second = await proposalShare("POST", slug, { decision: "approve", signerName: "Pat Owner" });
    // Idempotent: same answer, same card, no second card, no second pending write.
    expect(second.status).toBe(202);
    const secondBody = (await second.json()) as { data?: { approvalActionId?: string } };
    expect(secondBody.data?.approvalActionId).toBe(firstCard[0].actionId);
    expect(cardsFor("approveProposal")).toHaveLength(1);
    expect(listPendingWrites(dir, T1).filter((w) => w.op === "approve" && w.status === "pending")).toHaveLength(1);
    expect(getProposal(dir, T1, id)!.status).toBe("pending"); // nothing applied

    // POSITIVE CONTROL: a DIFFERENT decision is a different intent, and must
    // still reach the queue as its own card.
    const other = await proposalShare("POST", slug, { decision: "reject" });
    expect(other.status).toBe(202);
    expect(cardsFor("rejectProposal")).toHaveLength(1);
    expect(cardsFor("approveProposal")).toHaveLength(1);
  });
});

describe("192b-3 #9 — the public decision POST is rate-limited", () => {
  it("answers 429 with a stated wait once the budget is spent", async () => {
    const { slug } = await shareableProposal();
    const statuses: number[] = [];
    for (let i = 0; i < PROPOSAL_POST_LIMIT + 2; i++) {
      statuses.push((await proposalShare("POST", slug, { decision: "approve" }, "203.0.113.5")).status);
    }
    const blocked = statuses.filter((s) => s === 429);
    expect(blocked.length).toBeGreaterThanOrEqual(1);
    expect(statuses.slice(0, PROPOSAL_POST_LIMIT).every((s) => s !== 429)).toBe(true);

    const res = await proposalShare("POST", slug, { decision: "approve" }, "203.0.113.5");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe(String(Math.ceil(PROPOSAL_POST_WINDOW_MS / 1000)));
    const body = (await res.json()) as { error?: string; retryAfterSeconds?: number };
    expect(body.error).toContain("Too many decisions");
    expect(body.error).toContain(String(Math.ceil(PROPOSAL_POST_WINDOW_MS / 1000)));
    expect(body.retryAfterSeconds).toBe(Math.ceil(PROPOSAL_POST_WINDOW_MS / 1000));
  });
});

describe("192b-3 #20 — the limiter keys on the trusted peer, not on a header", () => {
  it("a spoofed x-forwarded-for does not reset the budget, but a different PEER does", async () => {
    publishedPage();
    // One request per peer, so the SECOND request from the SAME peer must fail
    // whatever header it carries.
    const limiter = createBookingPostLimiter(1, 60_000);
    const ctx = { peerAddress: "203.0.113.7", limiter };

    const first = await bookingPost(S09, ctx, "198.51.100.1");
    expect(first.status).not.toBe(429);

    // Same socket peer, brand-new spoofed header: the old code counted a new
    // client here and let the flood through.
    const spoofed = await bookingPost(S12, ctx, "198.51.100.2");
    expect(spoofed.status).toBe(429);

    // POSITIVE CONTROL: a genuinely different peer has its own budget.
    const otherPeer = await bookingPost(S12, { peerAddress: "198.51.100.9", limiter }, "198.51.100.1");
    expect(otherPeer.status).not.toBe(429);
  });
});

describe("192b-3 #16 — a past instant is refused by the server", () => {
  it("isSlotAvailable refuses a past instant and still accepts a future one", () => {
    const page = publishedPage();
    // Both instants sit on a Monday 09:00–13:00 window, so only the CLOCK can
    // tell them apart — that is the property under test.
    expect(isSlotAvailable(page, [], PAST_S09)).toBe(false);
    expect(isSlotAvailable(page, [], S09)).toBe(true);
    // …and the slot LIST filters at source, so the page and the API agree.
    expect(availableSlotsForDate(page, [], PAST_MON)).toEqual([]);
    expect(availableSlotsForDate(page, [], MON)).toEqual([
      "2027-01-04T14:00:00.000Z",
      "2027-01-04T15:00:00.000Z",
      "2027-01-04T16:00:00.000Z",
      "2027-01-04T17:00:00.000Z",
    ]);
  });

  it("a booking request for a past instant is refused with its own status and sentence", async () => {
    publishedPage();
    const res = await bookingPost(PAST_S09, { peerAddress: "203.0.113.11" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("already passed");
    // A past request never reaches the queue.
    expect(listBookingPendingWrites(dir, T1).filter((w) => w.op === "request")).toHaveLength(0);
    // The same page still accepts a future instant.
    const ok = await bookingPost(S09, { peerAddress: "203.0.113.11" });
    expect([200, 202]).toContain(ok.status);
  });
});
