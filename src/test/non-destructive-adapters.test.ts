/**
 * Non-destruction mandate tests (owner directive: NEVER delete inside client/owner
 * accounts — verification artifacts are created labeled and LEFT; deletion is
 * explicit-client-request only).
 *
 * Covers the non-compliant verification paths fixed across PR #153 + follow-up:
 *  1. xero.ts      — 6 create-then-rollback write contracts → create labeled + LEAVE
 *  2. priority.ts  — HubSpot write contracts: no deleteObject, read-only GET probe
 *  3. priority.ts  — Salesforce write contracts: no client.delete, no cleanupIds
 *  4. priority.ts  — Slack: no chat.delete/files.delete cleanup (send-message,
 *                    add-reaction, upload-file)
 *  5. priority.ts  — DocuSign send-document: draft envelope LEFT (no void cleanup)
 *  6. priority.ts  — Monday.com: no delete_item_by_id cleanup
 *  7. priority.ts  — ServiceNow: no deleteIncident/deleteChangeRequest cleanup
 *  8. priority.ts  — Zendesk: no deleteTicket cleanup (reply + status update)
 *  (Tableau/Onfleet/Shopify/Marketo non-destructive assertions live in their own
 *  adapter test files — updated in the same follow-up.)
 *
 * Each test drives the real adapter + real client with a mocked TRANSPORT (fetch),
 * records every HTTP call, and asserts BOTH:
 *  - the response reports `kept: true` (artifact left in place), and
 *  - zero DELETE HTTP requests were issued (no delete/rollback/archive calls).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { xeroAdapter } from "../verification/adapters/xero";
import {
  hubspotAdapter,
  salesforceAdapter,
  slackAdapter,
  docusignAdapter,
  mondayComAdapter,
  servicenowAdapter,
  zendeskAdapter,
} from "../verification/adapters/priority";
import type { AdapterContext } from "../verification/adapters";
import type { ProviderCredential } from "../verification/credential-source";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

/** Recorded HTTP calls (method + url + parsed body). */
const calls: Array<{ method: string; url: string; body?: any }> = [];

function installFetch(handler: (method: string, url: string, body?: any) => Response) {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    const method = (init?.method || "GET") as string;
    let body: any;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = String(init.body);
      }
    }
    calls.push({ method, url: u, body });
    return handler(method, u, body);
  }) as unknown as typeof fetch;
}

/** Assert zero destructive HTTP calls (DELETE) happened on any endpoint. */
function assertNoDelete(scope: string) {
  const destructive = calls.filter((c) => c.method === "DELETE");
  expect(destructive, `${scope}: expected zero DELETE requests, got ${JSON.stringify(destructive)}`).toEqual([]);
}

function makeCred(overrides: Partial<ProviderCredential> = {}): ProviderCredential {
  return {
    accessToken: "tok",
    refreshToken: "rt",
    // vitest note: OAuth expiresAt is in SECONDS (not ms) — future = no refresh.
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  } as ProviderCredential;
}

function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return { credentials: makeCred(), allowWrites: true, ...overrides } as AdapterContext;
}

const contract = (capabilityId: string) => ({ capabilityId } as never);

/* ────────────────────────── Xero (6 write contracts) ────────────────────────── */

function xeroRoutes(method: string, url: string) {
  // Accounting API: api.xero.com/api.xro/2.0/<Entity>
  if (url.includes("/api.xro/2.0/Accounts") && method === "GET") {
    return jsonResponse({
      Accounts: [
        { Code: "200", Status: "ACTIVE", Type: "REVENUE", AccountID: "acc-nonbank" },
        { AccountID: "acc-bank", Type: "BANK", Status: "ACTIVE" },
      ],
    });
  }
  if (url.includes("/api.xro/2.0/Invoices") && method === "POST") {
    return jsonResponse({ Invoices: [{ InvoiceID: "inv-1", InvoiceNumber: "INV-0001" }] });
  }
  if (url.includes("/api.xro/2.0/PurchaseOrders") && method === "POST") {
    return jsonResponse({ PurchaseOrders: [{ PurchaseOrderID: "po-1", PurchaseOrderNumber: "PO-0001" }] });
  }
  if (url.includes("/api.xro/2.0/Contacts") && method === "POST") {
    return jsonResponse({ Contacts: [{ ContactID: "con-1" }] });
  }
  if (url.includes("/api.xro/2.0/ManualJournals") && method === "POST") {
    return jsonResponse({ ManualJournals: [{ ManualJournalID: "mj-1", JournalNumber: "MJ-0001" }] });
  }
  if (url.includes("/api.xro/2.0/Payments") && method === "POST") {
    return jsonResponse({ Payments: [{ PaymentID: "pay-1" }] });
  }
  if (url.includes("/api.xro/2.0/Accounts") && method === "POST") {
    return jsonResponse({ Accounts: [{ AccountID: "acc-created" }] });
  }
  return jsonResponse({});
}

describe("Xero verification adapter — non-destructive writes (owner mandate)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch(xeroRoutes);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const writeCases = [
    "xero-create-draft-invoice",
    "xero-create-bill",
    "xero-create-purchase-order",
    "xero-create-contact",
    "xero-create-manual-journal",
    "xero-create-payment",
  ];

  for (const capabilityId of writeCases) {
    it(`${capabilityId} creates a labeled artifact and leaves it in place (kept:true, zero DELETE requests)`, async () => {
      const out = await xeroAdapter(contract(capabilityId), ctx({ credentials: makeCred({ tenantId: "tenant-1" }) }));
      expect(out.httpStatus).toBe(200);
      const response = out.response as Record<string, unknown>;
      expect(response.created).toBe(true);
      expect(response.kept).toBe(true);
      expect(response.rolledBack).toBeUndefined();
      // Every write path must have created at least one object (POST).
      expect(calls.some((c) => c.method === "POST")).toBe(true);
      assertNoDelete(capabilityId);
    });
  }

  it("labels artifacts with the Phase7-VERIFY prefix so they are identifiable as verification residue", async () => {
    await xeroAdapter(contract("xero-create-draft-invoice"), ctx({ credentials: makeCred({ tenantId: "tenant-1" }) }));
    const createCall = calls.find((c) => c.method === "POST");
    expect(createCall).toBeTruthy();
    expect(JSON.stringify(createCall?.body)).toContain("Phase7");
  });

  it("fails closed for writes without --writes (no API calls made)", async () => {
    await expect(
      xeroAdapter(contract("xero-create-draft-invoice"), ctx({ credentials: makeCred({ tenantId: "tenant-1" }), allowWrites: false })),
    ).rejects.toThrow("write verification disabled");
    expect(calls.length).toBe(0);
  });

  it("manual journal no longer has a residue/delete-unavailable branch — it just keeps the journal", async () => {
    const out = await xeroAdapter(contract("xero-create-manual-journal"), ctx({ credentials: makeCred({ tenantId: "tenant-1" }) }));
    const response = out.response as Record<string, unknown>;
    expect(response.kept).toBe(true);
    expect(response.residue).toBeUndefined();
    assertNoDelete("xero-create-manual-journal");
  });

  it("payment leaves the invoice, payment, and (if created) bank account in place", async () => {
    const out = await xeroAdapter(contract("xero-create-payment"), ctx({ credentials: makeCred({ tenantId: "tenant-1" }) }));
    const response = out.response as Record<string, unknown>;
    expect(response.kept).toBe(true);
    expect(response.paymentId).toBe("pay-1");
    expect(response.invoiceId).toBe("inv-1");
    expect(response.bankAccountId).toBe("acc-bank");
    assertNoDelete("xero-create-payment");
    // No DELETED/ARCHIVED status updates either (only POSTs in this flow).
    expect(calls.filter((c) => c.method === "PUT" || c.method === "PATCH")).toEqual([]);
  });
});

/* ────────────────────────── HubSpot (4 write contracts) ────────────────────────── */

function hubspotRoutes(method: string, url: string) {
  // Read-only existence probe: GET a non-existent object id → 404.
  if (method === "GET" && url.includes("/crm/v3/objects/deals/000000000000")) {
    return { ok: false, status: 404, headers: new Headers({ "content-type": "application/json" }), json: async () => ({}) } as unknown as Response;
  }
  if (method === "POST" && url.includes("/crm/v3/objects/deals") && !url.includes("/deals/")) return jsonResponse({ id: "deal-1" });
  if (method === "POST" && url.includes("/crm/v3/objects/contacts")) return jsonResponse({ id: "contact-1" });
  if (method === "POST" && url.includes("/crm/v3/objects/companies")) return jsonResponse({ id: "company-1" });
  if (method === "PATCH" && url.includes("/crm/v3/objects/deals/")) return jsonResponse({});
  if (method === "GET" && url.includes("/crm/v3/pipelines/deals")) {
    return jsonResponse({ results: [{ id: "p-1", stages: [{ id: "stage-1" }, { id: "stage-2" }] }] });
  }
  if (method === "GET" && url.includes("/crm/v3/owners")) return jsonResponse({ results: [] });
  return jsonResponse({});
}

describe("HubSpot verification adapter — non-destructive writes + read-only probe", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch(hubspotRoutes);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const writeCases = ["hubspot-create-deal", "hubspot-create-contact", "hubspot-create-company", "hubspot-update-deal-stage"];

  for (const capabilityId of writeCases) {
    it(`${capabilityId} creates a labeled artifact and leaves it (kept:true, zero deleteObject calls)`, async () => {
      const out = await hubspotAdapter(contract(capabilityId), ctx());
      expect(out.httpStatus).toBeGreaterThanOrEqual(200);
      const response = out.response as Record<string, unknown>;
      expect(response.kept).toBe(true);
      expect(response.rolledBack).toBeUndefined();
      assertNoDelete(capabilityId);
      // The pre-write probe must have run as a GET to a non-existent id.
      expect(calls.some((c) => c.method === "GET" && c.url.includes("/deals/000000000000"))).toBe(true);
    });
  }

  it("never issues a DELETE HTTP request (probe is read-only)", async () => {
    await hubspotAdapter(contract("hubspot-create-deal"), ctx());
    assertNoDelete("hubspot probe");
  });

  it("fails closed for writes without --writes", async () => {
    await expect(hubspotAdapter(contract("hubspot-create-deal"), ctx({ allowWrites: false }))).rejects.toThrow(
      "write verification disabled",
    );
    expect(calls.length).toBe(0);
  });

  it("fails closed when the read probe returns 403 (credential cannot read CRM objects)", async () => {
    installFetch((method: string) => ({ ok: false, status: 403, headers: new Headers({ "content-type": "application/json" }), json: async () => ({}) } as unknown as Response));
    await expect(hubspotAdapter(contract("hubspot-create-deal"), ctx())).rejects.toThrow(/cannot read CRM objects/i);
  });
});

/* ────────────────────────── Salesforce (4 write contracts) ────────────────────────── */

function salesforceRoutes(method: string, url: string) {
  if (method === "POST" && url.includes("/sobjects/")) {
    return jsonResponse({ id: "sf-id-1", success: true, errors: [] });
  }
  if (method === "PATCH" && url.includes("/sobjects/")) return jsonResponse({});
  if (method === "GET" && url.includes("/query")) return jsonResponse({ totalSize: 0, records: [], done: true });
  return jsonResponse({});
}

describe("Salesforce verification adapter — non-destructive writes", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch(salesforceRoutes);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const writeCases = ["salesforce-update-opportunity", "salesforce-create-task", "salesforce-create-event", "salesforce-update-lead"];

  for (const capabilityId of writeCases) {
    it(`${capabilityId} creates/updates a labeled artifact and leaves it (kept:true, zero client.delete calls)`, async () => {
      const cred = makeCred({ instanceUrl: "https://test.salesforce.com" });
      const out = await salesforceAdapter(contract(capabilityId), ctx({ credentials: cred }));
      expect(out.httpStatus).toBeGreaterThanOrEqual(200);
      const response = out.response as Record<string, unknown>;
      expect(response.kept).toBe(true);
      expect(response.rolledBack).toBeUndefined();
      assertNoDelete(capabilityId);
      // Must have created an object (POST to /sobjects/...) — never only deleted.
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/sobjects/"))).toBe(true);
    });
  }

  it("fails closed for writes without --writes", async () => {
    const cred = makeCred({ instanceUrl: "https://test.salesforce.com" });
    await expect(
      salesforceAdapter(contract("salesforce-create-task"), ctx({ credentials: cred, allowWrites: false })),
    ).rejects.toThrow("write verification disabled");
    expect(calls.length).toBe(0);
  });

  it("fails closed when the credential has no instanceUrl", async () => {
    await expect(salesforceAdapter(contract("salesforce-create-task"), ctx())).rejects.toThrow(/no instanceUrl/i);
  });
});

/* ────────────────────────── Slack (3 write contracts) ────────────────────────── */
describe("Slack verification adapter — non-destructive writes (owner mandate)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch((method: string, url: string) => {
      if (method === "GET" && url.includes("/conversations.list")) return jsonResponse({ ok: true, channels: [{ id: "C1", is_member: true, name: "general" }] });
      if (method === "GET" && url.includes("/users.list")) return jsonResponse({ ok: true, members: [{ id: "U1", is_bot: false, deleted: false }] });
      if (method === "POST" && url.includes("/chat.postMessage")) return jsonResponse({ ok: true, ts: "1.0001", channel: "C1" });
      if (method === "POST" && url.includes("/reactions.add")) return jsonResponse({ ok: true });
      if (method === "GET" && url.includes("/files.getUploadURLExternal")) return jsonResponse({ ok: true, upload_url: "https://files.slack.com/upload/x", file_id: "F1" });
      if (method === "PUT" && url.includes("files.slack.com/upload")) return jsonResponse({ ok: true });
      if (method === "POST" && url.includes("/files.completeUploadExternal")) return jsonResponse({ ok: true, files: [{ id: "F1" }] });
      return jsonResponse({});
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const writeCases = ["slack-send-message", "slack-add-reaction", "slack-upload-file"];
  for (const capabilityId of writeCases) {
    it(`${capabilityId} creates a labeled artifact and leaves it (kept:true, zero deletes)`, async () => {
      const out = await slackAdapter(contract(capabilityId), ctx());
      expect(out.httpStatus).toBe(200);
      expect(out.response.kept).toBe(true);
      expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
      expect(calls.filter((c) => c.url.includes("chat.delete") || c.url.includes("files.delete"))).toEqual([]);
    });
  }
  it("fails closed for writes without --writes", async () => {
    await expect(slackAdapter(contract("slack-send-message"), ctx({ allowWrites: false }))).rejects.toThrow(/write verification disabled/);
  });
});
/* ────────────────────────── DocuSign send-document ────────────────────────── */
describe("DocuSign send-document — draft envelope left in place (owner mandate)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch((method: string, url: string) => {
      if (method === "POST" && url.includes("/envelopes")) return jsonResponse({ envelopeId: "env-1" });
      return jsonResponse({});
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });
  it("creates a labeled draft envelope and leaves it (kept:true, no void PUT)", async () => {
    const out = await docusignAdapter(contract("docusign-send-document"), ctx({ credentials: { ...makeCred(), accountId: "acc-1", baseUrl: "https://demo.docusign.net/restapi", email: "verify@example.invalid" } }));
    expect(out).toMatchObject({ httpStatus: 201, response: { created: true, kept: true, envelopeId: "env-1" } });
    const voidPuts = calls.filter((c) => c.method === "PUT" && String(c.body?.status) === "voided");
    expect(voidPuts).toEqual([]);
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });
});
/* ────────────────────────── Monday.com ────────────────────────── */
describe("Monday.com verification adapter — non-destructive writes (owner mandate)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch((method: string, url: string, body: any) => {
      if (method === "POST" && url.includes("api.monday.com")) {
        const q = String(body?.query || "");
        if (q.includes("boards(limit")) return jsonResponse({ data: { boards: [{ id: 123, groups: [{ id: "grp1" }] }] } });
        if (q.includes("create_item")) return jsonResponse({ data: { create_item: { id: 777 } } });
      }
      return jsonResponse({});
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });
  it("monday-create-item creates a labeled item and leaves it (kept:true, no delete mutation)", async () => {
    const out = await mondayComAdapter(contract("monday-create-item"), ctx({ credentials: { apiToken: "tok" } as ProviderCredential }));
    expect(out).toMatchObject({ httpStatus: 200, response: { created: true, kept: true, itemId: 777 } });
    expect(calls.some((c) => String(c.body?.query || "").includes("delete_item_by_id"))).toBe(false);
  });
});
/* ────────────────────────── ServiceNow ────────────────────────── */
describe("ServiceNow verification adapter — non-destructive writes (owner mandate)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch((method: string, url: string) => {
      if (method === "POST" && url.includes("/table/incident")) return jsonResponse({ result: { sys_id: "inc1" } });
      if (method === "POST" && url.includes("/table/change_request")) return jsonResponse({ result: { sys_id: "cr1" } });
      return jsonResponse({});
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const writeCases = ["servicenow-create-incident", "servicenow-create-change-request"];
  for (const capabilityId of writeCases) {
    it(`${capabilityId} creates a labeled record and leaves it (kept:true, no delete)`, async () => {
      const cred = { user: "u", password: "p", instance: "dev123456" } as ProviderCredential;
      const out = await servicenowAdapter(contract(capabilityId), ctx({ credentials: cred }));
      expect(out.httpStatus).toBe(201);
      expect(out.response.kept).toBe(true);
      expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
    });
  }
});
/* ────────────────────────── Zendesk ────────────────────────── */
describe("Zendesk verification adapter — non-destructive writes (owner mandate)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch((method: string, url: string) => {
      if (method === "POST" && url.includes("/tickets")) return jsonResponse({ ticket: { id: 555, status: "new" } });
      if (method === "PUT" && url.includes("/tickets/555")) return jsonResponse({ ticket: { id: 555, status: "open" } });
      return jsonResponse({});
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const writeCases = ["zendesk-reply-ticket", "zendesk-update-ticket-status"];
  for (const capabilityId of writeCases) {
    it(`${capabilityId} creates a labeled ticket and leaves it (kept:true, no delete)`, async () => {
      const cred = { email: "a@b.com", apiToken: "tok", subdomain: "sub" } as ProviderCredential;
      const out = await zendeskAdapter(contract(capabilityId), ctx({ credentials: cred }));
      expect(out.httpStatus).toBe(200);
      expect(out.response.kept).toBe(true);
      expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
    });
  }
});
