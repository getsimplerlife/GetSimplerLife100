import { createGSheetsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Google Sheets — Actions.
 *
 * Typed action definitions for the Agent Runtime. Every action maps to a real
 * Sheets API operation on the canonical sheets.googleapis.com host. Fail-closed:
 * missing IDs/ranges throw before any network call.
 */
export const googleSheetsActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "readGoogleSheetRange",
    description: "Read a range of values from a Google Sheet (e.g. 'Sheet1!A1:D50')",
    inputSchema: {
      type: "object",
      properties: { spreadsheetId: { type: "string" }, range: { type: "string" } },
      required: ["spreadsheetId", "range"],
    },
    handler: async (config, params) => {
      const c = createGSheetsClient(config);
      return c.readRange(params.spreadsheetId, params.range);
    },
  },
  {
    name: "getGoogleSheet",
    description: "Fetch Google Sheet metadata (tabs, grid info) by spreadsheet id",
    inputSchema: { type: "object", properties: { spreadsheetId: { type: "string" } }, required: ["spreadsheetId"] },
    handler: async (config, params) => {
      const c = createGSheetsClient(config);
      return c.getSpreadsheet(params.spreadsheetId);
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createGoogleSheet",
    description: "Create a new Google Sheet with a title and optional tab names",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, sheets: { type: "array", items: { type: "string" } } },
      required: ["title"],
    },
    handler: async (config, params) => {
      const c = createGSheetsClient(config);
      return c.createSpreadsheet(params.title, params.sheets);
    },
  },
  {
    name: "writeGoogleSheetRange",
    description: "Overwrite a range in a Google Sheet with values (array of rows)",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        range: { type: "string" },
        values: { type: "array", items: { type: "array" } },
      },
      required: ["spreadsheetId", "range", "values"],
    },
    handler: async (config, params) => {
      const c = createGSheetsClient(config);
      return c.writeRange(params.spreadsheetId, params.range, params.values);
    },
  },
  {
    name: "appendGoogleSheetRows",
    description: "Append rows to a Google Sheet range (grows the sheet)",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        range: { type: "string" },
        values: { type: "array", items: { type: "array" } },
      },
      required: ["spreadsheetId", "range", "values"],
    },
    handler: async (config, params) => {
      const c = createGSheetsClient(config);
      return c.appendRows(params.spreadsheetId, params.range, params.values);
    },
  },
  /* ── Health ── */
  {
    name: "googleSheetsHealthCheck",
    description: "Check the Google Sheets connection (token validity)",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createGSheetsClient(config);
      return { healthy: await c.healthCheck(), provider: "google-sheets" };
    },
  },
];
