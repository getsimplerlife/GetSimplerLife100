/**
 * Iguana Health Connector — Actions
 *
 * Action definitions for the Agent Runtime.
 * Wraps Iguana client operations as typed LLM-callable actions.
 */
import { createIguanaClient } from "./client";
import type { ConnectionConfig } from "../../framework/connection";

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (config: ConnectionConfig, params: Record<string, any>) => Promise<any>;
}

// ── Channel Management Actions ──────────────────────────────────────────────

export const listChannels: ActionDefinition = {
  name: "iguana_list_channels",
  description: "List all Iguana channels",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createIguanaClient(config);
    return client.listChannels();
  },
};

export const getChannel: ActionDefinition = {
  name: "iguana_get_channel",
  description: "Get details of a specific Iguana channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createIguanaClient(config);
    return client.getChannel(params.channelId);
  },
};

export const startChannel: ActionDefinition = {
  name: "iguana_start_channel",
  description: "Start a stopped Iguana channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID to start" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createIguanaClient(config);
    return client.startChannel(params.channelId);
  },
};

export const stopChannel: ActionDefinition = {
  name: "iguana_stop_channel",
  description: "Stop a running Iguana channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID to stop" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createIguanaClient(config);
    return client.stopChannel(params.channelId);
  },
};

export const getChannelConfig: ActionDefinition = {
  name: "iguana_get_channel_config",
  description: "Get configuration of an Iguana channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createIguanaClient(config);
    return client.getChannelConfig(params.channelId);
  },
};

// ── Message Monitoring Actions ─────────────────────────────────────────────

export const listMessages: ActionDefinition = {
  name: "iguana_list_messages",
  description: "List messages for an Iguana channel",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
      limit: { type: "number", description: "Maximum number of messages (default: 50)" },
      offset: { type: "number", description: "Pagination offset" },
      status: { type: "string", description: "Filter by status (received, processed, error, pending)" },
    },
    required: ["channelId"],
  },
  handler: async (config, params) => {
    const client = createIguanaClient(config);
    return client.listMessages(params.channelId, params.limit, params.offset, params.status);
  },
};

export const getMessage: ActionDefinition = {
  name: "iguana_get_message",
  description: "Get details of a specific Iguana message",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
      messageId: { type: "string", description: "Message ID" },
    },
    required: ["channelId", "messageId"],
  },
  handler: async (config, params) => {
    const client = createIguanaClient(config);
    return client.getMessage(params.channelId, params.messageId);
  },
};

export const reprocessMessage: ActionDefinition = {
  name: "iguana_reprocess_message",
  description: "Re-process a failed message in Iguana",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel ID" },
      messageId: { type: "string", description: "Message ID to reprocess" },
    },
    required: ["channelId", "messageId"],
  },
  handler: async (config, params) => {
    const client = createIguanaClient(config);
    return client.reprocessMessage(params.channelId, params.messageId);
  },
};

// ── LLP Listener Actions ────────────────────────────────────────────────────

export const listLLPListeners: ActionDefinition = {
  name: "iguana_list_listeners",
  description: "List all LLP listeners in Iguana",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createIguanaClient(config);
    return client.listLLPListeners();
  },
};

// ── Health Check ────────────────────────────────────────────────────────────

export const healthCheck: ActionDefinition = {
  name: "iguana_health_check",
  description: "Check if the Iguana connection is healthy",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createIguanaClient(config);
    const healthy = await client.healthCheck();
    return { healthy, provider: "iguana" };
  },
};

// ── All Actions Export ──────────────────────────────────────────────────────

export const iguanaActions: ActionDefinition[] = [
  listChannels,
  getChannel,
  startChannel,
  stopChannel,
  getChannelConfig,
  listMessages,
  getMessage,
  reprocessMessage,
  listLLPListeners,
  healthCheck,
];