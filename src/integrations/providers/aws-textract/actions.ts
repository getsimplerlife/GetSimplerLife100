import { createTextractClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const textractActions: ActionDefinition[] = [
  { name: "textractDetectText", description: "Detect text in document with AWS Textract", inputSchema: { type: "object", properties: { bytesBase64: { type: "string" } }, required: ["bytesBase64"] }, handler: async (config, params) => { const c = createTextractClient(config); return c.detectDocumentText(params.bytesBase64); } },
  { name: "textractAnalyze", description: "Analyze document with AWS Textract (tables+forms)", inputSchema: { type: "object", properties: { bytesBase64: { type: "string" }, featureTypes: { type: "array" } }, required: ["bytesBase64"] }, handler: async (config, params) => { const c = createTextractClient(config); return c.analyzeDocument(params.bytesBase64, params.featureTypes); } },
  { name: "textractHealthCheck", description: "Check AWS Textract connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTextractClient(config); return { healthy: await c.healthCheck(), provider: "aws-textract" }; } },
];