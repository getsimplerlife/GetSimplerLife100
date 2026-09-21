import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listDealRooms,
  getDealRoom,
  countDealRooms,
  listPendingWrites,
  listAudit,
} from "../native/dealroom/store";
import { submitDealRoomWrite, noteOwnerDecision } from "../native/dealroom/gate";
import { handleNativeDealRoomsAuthed, handleNativeDealRoomShare, registerBuiltinNativeDealRoomEventTypes } from "../native/dealroom/router";
import { insertProposal } from "../native/proposals/store";
import { insertChecklist } from "../native/checklists/store";
import { setAutonomyWorkflow, autonomyAuditPath } from "../lib/autonomy";
import { listTenantActions } from "../lib/approval-queue";
import { readJSON } from "../lib/data-store";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;

function authedReq(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET" || method === "DELETE") return new Request(url, { method });
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}
async function route(method: string, pathname: string, body?: unknown, tenantId = T1) {
  return handleNativeDealRoomsAuthed(authedReq(method, pathname, body), { userEmail: tenantId, dataDir: dir });
}
function validCreate(over: Record<string, unknown> = {}) {
  return {
    name: "Acme onboarding deal",
    customerName: "Acme Corp",
    customerEmail: "ops@acme.test",
    description: "Post-sale onboarding room",
    linkedProposalId: "prop_seedproposal0001",
    linkedChecklistId: "chk_seedchecklist0001",
    ...over,
  };
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
    lineItems: [{ id: "li_x", description: "Setup", qty: 1, unitPrice: 5000 }],
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
/** Create a deal room via HTTP (202 pending → apply → 200) and return its id. */
async function createAndApply(over: Record<string, unknown> = {}): Promise<string> {
  const created = await route("POST", "/api/native/dealroom", validCreate(over));
  expect(created.status).toBe(202);
  const applied = await route("POST", `/api/native/dealroom/writes/${pendingFirst("create")!.id}/apply`);
  expect(applied.status).toBe(200);
  const list = listDealRooms(dir, T1);
  expect(list.length).toBeGreaterThan(0);
  return list[list.length - 1].id;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-dealroom-"));
  seedRefs(T1);
  registerBuiltinNativeDealRoomEventTypes();
});
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("deal room lifecycle + gated writes (HTTP)", () => {
  it("creates a deal room through the Approval Queue (202 → apply → 200)", async () => {
    const id = await createAndApply();
    const d = getDealRoom(dir, T1, id)!;
    expect(d.status).toBe("draft");
    expect(d.name).toBe("Acme onboarding deal");
    expect(d.customerEmail).toBe("ops@acme.test");
    expect(d.linkedProposalId).toBe("prop_seedproposal0001");
    expect(d.linkedChecklistId).toBe("chk_seedchecklist0001");
    expect(d.shareSlug).toMatch(/^dr_/); // public read-only view available at create
    expect(d.version).toBe(1);
    // Gated: create rode a pending card + immutable audit.
    expect(listTenantActions(T1, dir).some((a) => a.actionType === "createDealRoom")).toBe(true);
    expect(listAudit(dir, T1).some((a) => a.action === "native.dealroom.create")).toBe(true);
  });

  it("fails closed on invalid payloads (400, never queued)", async () => {
    const bads: Record<string, unknown>[] = [
      validCreate({ name: "" }), // empty name
      validCreate({ name: "X".repeat(201) }), // name too long
      validCreate({ customerName: "" }), // missing customer name
      validCreate({ customerEmail: "not-an-email" }), // bad customer email
      validCreate({ description: "Y".repeat(2001) }), // description too long
      validCreate({ linkedProposalId: "" }), // missing proposal link
      validCreate({ linkedProposalId: "prop_nonexistent000" }), // unknown proposal → 400
      validCreate({ linkedChecklistId: "chk_nonexistent000" }), // unknown checklist → 400
      validCreate({ linkedChecklistId: "prop_notachecklist" }), // wrong id shape
      validCreate({ id: "dea_forged" }), // forged id on create → 400 before normalization
      validCreate({ status: "archived" }), // create must start as draft — archived illegal
    ];
    for (const body of bads) {
      const r = await route("POST", "/api/native/dealroom", body);
      expect(r.status).toBe(400);
    }
    // None of the invalid writes accumulated pending cards or records/audit.
    expect(listDealRooms(dir, T1).length).toBe(0);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
    expect(listAudit(dir, T1).length).toBe(0);
  });

  it("update (gated) changes fields + moves draft→active; audit + version bump", async () => {
    const id = await createAndApply();
    const upd = await route("POST", `/api/native/dealroom/${id}`, {
      name: "Renamed deal",
      status: "active",
    });
    expect(upd.status).toBe(202);
    expect(getDealRoom(dir, T1, id)!.status).toBe("draft"); // untouched until apply
    await route("POST", `/api/native/dealroom/writes/${pendingFirst("update")!.id}/apply`);
    const d1 = getDealRoom(dir, T1, id)!;
    expect(d1.name).toBe("Renamed deal");
    expect(d1.status).toBe("active");
    expect(d1.version).toBe(2);
    expect(listAudit(dir, T1).some((a) => a.action === "native.dealroom.update")).toBe(true);
    expect(listTenantActions(T1, dir).some((a) => a.actionType === "updateDealRoom")).toBe(true);
  });

  it("status lifecycle is fail-closed: draft→active→archived; illegal transitions → 400", async () => {
    const id = await createAndApply();
    // active → archived via the archive op
    await route("POST", `/api/native/dealroom/${id}`, { status: "active" });
    await route("POST", `/api/native/dealroom/writes/${pendingFirst("update")!.id}/apply`);
    const arch = await route("POST", `/api/native/dealroom/${id}/archive`);
    expect(arch.status).toBe(202);
    await route("POST", `/api/native/dealroom/writes/${pendingFirst("archive")!.id}/apply`);
    const archived = getDealRoom(dir, T1, id)!;
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).toBeTruthy();
    expect(listAudit(dir, T1).some((a) => a.action === "native.dealroom.archive")).toBe(true);
    // archived is terminal: update (incl. status change) and archive → 400
    expect((await route("POST", `/api/native/dealroom/${id}`, { name: "rename" })).status).toBe(400);
    expect((await route("POST", `/api/native/dealroom/${id}`, { status: "active" })).status).toBe(400);
    expect((await route("POST", `/api/native/dealroom/${id}/archive`)).status).toBe(400);
    // draft → archived directly (no active hop) is also legal via archive
    const id2 = await createAndApply({ name: "Second room" });
    const arch2 = await route("POST", `/api/native/dealroom/${id2}/archive`);
    expect(arch2.status).toBe(202);
    await route("POST", `/api/native/dealroom/writes/${pendingFirst("archive")!.id}/apply`);
    expect(getDealRoom(dir, T1, id2)!.status).toBe("archived");
  });

  it("delete (gated exact-id) removes the record + unregisters its share slug", async () => {
    const id1 = await createAndApply();
    const id2 = await createAndApply({ name: "Second" });
    // Reject-add: delete with no exact id is impossible (DELETE /:id only); glob fake routes 404.
    expect((await route("DELETE", "/api/native/dealroom/chk_*")).status).toBe(404);
    expect(countDealRooms(dir, T1)).toBe(2);
    const slug1 = getDealRoom(dir, T1, id1)!.shareSlug!;
    const del = await route("DELETE", `/api/native/dealroom/${id1}`);
    expect(del.status).toBe(202);
    await route("POST", `/api/native/dealroom/writes/${pendingFirst("delete")!.id}/apply`);
    expect(getDealRoom(dir, T1, id1)).toBeNull();
    expect(countDealRooms(dir, T1)).toBe(1);
    expect(getDealRoom(dir, T1, id2)!.id).toBe(id2);
    expect(listAudit(dir, T1).some((a) => a.action === "native.dealroom.delete")).toBe(true);
    // slug unregistered → public share 404
    const share = handleNativeDealRoomShare(new Request(`http://native.test/api/native/dealroom/share/${slug1}`), { dataDir: dir });
    expect((await share).status).toBe(404);
  });

  it("owner reject leaves the record untouched and marks the card rejected (audited)", async () => {
    const created = await route("POST", "/api/native/dealroom", validCreate());
    expect(created.status).toBe(202);
    const ptw = pendingFirst("create")!;
    noteOwnerDecision(dir, T1, ptw.approvalActionId, "rejected", T1);
    expect(listDealRooms(dir, T1).length).toBe(0); // nothing applied
    expect(listPendingWrites(dir, T1).find((w) => w.id === ptw.id)!.status).toBe("rejected");
    expect(listAudit(dir, T1).some((a) => a.action === "native.dealroom.pending")).toBe(true);
  });

  it("apply is idempotent (replay → alreadyApplied) and audit is append-only", async () => {
    const id = await createAndApply();
    await route("POST", `/api/native/dealroom/${id}`, { name: "Renamed" });
    const w = pendingFirst("update")!;
    const apply1 = await route("POST", `/api/native/dealroom/writes/${w.id}/apply`);
    expect(apply1.status).toBe(200);
    const apply2 = await route("POST", `/api/native/dealroom/writes/${w.id}/apply`);
    expect(apply2.status).toBe(200);
    expect((await apply2.json()).data.alreadyApplied).toBe(true);
    const auditBefore = listAudit(dir, T1).length;
    const replay3 = await route("POST", `/api/native/dealroom/writes/${w.id}/apply`);
    expect(replay3.status).toBe(200); // no 500 on repeated replay
    expect(listAudit(dir, T1).length).toBe(auditBefore); // no duplicate apply audit
  });
});

describe("cross-tenant isolation + autonomy + public share", () => {
  it("foreign deal room ids 404 for read/write; no IDOR", async () => {
    const id = await createAndApply();
    // T2 cannot read or write T1's deal room (404, fail-closed).
    expect((await route("GET", `/api/native/dealroom/${id}`, undefined, T2)).status).toBe(404);
    expect((await route("DELETE", `/api/native/dealroom/${id}`, undefined, T2)).status).toBe(404);
    expect((await route("POST", `/api/native/dealroom/${id}/archive`, undefined, T2)).status).toBe(404);
    expect((await route("POST", `/api/native/dealroom/${id}`, { name: "hijack" }, T2)).status).toBe(404);
    // T1 unaffected; T2 sees nothing (and its own refs are separate).
    expect(getDealRoom(dir, T1, id)).not.toBeNull();
    expect(listDealRooms(dir, T2).length).toBe(0);
    expect((await route("GET", `/api/native/dealroom/dea_doesnotexist000`, undefined, T1)).status).toBe(404);
  });

  it("autonomy allow-list auto-applies create; globs NEVER auto-delete", async () => {
    setAutonomyWorkflow(T1, "native-dealrooms", { enabled: true, allowList: [{ id: "al-cr-1", action: "createDealRoom" }] }, dir);
    const res = submitDealRoomWrite(dir, T1, "create", { data: validCreate() as Parameters<typeof submitDealRoomWrite>[3]["data"], via: "portal" }, T1);
    expect(res.applied).toBe(true);
    expect((res as { autonomy: boolean }).autonomy).toBe(true);
    const rec = (res as { dealRoom: { id: string } }).dealRoom;
    expect(listDealRooms(dir, T1).length).toBe(1);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
    const autoAudit = readJSON(autonomyAuditPath(dir));
    expect((autoAudit?.[T1] ?? []).some((e: { action: string }) => e.action === "createDealRoom")).toBe(true);
    // Glob allow-list entry for delete does NOT auto-delete (exact-id required).
    setAutonomyWorkflow(T1, "native-dealrooms", { enabled: true, allowList: [{ id: "al-del-1", action: "deleteDealRoom" }, { id: "al-del-2", action: "*.DealRoom" }] }, dir);
    const del = submitDealRoomWrite(dir, T1, "delete", { dealRoomId: rec.id, via: "portal" }, T1);
    expect(del.applied).toBe(false);
    expect((del as { pending: boolean }).pending).toBe(true); // still gated
    expect(getDealRoom(dir, T1, rec.id)).not.toBeNull();
  });

  it("public share slug: unknown → 404; read-only (POST → 405); no tenant internals leaked", async () => {
    const id = await createAndApply();
    const d = getDealRoom(dir, T1, id)!;
    // Unknown slug → 404.
    expect((await handleNativeDealRoomShare(new Request("http://native.test/api/native/dealroom/share/dr_bogus123"), { dataDir: dir })).status).toBe(404);
    expect((await handleNativeDealRoomShare(new Request("http://native.test/api/native/dealroom/share/not-a-dr-slug"), { dataDir: dir })).status).toBe(404);
    // GET renders the read-only view — deal metadata + proposal summary + checklist %.
    const res = await handleNativeDealRoomShare(new Request(`http://native.test/api/native/dealroom/share/${d.shareSlug}`), { dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as Record<string, unknown>;
    // Safe surface: deal basics + proposal summary + checklist progress % — nothing internal.
    expect(body.name).toBe("Acme onboarding deal");
    expect(body.customerName).toBe("Acme Corp");
    expect(body.status).toBe("draft");
    const prop = body.proposal as Record<string, unknown> | null;
    expect(prop).not.toBeNull();
    expect((prop as Record<string, unknown>).title).toBe("Onboarding retainer");
    expect((prop as Record<string, unknown>).status).toBe("approved");
    expect((prop as Record<string, unknown>).hasPdf).toBe(false);
    const chk = body.checklist as Record<string, unknown> | null;
    expect(chk).not.toBeNull();
    expect((chk as Record<string, unknown>).progress).toEqual({ done: 1, total: 2 });
    expect((chk as Record<string, unknown>).percentDone).toBe(50);
    // NO internal ids / audit / tenant internals leak on the public surface.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("chk_seedchecklist0001");
    expect(raw).not.toContain("tenantId");
    expect(raw).not.toContain("createdBy");
    expect(raw).not.toContain("audit");
    expect(raw).not.toContain("approvalActionId");
    // Read-only: POST/PUT/DELETE on the share path → 405.
    expect((await handleNativeDealRoomShare(new Request(`http://native.test/api/native/dealroom/share/${d.shareSlug}`, { method: "POST", body: JSON.stringify({ status: "active" }) }), { dataDir: dir })).status).toBe(405);
    expect((await handleNativeDealRoomShare(new Request(`http://native.test/api/native/dealroom/share/${d.shareSlug}`, { method: "DELETE" }), { dataDir: dir })).status).toBe(405);
    // Double-request harmless (still 200, same shape).
    const again = await handleNativeDealRoomShare(new Request(`http://native.test/api/native/dealroom/share/${d.shareSlug}`), { dataDir: dir });
    expect(again.status).toBe(200);
    expect(((await again.json()).data as Record<string, unknown>).name).toBe("Acme onboarding deal");
    // Record untouched after share requests.
    expect(getDealRoom(dir, T1, id)!.version).toBe(1);
  });
});