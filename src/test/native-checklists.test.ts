import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listChecklists,
  getChecklist,
  countChecklists,
  listPendingWrites,
  listAudit,
} from "../native/checklists/store";
import { submitChecklistWrite, noteOwnerDecision } from "../native/checklists/gate";
import { handleNativeChecklistsAuthed, registerBuiltinNativeChecklistEventTypes } from "../native/checklists/router";
import { setAutonomyWorkflow, autonomyAuditPath } from "../lib/autonomy";
import { listTenantActions } from "../lib/approval-queue";
import { listDeliveries, saveSubscription } from "../native/webhooks/store";
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
  return handleNativeChecklistsAuthed(authedReq(method, pathname, body), { userEmail: tenantId, dataDir: dir });
}
function validCreate(over: Record<string, unknown> = {}) {
  return {
    name: "Acme delivery checklist",
    description: "Post-sale delivery steps",
    kind: "delivery",
    items: [
      { title: "Scope confirmed", status: "todo" },
      { title: "Kickoff scheduled", status: "in_progress", assignee: "ops@acme.test" },
      { title: "Final handover", status: "todo" },
    ],
    ...over,
  };
}
function pendingFirst(op?: string) {
  return listPendingWrites(dir, T1).find((w) => w.status === "pending" && (op ? w.op === op : true)) ?? null;
}
/** Create a checklist via HTTP (202 pending → apply → 200) and return its id. */
async function createAndApply(over: Record<string, unknown> = {}): Promise<string> {
  const created = await route("POST", "/api/native/checklists", validCreate(over));
  expect(created.status).toBe(202);
  const applied = await route("POST", `/api/native/checklists/writes/${pendingFirst("create")!.id}/apply`);
  expect(applied.status).toBe(200);
  const list = listChecklists(dir, T1);
  expect(list.length).toBeGreaterThan(0);
  return list[list.length - 1].id;
}
function seedSubscription() {
  saveSubscription(dir, {
    id: "sub-test-1",
    tenantId: T1,
    url: "https://hooks.example.test/deliver",
    secretEncrypted: "x",
    eventTypes: [],
    enabled: true,
    retry: { maxAttempts: 1, initialBackoffMs: 100 },
    createdBy: T1,
    createdAt: new Date().toISOString(),
  });
}
const tick = () => new Promise((r) => setTimeout(r, 120));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-checklists-"));
  registerBuiltinNativeChecklistEventTypes();
});
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("checklist lifecycle + gated writes (HTTP)", () => {
  it("creates a checklist through the Approval Queue (202 → apply → 200)", async () => {
    const id = await createAndApply();
    const c = getChecklist(dir, T1, id)!;
    expect(c.status).toBe("open");
    expect(c.kind).toBe("delivery");
    expect(c.items.length).toBe(3);
    // Server-assigned cli_ ids — never client-supplied.
    for (const it of c.items) expect(it.id).toMatch(/^cli_/);
    expect(c.progress).toEqual({ done: 0, total: 3 });
    expect(c.version).toBe(1);
    // Gated: create rode a pending card (queue card exists, applied via executor).
    expect(listTenantActions(T1, dir).some((a) => a.actionType === "createChecklist")).toBe(true);
    expect(listAudit(dir, T1).some((a) => a.action === "native.checklist.create")).toBe(true);
  });

  it("fails closed on invalid payloads (400, never queued)", async () => {
    const bads: Record<string, unknown>[] = [
      validCreate({ name: "" }), // empty name
      validCreate({ name: "X".repeat(201) }), // name too long
      validCreate({ items: [] }), // no items
      validCreate({ items: "nope" }), // items not an array
      validCreate({ items: [{ title: "", status: "todo" }] }), // empty item title
      validCreate({ items: [{ title: "ok", status: "maybe" }] }), // bad item status
      validCreate({ items: [{ id: "cli_forged", title: "ok", status: "todo" }] }), // forged item id on create
      validCreate({ kind: "evil" }), // bad kind
    ];
    for (const body of bads) {
      const r = await route("POST", "/api/native/checklists", body);
      expect(r.status).toBe(400);
    }
    // bad assignee email
    expect((await route("POST", "/api/native/checklists", validCreate({ items: [{ title: "x", status: "todo", assignee: "not-an-email" }] }))).status).toBe(400);
    // cap: pending writes caps apply on the queue side; item cap enforced
    expect((await route("POST", "/api/native/checklists", validCreate({ items: Array.from({ length: 51 }, (_, i) => ({ title: `t${i}`, status: "todo" })) }))).status).toBe(400);
    // None of the invalid writes accumulated pending cards or records.
    expect(listChecklists(dir, T1).length).toBe(0);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
    expect(listAudit(dir, T1).length).toBe(0);
  });

  it("update (gated) changes items + recomputes progress + version bumps + audit", async () => {
    seedSubscription();
    const id = await createAndApply();
    const c0 = getChecklist(dir, T1, id)!;
    const firstId = c0.items[0].id;
    const upd = await route("POST", `/api/native/checklists/${id}`, {
      items: c0.items.map((it) => ({ ...it, status: it.id === firstId ? "done" : it.status })),
    });
    expect(upd.status).toBe(202);
    expect(getChecklist(dir, T1, id)!.progress.done).toBe(0); // untouched until apply
    await route("POST", `/api/native/checklists/writes/${pendingFirst("update")!.id}/apply`);
    const c1 = getChecklist(dir, T1, id)!;
    expect(c1.progress).toEqual({ done: 1, total: 3 });
    expect(c1.version).toBe(2);
    const done = c1.items.find((i) => i.id === firstId)!;
    expect(done.status).toBe("done");
    expect(done.completedAt).toBeTruthy();
    expect(done.completedBy).toBe(T1);
    expect(listAudit(dir, T1).some((a) => a.action === "native.checklist.update")).toBe(true);
    // Item-status change rode a real pending card.
    expect(listTenantActions(T1, dir).some((a) => a.actionType === "updateChecklist")).toBe(true);
    // Typed event delivered (seeded subscription).
    await tick();
    expect(listDeliveries(dir, T1).some((d) => d.eventType === "native.checklist.created")).toBe(true);
    expect(listDeliveries(dir, T1).some((d) => d.eventType === "native.checklist.updated")).toBe(true);
  });

  it("forged item ids on update fail closed (400, never queued); unknown item id → 400", async () => {
    const id = await createAndApply();
    const c = getChecklist(dir, T1, id)!;
    const forged = await route("POST", `/api/native/checklists/${id}`, {
      items: [{ id: "cli_doesnotexist000", title: "evil", status: "done" }],
    });
    expect(forged.status).toBe(400);
    // also a mixed set where one id is forged
    const mixed = await route("POST", `/api/native/checklists/${id}`, {
      items: [...c.items.map((it) => ({ id: it.id, title: it.title, status: it.status })), { id: "cli_evil2", title: "x", status: "todo" }],
    });
    expect(mixed.status).toBe(400);
    expect(getChecklist(dir, T1, id)!.version).toBe(1); // nothing applied
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
  });

  it("close (gated) transitions open → closed; further updates/closes on closed fail closed", async () => {
    const id = await createAndApply();
    const clo = await route("POST", `/api/native/checklists/${id}/close`);
    expect(clo.status).toBe(202);
    await route("POST", `/api/native/checklists/writes/${pendingFirst("close")!.id}/apply`);
    const closed = getChecklist(dir, T1, id)!;
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).toBeTruthy();
    expect(listAudit(dir, T1).some((a) => a.action === "native.checklist.close")).toBe(true);
    // Closed → cannot update or close again (400).
    expect((await route("POST", `/api/native/checklists/${id}`, { name: "rename" })).status).toBe(400);
    expect((await route("POST", `/api/native/checklists/${id}/close`)).status).toBe(400);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0); // closed-card only, no new cards
  });

  it("delete (gated) removes record; hard-delete touched only via exact id (no glob)", async () => {
    const id1 = await createAndApply();
    const id2 = await createAndApply({ name: "Second" });
    expect(countChecklists(dir, T1)).toBe(2);
    const del = await route("DELETE", `/api/native/checklists/${id1}`);
    expect(del.status).toBe(202);
    await route("POST", `/api/native/checklists/writes/${pendingFirst("delete")!.id}/apply`);
    expect(getChecklist(dir, T1, id1)).toBeNull();
    expect(countChecklists(dir, T1)).toBe(1);
    expect(getChecklist(dir, T1, id2)!.id).toBe(id2);
    expect(listAudit(dir, T1).some((a) => a.action === "native.checklist.delete")).toBe(true);
  });

  it("owner reject leaves the record untouched and marks the card rejected (audited)", async () => {
    const created = await route("POST", "/api/native/checklists", validCreate());
    expect(created.status).toBe(202);
    const ptw = pendingFirst("create")!;
    noteOwnerDecision(dir, T1, ptw.approvalActionId, "rejected", T1);
    expect(listChecklists(dir, T1).length).toBe(0); // nothing applied
    expect(listPendingWrites(dir, T1).find((w) => w.id === ptw.id)!.status).toBe("rejected");
    expect(listAudit(dir, T1).some((a) => a.action === "native.checklist.pending")).toBe(true);
  });

  it("apply is idempotent (replay → alreadyApplied) and audit is append-only", async () => {
    const id = await createAndApply();
    await route("POST", `/api/native/checklists/${id}`, { name: "Renamed" });
    const w = pendingFirst("update")!;
    const apply1 = await route("POST", `/api/native/checklists/writes/${w.id}/apply`);
    expect(apply1.status).toBe(200);
    const apply2 = await route("POST", `/api/native/checklists/writes/${w.id}/apply`);
    expect(apply2.status).toBe(200);
    expect((await apply2.json()).data.alreadyApplied).toBe(true);
    const auditBefore = listAudit(dir, T1).length;
    const replay3 = await route("POST", `/api/native/checklists/writes/${w.id}/apply`);
    expect(replay3.status).toBe(200); // no 500 on repeated replay
    expect(listAudit(dir, T1).length).toBe(auditBefore); // no duplicate apply audit
  });
});

describe("cross-tenant isolation + autonomy", () => {
  it("foreign checklist ids 404 for read/write; no IDOR", async () => {
    const id = await createAndApply();
    // T2 cannot read or write T1's checklist (404, fail-closed).
    expect((await route("GET", `/api/native/checklists/${id}`, undefined, T2)).status).toBe(404);
    expect((await route("DELETE", `/api/native/checklists/${id}`, undefined, T2)).status).toBe(404);
    expect((await route("POST", `/api/native/checklists/${id}/close`, undefined, T2)).status).toBe(404);
    expect((await route("POST", `/api/native/checklists/${id}`, { name: "hijack" }, T2)).status).toBe(404);
    // T1 unaffected; T2 sees nothing.
    expect(getChecklist(dir, T1, id)).not.toBeNull();
    expect(listChecklists(dir, T2).length).toBe(0);
    // Stranger id → 404 for both tenants.
    expect((await route("GET", `/api/native/checklists/chk_doesnotexist000`, undefined, T1)).status).toBe(404);
    expect((await route("DELETE", `/api/native/checklists/chk_doesnotexist000`, undefined, T1)).status).toBe(404);
  });

  it("autonomy allow-list auto-applies create; globs NEVER auto-delete", async () => {
    setAutonomyWorkflow(T1, "native-checklists", { enabled: true, allowList: [{ id: "al-cr-1", action: "createChecklist" }] }, dir);
    const res = submitChecklistWrite(dir, T1, "create", { data: validCreate() as Parameters<typeof submitChecklistWrite>[3]["data"], via: "portal" }, T1);
    expect(res.applied).toBe(true);
    expect((res as { autonomy: boolean }).autonomy).toBe(true);
    const rec = (res as { checklist: { id: string } }).checklist;
    expect(listChecklists(dir, T1).length).toBe(1);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
    const autoAudit = readJSON(autonomyAuditPath(dir));
    expect((autoAudit?.[T1] ?? []).some((e: { action: string }) => e.action === "createChecklist")).toBe(true);
    // Glob allow-list entry for delete does NOT auto-delete (exact-id required).
    setAutonomyWorkflow(T1, "native-checklists", { enabled: true, allowList: [{ id: "al-del-1", action: "deleteChecklist" }, { id: "al-del-2", action: "*.Checklist" }] }, dir);
    const del = submitChecklistWrite(dir, T1, "delete", { checklistId: rec.id, via: "portal" }, T1);
    expect(del.applied).toBe(false);
    expect((del as { pending: boolean }).pending).toBe(true); // still gated
    expect(getChecklist(dir, T1, rec.id)).not.toBeNull();
  });
});