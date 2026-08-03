import { createMarketoClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

export const marketoActions: ActionDefinition[] = [
  // ── understand (read) ──
  {
    name: "listMarketoCampaigns",
    description: "List Marketo campaigns",
    inputSchema: { type: "object", properties: { offset: { type: "number" }, maxReturn: { type: "number" } } },
    handler: async (config, params) => { const c = createMarketoClient(config); return c.listCampaigns(params as any); },
  },
  {
    name: "getMarketoCampaign",
    description: "Get a single Marketo campaign",
    inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
    handler: async (config, params) => { const c = createMarketoClient(config); return c.getCampaign((params as any).id); },
  },
  {
    name: "listMarketoPrograms",
    description: "List Marketo programs",
    inputSchema: { type: "object", properties: { offset: { type: "number" }, maxReturn: { type: "number" } } },
    handler: async (config, params) => { const c = createMarketoClient(config); return c.listPrograms(params as any); },
  },
  {
    name: "listMarketoEmails",
    description: "List Marketo email assets",
    inputSchema: { type: "object", properties: { offset: { type: "number" }, maxReturn: { type: "number" } } },
    handler: async (config, params) => { const c = createMarketoClient(config); return c.listEmails(params as any); },
  },
  {
    name: "listMarketoLeads",
    description: "List Marketo leads (with lead scores)",
    inputSchema: { type: "object", properties: { filterType: { type: "string" }, filterValues: { type: "array", items: { type: "string" } }, fields: { type: "array", items: { type: "string" } } } },
    handler: async (config, params) => { const c = createMarketoClient(config); return c.listLeads(params as any); },
  },
  {
    name: "getMarketoLead",
    description: "Get a single Marketo lead",
    inputSchema: { type: "object", properties: { id: { type: "number" }, fields: { type: "array", items: { type: "string" } } }, required: ["id"] },
    handler: async (config, params) => { const c = createMarketoClient(config); return c.getLead((params as any).id, (params as any).fields); },
  },
  {
    name: "getMarketoEmailMetrics",
    description: "Get Marketo email performance metrics",
    inputSchema: { type: "object", properties: { emailId: { type: "number" } } },
    handler: async (config, params) => {
      const c = createMarketoClient(config);
      if ((params as any)?.emailId) return c.getEmailMetrics((params as any).emailId);
      return c.getEmailSummaryStats();
    },
  },
  // ── automate (write) ──
  {
    name: "sendMarketoSampleEmail",
    description: "Send a Marketo sample email",
    inputSchema: { type: "object", properties: { emailId: { type: "number" }, emailAddress: { type: "string" } }, required: ["emailId", "emailAddress"] },
    handler: async (config, params) => { const c = createMarketoClient(config); return c.sendSampleEmail((params as any).emailId, (params as any).emailAddress); },
  },
  {
    name: "addMarketoLeadsToList",
    description: "Add leads to a Marketo static list",
    inputSchema: { type: "object", properties: { listId: { type: "number" }, leadIds: { type: "array", items: { type: "number" } } }, required: ["listId", "leadIds"] },
    handler: async (config, params) => { const c = createMarketoClient(config); return c.addLeadsToList((params as any).listId, (params as any).leadIds); },
  },
  {
    name: "triggerMarketoCampaign",
    description: "Trigger a Marketo campaign for leads (nurture)",
    inputSchema: { type: "object", properties: { campaignId: { type: "number" }, leadIds: { type: "array", items: { type: "number" } } }, required: ["campaignId", "leadIds"] },
    handler: async (config, params) => { const c = createMarketoClient(config); return c.triggerCampaign((params as any).campaignId, (params as any).leadIds); },
  },
  // ── health ──
  {
    name: "marketoHealthCheck",
    description: "Check Marketo connection health",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => { const c = createMarketoClient(config); return { healthy: await c.healthCheck(), provider: "marketo" }; },
  },
];
