import { createAzureDocIntelClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const azureDocIntelActions: ActionDefinition[] = [
  { name: "analyzeAzureDocument", description: "Analyze document with Azure Document Intelligence", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }, handler: async (config, params) => { const c = createAzureDocIntelClient(config); return c.analyzeDocument(params.url); } },
  { name: "analyzeAzureInvoice", description: "Analyze invoice with Azure prebuilt model", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }, handler: async (config, params) => { const c = createAzureDocIntelClient(config); return c.analyzeInvoice(params.url); } },
  { name: "azureDocIntelHealthCheck", description: "Check Azure Doc Intel connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAzureDocIntelClient(config); return { healthy: await c.healthCheck(), provider: "azure-doc-intel" }; } },
];