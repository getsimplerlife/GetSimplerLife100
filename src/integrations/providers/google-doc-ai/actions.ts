import { createDocAIClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const googleDocAIActions: ActionDefinition[] = [
  { name: "processGoogleDocAI", description: "Process document with Google Document AI", inputSchema: { type: "object", properties: { base64Content: { type: "string" }, mimeType: { type: "string" } }, required: ["base64Content"] }, handler: async (config, params) => { const c = createDocAIClient(config); return c.processDocument(params.base64Content, params.mimeType); } },
  { name: "googleDocAIHealthCheck", description: "Check Google Doc AI connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDocAIClient(config); return { healthy: await c.healthCheck(), provider: "google-doc-ai" }; } },
];