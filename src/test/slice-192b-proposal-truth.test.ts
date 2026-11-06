/**
 * slice-192b-proposal-truth.test.ts — the proposals TRUTH LAYER, server side.
 *
 * THE FIVE DEFECTS (read at source before the fix):
 *   1. `src/native/dealroom/router.ts` `publicShareView` served the linked
 *      proposal's title / status / total with NO status filter, so an ACTIVE
 *      deal room printed a DRAFT quote's amount to the client — the exact state
 *      the proposals lane itself refuses to serve (no slug exists for a draft).
 *   2. `grep -i expire` over `src/**` returned nothing: the page printed
 *      "Valid for {validityDays} days" and the Accept form never closed, and
 *      "Issued" was `createdAt`, not the day the quote was opened.
 *   3. `proposals/gate.ts` allowed `update` while `pending` — exactly when the
 *      client holds the link.
 *   4. `ProposalOp` had no revoke, so `delete` (which destroys the record) was
 *      the only way to retire a link.
 *   5. `proposals/validate.ts` hashed `{signerName, signatureType, initials,
 *      drawnDataUrl}` — the SIGNATURE, not the proposal. The signed amount was
 *      bound to nothing.
 *
 * Every assertion here reads a value the code supplies (the server's own status
 * codes, the module's own predicate, the record's own hash) rather than
 * re-typing a copy of the rule.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getProposal,
  listProposals,
  listAudit,
  listPendingWrites,
  lookupShareTenant,
  applyProposalMutation,
} from "../native/proposals/store";
import {
  handleNativeProposalsAuthed,
  handleNativeProposalShare,
  registerBuiltinNativeProposalEventTypes,
} from "../native/proposals/router";
import {
  handleNativeDealRoomsAuthed,
  handleNativeDealRoomShare,
  registerBuiltinNativeDealRoomEventTypes,
} from "../native/dealroom/router";
import { getDealRoom, listDealRooms, listPendingWrites as listDealRoomPendingWrites } from "../native/dealroom/store";
// Namespace imports for the NEW symbols on purpose: this file must be runnable
// against the pre-fix code to prove each test fails there, and a missing named
// export would take the whole file down with it instead of one test.
import * as proposalTypes from "../native/proposals/types";
import * as proposalValidate from "../native/proposals/validate";
import { clearMailLane } from "./mail-lane-isolation";

const T1 = "tenant-192b@acme.test";
let dir: string;
let restoreMailLane: () => void;

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
  return handleNativeProposalsAuthed(authedReq(method, pathname, body), { userEmail: T1, dataDir: dir });
}
async function share(method: string, slug: string, body?: unknown) {
  return handleNativeProposalShare(authedReq(method, `/api/native/proposals/share/${slug}`, body), { dataDir: dir });
}
function pendingFirst(op: string) {
  return listPendingWrites(dir, T1).find((w) => w.status === "pending" && w.op === op) ?? null;
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
/** Create a proposal through the Approval Queue (202 → apply → 200). */
async function createAndApply(over: Record<string, unknown> = {}): Promise<string> {
  const created = await route("POST", "/api/native/proposals", validBody(over));
  expect(created.status).toBe(202);
  const applied = await route("POST", `/api/native/proposals/writes/${pendingFirst("create")!.id}/apply`);
  expect(applied.status).toBe(200);
  const list = listProposals(dir, T1);
  return list[list.length - 1].id;
}
/** Open a draft for client review (mints the slug, sets the real expiry). */
async function openAndApply(id: string) {
  expect((await route("POST", `/api/native/proposals/${id}/open`)).status).toBe(202);
  expect((await route("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`)).status).toBe(200);
  expect(getProposal(dir, T1, id)!.status).toBe("pending");
}

// ── deal-room helpers (the tenant's own lane) ───────────────────────────────
async function drRoute(method: string, pathname: string, body?: unknown) {
  return handleNativeDealRoomsAuthed(authedReq(method, pathname, body), { userEmail: T1, dataDir: dir });
}
function drShare(slug: string) {
  return handleNativeDealRoomShare(new Request(`http://native.test/api/native/dealroom/share/${slug}`, { method: "GET" }), { dataDir: dir });
}
function drPendingFirst(op: string) {
  return listDealRoomPendingWrites(dir, T1).find((w) => w.status === "pending" && w.op === op) ?? null;
}
/** Create a deal room for a linked proposal and return its id (always `draft`). */
async function createRoom(linkedProposalId: string, name: string): Promise<string> {
  const created = await drRoute("POST", "/api/native/dealroom", {
    name,
    customerName: "Acme Corp",
    customerEmail: "ops@acme.test",
    description: "Post-sale room",
    linkedProposalId,
  });
  expect(created.status).toBe(202);
  const applied = await drRoute("POST", `/api/native/dealroom/writes/${drPendingFirst("create")!.id}/apply`);
  expect(applied.status).toBe(200);
  const rooms = listDealRooms(dir, T1);
  return rooms[rooms.length - 1].id;
}
/** Publish a room (draft → active) through the gate. */
async function activate(id: string) {
  expect((await drRoute("POST", `/api/native/dealroom/${id}`, { status: "active" })).status).toBe(202);
  expect((await drRoute("POST", `/api/native/dealroom/writes/${drPendingFirst("update")!.id}/apply`)).status).toBe(200);
  expect(getDealRoom(dir, T1, id)!.status).toBe("active");
}

const DAY_MS = 86_400_000;

beforeEach(() => {
  restoreMailLane = clearMailLane();
  dir = mkdtempSync(join(tmpdir(), "slice-192b-proposal-"));
  registerBuiltinNativeProposalEventTypes();
  registerBuiltinNativeDealRoomEventTypes();
});
afterEach(() => {
  restoreMailLane();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("slice 192b-1 — proposals: the truth layer", () => {
  it("(a) a deal room linked to a DRAFT proposal serves no title, status or total; a PENDING one does", async () => {
    const draftId = await createAndApply({
      title: "Secret draft quote",
      lineItems: [{ description: "Secret work", qty: 1, unitPrice: 987654.32 }],
    });
    const pendingId = await createAndApply({
      title: "Published quote",
      lineItems: [{ description: "Published work", qty: 1, unitPrice: 1234.56 }],
    });
    await openAndApply(pendingId);

    // The rule is the proposals module's own, and it says one of these two is
    // publishable and the other is not.
    expect(proposalTypes.isProposalPubliclyShareable(getProposal(dir, T1, draftId)!.status)).toBe(false);
    expect(proposalTypes.isProposalPubliclyShareable(getProposal(dir, T1, pendingId)!.status)).toBe(true);

    const draftRoom = await createRoom(draftId, "Quote-linked room one");
    const pendingRoom = await createRoom(pendingId, "Quote-linked room two");
    await activate(draftRoom);
    await activate(pendingRoom);

    // POSITIVE CONTROL — the same lane, the same code path, serves a published quote.
    const okRes = await drShare(getDealRoom(dir, T1, pendingRoom)!.shareSlug!);
    expect(okRes.status).toBe(200);
    const okBody = (await okRes.json()) as { data: { proposal: { title: string; status: string; total: string } | null } };
    expect(okBody.data.proposal).not.toBeNull();
    expect(okBody.data.proposal!.title).toBe("Published quote");
    expect(okBody.data.proposal!.status).toBe("pending");
    expect(okBody.data.proposal!.total).toBe("USD 1234.56");

    // The room itself is published (200) — the QUOTE inside it is not.
    const draftRes = await drShare(getDealRoom(dir, T1, draftRoom)!.shareSlug!);
    expect(draftRes.status).toBe(200);
    const body = (await draftRes.json()) as { data: Record<string, unknown> };
    expect(body.data.proposal).toBeNull();
    // Nothing of the draft reaches the client, in any form.
    const raw = JSON.stringify(body.data);
    expect(raw).not.toContain("Secret draft quote");
    expect(raw).not.toContain("Secret work");
    expect(raw).not.toContain("987654");
  });

  it("(b) a proposal past its expiry has no signable state, and its decision POST answers 409 and applies nothing", async () => {
    const id = await createAndApply();
    await openAndApply(id);
    const opened = getProposal(dir, T1, id)!;

    // `open` computed a REAL expiry from validityDays — not a printed constant.
    expect(typeof opened.issuedAt).toBe("string");
    expect(typeof opened.expiresAt).toBe("string");
    expect(Date.parse(opened.expiresAt!)).toBe(Date.parse(opened.issuedAt!) + 30 * DAY_MS);

    const slug = opened.shareSlug!;
    const freshRes = await share("GET", slug);
    expect(freshRes.status).toBe(200);
    const fresh = (await freshRes.json()) as { data: Record<string, unknown> };
    expect(fresh.data.expired).toBe(false);
    expect(fresh.data.signable).toBe(true);
    expect(fresh.data.expiresAt).toBe(opened.expiresAt);
    // "Issued" is the day the quote was OPENED, not the day the row was created.
    expect(fresh.data.issuedAt).toBe(opened.issuedAt);
    expect(fresh.data.issuedAtSource).toBe("opened");

    // Time passes. The record's own expiry is moved into the past by the same
    // writer the gate uses — no hand-edited JSON, no fake clock.
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(applyProposalMutation(dir, T1, id, {}, null, "test-clock", { expiresAt: past })).not.toBeNull();

    const res = await share("GET", slug);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data.expired).toBe(true);
    expect(body.data.signable).toBe(false);
    expect(body.data.expiresAt).toBe(past);

    const queuedBefore = listPendingWrites(dir, T1).length;
    const post = await share("POST", slug, {
      decision: "approve",
      signerName: "Late Signer",
      signature: { signerName: "Late Signer", signatureType: "typed", initials: "LS" },
    });
    expect(post.status).toBe(409);
    const postBody = (await post.json()) as Record<string, unknown>;
    expect(postBody.reason).toBe("expired");
    expect(typeof postBody.error).toBe("string");
    // Nothing was queued, nothing was signed, the record is untouched.
    expect(listPendingWrites(dir, T1).length).toBe(queuedBefore);
    expect(getProposal(dir, T1, id)!.status).toBe("pending");
    expect(getProposal(dir, T1, id)!.signatures.length).toBe(0);
  });

  it("(c) update is refused while the client holds the link (and still allowed on a draft)", async () => {
    const id = await createAndApply();
    await openAndApply(id);
    const before = getProposal(dir, T1, id)!;
    const queuedBefore = listPendingWrites(dir, T1).length;

    const res = await route("POST", `/api/native/proposals/${id}`, {
      lineItems: [{ description: "Sneaky swap", qty: 1, unitPrice: 1 }],
    });
    expect(res.status).toBe(400);
    // Refused BEFORE the gate: no approval card, no pending write, no change.
    expect(listPendingWrites(dir, T1).length).toBe(queuedBefore);
    const after = getProposal(dir, T1, id)!;
    expect(after.lineItems[0].unitPrice).toBe(before.lineItems[0].unitPrice);
    expect(after.version).toBe(before.version);

    // Positive control: a draft is still editable — the lock is about the link.
    const draftId = await createAndApply({ title: "Editable draft" });
    expect((await route("POST", `/api/native/proposals/${draftId}`, { title: "Edited draft" })).status).toBe(202);
  });

  it("(d) revokeShare mints a fresh slug through the queue and the OLD link stops resolving", async () => {
    const id = await createAndApply();
    await openAndApply(id);
    const oldSlug = getProposal(dir, T1, id)!.shareSlug!;
    expect((await share("GET", oldSlug)).status).toBe(200);

    // Gated write: the first POST queues, nothing changes until it is applied.
    const queued = await route("POST", `/api/native/proposals/${id}/share/revoke`);
    expect(queued.status).toBe(202);
    expect(getProposal(dir, T1, id)!.shareSlug).toBe(oldSlug); // untouched until approved
    const applied = await route("POST", `/api/native/proposals/writes/${pendingFirst("revokeShare")!.id}/apply`);
    expect(applied.status).toBe(200);

    const after = getProposal(dir, T1, id)!;
    expect(after.shareSlug).not.toBe(oldSlug); // a fresh slug was minted
    expect(after.status).toBe("pending"); // revoking the link is not a status change
    // The old link is dead: the slug index no longer knows it at all.
    expect(lookupShareTenant(dir, oldSlug)).toBeNull();
    expect((await share("GET", oldSlug)).status).toBe(404);
    // The new link works, because the quote is still open for review.
    expect((await share("GET", after.shareSlug!)).status).toBe(200);
    expect(listAudit(dir, T1).some((a) => a.action === "native.proposal.shareRevoked")).toBe(true);
  });

  it("(e) the signature binds the CONTENT it was signed against, not just the signature", async () => {
    const signature = { signerName: "Sam Signer", signatureType: "typed" as const, initials: "SS" };
    // Identical line-item words, different amount — and identical signer fields.
    const a = await createAndApply({ title: "Quote A", lineItems: [{ description: "Automation build", qty: 1, unitPrice: 1000 }] });
    const b = await createAndApply({ title: "Quote B", lineItems: [{ description: "Automation build", qty: 1, unitPrice: 2000 }] });
    await openAndApply(a);
    await openAndApply(b);

    expect((await share("POST", getProposal(dir, T1, a)!.shareSlug!, { decision: "approve", signerName: "Sam Signer", signature })).status).toBe(202);
    expect((await share("POST", getProposal(dir, T1, b)!.shareSlug!, { decision: "approve", signerName: "Sam Signer", signature })).status).toBe(202);

    const cardA = listPendingWrites(dir, T1).find((w) => w.status === "pending" && w.op === "approve" && w.proposalId === a)!;
    const cardB = listPendingWrites(dir, T1).find((w) => w.status === "pending" && w.op === "approve" && w.proposalId === b)!;
    expect((await route("POST", `/api/native/proposals/writes/${cardA.id}/apply`)).status).toBe(200);
    expect((await route("POST", `/api/native/proposals/writes/${cardB.id}/apply`)).status).toBe(200);

    const pa = getProposal(dir, T1, a)!;
    const pb = getProposal(dir, T1, b)!;
    expect(pa.status).toBe("approved");
    expect(pb.status).toBe("approved");
    const sa = pa.signatures[0];
    const sb = pb.signatures[0];
    // Same signer, same words, different signed amount ⇒ different fingerprint.
    expect(sa.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sa.payloadHash).not.toBe(sb.payloadHash);
    // Both audit entries carry the hash AND the version that was signed.
    expect(listAudit(dir, T1).some((e) => e.action === "native.esign.signed" && e.detail.includes(sa.payloadHash) && e.detail.includes(`version ${sa.signedVersion}`))).toBe(true);

    // POSITIVE CONTROL — right after signing, the hash still matches the record.
    const contentA = proposalValidate.proposalSignedContent(pa);
    expect(proposalValidate.signatureMatchesContent(sa, contentA)).toBe(true);

    // A line item changes AFTER the signature: the record no longer matches.
    const tampered = applyProposalMutation(dir, T1, a, { lineItems: [{ description: "Automation build", qty: 1, unitPrice: 50_000 }] }, null, "post-signature-edit")!;
    expect(tampered.version).toBeGreaterThan(sa.signedVersion);
    expect(proposalValidate.signatureMatchesContent(sa, proposalValidate.proposalSignedContent(tampered))).toBe(false);
    // …and the stored hash is unchanged, so the change is provable rather than invisible.
    expect(tampered.signatures[0].payloadHash).toBe(sa.payloadHash);
  });
});
