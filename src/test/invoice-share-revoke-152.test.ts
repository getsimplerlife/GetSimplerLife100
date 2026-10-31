/**
 * invoice-share-revoke-152.test.ts — GUARD TESTS for slice 152: a SENT
 * invoice's public share link can finally be taken back.
 *
 * The failure this locks down is real and was open in the product: the public
 * slug was minted at send time and unregistered ONLY on invoice delete, but
 * `sent` is terminal (no delete) — so once an invoice was emailed, its link
 * could never be killed. Wrong recipient, forwarded link, or simply wanting a
 * fresh URL had no answer.
 *
 * The rules these tests hold, each a real failure mode rather than a style
 * preference:
 *   (a) REVOKE kills the public URL from the very next request, while another
 *       invoice's link keeps serving — one slug, never a sweep.
 *   (b) The RECORD survives: status stays `sent`, amounts/line items unchanged,
 *       `shareSlug` becomes null and `shareRevokedAt` is stamped. Revoke is not
 *       a delete and never resurrects an invoice.
 *   (c) ROTATE kills the old URL and issues a working new one for the same
 *       invoice.
 *   (d) The AUDIT is immutable, names who and when, and carries NO slug value —
 *       the link is a bearer credential, so writing it into an append-only log
 *       would be a credential leak with a long tail.
 *   (e) Both actions are WRITES: they ride the Approval Queue (202 + pending
 *       write + approval card), are classified as writes by isWriteAction (a
 *       verb-last or unclassified name would BYPASS the gate — fail-open), and
 *       replay idempotently (second apply → alreadyApplied, never an error).
 *   (f) A foreign/unknown invoice is 404 for both — no IDOR.
 *   (g) HONESTY: revoking our page does not cancel a Stripe Checkout Session a
 *       customer already opened. The response says so in words; a silent
 *       "revoked" would be a half-truth about money.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  insertInvoice,
  registerInvoiceSlug,
  getInvoice,
  listInvoices,
  listPendingWrites,
  listAudit,
  lookupInvoiceShareTenant,
} from "../native/invoice/store";
import { handleNativeInvoicesAuthed, handleNativeInvoiceShare, registerBuiltinNativeInvoiceEventTypes } from "../native/invoice/router";
import { listTenantActions, isWriteAction } from "../lib/approval-queue";
import { setAutonomyWorkflow } from "../lib/autonomy";
import { NATIVE_INVOICES_AUDIT_KEY, type InvoiceRecord, type InvoiceStatus } from "../native/invoice/types";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";

let dir: string;
let seq = 0;

function req(method: string, pathname: string): Request {
  return new Request(`http://native.test${pathname}`, { method });
}
function authed(method: string, pathname: string, tenantId = T1) {
  return handleNativeInvoicesAuthed(req(method, pathname), { userEmail: tenantId, dataDir: dir });
}
function publicLane(method: string, slug: string) {
  return handleNativeInvoiceShare(req(method, `/api/native/invoice/share/${slug}`), { dataDir: dir });
}

/** Seed one invoice in a given status; register its slug when it has one. */
function seedInvoice(tenantId: string, slug: string | null, status: InvoiceStatus = "sent"): InvoiceRecord {
  seq += 1;
  const now = new Date().toISOString();
  const record: InvoiceRecord = {
    id: `inv_seed152${String(seq).padStart(4, "0")}`,
    tenantId,
    invoiceNumber: `INV-000${seq}`,
    linkedDealRoomId: "dea_seedroom1520",
    currency: "USD",
    lineItems: [{ id: "li_1", description: "Onboarding retainer", qty: 1, unitPriceCents: 250000 }],
    amountDueCents: 250000,
    status,
    docId: null,
    customerEmail: "client@acme.test",
    dueDate: "2026-11-28",
    shareSlug: slug,
    lastAttempt: null,
    version: 2,
    createdAt: now,
    createdBy: tenantId,
    updatedAt: now,
    updatedBy: tenantId,
    ...(status === "sent" ? { sentAt: now, sentBy: tenantId } : {}),
  };
  insertInvoice(dir, record);
  if (slug) registerInvoiceSlug(dir, slug, tenantId);
  return record;
}

/** Every audit line this box has ever written, as raw text. */
function auditRaw(): string {
  try {
    return readFileSync(join(dir, NATIVE_INVOICES_AUDIT_KEY), "utf8");
  } catch {
    return "";
  }
}

/** Approve-path: submit, then apply the pending write it queued. */
async function revokeViaApproval(invoiceId: string): Promise<Response> {
  const queued = await authed("POST", `/api/native/invoice/${invoiceId}/share/revoke`);
  expect(queued.status).toBe(202);
  const { data } = (await queued.json()) as { data: { approvalActionId: string } };
  const ptw = listPendingWrites(dir, T1).find((w) => w.approvalActionId === data.approvalActionId);
  expect(ptw).toBeTruthy();
  const applied = await authed("POST", `/api/native/invoice/writes/${ptw!.id}/apply`);
  expect(applied.status).toBe(200);
  return applied;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "invoice-share-152-"));
  registerBuiltinNativeInvoiceEventTypes();
});
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("(a) revoke kills one public link, immediately and only that one", () => {
  it("revoked slug 404s on the very next request while a different invoice's link still serves", async () => {
    const doomed = seedInvoice(T1, "si_doomed0001");
    const kept = seedInvoice(T1, "si_keep0001");

    // Both links serve before the revoke.
    expect((await publicLane("GET", "si_doomed0001")).status).toBe(200);
    expect((await publicLane("GET", "si_keep0001")).status).toBe(200);

    await revokeViaApproval(doomed.id);

    // The old URL is dead for everyone, and the body carries no invoice data.
    const dead = await publicLane("GET", "si_doomed0001");
    expect(dead.status).toBe(404);
    expect(((await dead.json()) as { data?: unknown }).data).toBeUndefined();

    // The OTHER invoice is untouched — one slug retired, never a sweep.
    const alive = await publicLane("GET", "si_keep0001");
    expect(alive.status).toBe(200);
    expect(((await alive.json()) as { data: { invoiceNumber: string } }).data.invoiceNumber).toBe(kept.invoiceNumber);

    // The slug index entry is gone, and the customer page cannot reach the pay lane either.
    expect(lookupInvoiceShareTenant(dir, "si_doomed0001")).toBeNull();
    expect((await publicLane("POST", "si_doomed0001")).status).toBe(404);
  });

  it("keeps the invoice record intact: still `sent`, same money, no slug, revocation stamped", async () => {
    const inv = seedInvoice(T1, "si_intact0001");
    const before = listInvoices(dir, T1).length;
    await revokeViaApproval(inv.id);

    const after = getInvoice(dir, T1, inv.id);
    expect(after).not.toBeNull();
    expect(after!.status).toBe("sent"); // `sent` stays terminal — revoke is not a status change
    expect(after!.invoiceNumber).toBe(inv.invoiceNumber);
    expect(after!.amountDueCents).toBe(250000);
    expect(after!.lineItems).toEqual(inv.lineItems);
    expect(after!.shareSlug).toBeNull(); // the record no longer carries the old link
    expect(typeof after!.shareRevokedAt).toBe("string");
    expect(Number.isNaN(Date.parse(after!.shareRevokedAt!))).toBe(false);
    expect(after!.version).toBe(inv.version + 1);
    // Nothing was deleted — a legal record is never removed by this action.
    expect(listInvoices(dir, T1).length).toBe(before);
  });
});

describe("(b) rotate: the old link dies, a fresh working link replaces it", () => {
  it("returns a new URL that serves the same invoice and 404s the previous one", async () => {
    const inv = seedInvoice(T1, "si_oldlink0001");
    const queued = await authed("POST", `/api/native/invoice/${inv.id}/share/rotate`);
    expect(queued.status).toBe(202);
    const { data: q } = (await queued.json()) as { data: { approvalActionId: string } };
    const ptw = listPendingWrites(dir, T1).find((w) => w.approvalActionId === q.approvalActionId)!;
    const applied = await authed("POST", `/api/native/invoice/writes/${ptw.id}/apply`);
    expect(applied.status).toBe(200);
    const { data } = (await applied.json()) as { data: { shareUrl: string; invoiceStatus: string } };

    expect(data.invoiceStatus).toBe("sent");
    expect(typeof data.shareUrl).toBe("string");
    const fresh = data.shareUrl.split("/").pop()!;
    expect(fresh).toMatch(/^si_[A-Za-z0-9_-]+$/);
    expect(fresh).not.toBe("si_oldlink0001");

    // Old link dead, new link serves the SAME invoice.
    expect((await publicLane("GET", "si_oldlink0001")).status).toBe(404);
    const served = await publicLane("GET", fresh);
    expect(served.status).toBe(200);
    expect(((await served.json()) as { data: { invoiceNumber: string } }).data.invoiceNumber).toBe(inv.invoiceNumber);

    // Exactly one live slug for the invoice, and the index points at this tenant.
    expect(getInvoice(dir, T1, inv.id)!.shareSlug).toBe(fresh);
    expect(lookupInvoiceShareTenant(dir, fresh)).toBe(T1);
    expect(lookupInvoiceShareTenant(dir, "si_oldlink0001")).toBeNull();
  });

  it("refuses to mint a link for an invoice that was never sent (400, nothing public)", async () => {
    const draft = seedInvoice(T1, null, "draft");
    const res = await authed("POST", `/api/native/invoice/${draft.id}/share/rotate`);
    expect(res.status).toBe(400);
    expect(getInvoice(dir, T1, draft.id)!.shareSlug).toBeNull();
    expect(listPendingWrites(dir, T1).filter((w) => w.op === "rotateShare").length).toBe(0);
  });
});

describe("(c) the audit trail is immutable, attributable and slug-free", () => {
  it("records who and when for revoke and rotate, and never writes a link value", async () => {
    const revoked = seedInvoice(T1, "si_audited0001");
    await revokeViaApproval(revoked.id);

    const rotated = seedInvoice(T1, "si_audited0002");
    const queued = await authed("POST", `/api/native/invoice/${rotated.id}/share/rotate`);
    const { data: q } = (await queued.json()) as { data: { approvalActionId: string } };
    const ptw = listPendingWrites(dir, T1).find((w) => w.approvalActionId === q.approvalActionId)!;
    await authed("POST", `/api/native/invoice/writes/${ptw.id}/apply`);
    const newSlug = getInvoice(dir, T1, rotated.id)!.shareSlug!;

    const entries = listAudit(dir, T1);
    const revokeEntry = entries.find((e) => e.action === "native.invoice.shareRevoked")!;
    expect(revokeEntry).toBeTruthy();
    expect(revokeEntry.actor).toBe(T1); // who
    expect(Number.isNaN(Date.parse(revokeEntry.ts))).toBe(false); // when
    expect(revokeEntry.invoiceId).toBe(revoked.id);

    const rotateEntry = entries.find((e) => e.action === "native.invoice.shareRotated")!;
    expect(rotateEntry).toBeTruthy();
    expect(rotateEntry.actor).toBe(T1);
    expect(rotateEntry.invoiceId).toBe(rotated.id);

    // The link is a BEARER credential: no slug value may reach the audit file —
    // not the retired one, not the freshly issued one.
    const raw = auditRaw();
    expect(raw).not.toContain("si_audited0001");
    expect(raw).not.toContain("si_audited0002");
    expect(raw).not.toContain(newSlug);
  });
});

describe("(d) both actions are WRITES that ride the Approval Queue", () => {
  it("isWriteAction classifies them as writes (an unclassified verb would fail OPEN)", () => {
    expect(isWriteAction("revokeInvoiceShare")).toBe(true);
    expect(isWriteAction("rotateInvoiceShare")).toBe(true);
  });

  it("queues a pending write + approval card, leaves the link live until approved, and replays idempotently", async () => {
    const inv = seedInvoice(T1, "si_gated0001");
    const first = await authed("POST", `/api/native/invoice/${inv.id}/share/revoke`);
    expect(first.status).toBe(202);
    const { data: d1 } = (await first.json()) as { data: { status: string; approvalActionId: string } };
    expect(d1.status).toBe("pending");
    expect(d1.approvalActionId).toBeTruthy();

    // The durable mirror looks like every other invoice write.
    const pending = listPendingWrites(dir, T1).filter((w) => w.status === "pending");
    expect(pending.length).toBe(1);
    expect(pending[0].op).toBe("revokeShare");
    expect(pending[0].invoiceId).toBe(inv.id);
    expect(listTenantActions(T1, dir).some((a) => a.actionType === "revokeInvoiceShare")).toBe(true);

    // Nothing has happened yet: the link still serves while it waits for approval.
    expect((await publicLane("GET", "si_gated0001")).status).toBe(200);

    // A second identical request reuses the same card (no pile-up).
    const again = await authed("POST", `/api/native/invoice/${inv.id}/share/revoke`);
    expect(again.status).toBe(202);
    const { data: d2 } = (await again.json()) as { data: { approvalActionId: string } };
    expect(d2.approvalActionId).toBe(d1.approvalActionId);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(1);

    // Apply, then replay the SAME approval: applied → alreadyApplied, never an error.
    const applied = await authed("POST", `/api/native/invoice/writes/${pending[0].id}/apply`);
    expect(applied.status).toBe(200);
    expect(((await applied.json()) as { data: { status: string } }).data.status).toBe("applied");
    expect((await publicLane("GET", "si_gated0001")).status).toBe(404);

    const replay = await authed("POST", `/api/native/invoice/writes/${pending[0].id}/apply`);
    expect(replay.status).toBe(200);
    const { data: r } = (await replay.json()) as { data: { status: string; alreadyApplied: boolean } };
    expect(r.alreadyApplied).toBe(true);
    expect(r.status).toBe("alreadyApplied");
  });

  it("applies idempotently when the write auto-applies (revoke twice is a no-op, not an error)", async () => {
    const inv = seedInvoice(T1, "si_twice0001");
    setAutonomyWorkflow(T1, "native-invoices", { enabled: true, allowList: [{ id: "al-152-1", action: "revokeInvoiceShare" }] }, dir);

    const first = await authed("POST", `/api/native/invoice/${inv.id}/share/revoke`);
    expect(first.status).toBe(200);
    const { data } = (await first.json()) as { data: { status: string; shareRevoked: boolean } };
    expect(data.status).toBe("applied");
    expect(data.shareRevoked).toBe(true);
    const versionAfterFirst = getInvoice(dir, T1, inv.id)!.version;

    // Second revoke: there is no live link left. Success, no mutation, no throw.
    const second = await authed("POST", `/api/native/invoice/${inv.id}/share/revoke`);
    expect(second.status).toBe(200);
    expect(getInvoice(dir, T1, inv.id)!.version).toBe(versionAfterFirst);
    expect(getInvoice(dir, T1, inv.id)!.shareSlug).toBeNull();
  });
});

describe("(e) fail-closed: foreign and unknown invoices are 404 for both actions", () => {
  it("another tenant cannot revoke or rotate this tenant's link, and the link keeps working", async () => {
    const inv = seedInvoice(T1, "si_foreign0001");
    expect((await authed("POST", `/api/native/invoice/${inv.id}/share/revoke`, T2)).status).toBe(404);
    expect((await authed("POST", `/api/native/invoice/${inv.id}/share/rotate`, T2)).status).toBe(404);
    expect((await publicLane("GET", "si_foreign0001")).status).toBe(200);
    expect(getInvoice(dir, T1, inv.id)!.shareSlug).toBe("si_foreign0001");
    // Nothing was queued for the stranger either.
    expect(listPendingWrites(dir, T2).length).toBe(0);
  });

  it("unknown ids and unknown verbs 404 (no guessed routes)", async () => {
    expect((await authed("POST", "/api/native/invoice/inv_doesnotexist/share/revoke")).status).toBe(404);
    expect((await authed("POST", "/api/native/invoice/inv_doesnotexist/share/rotate")).status).toBe(404);
    const inv = seedInvoice(T1, "si_verbs0001");
    expect((await authed("POST", `/api/native/invoice/${inv.id}/share/nuke`)).status).toBe(404);
    // The share verbs are POST-only.
    expect((await authed("GET", `/api/native/invoice/${inv.id}/share/revoke`)).status).toBe(405);
    expect((await publicLane("GET", "si_verbs0001")).status).toBe(200);
  });
});

describe("(f) honesty: the already-opened payment page is not claimed to be cancelled", () => {
  it("revoke says the link is dead AND that a checkout session may still be payable", async () => {
    const inv = seedInvoice(T1, "si_honest0001");
    const applied = await revokeViaApproval(inv.id);
    const { data } = (await applied.json()) as {
      data: { publicLinkDead: boolean; checkoutSessionMayStillBePayable: boolean; notice: string };
    };
    expect(data.publicLinkDead).toBe(true);
    expect(data.checkoutSessionMayStillBePayable).toBe(true);
    expect(data.notice).toMatch(/may still be payable/i);
    expect(data.notice).toMatch(/Stripe/);
    // The same caveat is on the permanent record, not just the HTTP response.
    const entry = listAudit(dir, T1).find((e) => e.action === "native.invoice.shareRevoked")!;
    expect(entry.detail).toMatch(/may still be payable/i);
  });

  it("rotate says the previous link is dead and repeats the payment caveat", async () => {
    const inv = seedInvoice(T1, "si_honest0002");
    setAutonomyWorkflow(T1, "native-invoices", { enabled: true, allowList: [{ id: "al-152-2", action: "rotateInvoiceShare" }] }, dir);
    const res = await authed("POST", `/api/native/invoice/${inv.id}/share/rotate`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: { previousLinkDead: boolean; checkoutSessionMayStillBePayable: boolean; notice: string };
    };
    expect(data.previousLinkDead).toBe(true);
    expect(data.checkoutSessionMayStillBePayable).toBe(true);
    expect(data.notice).toMatch(/may still be payable/i);
  });
});
