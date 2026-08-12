import { createGDriveClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Google Drive — Actions.
 *
 * Typed action definitions for the Agent Runtime. Every action maps to a real
 * Drive API operation on the canonical googleapis.com hosts. Fail-closed:
 * missing ids/names throw before any network call.
 */
export const gdriveActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "listGDriveFiles",
    description: "List Google Drive files (optional Drive query, e.g. \"name contains 'report'\")",
    inputSchema: { type: "object", properties: { query: { type: "string" }, pageSize: { type: "number" } } },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.listFiles(params.query, params.pageSize);
    },
  },
  {
    name: "searchGDriveFiles",
    description: "Search Google Drive files by name fragment",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.searchFiles(params.query);
    },
  },
  {
    name: "getGDriveFile",
    description: "Read Google Drive file metadata (name, mimeType, parents, modifiedTime) by id",
    inputSchema: { type: "object", properties: { fileId: { type: "string" } }, required: ["fileId"] },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.getFile(params.fileId);
    },
  },
  {
    name: "downloadGDriveFile",
    description: "Download a Google Drive file's raw content (alt=media)",
    inputSchema: { type: "object", properties: { fileId: { type: "string" } }, required: ["fileId"] },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.getFileContent(params.fileId);
    },
  },
  /* ── Monitor ── */
  {
    name: "listGDriveChangesSince",
    description: "List Google Drive files modified since an ISO timestamp (changes polling)",
    inputSchema: { type: "object", properties: { since: { type: "string" } }, required: ["since"] },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.listChangesSince(params.since);
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createGDriveFolder",
    description: "Create a folder in Google Drive",
    inputSchema: { type: "object", properties: { name: { type: "string" }, parentId: { type: "string" } }, required: ["name"] },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.createFolder(params.name, params.parentId);
    },
  },
  {
    name: "uploadGDriveFile",
    description: "Upload a file to Google Drive (multipart: name + content + optional mimeType/parent)",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, content: { type: "string" }, mimeType: { type: "string" }, parentId: { type: "string" } },
      required: ["name", "content"],
    },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.uploadFile(params.name, params.content, params.mimeType, params.parentId);
    },
  },
  {
    name: "copyGDriveFile",
    description: "Copy a Google Drive file to a new name",
    inputSchema: { type: "object", properties: { fileId: { type: "string" }, name: { type: "string" } }, required: ["fileId"] },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.copyFile(params.fileId, params.name);
    },
  },
  {
    name: "moveGDriveFile",
    description: "Move a Google Drive file into a folder",
    inputSchema: { type: "object", properties: { fileId: { type: "string" }, parentId: { type: "string" } }, required: ["fileId", "parentId"] },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.moveFile(params.fileId, params.parentId);
    },
  },
  {
    name: "deleteGDriveFile",
    description: "Delete a Google Drive file (moves to trash; permanent only when explicitly requested)",
    inputSchema: { type: "object", properties: { fileId: { type: "string" }, permanent: { type: "boolean" } }, required: ["fileId"] },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.deleteFile(params.fileId, params.permanent);
    },
  },
  {
    name: "trashGDriveFile",
    description: "Trash a Google Drive file (restorable)",
    inputSchema: { type: "object", properties: { fileId: { type: "string" } }, required: ["fileId"] },
    handler: async (config, params) => {
      const c = createGDriveClient(config);
      return c.trashFile(params.fileId);
    },
  },
  {
    name: "gdriveHealthCheck",
    description: "Check Google Drive connection",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createGDriveClient(config);
      return { healthy: await c.healthCheck(), provider: "google-drive" };
    },
  },
];
