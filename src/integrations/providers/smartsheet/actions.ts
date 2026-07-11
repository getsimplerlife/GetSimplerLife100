import { createSmartsheetClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const smartsheetActions: ActionDefinition[] = [
  { name: "listSmartsheets", description: "List Smartsheet sheets", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSmartsheetClient(config); return c.listSheets(); } },
  { name: "addSmartsheetRows", description: "Add rows to Smartsheet", inputSchema: { type: "object", properties: { sheetId: { type: "number" }, rows: { type: "array" } }, required: ["sheetId", "rows"] }, handler: async (config, params) => { const c = createSmartsheetClient(config); return c.addRows(params.sheetId, params.rows); } },
  { name: "smartsheetHealthCheck", description: "Check Smartsheet connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSmartsheetClient(config); return { healthy: await c.healthCheck(), provider: "smartsheet" }; } },
];