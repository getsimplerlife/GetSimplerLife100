import { createDynamicsClient } from "./client";
import { ConnectionConfig } from "../../framework/connection";
import type { ActionDefinition } from "../salesforce/actions";

export const dynamicsActions: ActionDefinition[] = [
  {
    name: "searchDynamicsContacts", description: "Search Dynamics 365 contacts", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    handler: async (config, params) => { const c = createDynamicsClient(config); return c.searchContacts(params.query); },
  },
  {
    name: "createDynamicsContact", description: "Create a contact in Dynamics 365", inputSchema: { type: "object", properties: { firstname: { type: "string" }, lastname: { type: "string" }, emailaddress1: { type: "string" } }, required: ["lastname"] },
    handler: async (config, params) => { const c = createDynamicsClient(config); return c.createContact(params); },
  },
  {
    name: "createDynamicsOpportunity", description: "Create an opportunity in Dynamics 365", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    handler: async (config, params) => { const c = createDynamicsClient(config); return c.createOpportunity(params); },
  },
  {
    name: "dynamicsHealthCheck", description: "Check Dynamics 365 connection", inputSchema: { type: "object", properties: {} },
    handler: async (config) => { const c = createDynamicsClient(config); return { healthy: await c.healthCheck(), provider: "dynamics-365" }; },
  },
];