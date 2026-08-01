// Regression tests for Phase 2a agent-write safety.
//
// These tests prove the fail-closed guarantees:
//  1. A write executes ONLY for explicitly allowlisted (provider, action)
//     pairs — mismatched intents (the bugs found in the capability audit)
//     are skipped with NO network call.
//  2. Credentials are never sent to guessed/fabricated domains.
//  3. Permanently-broken generic reads report unsupported/not_configured
//     instead of firing invalid requests.
//  4. Inventory Tracker actions carry the canonical providerId.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeProviderAction, querySingleProvider, getHubSpotTrustedTenantId } from "../lib/provider-api";
import type { ProviderResult, AgentIntegrationResult } from "../lib/provider-api";
import { processAgentResults } from "../lib/agent-processor";

const CREDS = { accessToken: "test-token-456" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ id: "rec-1", ok: true, key: "PROJ-1", ts: "1.2", channel: "C1" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ──────────────────────────────────────────────────────────────────────
// 1. Dangerous mismatched writes are skipped with NO network call
// ──────────────────────────────────────────────────────────────────────
describe("write dispatch fail-closed: audit's dangerous mismatches cannot execute", () => {
  const dangerousPairs: Array<[string, string, string]> = [
    // [providerId, providerName, action] — each of these previously executed
    // an unrelated write (or a POST to a fabricated domain).
    ["hubspot", "HubSpot", "deduplicate_contacts"], // used to CREATE a contact
    ["hubspot", "HubSpot", "create_follow_up_task"], // used to CREATE a contact
    ["quickbooks", "QuickBooks", "reconcile_records"], // used to CREATE an invoice
    ["bamboohr", "BambooHR", "verify_documents"], // used to POST /employees (create employee)
    ["jira", "Jira", "route_tickets"], // used to CREATE a generic issue
    ["googlesheets", "Google Sheets", "normalize_data"], // used to POST to fabricated api.googlesheets.com
    ["googlesheets", "Google Sheets", "sync_data"], // same fabricated domain
    ["gmail", "Gmail", "draft_responses"], // used to POST to fabricated api.gmail.com
    ["salesforce", "Salesforce", "delete_everything"], // arbitrary unknown action
  ];

  for (const [providerId, providerName, action] of dangerousPairs) {
    it(`skips ${providerId} × ${action} without any network call`, async () => {
      const result = await executeProviderAction(providerId, providerName, CREDS, {
        action,
        detail: "test",
      });
      expect(result.status).toBe("skipped");
      expect(result.action).toBe(action);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("skips writes when no credentials are present (no network call)", async () => {
    const result = await executeProviderAction("hubspot", "HubSpot", {}, { action: "create_contact" });
    expect(result.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────
// 2. Allowlisted writes still execute — against vetted domains only
// ──────────────────────────────────────────────────────────────────────
describe("write dispatch: explicitly allowlisted pairs still execute", () => {
  it("hubspot × create_contact executes against api.hubapi.com", async () => {
    const result = await executeProviderAction("hubspot", "HubSpot", CREDS, {
      action: "create_contact",
      tenantId: "attacker-tenant",
      __trustedTenantId: "tenant-test",
      email: "a@b.co",
    });
    expect(result.status).toBe("executed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://api.hubapi.com/");
  });

  it("single-user tenant guard rejects non-owner users", () => {
    expect(getHubSpotTrustedTenantId("other-user@example.com", "owner@example.com", { "owner@example.com": {} , "other-user@example.com": {} })).toBeNull();
    expect(getHubSpotTrustedTenantId("OWNER@example.com", "owner@example.com", { "owner@example.com": {} })).toBe("owner@example.com");
    expect(getHubSpotTrustedTenantId("owner@example.com", "owner@example.com", {})).toBeNull();
    expect(getHubSpotTrustedTenantId("owner@example.com", undefined as any, { "owner@example.com": {} })).toBeNull();
    expect(getHubSpotTrustedTenantId("owner@example.com", "owner@example.com", undefined as any)).toBeNull();
    expect(getHubSpotTrustedTenantId("owner@example.com", "owner@example.com", { "owner@example.com": null })).toBeNull();
    expect(getHubSpotTrustedTenantId("owner@example.com", "owner@example.com", { "owner@example.com": "not-a-user" })).toBeNull();
  });
  it("rejects missing or blank Bearer accessToken without a request", async () => {
    for (const credentials of [{}, { accessToken: "" }, { accessToken: "   " }]) {
      const result = await executeProviderAction("hubspot", "HubSpot", credentials, { action: "create_contact", __trustedTenantId: "tenant-test", email: "a@b.co" });
      expect(result.status).toBe("skipped");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
  it("rejects apiKey-only HubSpot credentials without a request", async () => {
    const result = await executeProviderAction("hubspot", "HubSpot", { apiKey: "legacy-key" }, { action: "create_contact", __trustedTenantId: "tenant-test", email: "a@b.co" });
    expect(result.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("ignores caller tenantId when trusted live tenant context is present", async () => {
    const result = await executeProviderAction("hubspot", "HubSpot", CREDS, { action: "create_contact", tenantId: "attacker", __trustedTenantId: "tenant-test", email: "a@b.co" });
    expect(result.status).toBe("executed");
    expect(JSON.stringify((fetchMock.mock.calls[0][1] as any).body)).not.toContain("attacker");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("HubSpot writes fail closed without tenant scope", async () => {
    const result = await executeProviderAction("hubspot", "HubSpot", CREDS, { action: "create_contact", email: "a@b.co" });
    expect(result.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("HubSpot update_contact uses numeric ID and vetted HubSpot host", async () => {
    const result = await executeProviderAction("hubspot", "HubSpot", CREDS, { action: "update_contact", tenantId: "tenant-test", __trustedTenantId: "tenant-test", contactId: "123", email: "updated@b.co" });
    expect(result.status).toBe("executed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.hubapi.com/crm/v3/objects/contacts/123");
    expect((fetchMock.mock.calls[0][1] as any).method).toBe("PATCH");
  });
  it("HubSpot invalid object IDs fail closed without network", async () => {
    const result = await executeProviderAction("hubspot", "HubSpot", CREDS, { action: "update_contact", tenantId: "tenant-test", __trustedTenantId: "tenant-test", contactId: "../../evil" });
    expect(result.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  for (const [action, path] of [["create_task", "/crm/v3/objects/tasks"], ["create_deal", "/crm/v3/objects/deals"], ["create_company", "/crm/v3/objects/companies"]] as const) {
    it(`HubSpot ${action} uses the fixed host`, async () => {
      const result = await executeProviderAction("hubspot", "HubSpot", CREDS, { action, tenantId: "tenant-test", __trustedTenantId: "tenant-test", subject: "test" });
      expect(result.status).toBe("executed");
      expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.hubapi.com${path}`);
    });
  }
  it("HubSpot pipeline stage rejects malformed stage without network", async () => {
    const result = await executeProviderAction("hubspot", "HubSpot", CREDS, { action: "update_pipeline_stage", tenantId: "tenant-test", __trustedTenantId: "tenant-test", dealId: "123", dealstage: "bad/stage" });
    expect(result.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("jira × create_audit_finding executes (issue creation matches intent) and reports the requested action", async () => {
    const result = await executeProviderAction(
      "jira",
      "Jira",
      { ...CREDS, domain: "acme", email: "a@b.co" },
      { action: "create_audit_finding", summary: "Audit finding" }
    );
    expect(result.status).toBe("executed");
    expect(result.action).toBe("create_audit_finding");
    expect(String(fetchMock.mock.calls[0][0])).toContain(".atlassian.net/");
  });

  it("slack × send_message executes against slack.com", async () => {
    const result = await executeProviderAction("slack", "Slack", CREDS, {
      action: "send_message",
      channel: "general",
      text: "hi",
    });
    expect(result.status).toBe("executed");
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://slack.com/");
  });
});

// ──────────────────────────────────────────────────────────────────────
// 3. Broken generic reads fail closed: no invalid requests, no leaks
// ──────────────────────────────────────────────────────────────────────
describe("generic reads: unsupported providers make no network call", () => {
  const unsupported = [
    ["monday-com", "Monday.com"],
    ["onfleet", "Onfleet"],
    ["quickbooks-payroll", "QuickBooks Payroll"],
    ["sap", "SAP"],
    ["sap-ariba", "SAP Ariba"],
    ["coupa", "Coupa"],
    ["workday", "Workday"],
    ["adp", "ADP"],
    ["gusto", "Gusto"],
  ];

  for (const [providerId, providerName] of unsupported) {
    it(`${providerId} reports unsupported without any request`, async () => {
      const result = await querySingleProvider(providerId, providerName, CREDS);
      expect(result.status).toBe("unsupported");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("a completely unknown provider reports unsupported without any request", async () => {
    const result = await querySingleProvider("totally-unknown-tool", "Unknown Tool", CREDS);
    expect(result.status).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("generic reads: placeholder endpoints resolve from credentials or fail closed", () => {
  it("marketo without a munchkin id reports not_configured without any request", async () => {
    const result = await querySingleProvider("marketo", "Marketo", CREDS);
    expect(result.status).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marketo with a munchkin id queries the real mktorest.com host", async () => {
    await querySingleProvider("marketo", "Marketo", { ...CREDS, munchkin: "123-ABC-456" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("https://123-ABC-456.mktorest.com/");
    expect(url).not.toContain("{");
  });

  it("freshdesk is unsupported and makes no request even with a domain", async () => {
    const result = await querySingleProvider("freshdesk", "Freshdesk", { ...CREDS, domain: "acme" });
    expect(result.status).toBe("unsupported");
    expect(result.error).toContain("no request was made");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not inspect or resolve an untrusted Freshdesk domain", async () => {
    const result = await querySingleProvider("freshdesk", "Freshdesk", { ...CREDS, domain: "evil.com/pwn?x=" });
    expect(result.status).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────
// 4. Inventory Tracker actions carry the canonical providerId
// ──────────────────────────────────────────────────────────────────────
describe("inventory tracker reorder actions use canonical provider ids", () => {
  it("create_reorder actions use providerId 'shopify', not the display name", () => {
    const shopifyResult: ProviderResult = {
      providerId: "shopify",
      provider: "Shopify",
      status: "ok",
      recordsFound: 2,
      sampleData: [
        { id: 1, title: "Widget", inventory: 3 },
        { id: 2, title: "Gadget", inventory: 50 },
      ],
      endpoint: "admin/api/2024-01/products",
    };
    const queryResult: AgentIntegrationResult = {
      agentId: "inventory-tracker-v1",
      agentName: "Inventory Tracker",
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: "",
      integrationsUsed: [shopifyResult],
      totalRecordsProcessed: 2,
    };

    const result = processAgentResults(
      { id: "inventory-tracker-v1", name: "Inventory Tracker", category: "operations", instructions: "" },
      queryResult,
      []
    );

    const reorders = result.actionsTaken.filter((a) => a.action === "create_reorder");
    expect(reorders.length).toBe(1);
    expect(reorders[0].providerId).toBe("shopify");
    expect(reorders[0].provider).toBe("Shopify");
  });

  it("create_reorder remains safely skipped by the write executor (no vetted handler)", async () => {
    const result = await executeProviderAction("shopify", "Shopify", CREDS, {
      action: "create_reorder",
      detail: "Reorder Widget",
    });
    expect(result.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
