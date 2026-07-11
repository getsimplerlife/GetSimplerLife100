/**
 * HubSpot Integration — Actions
 */
import { createHubSpotClient } from "./client";
import { ConnectionConfig } from "../../framework/connection";

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (config: ConnectionConfig, params: Record<string, any>) => Promise<any>;
}

export const searchContacts: ActionDefinition = {
  name: "searchHubSpotContacts",
  description: "Search HubSpot contacts by query",
  inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  handler: async (config, params) => { const c = createHubSpotClient(config); return c.searchContacts(params.query); },
};

export const createContact: ActionDefinition = {
  name: "createHubSpotContact",
  description: "Create a contact in HubSpot",
  inputSchema: { type: "object", properties: { firstname: { type: "string" }, lastname: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, jobtitle: { type: "string" }, company: { type: "string" } }, required: ["lastname"] },
  handler: async (config, params) => { const c = createHubSpotClient(config); return c.createContact(params); },
};

export const createDeal: ActionDefinition = {
  name: "createHubSpotDeal",
  description: "Create a deal in HubSpot",
  inputSchema: { type: "object", properties: { dealname: { type: "string" }, dealstage: { type: "string" }, amount: { type: "number" }, closedate: { type: "string" } }, required: ["dealname"] },
  handler: async (config, params) => { const c = createHubSpotClient(config); return c.createDeal(params); },
};

export const getPipelineStages: ActionDefinition = {
  name: "getHubSpotPipelineStages",
  description: "Get HubSpot deal pipeline stages",
  inputSchema: { type: "object", properties: {} },
  handler: async (config) => { const c = createHubSpotClient(config); return c.getPipelineStages(); },
};

export const createCompany: ActionDefinition = {
  name: "createHubSpotCompany",
  description: "Create a company in HubSpot",
  inputSchema: { type: "object", properties: { name: { type: "string" }, domain: { type: "string" }, industry: { type: "string" } }, required: ["name"] },
  handler: async (config, params) => { const c = createHubSpotClient(config); return c.createCompany(params); },
};

export const healthCheck: ActionDefinition = {
  name: "hubSpotHealthCheck",
  description: "Check HubSpot connection health",
  inputSchema: { type: "object", properties: {} },
  handler: async (config) => { const c = createHubSpotClient(config); return { healthy: await c.healthCheck(), provider: "hubspot" }; },
};

export const hubSpotActions: ActionDefinition[] = [searchContacts, createContact, createDeal, getPipelineStages, createCompany, healthCheck];