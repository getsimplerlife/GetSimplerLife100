/**
 * native-invoice-delivery.test.ts — GUARD TESTS for the invoice LAST MILE.
 *
 * The bug these tests lock down: `send` used to write status "sent" while
 * nothing was dispatched. The rules now:
 *   (a) `send` NEVER yields "sent" without a provider acknowledgement,
 *   (b) an unconfigured email lane yields a truthful non-sent state and does
 *       not dispatch at all,
 *   (c) the public signed-slug route: unknown/foreign/never-sent → 404, and it
 *       only ever renders the ONE invoice behind the slug,
 *   (d) malformed/absent customerEmail → 400 BEFORE any gating,
 *   (e) every transition writes its immutable audit line + typed event,
 *   (f) every CUSTOMER-facing surface (public view, PDF, email) carries a human
 *       DISPLAY NAME only — never the tenant id, never an entity id. Security
 *       finding (1) of the PR #317 review: the public view used to publish
 *       `issuerName: inv.tenantId`, i.e. the workspace's account identifier.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listInvoices,
  getInvoice,
  listPendingWrites,
  listAudit,
  insertInvoice,
} from "../native/invoice/store";
import { handleNativeInvoicesAuthed, handleNativeInvoiceShare, registerBuiltinNativeInvoiceEventTypes } from "../native/invoice/router";
import { resolveIssuerDisplayName, NEUTRAL_ISSUER_LABEL } from "../native/invoice/issuer";
import { getDoc } from "../native/documents/store";
import { writeJSON } from "../lib/data-store";
import { tenantSettingsPath } from "../lib/tenant-settings";
import { insertProposal } from "../native/proposals/store";
import { insertChecklist } from "../native/checklists/store";
import { setNativeEventObserver } from "../native/webhooks/outbound";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
let events: string[];

function req(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET" || method === "DELETE") return new Request(url, { method });
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}
function route(method: string, pathname: string, body?: unknown, tenantId = T1) {
  return handleNativeInvoicesAuthed(req(method, pathname, body), { userEmail: tenantId, dataDir: dir });
}
function publicRoute(pathname: string, method = "GET") {
  return handleNativeInvoiceShare(new Request(`http://native.test${pathname}`, { method }), { dataDir: dir });
}
function pendingFirst(op: string, tenantId = T1) {
  return listPendingWrites(dir, tenantId).find((w) => w.status === "pending" && w.op === op) ?? null;
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
    items: [{ id: "cli_a", title: "Kickoff", status: "todo" }],
    status: "open",
    progress: { done: 0, total: 1 },
    version: 1,
    createdAt: now,
    createdBy: tenantId,
    updatedAt: now,
    updatedBy: tenantId,
  });
}

async function createDealRoom(tenantId = T1, customerEmail = "ops@acme.test"): Promise<string> {
  const { handleNativeDealRoomsAuthed } = await import("../native/dealroom/router");
  const { listDealRooms, listPendingWrites: listDrWrites } = await import("../native/dealroom/store");
  const created = await handleNativeDealRoomsAuthed(
    new Request(`http://native.test/api/native/dealroom`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Acme onboarding deal",
        customerName: "Acme Corp",
        customerEmail,
        description: "Post-sale onboarding room",
        linkedProposalId: "prop_seedproposal0001",
        linkedChecklistId: "chk_seedchecklist0001",
      }),
    }),
    { userEmail: tenantId, dataDir: dir },
  );
  expect(created.status).toBe(202);
  const ptw = listDrWrites(dir, tenantId).find((w) => w.status === "pending" && w.op === "create")!;
  await handleNativeDealRoomsAuthed(
    new Request(`http://native.test/api/native/dealroom/writes/${ptw.id}/apply`, { method: "POST" }),
    { userEmail: tenantId, dataDir: dir },
  );
  const rooms = listDealRooms(dir, tenantId);
  return rooms[rooms.length - 1].id;
}

/** Create + apply an invoice through the gate; returns its id. */
async function createInvoice(dealRoomId: string, tenantId = T1): Promise<string> {
  const created = await route("POST", "/api/native/invoice", { linkedDealRoomId: dealRoomId }, tenantId);
  expect(created.status).toBe(202);
  const ptw = pendingFirst("create", tenantId)!;
  const applied = await route("POST", `/api/native/invoice/writes/${ptw.id}/apply`, undefined, tenantId);
  expect(applied.status).toBe(200);
  const list = listInvoices(dir, tenantId);
  return list[list.length - 1].id;
}

/** Run a gated send end to end (202 → apply). */
async function sendInvoice(id: string, body?: unknown, tenantId = T1) {
  const asked = await route("POST", `/api/native/invoice/${id}/send`, body, tenantId);
  if (asked.status !== 202) return { asked, applied: null as Response | null };
  const ptw = pendingFirst("send", tenantId)!;
  const applied = await route("POST", `/api/native/invoice/writes/${ptw.id}/apply`, undefined, tenantId);
  return { asked, applied };
}

const ACK_202 = () =>
  ({
    status: 202,
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === "x-message-id" ? "sg-test-msg-1" : null) },
    text: async () => "",
  }) as unknown as Response;
const REJECT_500 = () =>
  ({
    status: 500,
    ok: false,
    headers: { get: () => null },
    text: async () => "invalid api key",
  }) as unknown as Response;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-invoice-delivery-"));
  seedRefs(T1);
  seedRefs(T2);
  events = [];
  registerBuiltinNativeInvoiceEventTypes();
  setNativeEventObserver((e: { eventType: string }) => {
    events.push(e.eventType);
  });
});

afterEach(() => {
  setNativeEventObserver(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("(a) delivery truthfulness — never 'sent' without a provider ack", () => {
  it("provider rejects (HTTP 500) → status failed, error stored, no sent claim, public link 404", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    const fetchMock = vi.fn(async () => REJECT_500());
    vi.stubGlobal("fetch", fetchMock);
    const dealRoomId = await createDealRoom();
    const id = await createInvoice(dealRoomId);

    const { asked, applied } = await sendInvoice(id);
    expect(asked.status).toBe(202);
    expect(applied!.status).toBe(200);

    const inv = getInvoice(dir, T1, id)!;
    expect(inv.status).toBe("failed"); // NOT sent
    expect(inv.sentAt).toBeUndefined();
    expect(inv.lastAttempt?.outcome).toBe("failed");
    expect(inv.lastAttempt?.channel).toBe("sendgrid");
    expect(inv.lastAttempt?.error).toContain("SendGrid HTTP 500");
    expect(inv.lastAttempt?.at).toBeTruthy();
    // The attempt really was made against the lane.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("api.sendgrid.com");
    // Audit says exactly what happened; nothing claims a send.
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.queued")).toBe(true);
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.failed")).toBe(true);
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.sent")).toBe(false);
    // A failed invoice is never public.
    expect(inv.shareSlug).toBeTruthy();
    expect((await publicRoute(`/api/native/invoice/share/${inv.shareSlug}`)).status).toBe(404);
  });

  it("provider acknowledges (HTTP 202) → status sent, messageId stored, invoice is terminal", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SITE_ORIGIN", "https://invoices.example.test");
    const fetchMock = vi.fn(async () => ACK_202());
    vi.stubGlobal("fetch", fetchMock);
    const dealRoomId = await createDealRoom();
    const id = await createInvoice(dealRoomId);

    const { applied } = await sendInvoice(id);
    expect(applied!.status).toBe(200);

    const inv = getInvoice(dir, T1, id)!;
    expect(inv.status).toBe("sent");
    expect(inv.sentAt).toBeTruthy();
    expect(inv.sentBy).toBe(T1);
    expect(inv.lastAttempt?.outcome).toBe("sent");
    expect(inv.lastAttempt?.messageId).toBe("sg-test-msg-1");
    expect(inv.shareSlug).toMatch(/^si_/);
    // The message went to the CUSTOMER with a link to the invoice (no payment link).
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    const payload = JSON.parse(init.body) as {
      personalizations: { to: { email: string }[] }[];
      subject: string;
      content: { value: string }[];
    };
    expect(payload.personalizations[0].to[0].email).toBe("ops@acme.test");
    expect(payload.subject).toContain("INV-0001");
    const bodyText = payload.content.map((c) => c.value).join("\n");
    expect(bodyText).toContain(`https://invoices.example.test/invoices/share/${inv.shareSlug}`);
    expect(bodyText).not.toMatch(/stripe\.com|pay now|Pay invoice/i); // no payment rail
    // Terminal: no regenerate, no re-send, no delete.
    expect((await route("POST", `/api/native/invoice/${id}/generate`)).status).toBe(400);
    expect((await route("POST", `/api/native/invoice/${id}/send`)).status).toBe(400);
    expect((await route("DELETE", `/api/native/invoice/${id}`)).status).toBe(400);
  });
});

describe("(b) unconfigured lane — truthful non-sent state, nothing dispatched", () => {
  it("no SENDGRID_API_KEY and no SMTP → failed/unconfigured, zero fetch calls", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "");
    const fetchMock = vi.fn(async () => ACK_202());
    vi.stubGlobal("fetch", fetchMock);
    const dealRoomId = await createDealRoom();
    const id = await createInvoice(dealRoomId);

    await sendInvoice(id);

    const inv = getInvoice(dir, T1, id)!;
    expect(inv.status).toBe("failed");
    expect(inv.sentAt).toBeUndefined();
    expect(inv.lastAttempt?.outcome).toBe("unconfigured");
    expect(inv.lastAttempt?.channel).toBe("none");
    expect(inv.lastAttempt?.error).toMatch(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled(); // no lane → no dispatch at all
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.failed")).toBe(true);
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.sent")).toBe(false);
    expect((await publicRoute(`/api/native/invoice/share/${inv.shareSlug}`)).status).toBe(404);
  });
});

describe("(c) public signed-slug route", () => {
  it("unknown / malformed / never-sent slugs → 404; a sent invoice renders read-only, one invoice only", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ACK_202()));
    const dealRoomId = await createDealRoom();
    const id = await createInvoice(dealRoomId);
    const draft = getInvoice(dir, T1, id)!;
    expect(draft.shareSlug).toBeNull(); // nothing public before a send

    // Unknown + malformed slugs fail closed.
    expect((await publicRoute("/api/native/invoice/share/si_doesnotexist000")).status).toBe(404);
    expect((await publicRoute("/api/native/invoice/share/not-a-slug")).status).toBe(404);
    expect((await publicRoute("/api/native/invoice/share/")).status).toBe(404);
    // A stale slug (index entry with no record behind it) fails closed too.
    const { registerInvoiceSlug } = await import("../native/invoice/store");
    registerInvoiceSlug(dir, "si_staleentry000", T1);
    expect((await publicRoute("/api/native/invoice/share/si_staleentry000")).status).toBe(404);

    await sendInvoice(id);
    const sent = getInvoice(dir, T1, id)!;
    expect(sent.status).toBe("sent");

    const view = await publicRoute(`/api/native/invoice/share/${sent.shareSlug}`);
    expect(view.status).toBe(200);
    const body = (await view.json()) as { data: Record<string, unknown> };
    expect(body.data.invoiceNumber).toBe("INV-0001");
    expect(body.data.amountDueCents).toBe(500000 + 2 * 125050);
    expect(body.data.dueDate).toBe(sent.dueDate);
    expect(body.data.billToName).toBe("Acme Corp");
    // SECURITY (finding 1): the issuer label is a HUMAN display name — the
    // tenant id (the workspace account identifier) must never be published.
    expect(body.data.issuerName).not.toBe(T1);
    expect(body.data.issuerName).toBe(NEUTRAL_ISSUER_LABEL); // no company name configured
    expect(String(body.data.issuerName).length).toBeGreaterThan(0);
    expect((body.data.lineItems as unknown[]).length).toBe(2);
    expect(body.data.hasPdf).toBe(true);
    // No internals, no ids, no enumeration surface.
    const raw = JSON.stringify(body.data);
    expect(raw).not.toContain(T1); // never the issuer's account identifier
    expect(raw).not.toMatch(/inv_[A-Za-z0-9]/); // no inv_ record id
    expect(raw).not.toMatch(/dea_[A-Za-z0-9]/); // no deal-room id
    expect(raw).not.toMatch(/doc_[A-Za-z0-9]/); // no doc id
    expect(raw).not.toMatch(/ipw_[A-Za-z0-9]/); // no approval-action id
    expect(raw).not.toContain("docId");
    expect(raw).not.toContain("audit");
    expect(raw).not.toContain("pendingWrites");
    expect(raw).not.toContain("approvalActionId");
    expect(raw).not.toContain(T2);

    // PDF download comes from the STORED doc (no regeneration), and is gated by
    // the same slug: an unknown slug has no PDF.
    const pdf = await publicRoute(`/api/native/invoice/share/${sent.shareSlug}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect((await publicRoute("/api/native/invoice/share/si_doesnotexist000/pdf")).status).toBe(404);
    // Write verbs are not available on the public lane.
    expect((await publicRoute(`/api/native/invoice/share/${sent.shareSlug}`, "POST")).status).toBe(405);
  });

  it("never renders another tenant's invoice (each slug resolves ONLY its own)", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ACK_202()));
    const roomA = await createDealRoom(T1);
    const idA = await createInvoice(roomA, T1);
    await sendInvoice(idA, undefined, T1);
    const invA = getInvoice(dir, T1, idA)!;

    const roomB = await createDealRoom(T2);
    const idB = await createInvoice(roomB, T2);
    await sendInvoice(idB, undefined, T2);
    const invB = getInvoice(dir, T2, idB)!;

    expect(invA.shareSlug).not.toBe(invB.shareSlug);
    expect(invA.invoiceNumber).toBe("INV-0001");
    expect(invB.invoiceNumber).toBe("INV-0001"); // per-tenant sequence, isolated

    const bodyA = (await (await publicRoute(`/api/native/invoice/share/${invA.shareSlug}`)).json()) as { data: Record<string, unknown> };
    const bodyB = (await (await publicRoute(`/api/native/invoice/share/${invB.shareSlug}`)).json()) as { data: Record<string, unknown> };
    expect(bodyA.data.issuerName).toBe(NEUTRAL_ISSUER_LABEL);
    expect(bodyB.data.issuerName).toBe(NEUTRAL_ISSUER_LABEL);
    expect(JSON.stringify(bodyA.data)).not.toContain(T1);
    expect(JSON.stringify(bodyA.data)).not.toContain(T2);
    expect(JSON.stringify(bodyB.data)).not.toContain(T1);
    expect(JSON.stringify(bodyB.data)).not.toContain(T2);
    // T2 cannot reach A's invoice by id, and A's slug never lists B's records.
    expect((await route("GET", `/api/native/invoice/${invA.id}`, undefined, T2)).status).toBe(404);
  });
});

// ── SECURITY finding (1): customer surfaces carry display names, never ids ──
describe("(f) issuer label on customer surfaces — display names only, never ids", () => {
  /** Any entity id shape that must never reach a customer. */
  const ID_SHAPE = /\b(?:inv|dea|doc|ipw|bkt)_[A-Za-z0-9_-]+/;
  const NEUTRAL = NEUTRAL_ISSUER_LABEL;

  it("no display name configured → neutral human label; no tenant id and no ids on the public view, the PDF or the email", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    const fetchMock = vi.fn(async () => ACK_202());
    vi.stubGlobal("fetch", fetchMock);
    const dealRoomId = await createDealRoom();
    const id = await createInvoice(dealRoomId);
    await sendInvoice(id);
    const inv = getInvoice(dir, T1, id)!;
    expect(inv.status).toBe("sent");

    // (c) a non-empty HUMAN label when nothing is configured — never an id.
    expect(resolveIssuerDisplayName(T1, dir)).toBe(NEUTRAL);
    expect(NEUTRAL.trim().length).toBeGreaterThan(0);

    // (a)+(b) the public view payload — exactly what the share page renders.
    const payload = (await (await publicRoute(`/api/native/invoice/share/${inv.shareSlug}`)).json()) as { data: Record<string, unknown> };
    expect(payload.data.issuerName).toBe(NEUTRAL);
    const rawView = JSON.stringify(payload.data);
    expect(rawView).not.toContain(T1); // (a) never the tenant id
    expect(rawView).not.toMatch(ID_SHAPE); // (b) never an entity id

    // (a)+(b) the PDF the customer keeps — body AND footer.
    expect(inv.docId).toBeTruthy();
    const doc = getDoc(dir, T1, inv.docId!)!;
    expect(doc.textProjection).toContain(NEUTRAL);
    expect(doc.textProjection).toContain("Acme Corp"); // bill-to display name survives
    expect(doc.textProjection).not.toContain(inv.id); // no internal record id
    expect(doc.textProjection).not.toContain(T1);
    expect(doc.textProjection).not.toMatch(ID_SHAPE);

    // (a)+(b) the email that lands in the customer's inbox.
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    const mail = JSON.parse(init.body) as { subject: string; content: { value: string }[] };
    const mailText = `${mail.subject}\n${mail.content.map((c) => c.value).join("\n")}`;
    expect(mailText).toContain(NEUTRAL);
    expect(mailText).not.toContain(T1);
    expect(mailText).not.toMatch(ID_SHAPE);
  });

  it("uses the workspace display name from the ONE settings store when it is configured", async () => {
    // tenant_settings.json keyed by tenant id — the field the portal's
    // Brand & Profile section captures. Nothing new is introduced.
    writeJSON(tenantSettingsPath(dir), { [T1]: { companyName: "Acme Advisory Ltd" } });
    expect(resolveIssuerDisplayName(T1, dir)).toBe("Acme Advisory Ltd");

    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    const fetchMock = vi.fn(async () => ACK_202());
    vi.stubGlobal("fetch", fetchMock);
    const dealRoomId = await createDealRoom();
    const id = await createInvoice(dealRoomId);
    await sendInvoice(id);
    const inv = getInvoice(dir, T1, id)!;

    const payload = (await (await publicRoute(`/api/native/invoice/share/${inv.shareSlug}`)).json()) as { data: Record<string, unknown> };
    expect(payload.data.issuerName).toBe("Acme Advisory Ltd");
    expect(JSON.stringify(payload.data)).not.toContain(T1);
    expect(JSON.stringify(payload.data)).not.toMatch(ID_SHAPE);

    const doc = getDoc(dir, T1, inv.docId!)!;
    expect(doc.textProjection).toContain("Acme Advisory Ltd");
    expect(doc.textProjection).not.toContain(T1);
    expect(doc.textProjection).not.toMatch(ID_SHAPE);

    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    expect(init.body).toContain("Acme Advisory Ltd");
    expect(init.body).not.toContain(T1);
  });

  it("never echoes an identifier back as a display name (account id, entity id, email shape, blank)", () => {
    expect(resolveIssuerDisplayName(T1, dir)).toBe(NEUTRAL); // nothing configured
    writeJSON(tenantSettingsPath(dir), { [T1]: { companyName: T1 } }); // the account id itself
    expect(resolveIssuerDisplayName(T1, dir)).toBe(NEUTRAL);
    writeJSON(tenantSettingsPath(dir), { [T1]: { companyName: "inv_abc123def456" } }); // an entity id
    expect(resolveIssuerDisplayName(T1, dir)).toBe(NEUTRAL);
    writeJSON(tenantSettingsPath(dir), { [T1]: { companyName: "   " } }); // blank
    expect(resolveIssuerDisplayName(T1, dir)).toBe(NEUTRAL);
    // The `{ items: [{ key, value }] }` shape the settings page also reads.
    writeJSON(tenantSettingsPath(dir), { [T1]: { items: [{ key: "companyName", value: "Acme Advisory Ltd" }] } });
    expect(resolveIssuerDisplayName(T1, dir)).toBe("Acme Advisory Ltd");
  });
});

describe("(d) recipient validation happens BEFORE the gate", () => {
  it("an invoice with no customerEmail cannot be sent (400, nothing queued)", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ACK_202()));
    const dealRoomId = await createDealRoom();
    const now = new Date().toISOString();
    insertInvoice(dir, {
      id: "inv_norecipient0001",
      tenantId: T1,
      invoiceNumber: "INV-0900",
      linkedDealRoomId: dealRoomId,
      currency: "USD",
      lineItems: [{ id: "invli_a", description: "Setup", qty: 1, unitPriceCents: 100000 }],
      amountDueCents: 100000,
      status: "draft",
      docId: null,
      customerEmail: "",
      dueDate: "2026-11-28",
      shareSlug: null,
      lastAttempt: null,
      version: 1,
      createdAt: now,
      createdBy: T1,
      updatedAt: now,
      updatedBy: T1,
    });
    const res = await route("POST", "/api/native/invoice/inv_norecipient0001/send");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/customerEmail is required/i);
    expect(pendingFirst("send")).toBeNull(); // never reached the queue
    expect(getInvoice(dir, T1, "inv_norecipient0001")!.status).toBe("draft");
  });

  it("a malformed customerEmail on send → 400 before gating; a valid one is accepted", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ACK_202()));
    const dealRoomId = await createDealRoom();
    const now = new Date().toISOString();
    insertInvoice(dir, {
      id: "inv_badrecipient0001",
      tenantId: T1,
      invoiceNumber: "INV-0901",
      linkedDealRoomId: dealRoomId,
      currency: "USD",
      lineItems: [{ id: "invli_b", description: "Setup", qty: 1, unitPriceCents: 100000 }],
      amountDueCents: 100000,
      status: "draft",
      docId: null,
      customerEmail: "",
      dueDate: "2026-11-28",
      shareSlug: null,
      lastAttempt: null,
      version: 1,
      createdAt: now,
      createdBy: T1,
      updatedAt: now,
      updatedBy: T1,
    });
    const bad = await route("POST", "/api/native/invoice/inv_badrecipient0001/send", { customerEmail: "not-an-email" });
    expect(bad.status).toBe(400);
    expect(pendingFirst("send")).toBeNull();
    const badType = await route("POST", "/api/native/invoice/inv_badrecipient0001/send", { customerEmail: 42 });
    expect(badType.status).toBe(400);
    expect(pendingFirst("send")).toBeNull();
    // A valid recipient is accepted and persisted on the record.
    const { asked, applied } = await sendInvoice("inv_badrecipient0001", { customerEmail: "ap@acme.test" });
    expect(asked.status).toBe(202);
    expect(applied!.status).toBe(200);
    const inv = getInvoice(dir, T1, "inv_badrecipient0001")!;
    expect(inv.customerEmail).toBe("ap@acme.test");
    expect(inv.status).toBe("sent");
  });

  it("a malformed customerEmail on create → 400, never queued", async () => {
    const dealRoomId = await createDealRoom();
    const res = await route("POST", "/api/native/invoice", { linkedDealRoomId: dealRoomId, customerEmail: "nope@" });
    expect(res.status).toBe(400);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
    expect(listInvoices(dir, T1).length).toBe(0);
  });
});

describe("(e) audit + typed events on every transition", () => {
  it("successful send emits queued then sent; audit carries both lines", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ACK_202()));
    const dealRoomId = await createDealRoom();
    const id = await createInvoice(dealRoomId);
    events = [];
    await sendInvoice(id);
    expect(events).toContain("native.invoice.queued");
    expect(events).toContain("native.invoice.sent");
    expect(events).not.toContain("native.invoice.failed");
    expect(events.indexOf("native.invoice.queued")).toBeLessThan(events.indexOf("native.invoice.sent"));
    const audit = listAudit(dir, T1).map((a) => a.action);
    expect(audit).toContain("native.invoice.queued");
    expect(audit).toContain("native.invoice.sent");
  });

  it("a failed attempt emits queued then failed (never sent)", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "");
    const dealRoomId = await createDealRoom();
    const id = await createInvoice(dealRoomId);
    events = [];
    await sendInvoice(id);
    expect(events).toContain("native.invoice.queued");
    expect(events).toContain("native.invoice.failed");
    expect(events).not.toContain("native.invoice.sent");
    const audit = listAudit(dir, T1).map((a) => a.action);
    expect(audit).toContain("native.invoice.queued");
    expect(audit).toContain("native.invoice.failed");
    expect(audit).not.toContain("native.invoice.sent");
  });
});
