import { createExcelClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Microsoft Excel — Actions.
 *
 * Typed action definitions for the Agent Runtime. Every action maps to a real
 * Microsoft Graph operation on the canonical graph.microsoft.com host.
 * Fail-closed: missing ids/ranges throw before any network call.
 */
export const microsoftExcelActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "readExcelRange",
    description: "Read a range of values from an Excel workbook via the Graph workbook API (e.g. 'Sheet1!A1:D50')",
    inputSchema: { type: "object", properties: { id: { type: "string" }, range: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createExcelClient(config);
      return c.readWorkbookRange(params.id, params.range);
    },
  },
  {
    name: "listExcelWorkbooks",
    description: "List Excel (.xlsx) workbooks in the OneDrive root",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createExcelClient(config);
      return c.listExcelWorkbooks();
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createExcelWorkbook",
    description: "Create an Excel workbook in OneDrive with an initial set of rows",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, rows: { type: "array", items: { type: "array" } } },
      required: ["name", "rows"],
    },
    handler: async (config, params) => {
      const c = createExcelClient(config);
      return c.createExcelWorkbook(params.name, params.rows);
    },
  },
  {
    name: "writeExcelRange",
    description: "Write values into a range of an Excel workbook via the Graph workbook API",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, range: { type: "string" }, values: { type: "array", items: { type: "array" } } },
      required: ["id", "range", "values"],
    },
    handler: async (config, params) => {
      const c = createExcelClient(config);
      return c.writeWorkbookRange(params.id, params.range, params.values);
    },
  },
  /* ── Health ── */
  {
    name: "microsoftExcelHealthCheck",
    description: "Check the Microsoft Excel connection (token validity + drive access)",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createExcelClient(config);
      return { healthy: await c.healthCheck(), provider: "microsoft-excel" };
    },
  },
];
