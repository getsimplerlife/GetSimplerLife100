import { createGDocsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Google Docs — Actions.
 *
 * Typed action definitions for the Agent Runtime. Every action maps to a real
 * Google API operation on the canonical docs.googleapis.com / drive.googleapis.com
 * hosts. Fail-closed: missing IDs/credentials throw before any network call.
 */
export const googleDocsActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "readGoogleDoc",
    description: "Read a Google Doc's plain-text content by document id",
    inputSchema: { type: "object", properties: { documentId: { type: "string" } }, required: ["documentId"] },
    handler: async (config, params) => {
      const c = createGDocsClient(config);
      return c.getDocumentText(params.documentId);
    },
  },
  {
    name: "getGoogleDoc",
    description: "Fetch a Google Doc resource (metadata + body content) by document id",
    inputSchema: { type: "object", properties: { documentId: { type: "string" } }, required: ["documentId"] },
    handler: async (config, params) => {
      const c = createGDocsClient(config);
      return c.getDocument(params.documentId);
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createGoogleDoc",
    description: "Create a new Google Doc with a title (optionally inside a Drive folder)",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, parentFolderId: { type: "string" }, content: { type: "string" } },
      required: ["title"],
    },
    handler: async (config, params) => {
      const c = createGDocsClient(config);
      const file = await c.createDocument(params.title, params.parentFolderId);
      if (params.content) {
        await c.insertText(file.id, params.content);
      }
      return file;
    },
  },
  {
    name: "createGoogleDocFromTemplate",
    description: "Create a Google Doc from a template doc, replacing {{placeholder}} tokens with values",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        title: { type: "string" },
        replacements: { type: "object", additionalProperties: { type: "string" } },
      },
      required: ["templateId", "title"],
    },
    handler: async (config, params) => {
      const c = createGDocsClient(config);
      return c.createDocumentFromTemplate(params.templateId, params.title, params.replacements || {});
    },
  },
  {
    name: "updateGoogleDoc",
    description: "Insert text into a Google Doc at the given 1-based index (default: end of document)",
    inputSchema: {
      type: "object",
      properties: { documentId: { type: "string" }, text: { type: "string" }, index: { type: "number" } },
      required: ["documentId", "text"],
    },
    handler: async (config, params) => {
      const c = createGDocsClient(config);
      return c.insertText(params.documentId, params.text, params.index);
    },
  },
  {
    name: "replaceGoogleDocText",
    description: "Replace all occurrences of {{placeholder}} tokens in a Google Doc",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        replacements: { type: "object", additionalProperties: { type: "string" } },
      },
      required: ["documentId", "replacements"],
    },
    handler: async (config, params) => {
      const c = createGDocsClient(config);
      return c.replaceAllText(params.documentId, params.replacements);
    },
  },
  /* ── Health ── */
  {
    name: "googleDocsHealthCheck",
    description: "Check the Google Docs connection (token validity)",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createGDocsClient(config);
      return { healthy: await c.healthCheck(), provider: "google-docs" };
    },
  },
];
