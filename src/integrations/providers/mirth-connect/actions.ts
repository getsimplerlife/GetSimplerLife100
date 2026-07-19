/**
 * Mirth Connect Healthcare Connector — Actions
 *
 * Action definitions for the Agent Runtime.
 * Wraps Mirth Connect client operations as typed LLM-callable actions.
 */
import { createMirthClient } from "./client";
import type { ConnectionConfig } from "../../framework/connection";

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (config: ConnectionConfig, params: Record<string, any>) => Promise<any>;
}

// ── Channel Management Actions ──────────────────────────────────────────────

export const listChannels: ActionDefinition = {
  name: "mirth_list_channels",
  description: "List all Mirth Connect channels",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createMirthClient(config);
    return client.listChannels();
  },
};

export const getChannel: ActionDefinition = {
  name: "mirth_get_channel",
  description: "Get details of a specific Mirth Connect channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createMirthClient(config);
    return client.getChannel(params.channelId);
  },
};

export const deployChannel: ActionDefinition = {
  name: "mirth_deploy_channel",
  description: "Deploy (start) a Mirth Connect channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID to deploy" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createMirthClient(config);
    return client.deployChannel(params.channelId);
  },
};

export const undeployChannel: ActionDefinition = {
  name: "mirth_undeploy_channel",
  description: "Undeploy (stop) a Mirth Connect channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID to undeploy" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createMirthClient(config);
    return client.undeployChannel(params.channelId);
  },
};

export const deleteChannel: ActionDefinition = {
  name: "mirth_delete_channel",
  description: "Delete a Mirth Connect channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID to delete" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createMirthClient(config);
    return client.deleteChannel(params.channelId);
  },
};

// ── Dashboard & Statistics Actions ──────────────────────────────────────────

export const getDashboardStatus: ActionDefinition = {
  name: "mirth_dashboard_status",
  description: "Get dashboard status for all Mirth Connect channels",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createMirthClient(config);
    return client.getDashboardStatus();
  },
};

export const getChannelStatistics: ActionDefinition = {
  name: "mirth_channel_statistics",
  description: "Get statistics for a specific Mirth Connect channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createMirthClient(config);
    return client.getChannelStatistics(params.channelId);
  },
};

// ── Connector Actions ───────────────────────────────────────────────────────

export const getConnectors: ActionDefinition = {
  name: "mirth_get_connectors",
  description: "Get connectors for a Mirth Connect channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createMirthClient(config);
    return client.getConnectors(params.channelId);
  },
};

// ── Message Actions ─────────────────────────────────────────────────────────

export const searchMessages: ActionDefinition = {
  name: "mirth_search_messages",
  description: "Search messages in a Mirth Connect channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
      status: { type: "string", description: "Filter by status (RECEIVED, FILTERED, TRANSFORMED, SENT, ERROR)" },
      limit: { type: "number", description: "Maximum number of messages (default: 50)" },
      startDate: { type: "string", description: "Start date for search (ISO format)" },
      endDate: { type: "string", description: "End date for search (ISO format)" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createMirthClient(config);
    return client.searchMessages(params.channelId, {
      status: params.status,
      limit: params.limit,
      startDate: params.startDate,
      endDate: params.endDate,
    });
  },
};

export const getMessageContent: ActionDefinition = {
  name: "mirth_get_message",
  description: "Get content of a specific Mirth Connect message",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
      messageId: { type: "string", description: "Message ID" },
    },
    required: ["channelId", "messageId"],
  },
  handler: async (config, params) => {
    const client = createMirthClient(config);
    return client.getMessageContent(params.channelId, params.messageId);
  },
};

// ── Health Check ────────────────────────────────────────────────────────────

export const healthCheck: ActionDefinition = {
  name: "mirth_health_check",
  description: "Check if the Mirth Connect connection is healthy",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createMirthClient(config);
    const healthy = await client.healthCheck();
    return { healthy, provider: "mirth-connect" };
  },
};

// ── All Actions Export ──────────────────────────────────────────────────────

export const mirthActions: ActionDefinition[] = [
  listChannels,
  getChannel,
  deployChannel,
  undeployChannel,
  deleteChannel,
  getDashboardStatus,
  getChannelStatistics,
  getConnectors,
  searchMessages,
  getMessageContent,
  healthCheck,
];