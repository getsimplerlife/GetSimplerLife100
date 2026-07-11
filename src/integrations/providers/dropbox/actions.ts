import { createDropboxClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const dropboxActions: ActionDefinition[] = [
  { name: "listDropboxFolder", description: "List Dropbox folder contents", inputSchema: { type: "object", properties: { path: { type: "string" } } }, handler: async (config, params) => { const c = createDropboxClient(config); return c.listFolder(params.path); } },
  { name: "searchDropboxFiles", description: "Search Dropbox files", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] }, handler: async (config, params) => { const c = createDropboxClient(config); return c.searchFiles(params.query, params.limit); } },
  { name: "createDropboxShareLink", description: "Create Dropbox shared link", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }, handler: async (config, params) => { const c = createDropboxClient(config); return c.createShareLink(params.path); } },
  { name: "dropboxHealthCheck", description: "Check Dropbox connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDropboxClient(config); return { healthy: await c.healthCheck(), provider: "dropbox" }; } },
];