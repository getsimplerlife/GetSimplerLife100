import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listProposals,
  getProposal,
  listAudit,
  lookupShareTenant,
  countProposals,
  listPendingWrites,
} from "../native/proposals/store";
import { submitProposalWrite, executePendingProposalWrite, noteOwnerDecision, formatCurrencyTotal } from "../native/proposals/gate";
import { handleNativeProposalsAuthed, handleNativeProposalShare, registerBuiltinNativeProposalEventTypes } from "../native/proposals/router";
import { proposalTotalCents, proposalHtml } from "../native/proposals/generate";
import { setAutonomyWorkflow, autonomyAuditPath } from "../lib/autonomy";
import { listTenantActions } from "../lib/approval-queue";
import { listDeliveries, saveSubscription } from "../native/webhooks/store";
import { readJSON } from "../lib/data-store";
import { getDoc, readDocumentBytes } from "../native/documents/store";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;

function authedReq(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET") return new Request(url);
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}
async function route(method: string, pathname: string, body?: unknown, tenantId = T1) {
  return handleNativeProposalsAuthed(authedReq(method, pathname, body), { userEmail: tenantId, dataDir: dir });
}
async function share(method: string, slug: string, body?: unknown) {
  const req = authedReq(method, `/api/native/proposals/share/${slug}`, body);
  return handleNativeProposalShare(req, { dataDir: dir });
}
function validBody(over: Record<string, unknown> = {}) {
  return {
    title: "Acme Q3 Automation",
    clientName: "Pat Owner",
    clientEmail: "pat@acme.test",
    clientCompany: "Acme Corp",
    lineItems: [
      { description: "Discovery workshop", qty: 2, unitPrice: 49.99 },
      { description: "Integration setup", qty: 1, unitPrice: 500 },
    ],
    currency: "USD",
    terms: "Net 30",
    validityDays: 30,
    ...over,
  };
}
function pendingFirst(op?: string) {
  return listPendingWrites(dir, T1).find((w) => w.status === "pending" && (op ? w.op === op : true)) ?? null;
}
/** Create a proposal via HTTP (202 pending → apply → 200) and return its id. */
async function createAndApply(over: Record<string, unknown> = {}): Promise<string> {
  const created = await route("POST", "/api/native/proposals", validBody(over));
  expect(created.status).toBe(202);
  const applied = await route("POST", `/api/native/proposals/writes/${pendingFirst("create")!.id}/apply`);
  expect(applied.status).toBe(200);
  const list = listProposals(dir, T1);
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
  dir = mkdtempSync(join(tmpdir(), "native-proposals-"));
  registerBuiltinNativeProposalEventTypes();
});
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("proposal lifecycle + gated writes (HTTP)", () => {
  it("creates a draft through the Approval Queue (202 → apply → 200)", async () => {
    const id = await createAndApply();
    const p = getProposal(dir, T1, id)!;
    expect(p.status).toBe("draft");
    expect(p.lineItems.length).toBe(2);
    expect(p.docId).toBeNull();
    expect(p.shareSlug).toBeNull();
    // Money math in cents — 2×49.99 + 1×500 = 599.98
    expect(proposalTotalCents(p)).toBe(9998 + 50000);
    expect(formatCurrencyTotal(p)).toBe("USD 599.98");
    // Gated: create rode a pending card (queue card exists, record applied after).
    expect(listTenantActions(T1, dir).some((a) => a.actionType === "createProposal")).toBe(true); // gated: card existed; applied via executor
    expect(listAudit(dir, T1).some((a) => a.action === "native.proposal.create")).toBe(true);
  });

  it("fails closed on invalid payloads (400, never queued)", async () => {
    for (const bad of [
      validBody({ title: "" }),
      validBody({ clientName: "" }),
      validBody({ currency: "usd" }),
      validBody({ currency: "US" }),
      validBody({ lineItems: [] }),
      validBody({ lineItems: [{ description: "x", qty: 0, unitPrice: 10 }] }),
      validBody({ lineItems: [{ description: "x", qty: 1, unitPrice: -5 }] }),
      validBody({ lineItems: [{ description: "x", qty: 1, unitPrice: 10.001 }] }),
      validBody({ validityDays: 0 }),
      validBody({ validityDays: 999 }),
      validBody({ lineItems: Array.from({ length: 51 }, (_, i) => ({ description: `item ${i}`, qty: 1, unitPrice: 1 })) }),
    ]) {
      const res = await route("POST", "/api/native/proposals", bad);
      expect(res.status).toBe(400);
      expect(listPendingWrites(dir, T1).length).toBe(0); // never queued
    }
  });

  it("updates title/lineItems (gated), and lock is enforced after approve", async () => {
    const id = await createAndApply();
    const upd = await route("POST", `/api/native/proposals/${id}`, { title: "Acme Q4 Automation", terms: "Net 15" });
    expect(upd.status).toBe(202);
    const updApply = await route("POST", `/api/native/proposals/writes/${pendingFirst("update")!.id}/apply`);
    expect(updApply.status).toBe(200);
    expect(getProposal(dir, T1, id)!.title).toBe("Acme Q4 Automation");
    expect(getProposal(dir, T1, id)!.terms).toBe("Net 15");
    expect(listAudit(dir, T1).some((a) => a.action === "native.proposal.update")).toBe(true);

    // Approve (owner path) then lock updates.
    await route("POST", `/api/native/proposals/${id}/approve`);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("approve")!.id}/apply`);
    expect(getProposal(dir, T1, id)!.status).toBe("approved");
    const locked = await route("POST", `/api/native/proposals/${id}`, { title: "Nope" });
    expect(locked.status).toBe(400);
    expect(getProposal(dir, T1, id)!.title).toBe("Acme Q4 Automation");
  });

  it("state machine fail-closed: send requires approved; reject only from pending", async () => {
    const id = await createAndApply();
    // send from draft → 400; open → pending → 202 → apply → 200; send from pending → 400; reject ok.
    const send1 = await route("POST", `/api/native/proposals/${id}/send`);
    expect(send1.status).toBe(400);
    await route("POST", `/api/native/proposals/${id}/open`);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`);
    expect(getProposal(dir, T1, id)!.status).toBe("pending");
    const send2 = await route("POST", `/api/native/proposals/${id}/send`);
    expect(send2.status).toBe(400);
    await route("POST", `/api/native/proposals/${id}/reject`);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("reject")!.id}/apply`);
    expect(getProposal(dir, T1, id)!.status).toBe("rejected");
    expect(getProposal(dir, T1, id)!.rejectedBy).toBe(T1);
  });
});

describe("share + PDF generation", () => {
  it("open generates the draft PDF + share slug and registers the slug index", async () => {
    const id = await createAndApply();
    const opened = await route("POST", `/api/native/proposals/${id}/open`);
    expect(opened.status).toBe(202);
    const openApply = await route("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`);
    expect(openApply.status).toBe(200);
    const p = getProposal(dir, T1, id)!;
    expect(p.status).toBe("pending");
    expect(p.shareSlug).toMatch(/^sp_/);
    expect(lookupShareTenant(dir, p.shareSlug!)).toBe(T1);
    expect(p.docId).toBeTruthy();
    const doc = getDoc(dir, T1, p.docId!)!;
    expect(doc.kind).toBe("proposal");
    expect(doc.acl.owner).toBe(T1);
    expect(doc.checksum.length).toBeGreaterThan(0);
    const bytes = readDocumentBytes(dir, T1, p.docId!);
    expect(bytes).not.toBeNull();
    expect(bytes!.byteLength).toBe(doc.sizeBytes);
    expect(new TextDecoder().decode(bytes!.subarray(0, 4))).toBe("%PDF");
  });

  it("public share: GET summary, approve rides the tenant Approval Queue, send generates final v2 PDF", async () => {
    seedSubscription();
    const id = await createAndApply();
    await route("POST", `/api/native/proposals/${id}/open`);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`);
    const p = getProposal(dir, T1, id)!;
    const slug = p.shareSlug!;
    // Client views the share.
    const view = await share("GET", slug);
    expect(view.status).toBe(200);
    const body = (await view.json()).data;
    expect(body.lineItems.length).toBe(2);
    expect(body.proposalId).toBe(id);
    expect(body.clientEmail).toBeUndefined(); // no tenant internals on the share
    // Client approves — decision is QUEUED (tenant side), status untouched until owner approves.
    const decide = await share("POST", slug, { decision: "approve", signerName: "Pat Owner" });
    expect(decide.status).toBe(202);
    const ptw = pendingFirst("approve");
    expect(ptw!.payload.via).toBe("client-decision");
    expect(getProposal(dir, T1, id)!.status).toBe("pending"); // untouched yet
    // Owner approves the card → applied + typed event delivered.
    noteOwnerDecision(dir, T1, ptw!.approvalActionId, "approved", T1);
    await tick();
    const approved = getProposal(dir, T1, id)!;
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe(T1);
    expect(listDeliveries(dir, T1).some((d) => d.eventType === "native.proposal.approved")).toBe(true);
    expect(listDeliveries(dir, T1).some((d) => d.eventType === "native.proposal.created")).toBe(true);
    // Decided proposal: second decision → 409.
    const again = await share("POST", slug, { decision: "reject" });
    expect(again.status).toBe(409);
    // send → final PDF, add-only v2 on the same doc record.
    const sent = await route("POST", `/api/native/proposals/${id}/send`);
    expect(sent.status).toBe(202);
    const sendApply = await route("POST", `/api/native/proposals/writes/${pendingFirst("send")!.id}/apply`);
    expect(sendApply.status).toBe(200);
    const sentP = getProposal(dir, T1, id)!;
    expect(sentP.status).toBe("sent");
    expect(sentP.sentAt).toBeTruthy();
    const doc = getDoc(dir, T1, sentP.docId!)!;
    expect(doc.version).toBe(2); // draft v1 + final v2, add-only history
    expect(doc.history.length).toBe(1);
  });

  it("reject via share + unknown slug / foreign decisions fail closed", async () => {
    seedSubscription();
    const id = await createAndApply();
    await route("POST", `/api/native/proposals/${id}/open`);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`);
    const slug = getProposal(dir, T1, id)!.shareSlug!;
    const unknown = await share("GET", "sp_nonexistentxxxxx");
    expect(unknown.status).toBe(404);
    const badSlug = await share("POST", "sp_notreal000000", { decision: "approve" });
    expect(badSlug.status).toBe(404);
    const badDecision = await share("POST", slug, { decision: "maybe" });
    expect(badDecision.status).toBe(400);
    const reject = await share("POST", slug, { decision: "reject" });
    expect(reject.status).toBe(202);
    const ptw = pendingFirst("reject");
    // Owner rejects the card -> write NOT applied; proposal status unchanged.
    noteOwnerDecision(dir, T1, ptw!.approvalActionId, "rejected", T1);
    expect(getProposal(dir, T1, id)!.status).toBe("pending");
    expect(listPendingWrites(dir, T1).find((w) => w.approvalActionId === ptw!.approvalActionId)!.status).toBe("rejected");
    // The client may re-send a decision; an owner who lets the rejection through
    // applies the queued write -> status rejected + typed event.
    const reject2 = await share("POST", slug, { decision: "reject" });
    expect(reject2.status).toBe(202);
    const ptw2 = listPendingWrites(dir, T1).find((w) => w.op === "reject" && w.status === "pending")!;
    const applied = executePendingProposalWrite(dir, T1, ptw2.approvalActionId, T1);
    expect(applied.ok).toBe(true);
    expect(getProposal(dir, T1, id)!.status).toBe("rejected");
    await tick();
    expect(listDeliveries(dir, T1).some((d) => d.eventType === "native.proposal.rejected")).toBe(true);
  });
});

describe("cross-tenant isolation + autonomy + durability", () => {
  it("foreign proposal ids 404 for read/write; share slug resolves only to its tenant", async () => {
    const id = await createAndApply();
    // T2 cannot read or delete T1's proposal (404, no IDOR).
    expect((await route("GET", `/api/native/proposals/${id}`, undefined, T2)).status).toBe(404);
    expect((await route("DELETE", `/api/native/proposals/${id}`, undefined, T2)).status).toBe(404);
    await route("POST", `/api/native/proposals/${id}/open`);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`);
    const slug = getProposal(dir, T1, id)!.shareSlug!;
    // The share link is slug-gated (forms pattern): whoever holds it IS the
    // client. The decision still lands in T1's OWN tenant store (the slug index
    // maps slug → T1) — zero cross-tenant store writes.
    const asT2 = await share("POST", slug, { decision: "approve" });
    expect(asT2.status).toBe(202);
    const cards = listPendingWrites(dir, T1).filter((w) => w.status === "pending");
    expect(cards.length).toBe(1);
    expect(cards[0].tenantId).toBe(T1);
    expect(cards[0].op).toBe("approve");
    // T1 list shows exactly 1.
    expect(listProposals(dir, T1).length).toBe(1);
    expect(listProposals(dir, T2).length).toBe(0);
  });

  it("autonomy allow-list auto-applies create; globs NEVER auto-delete", async () => {
    setAutonomyWorkflow(T1, "native-proposals", { enabled: true, allowList: [{ id: "al-cr-1", action: "createProposal" }] }, dir);
    const res = submitProposalWrite(dir, T1, "create", { data: validBody() }, T1);
    expect(res.applied).toBe(true);
    expect((res as { autonomy: boolean }).autonomy).toBe(true);
    const rec = (res as { proposal: { id: string } }).proposal;
    expect(listProposals(dir, T1).length).toBe(1);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
    const autoAudit = readJSON(autonomyAuditPath(dir));
    expect((autoAudit?.[T1] ?? []).some((e: { action: string }) => e.action === "createProposal")).toBe(true);
    // Glob allow-list entry for delete does NOT auto-delete (exact-id required).
    setAutonomyWorkflow(T1, "native-proposals", { enabled: true, allowList: [{ id: "al-del-1", action: "deleteProposal" }, { id: "al-del-2", action: "*.Proposal" }] }, dir);
    const del = submitProposalWrite(dir, T1, "delete", { proposalId: rec.id }, T1);
    expect(del.applied).toBe(false);
    expect((del as { pending: boolean }).pending).toBe(true); // still gated
  });

  it("apply is idempotent (replay → alreadyApplied) and audit is append-only", async () => {
    const id = await createAndApply();
    await route("POST", `/api/native/proposals/${id}/approve`);
    const w = pendingFirst("approve")!;
    const apply1 = await route("POST", `/api/native/proposals/writes/${w.id}/apply`);
    expect(apply1.status).toBe(200);
    const apply2 = await route("POST", `/api/native/proposals/writes/${w.id}/apply`);
    expect(apply2.status).toBe(200);
    expect((await apply2.json()).data.alreadyApplied).toBe(true);
    const auditBefore = listAudit(dir, T1).length;
    const replay3 = await route("POST", `/api/native/proposals/writes/${w.id}/apply`);
    expect(replay3.status).toBe(200); // no 500 on repeated replay
    expect(listAudit(dir, T1).length).toBe(auditBefore); // no duplicate apply audit
  });

  it("delete (gated) removes record + unregisters slug + caps", async () => {
    const id1 = await createAndApply();
    const id2 = await createAndApply({ title: "Second" });
    await route("POST", `/api/native/proposals/${id1}/open`);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`);
    const slug = getProposal(dir, T1, id1)!.shareSlug!;
    expect(countProposals(dir, T1)).toBe(2);
    const del = await route("DELETE", `/api/native/proposals/${id1}`);
    expect(del.status).toBe(202);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("delete")!.id}/apply`);
    expect(getProposal(dir, T1, id1)).toBeNull();
    expect(lookupShareTenant(dir, slug)).toBeNull();
    expect(countProposals(dir, T1)).toBe(1);
    expect(getProposal(dir, T1, id2)!.id).toBe(id2);
    expect(listAudit(dir, T1).some((a) => a.action === "native.proposal.delete")).toBe(true);
  });
});

describe("e-sign (Phase 2.2)", () => {
  const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  async function openForSign() {
    const id = await createAndApply();
    await route("POST", `/api/native/proposals/${id}/open`);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`);
    return { id, slug: getProposal(dir, T1, id)!.shareSlug! };
  }
  it("typed signature rides the client's approve card and lands on the record with audit + event", async () => {
    seedSubscription();
    const { id, slug } = await openForSign();
    const res = await share("POST", slug, { decision: "approve", signerName: "Jamie Doe", signature: { signerName: "Jamie Doe", signatureType: "typed", initials: "JD" } });
    expect(res.status).toBe(202);
    const ptw = pendingFirst("approve")!;
    expect(ptw.payload.signature).toBeTruthy();
    expect(ptw.payload.signature!.signerName).toBe("Jamie Doe");
    // Owner approves the card → signature recorded (proposal status untouched until apply).
    expect(getProposal(dir, T1, id)!.signatures.length).toBe(0);
    noteOwnerDecision(dir, T1, ptw.approvalActionId, "approved", T1);
    await tick();
    const p = getProposal(dir, T1, id)!;
    expect(p.status).toBe("approved");
    expect(p.signatures.length).toBe(1);
    const sg = p.signatures[0];
    expect(sg.signerName).toBe("Jamie Doe");
    expect(sg.signatureType).toBe("typed");
    expect(sg.initials).toBe("JD");
    expect(sg.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(listAudit(dir, T1).some((a) => a.action === "native.esign.signed" && a.detail.includes(sg.payloadHash))).toBe(true);
    const types = listDeliveries(dir, T1).map((d) => d.eventType);
    expect(types).toContain("native.esign.signed");
    expect(types).toContain("native.proposal.approved");
  });
  it("drawn signature (PNG) is stored + embedded in the regenerated final PDF", async () => {
    seedSubscription();
    const { id, slug } = await openForSign();
    const res = await share("POST", slug, { decision: "approve", signerName: "Drew Artist", signature: { signerName: "Drew Artist", signatureType: "drawn", drawnDataUrl: `data:image/png;base64,${PNG_1PX}` } });
    expect(res.status).toBe(202);
    noteOwnerDecision(dir, T1, pendingFirst("approve")!.approvalActionId, "approved", T1);
    const approved = getProposal(dir, T1, id)!;
    expect(approved.status).toBe("approved");
    expect(approved.signatures[0].drawnDataUrl).toBe(`data:image/png;base64,${PNG_1PX}`);
    // send → final PDF regenerated with the signature block embedded (add-only v2).
    await route("POST", `/api/native/proposals/${id}/send`);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("send")!.id}/apply`);
    const sent = getProposal(dir, T1, id)!;
    expect(sent.status).toBe("sent");
    const doc = getDoc(dir, T1, sent.docId!)!;
    expect(doc.version).toBe(2);
    expect(doc.textProjection).toContain("Drew Artist");
    expect(doc.textProjection).toContain("Handwritten signature captured");
    const bytes = readDocumentBytes(dir, T1, sent.docId!);
    expect(bytes!.byteLength).toBe(doc.sizeBytes);
    expect(proposalHtml(sent, { final: true })).toContain(`data:image/png;base64,${PNG_1PX}`);
  });
  it("fails closed on invalid signatures (400, never queued)", async () => {
    const { id, slug } = await openForSign();
    const cases: Record<string, unknown>[] = [
      { decision: "approve", signerName: "", signature: { signerName: "", signatureType: "typed", initials: "JD" } },
      { decision: "approve", signerName: "Jamie", signature: { signerName: "Jamie", signatureType: "typed", initials: "ABCDEFGHIJKLMNOPQ" } },
      { decision: "approve", signerName: "Jamie", signature: { signerName: "Jamie", signatureType: "typed", initials: "J<D" } },
      { decision: "approve", signerName: "Jamie", signature: { signerName: "Jamie", signatureType: "drawn", drawnDataUrl: "data:image/png;base64,AAAA" } },
      { decision: "approve", signerName: "Jamie", signature: { signerName: "Jamie", signatureType: "drawn", drawnDataUrl: "https://evil.test/sig.png" } },
      { decision: "approve", signerName: "Jamie", signature: { signerName: "Jamie", signatureType: "drawn", drawnDataUrl: `data:image/png;base64,${"A".repeat(200000)}` } },
      { decision: "reject", signerName: "Jamie", signature: { signerName: "Jamie", signatureType: "typed", initials: "JD" } },
    ];
    for (const body of cases) {
      const r = await share("POST", slug, body);
      expect(r.status).toBe(400);
    }
    expect(getProposal(dir, T1, id)!.status).toBe("pending");
  });
});
