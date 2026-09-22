import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listInvoices,
  getInvoice,
  countInvoices,
  listPendingWrites,
  listAudit,
} from "../native/invoice/store";
import { submitInvoiceWrite, noteOwnerDecision } from "../native/invoice/gate";
import { handleNativeInvoicesAuthed, registerBuiltinNativeInvoiceEventTypes } from "../native/invoice/router";
import { insertProposal } from "../native/proposals/store";
import { insertChecklist } from "../native/checklists/store";
import { setAutonomyWorkflow, autonomyAuditPath } from "../lib/autonomy";
import { listTenantActions } from "../lib/approval-queue";
import { readJSON } from "../lib/data-store";
import { listDocs } from "../native/documents/store";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;

function authedReq(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET" || method === "DELETE") return new Request(url, { method });
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}
async function route(method: string, pathname: string, body?: unknown, tenantId = T1) {
  return handleNativeInvoicesAuthed(authedReq(method, pathname, body), { userEmail: tenantId, dataDir: dir });
}
function pendingFirst(op?: string) {
  return listPendingWrites(dir, T1).find((w) => w.status === "pending" && (op ? w.op === op : true)) ?? null;
}
/** Seed a proposal + checklist for a tenant (deal rooms need valid linked refs). */
function seedRefs(tenantId: string) {
  const now = new Date().toISOString();
  insertProposal(dir, {
    id: "prop_seedproposal0001",
    tenantId,
    title: "Onboarding retainer",
    clientName: "Acme Corp",
    clientEmail: "ops@acme.test",
    clientCompany: "Acme Corp",
    lineItems: [
      { id: "li_x", description: "Setup", qty: 1, unitPrice: 5000 },
      { id: "li_y", description: "Monthly retainer", qty: 2, unitPrice: 1250.5 },
    ],
    currency: "USD",
    terms: "",
    validityDays: 30,
    status: "approved",
    shareSlug: null,
    docId: null,
    version: 1,
    createdAt: now,
    createdBy: tenantId,
    updatedAt: now,
    updatedBy: tenantId,
    signatures: [],
  });
  insertChecklist(dir, {
    id: "chk_seedchecklist0001",
    tenantId,
    name: "Delivery checklist",
    description: "",
    kind: "delivery",
    linkedProposalId: "prop_seedproposal0001",
    items: [
      { id: "cli_a", title: "Kickoff", status: "done" },
      { id: "cli_b", title: "Handover", status: "todo" },
    ],
    status: "open",
    progress: { done: 1, total: 2 },
    version: 1,
    createdAt: now,
    createdBy: tenantId,
    updatedAt: now,
    updatedBy: tenantId,
  });
}
/** Create a deal room via its authed route (202 → apply → 200) and return its id. */
async function createDealRoom(tenantId = T1, over: Record<string, unknown> = {}): Promise<string> {
  const body = {
    name: "Acme onboarding deal",
    customerName: "Acme Corp",
    customerEmail: "ops@acme.test",
    description: "Post-sale onboarding room",
    linkedProposalId: "prop_seedproposal0001",
    linkedChecklistId: "chk_seedchecklist0001",
    ...over,
  };
  const { handleNativeDealRoomsAuthed } = await import("../native/dealroom/router");
  const created = await handleNativeDealRoomsAuthed(new Request(`http://native.test/api/native/dealroom`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { userEmail: tenantId, dataDir: dir });
  expect(created.status).toBe(202);
  const { listDealRooms, listPendingWrites } = await import("../native/dealroom/store");
  const ptw = listPendingWrites(dir, tenantId).find((w) => w.status === "pending" && w.op === "create");
  expect(ptw).toBeTruthy();
  await handleNativeDealRoomsAuthed(new Request(`http://native.test/api/native/dealroom/writes/${ptw!.id}/apply`, { method: "POST" }), { userEmail: tenantId, dataDir: dir });
  const rooms = listDealRooms(dir, tenantId);
  expect(rooms.length).toBeGreaterThan(0);
  return rooms[rooms.length - 1].id;
}
/** Create an invoice via HTTP (202 pending → apply → 200) and return its id. */
async function createAndApply(dealRoomId: string, tenantId = T1): Promise<string> {
  const created = await route("POST", "/api/native/invoice", { linkedDealRoomId: dealRoomId }, tenantId);
  expect(created.status).toBe(202);
  const applied = await route("POST", `/api/native/invoice/writes/${pendingFirst("create")!.id}/apply`, undefined, tenantId);
  expect(applied.status).toBe(200);
  const list = listInvoices(dir, tenantId);
  expect(list.length).toBeGreaterThan(0);
  return list[list.length - 1].id;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-invoice-"));
  seedRefs(T1);
  registerBuiltinNativeInvoiceEventTypes();
});
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("invoice lifecycle + gated writes (HTTP)", () => {
  it("creates an invoice from a deal room through the Approval Queue (202 → apply → 200), snapshotting cents", async () => {
    const dealRoomId = await createDealRoom();
    const id = await createAndApply(dealRoomId);
    const inv = getInvoice(dir, T1, id)!;
    expect(inv.status).toBe("draft");
    expect(inv.linkedDealRoomId).toBe(dealRoomId);
    expect(inv.invoiceNumber).toBe("INV-0001"); // per-tenant sequence
    expect(inv.currency).toBe("USD");
    // Snapshot in integer cents — line 2 × 1250.50 → 2501.00, no float drift.
    expect(inv.lineItems).toEqual([
      { id: expect.stringMatching(/^invli_/), description: "Setup", qty: 1, unitPriceCents: 500000 },
      { id: expect.stringMatching(/^invli_/), description: "Monthly retainer", qty: 2, unitPriceCents: 125050 },
    ]);
    expect(inv.amountDueCents).toBe(500000 + 2 * 125050);
    expect(inv.docId).toBeNull();
    expect(inv.version).toBe(1);
    expect(listTenantActions(T1, dir).some((a) => a.actionType === "createInvoice")).toBe(true);
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.create")).toBe(true);
  });

  it("invoice numbers are a per-tenant monotonic sequence", async () => {
    const dealRoomId = await createDealRoom();
    const id1 = await createAndApply(dealRoomId);
    const id2 = await createAndApply(dealRoomId);
    expect(getInvoice(dir, T1, id1)!.invoiceNumber).toBe("INV-0001");
    expect(getInvoice(dir, T1, id2)!.invoiceNumber).toBe("INV-0002");
  });

  it("fails closed on invalid payloads (400, never queued)", async () => {
    const dealRoomId = await createDealRoom();
    const bads: Record<string, unknown>[] = [
      {}, // missing linkedDealRoomId
      { linkedDealRoomId: "" }, // empty
      { linkedDealRoomId: "dea_nonexistent000" }, // unknown deal room → 400/404 family
      { linkedDealRoomId: "chk_notadealroom" }, // wrong id shape
      { id: "inv_forged", linkedDealRoomId: dealRoomId }, // forged id on create
      { linkedDealRoomId: dealRoomId, status: "sent" }, // status not settable (dropped → still requires room) — validate drops status
    ];
    for (const body of bads) {
      const r = await route("POST", "/api/native/invoice", body);
      expect([400, 404]).toContain(r.status);
    }
    // None of the invalid writes accumulated pending cards/records/audit.
    expect(listInvoices(dir, T1).length).toBe(0);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
    expect(listAudit(dir, T1).length).toBe(0);
  });

  it("generate (gated) stores an add-only PDF doc; send (gated) flips draft→sent and is terminal", async () => {
    const dealRoomId = await createDealRoom();
    const id = await createAndApply(dealRoomId);
    // generate → PDF in the doc store, still draft
    const gen = await route("POST", `/api/native/invoice/${id}/generate`);
    expect(gen.status).toBe(202);
    await route("POST", `/api/native/invoice/writes/${pendingFirst("generate")!.id}/apply`);
    const drafted = getInvoice(dir, T1, id)!;
    expect(drafted.status).toBe("draft");
    expect(drafted.docId).toMatch(/^doc_/);
    expect(listDocs(dir, T1).some((d) => d.id === drafted.docId && d.kind === "invoice")).toBe(true);
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.generate")).toBe(true);
    // send → status flips, PDF stored BEFORE the flip (2.2 discipline)
    const send = await route("POST", `/api/native/invoice/${id}/send`);
    expect(send.status).toBe(202);
    await route("POST", `/api/native/invoice/writes/${pendingFirst("send")!.id}/apply`);
    const sent = getInvoice(dir, T1, id)!;
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).toBeTruthy();
    expect(sent.docId).toMatch(/^doc_/);
    expect(listDocs(dir, T1).some((d) => d.id === sent.docId && d.checksum)).toBe(true);
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.send")).toBe(true);
    expect(listTenantActions(T1, dir).some((a) => a.actionType === "sendInvoice")).toBe(true);
    // sent is terminal: no regenerate, no re-send, no delete (legal record)
    expect((await route("POST", `/api/native/invoice/${id}/generate`)).status).toBe(400);
    expect((await route("POST", `/api/native/invoice/${id}/send`)).status).toBe(400);
    expect((await route("DELETE", `/api/native/invoice/${id}`)).status).toBe(400);
  });

  it("delete (gated exact-id) removes a DRAFT invoice only; audit appended; unknown → 404", async () => {
    const dealRoomId = await createDealRoom();
    const id1 = await createAndApply(dealRoomId);
    const id2 = await createAndApply(dealRoomId);
    expect(countInvoices(dir, T1)).toBe(2);
    const del = await route("DELETE", `/api/native/invoice/${id1}`);
    expect(del.status).toBe(202);
    await route("POST", `/api/native/invoice/writes/${pendingFirst("delete")!.id}/apply`);
    expect(getInvoice(dir, T1, id1)).toBeNull();
    expect(countInvoices(dir, T1)).toBe(1);
    expect(getInvoice(dir, T1, id2)!.id).toBe(id2);
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.delete")).toBe(true);
    expect((await route("GET", `/api/native/invoice/inv_doesnotexist000`)).status).toBe(404);
    expect((await route("DELETE", `/api/native/invoice/inv_doesnotexist000`)).status).toBe(404);
  });

  it("owner reject leaves the record untouched and marks the card rejected (audited)", async () => {
    const dealRoomId = await createDealRoom();
    const created = await route("POST", "/api/native/invoice", { linkedDealRoomId: dealRoomId });
    expect(created.status).toBe(202);
    const ptw = pendingFirst("create")!;
    noteOwnerDecision(dir, T1, ptw.approvalActionId, "rejected", T1);
    expect(listInvoices(dir, T1).length).toBe(0); // nothing applied
    expect(listPendingWrites(dir, T1).find((w) => w.id === ptw.id)!.status).toBe("rejected");
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.pending")).toBe(true);
  });

  it("apply is idempotent (replay → alreadyApplied) and audit is append-only", async () => {
    const dealRoomId = await createDealRoom();
    await createAndApply(dealRoomId);
    await route("POST", "/api/native/invoice/writes", undefined);
    // trigger a generate and replay it
    const id = listInvoices(dir, T1)[0].id;
    await route("POST", `/api/native/invoice/${id}/generate`);
    const w = pendingFirst("generate")!;
    const apply1 = await route("POST", `/api/native/invoice/writes/${w.id}/apply`);
    expect(apply1.status).toBe(200);
    const apply2 = await route("POST", `/api/native/invoice/writes/${w.id}/apply`);
    expect(apply2.status).toBe(200);
    expect((await apply2.json()).data.alreadyApplied).toBe(true);
    const auditBefore = listAudit(dir, T1).length;
    const replay3 = await route("POST", `/api/native/invoice/writes/${w.id}/apply`);
    expect(replay3.status).toBe(200); // no 500 on repeated replay
    expect(listAudit(dir, T1).length).toBe(auditBefore); // no duplicate apply audit
  });
});

describe("cross-tenant isolation + autonomy", () => {
  it("foreign invoice ids 404 for read/write; no IDOR; tenants isolated", async () => {
    const dealRoomId = await createDealRoom();
    const id = await createAndApply(dealRoomId);
    // T2 cannot read or write T1's invoice (404, fail-closed).
    expect((await route("GET", `/api/native/invoice/${id}`, undefined, T2)).status).toBe(404);
    expect((await route("DELETE", `/api/native/invoice/${id}`, undefined, T2)).status).toBe(404);
    expect((await route("POST", `/api/native/invoice/${id}/send`, undefined, T2)).status).toBe(404);
    expect((await route("POST", `/api/native/invoice/${id}/generate`, undefined, T2)).status).toBe(404);
    // T1 unaffected; T2 sees nothing.
    expect(getInvoice(dir, T1, id)).not.toBeNull();
    expect(listInvoices(dir, T2).length).toBe(0);
    expect((await route("GET", "/api/native/invoice", undefined, T2)).status).toBe(200);
    expect(((await (await route("GET", "/api/native/invoice", undefined, T2))).json() as unknown as { data: unknown[] }).data?.length ?? 0).toBe(0);
  });

  it("autonomy allow-list auto-applies create; globs NEVER auto-delete", async () => {
    const dealRoomId = await createDealRoom();
    setAutonomyWorkflow(T1, "native-invoices", { enabled: true, allowList: [{ id: "al-inv-1", action: "createInvoice" }] }, dir);
    const res = submitInvoiceWrite(dir, T1, "create", { data: { linkedDealRoomId: dealRoomId }, via: "portal" }, T1);
    expect(res.applied).toBe(true);
    expect((res as { autonomy: boolean }).autonomy).toBe(true);
    const rec = (res as { invoice: { id: string } }).invoice;
    expect(listInvoices(dir, T1).length).toBe(1);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
    const autoAudit = readJSON(autonomyAuditPath(dir));
    expect((autoAudit?.[T1] ?? []).some((e: { action: string }) => e.action === "createInvoice")).toBe(true);
    // Glob allow-list entry for delete does NOT auto-delete (exact-id required).
    setAutonomyWorkflow(T1, "native-invoices", { enabled: true, allowList: [{ id: "al-del-1", action: "deleteInvoice" }, { id: "al-del-2", action: "*.Invoice" }] }, dir);
    const del = submitInvoiceWrite(dir, T1, "delete", { invoiceId: rec.id, via: "portal" }, T1);
    expect(del.applied).toBe(false);
    expect((del as { pending: boolean }).pending).toBe(true); // still gated
    expect(getInvoice(dir, T1, rec.id)).not.toBeNull();
  });

  it("public deal-room share view exposes a SAFE invoice summary (number/amount/status only — no internal ids)", async () => {
    const dealRoomId = await createDealRoom();
    await createAndApply(dealRoomId);
    const { handleNativeDealRoomShare } = await import("../native/dealroom/router");
    const { getDealRoom, listDealRooms } = await import("../native/dealroom/store");
    const room = listDealRooms(dir, T1)[0];
    // Invoice visible on the PUBLIC share (no auth) — safe summary only.
    const res = await handleNativeDealRoomShare(new Request(`http://native.test/api/native/dealroom/share/${room.shareSlug}`, { method: "GET" }), { dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { invoices: unknown[]; dealRoomId: string } };
    expect(body.data.invoices.length).toBe(1);
    const inv = body.data.invoices[0] as Record<string, unknown>;
    expect(inv.invoiceNumber).toBe("INV-0001");
    expect(inv.currency).toBe("USD");
    expect(inv.amountDueCents).toBe(500000 + 2 * 125050);
    expect(inv.status).toBe("draft");
    // NO internal ids / internals may leak through the public view.
    const raw = JSON.stringify(body.data);
    expect(raw).not.toMatch(/inv_[A-Za-z0-9_-]+/); // no inv_ record ids
    expect(raw).not.toContain("docId");
    expect(raw).not.toContain("audit");
    expect(raw).not.toContain("pendingWrites");
    expect(raw).not.toContain("approvalActionId");
    // Marching: the room's own internal record still has its id (internal only).
    const roomRec = getDealRoom(dir, T1, dealRoomId)!;
    expect(roomRec.id.startsWith("dea_")).toBe(true);
  });

  it("cannot invoice an archived deal room (fail-closed)", async () => {
    const dealRoomId = await createDealRoom();
    const { handleNativeDealRoomsAuthed } = await import("../native/dealroom/router");
    await handleNativeDealRoomsAuthed(new Request(`http://native.test/api/native/dealroom/${dealRoomId}/archive`, { method: "POST" }), { userEmail: T1, dataDir: dir });
    const { listDealRooms, listPendingWrites } = await import("../native/dealroom/store");
    const ptw = listPendingWrites(dir, T1).find((w) => w.status === "pending" && w.op === "archive");
    expect(ptw).toBeTruthy();
    await handleNativeDealRoomsAuthed(new Request(`http://native.test/api/native/dealroom/writes/${ptw!.id}/apply`, { method: "POST" }), { userEmail: T1, dataDir: dir });
    expect(listDealRooms(dir, T1)[0].status).toBe("archived");
    const created = await route("POST", "/api/native/invoice", { linkedDealRoomId: dealRoomId });
    expect([400, 404]).toContain(created.status);
    expect(listInvoices(dir, T1).length).toBe(0);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
  });
});