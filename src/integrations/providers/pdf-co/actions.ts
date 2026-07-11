import { createPDFCoClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const pdfCoActions: ActionDefinition[] = [
  { name: "pdfGenerate", description: "Generate PDF from template/data", inputSchema: { type: "object", properties: { data: { type: "object" } }, required: ["data"] }, handler: async (config, params) => { const c = createPDFCoClient(config); return c.pdfMake(params.data); } },
  { name: "pdfExtractText", description: "Extract text from PDF", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }, handler: async (config, params) => { const c = createPDFCoClient(config); return c.pdfExtractText(params.url); } },
  { name: "pdfMerge", description: "Merge PDF files", inputSchema: { type: "object", properties: { urls: { type: "array" } }, required: ["urls"] }, handler: async (config, params) => { const c = createPDFCoClient(config); return c.pdfMerge(params.urls); } },
  { name: "pdfOCRSpace", description: "Run OCR on PDF/image", inputSchema: { type: "object", properties: { url: { type: "string" }, lang: { type: "string" } }, required: ["url"] }, handler: async (config, params) => { const c = createPDFCoClient(config); return c.ocr(params.url, params.lang); } },
  { name: "pdfCoHealthCheck", description: "Check PDF.co connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPDFCoClient(config); return { healthy: await c.healthCheck(), provider: "pdf-co" }; } },
];