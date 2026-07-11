import { createGoogle_workspace_identityClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const google_workspace_identityActions: ActionDefinition[] = [
  { name: "listGoogle_workspace_identityItems", description: "List google-workspace-identity items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGoogle_workspace_identityClient(config); return c.listItems(); } },
  { name: "google_workspace_identityHealthCheck", description: "Check google-workspace-identity connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGoogle_workspace_identityClient(config); return { healthy: await c.healthCheck(), provider: "google-workspace-identity" }; } },
];
