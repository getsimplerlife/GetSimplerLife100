import { createOCRSpaceClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const ocrSpaceActions: ActionDefinition[] = [
  { name: "ocrUrl", description: "Run OCR on image/PDF URL", inputSchema: { type: "object", properties: { url: { type: "string" }, lang: { type: "string" } }, required: ["url"] }, handler: async (config, params) => { const c = createOCRSpaceClient(config); return c.ocrUrl(params.url, params.lang); } },
  { name: "ocrBase64", description: "Run OCR on base64 image", inputSchema: { type: "object", properties: { base64: { type: "string" }, lang: { type: "string" }, filename: { type: "string" } }, required: ["base64"] }, handler: async (config, params) => { const c = createOCRSpaceClient(config); return c.ocrBase64(params.base64, params.lang, params.filename); } },
  { name: "ocrSpaceHealthCheck", description: "Check OCR.space connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createOCRSpaceClient(config); return { healthy: await c.healthCheck(), provider: "ocr-space" }; } },
];