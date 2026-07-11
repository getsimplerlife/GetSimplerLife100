import { createSftpClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const sftpActions: ActionDefinition[] = [
  { name: "sftpQuery", description: "Run query on sftp", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createSftpClient(config); return c.query(params.sql); } },
  { name: "sftpHealthCheck", description: "Check sftp connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSftpClient(config); return { healthy: await c.healthCheck(), provider: "sftp" }; } },
];
