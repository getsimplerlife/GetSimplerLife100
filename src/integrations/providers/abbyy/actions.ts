import { createAbbyyClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const abbyyActions: ActionDefinition[] = [
  { name: "abbyyRecognizeText", description: "OCR document with ABBYY", inputSchema: { type: "object", properties: { url: { type: "string" }, language: { type: "string" } }, required: ["url"] }, handler: async (config, params) => { const c = createAbbyyClient(config); return c.recognizeText(params.url, params.language); } },
  { name: "abbyyHealthCheck", description: "Check ABBYY connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAbbyyClient(config); return { healthy: await c.healthCheck(), provider: "abbyy" }; } },
];