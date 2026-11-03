/**
 * slice-192a-dealroom-publish.test.tsx — the deal-room share link gets a
 * publish rule.
 *
 * THE THREE DEFECTS (read at source before the fix):
 *   1. `src/native/dealroom/gate.ts` minted and REGISTERED the share slug in the
 *      `create` branch, so a room nobody had published resolved from `draft`;
 *   2. `src/native/dealroom/router.ts` `publicShareView` mapped every linked
 *      invoice with no status filter, so a DRAFT invoice's number, currency and
 *      amount reached the client — the exact state the invoice share lane
 *      (`PUBLIC_INVOICE_STATUS`) refuses to serve;
 *   3. `DealRoomOp` had no revoke, and archiving never stopped the slug
 *      resolving, so a finished room stayed readable forever.
 *
 * Every assertion here reads a value the code supplies (the server's own status
 * codes, the invoice module's own predicate, the route's own head()) rather than
 * re-typing a copy of the rule.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import DealRoomSharePage from "../lazy/deal-rooms.share.$slug.page";
import { Route as DealRoomShareRoute } from "../routes/deal-rooms.share.$slug";
import {
  handleNativeDealRoomsAuthed,
  handleNativeDealRoomShare,
  registerBuiltinNativeDealRoomEventTypes,
} from "../native/dealroom/router";
import { getDealRoom, listDealRooms, listPendingWrites } from "../native/dealroom/store";
import { isDealRoomPubliclyShareable } from "../native/dealroom/types";
import { insertInvoice } from "../native/invoice/store";
import { isInvoicePubliclyShareable } from "../native/invoice/router";
import type { InvoiceRecord } from "../native/invoice/types";
import { insertProposal } from "../native/proposals/store";
import { insertChecklist } from "../native/checklists/store";

const T1 = "tenant-a@acme.test";
let dir: string;

// ── the page's router surface ───────────────────────────────────────────────
let currentSlug = "dr_s192a";

// Partial mock: the real module is kept (the route file needs `createFileRoute`
// at import time), only the two hooks a bare render would need are replaced.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
    useParams: () => ({ slug: currentSlug }),
  };
});

interface StubRoute {
  path?: string;
  status?: number;
  body: unknown;
}
function stubFetch(routes: StubRoute[]) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const path = url.split("?")[0] ?? "";
    const route = routes.find((r) => r.path === undefined || path.endsWith(r.path));
    const status = route ? (route.status ?? 200) : 404;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => (route ? route.body : { error: "not mocked" }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

// ── HTTP helpers (the tenant's own lane) ────────────────────────────────────
function authedReq(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET" || method === "DELETE") return new Request(url, { method });
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
async function route(method: string, pathname: string, body?: unknown) {
  return handleNativeDealRoomsAuthed(authedReq(method, pathname, body), { userEmail: T1, dataDir: dir });
}
function pendingFirst(op: string) {
  return listPendingWrites(dir, T1).find((w) => w.status === "pending" && w.op === op) ?? null;
}
function seedRefs() {
  const now = new Date().toISOString();
  insertProposal(dir, {
    id: "prop_seedproposal0001",
    tenantId: T1,
    title: "Onboarding retainer",
    clientName: "Acme Corp",
    clientEmail: "ops@acme.test",
    clientCompany: "Acme Corp",
    lineItems: [{ id: "li_x", description: "Setup", qty: 1, unitPrice: 5000 }],
    currency: "USD",
    terms: "",
    validityDays: 30,
    status: "approved",
    shareSlug: null,
    docId: null,
    version: 1,
    createdAt: now,
    createdBy: T1,
    updatedAt: now,
    updatedBy: T1,
    signatures: [],
  });
  insertChecklist(dir, {
    id: "chk_seedchecklist0001",
    tenantId: T1,
    name: "Delivery checklist",
    description: "",
    kind: "delivery",
    linkedProposalId: "prop_seedproposal0001",
    items: [{ id: "cli_a", title: "Kickoff", status: "todo" }],
    status: "open",
    progress: { done: 0, total: 1 },
    version: 1,
    createdAt: now,
    createdBy: T1,
    updatedAt: now,
    updatedBy: T1,
  });
}
/** Create a deal room through the gate and return its id (always starts `draft`). */
async function createRoom(name = "Acme onboarding deal"): Promise<string> {
  const created = await route("POST", "/api/native/dealroom", {
    name,
    customerName: "Acme Corp",
    customerEmail: "ops@acme.test",
    description: "Post-sale onboarding room",
    linkedProposalId: "prop_seedproposal0001",
    linkedChecklistId: "chk_seedchecklist0001",
  });
  expect(created.status).toBe(202);
  const applied = await route("POST", `/api/native/dealroom/writes/${pendingFirst("create")!.id}/apply`);
  expect(applied.status).toBe(200);
  const rooms = listDealRooms(dir, T1);
  return rooms[rooms.length - 1].id;
}
/** Move a room draft → active through the gate (the "publish" the tenant does). */
async function activate(id: string) {
  const res = await route("POST", `/api/native/dealroom/${id}`, { status: "active" });
  expect(res.status).toBe(202);
  expect((await route("POST", `/api/native/dealroom/writes/${pendingFirst("update")!.id}/apply`)).status).toBe(200);
  expect(getDealRoom(dir, T1, id)!.status).toBe("active");
}
async function archive(id: string) {
  expect((await route("POST", `/api/native/dealroom/${id}/archive`)).status).toBe(202);
  expect((await route("POST", `/api/native/dealroom/writes/${pendingFirst("archive")!.id}/apply`)).status).toBe(200);
  expect(getDealRoom(dir, T1, id)!.status).toBe("archived");
}
function shareGet(slug: string) {
  return handleNativeDealRoomShare(
    new Request(`http://native.test/api/native/dealroom/share/${slug}`, { method: "GET" }),
    { dataDir: dir },
  );
}
function seedInvoice(over: Partial<InvoiceRecord> & { id: string; invoiceNumber: string }): InvoiceRecord {
  const now = new Date().toISOString();
  const rec: InvoiceRecord = {
    tenantId: T1,
    linkedDealRoomId: "",
    currency: "USD",
    lineItems: [{ id: "li_s192a", description: "Setup", qty: 1, unitPriceCents: 500000 }],
    amountDueCents: 500000,
    status: "draft",
    docId: null,
    customerEmail: "ops@acme.test",
    dueDate: "2026-12-01",
    shareSlug: null,
    lastAttempt: null,
    version: 1,
    createdAt: now,
    createdBy: T1,
    updatedAt: now,
    updatedBy: T1,
    ...over,
  };
  insertInvoice(dir, rec);
  return rec;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "slice-192a-dealroom-"));
  seedRefs();
  registerBuiltinNativeDealRoomEventTypes();
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("slice 192a — the deal-room publish rule", () => {
  it("a DRAFT deal room's slug does not serve its contents", async () => {
    const id = await createRoom();
    const room = getDealRoom(dir, T1, id)!;
    expect(room.status).toBe("draft");
    // The predicate and the lane agree, and the lane is what the client hits.
    expect(isDealRoomPubliclyShareable(room.status)).toBe(false);
    const res = await shareGet(room.shareSlug!);
    expect(res.status).toBe(410);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.reason).toBe("not-published");
    expect(typeof body.error).toBe("string");
    // Nothing of the room leaks in the refusal — no name, no customer, no data.
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("Acme onboarding deal");
    expect(JSON.stringify(body)).not.toContain("Acme Corp");
  });

  it("an ARCHIVED deal room's slug stops serving its contents", async () => {
    const id = await createRoom();
    await activate(id);
    const slug = getDealRoom(dir, T1, id)!.shareSlug!;
    // Positive control: the same slug served the room a moment ago.
    expect((await shareGet(slug)).status).toBe(200);
    await archive(id);
    expect(isDealRoomPubliclyShareable(getDealRoom(dir, T1, id)!.status)).toBe(false);
    const res = await shareGet(slug);
    expect(res.status).toBe(410);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.reason).toBe("archived");
    expect(body.data).toBeUndefined();
  });

  it("revoking mints a fresh slug through the Approval Queue and the OLD slug stops resolving", async () => {
    const id = await createRoom();
    await activate(id);
    const oldSlug = getDealRoom(dir, T1, id)!.shareSlug!;
    expect((await shareGet(oldSlug)).status).toBe(200);

    // Gated write: the first POST queues, nothing changes until it is applied.
    const queued = await route("POST", `/api/native/dealroom/${id}/share/revoke`);
    expect(queued.status).toBe(202);
    expect(getDealRoom(dir, T1, id)!.shareSlug).toBe(oldSlug); // untouched until approved
    const applied = await route("POST", `/api/native/dealroom/writes/${pendingFirst("revokeShare")!.id}/apply`);
    expect(applied.status).toBe(200);

    const after = getDealRoom(dir, T1, id)!;
    expect(after.shareSlug).not.toBe(oldSlug); // a fresh slug was minted
    expect(after.status).toBe("active"); // revoking is not a status change
    // The old link is dead: the slug index no longer knows it at all.
    expect((await shareGet(oldSlug)).status).toBe(404);
    // The new link works, because the room is still published.
    expect((await shareGet(after.shareSlug!)).status).toBe(200);
  });

  it("a DRAFT invoice linked to a PUBLISHED room is not in the share view; an issued one is", async () => {
    const id = await createRoom();
    await activate(id);
    const slug = getDealRoom(dir, T1, id)!.shareSlug!;

    const draft = seedInvoice({ id: "inv_s192adraft0001", invoiceNumber: "INV-0001", linkedDealRoomId: id, status: "draft" });
    const sent = seedInvoice({
      id: "inv_s192asent00001",
      invoiceNumber: "INV-0002",
      linkedDealRoomId: id,
      status: "sent",
      shareSlug: "si_s192asent00001",
      amountDueCents: 1234500,
    });
    // The rule being applied is the invoice module's own, not a copy of it.
    expect(isInvoicePubliclyShareable(draft.status)).toBe(false);
    expect(isInvoicePubliclyShareable(sent.status)).toBe(true);

    const res = await shareGet(slug);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { invoices: { invoiceNumber: string; status: string; amountDueCents: number }[] } };
    expect(body.data.invoices.map((i) => i.invoiceNumber)).toEqual(["INV-0002"]);
    expect(body.data.invoices[0].status).toBe("sent");
    expect(body.data.invoices[0].amountDueCents).toBe(1234500);
    // The draft's number and amount never reach the client, in any form.
    const raw = JSON.stringify(body.data);
    expect(raw).not.toContain("INV-0001");
    expect(raw).not.toContain("500000");
    expect(raw).not.toContain("inv_s192adraft0001");
  });

  it("the page splits 'not available' from 'something failed' (and a real 500 still reads as a failure)", async () => {
    currentSlug = "dr_s192a";
    // 410 — the sender has not published this room. Nothing to retry.
    stubFetch([{ path: `/api/native/dealroom/share/${currentSlug}`, status: 410, body: { error: "This deal room has not been published yet." } }]);
    const unavailable = render(<DealRoomSharePage />);
    expect(await screen.findByText("This deal room isn't available")).toBeTruthy();
    expect(screen.getByText("This deal room has not been published yet.")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull(); // a 410 is not retryable
    unavailable.unmount();

    // 500 — the server broke. That is a FAILURE, with a retry, not "not found".
    stubFetch([{ path: `/api/native/dealroom/share/${currentSlug}`, status: 500, body: { error: "Internal error" } }]);
    render(<DealRoomSharePage />);
    expect(await screen.findByText("We couldn't load this deal room")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.queryByText("This deal room isn't available")).toBeNull();
  });

  it("the share route sets noindex, nofollow", () => {
    const head = DealRoomShareRoute.options.head?.({} as never) as { meta?: { name?: string; content?: string }[] } | undefined;
    const robots = head?.meta?.find((m) => m.name === "robots");
    expect(robots?.content).toBe("noindex, nofollow");
  });
});
