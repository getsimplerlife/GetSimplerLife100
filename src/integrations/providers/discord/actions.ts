import { createDiscordClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const discordActions: ActionDefinition[] = [
  { name: "listDiscordGuilds", description: "List Discord guilds/servers", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDiscordClient(config); return c.listGuilds(); } },
  { name: "listDiscordChannels", description: "List Discord channels", inputSchema: { type: "object", properties: { guildId: { type: "string" } }, required: ["guildId"] }, handler: async (config, params) => { const c = createDiscordClient(config); return c.listChannels(params.guildId); } },
  { name: "sendDiscordMessage", description: "Send message to Discord channel", inputSchema: { type: "object", properties: { channelId: { type: "string" }, content: { type: "string" } }, required: ["channelId", "content"] }, handler: async (config, params) => { const c = createDiscordClient(config); return c.sendMessage(params.channelId, params.content); } },
  { name: "discordHealthCheck", description: "Check Discord connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDiscordClient(config); return { healthy: await c.healthCheck(), provider: "discord" }; } },
];