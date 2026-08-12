import { createWordClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Microsoft Word — Actions.
 *
 * Typed action definitions for the Agent Runtime. Every action maps to a real
 * Microsoft Graph operation on the canonical graph.microsoft.com host.
 * Fail-closed: missing ids/names throw before any network call.
 */
export const microsoftWordActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "readWordDocument",
    description: "Read a Word document's plain-text content by OneDrive item id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createWordClient(config);
      return c.readWordDocumentText(params.id);
    },
  },
  {
    name: "listWordDocuments",
    description: "List Word (.docx) documents in the OneDrive root",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createWordClient(config);
      return c.listWordDocuments();
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createWordDocument",
    description: "Create a Word document in OneDrive from paragraphs of text",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, paragraphs: { type: "array", items: { type: "string" } } },
      required: ["name", "paragraphs"],
    },
    handler: async (config, params) => {
      const c = createWordClient(config);
      return c.createWordDocument(params.name, params.paragraphs);
    },
  },
  /* ── Health ── */
  {
    name: "microsoftWordHealthCheck",
    description: "Check the Microsoft Word connection (token validity + drive access)",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createWordClient(config);
      return { healthy: await c.healthCheck(), provider: "microsoft-word" };
    },
  },
];
