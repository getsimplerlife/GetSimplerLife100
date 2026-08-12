import { createODClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * OneDrive — Actions.
 *
 * Typed action definitions for the Agent Runtime. Every action maps to a real
 * Microsoft Graph operation on the canonical graph.microsoft.com host.
 * Fail-closed: missing ids/paths throw before any network call.
 */
export const onedriveActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "listODItems",
    description: "List OneDrive root items",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createODClient(config);
      return c.listRootItems();
    },
  },
  {
    name: "getODItem",
    description: "Get a OneDrive item by id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createODClient(config);
      return c.getItem(params.id);
    },
  },
  {
    name: "downloadODFile",
    description: "Download a OneDrive file's raw bytes by item id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createODClient(config);
      const bytes = await c.getFileContent(params.id);
      return new TextDecoder().decode(bytes);
    },
  },
  {
    name: "searchODFiles",
    description: "Search OneDrive files",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    handler: async (config, params) => {
      const c = createODClient(config);
      return c.searchFiles(params.query);
    },
  },
  /* ── Monitor ── */
  {
    name: "listODChangesSince",
    description: "Poll OneDrive delta for changes since a cursor",
    inputSchema: { type: "object", properties: { deltaToken: { type: "string" } } },
    handler: async (config, params) => {
      const c = createODClient(config);
      return c.listChangesSince(params.deltaToken);
    },
  },
  /* ── Automate (write) ── */
  {
    name: "uploadODFile",
    description: "Upload a file to OneDrive (path + content)",
    inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, mimeType: { type: "string" } }, required: ["path", "content"] },
    handler: async (config, params) => {
      const c = createODClient(config);
      return c.uploadFile(params.path, params.content, params.mimeType || "text/plain");
    },
  },
  {
    name: "createODFolder",
    description: "Create a folder in OneDrive",
    inputSchema: { type: "object", properties: { name: { type: "string" }, parentId: { type: "string" } }, required: ["name"] },
    handler: async (config, params) => {
      const c = createODClient(config);
      return c.createFolder(params.name, params.parentId);
    },
  },
  {
    name: "copyODFile",
    description: "Copy a OneDrive file (optionally rename or move to a folder)",
    inputSchema: { type: "object", properties: { id: { type: "string" }, newName: { type: "string" }, parentId: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createODClient(config);
      return c.copyFile(params.id, params.newName, params.parentId);
    },
  },
  {
    name: "moveODFile",
    description: "Move a OneDrive file into a folder (optionally rename)",
    inputSchema: { type: "object", properties: { id: { type: "string" }, parentId: { type: "string" }, newName: { type: "string" } }, required: ["id", "parentId"] },
    handler: async (config, params) => {
      const c = createODClient(config);
      return c.moveFile(params.id, params.parentId, params.newName);
    },
  },
  {
    name: "deleteODFile",
    description: "Delete a OneDrive file (idempotent)",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createODClient(config);
      return c.deleteFile(params.id);
    },
  },
  {
    name: "createODShareLink",
    description: "Create a OneDrive sharing link",
    inputSchema: { type: "object", properties: { id: { type: "string" }, type: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createODClient(config);
      return c.createShareLink(params.id, params.type);
    },
  },
  /* ── Health ── */
  {
    name: "onedriveHealthCheck",
    description: "Check OneDrive connection",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createODClient(config);
      return { healthy: await c.healthCheck(), provider: "onedrive" };
    },
  },
];
