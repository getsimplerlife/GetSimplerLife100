/**
 * Iguana Health Connector — Client
 *
 * Typed API client for Iguana healthcare interface engine.
 * Supports channel management, message monitoring, LLP listener management,
 * and HL7 message routing.
 */
import { HttpClient } from "../../framework/client";
import type { ConnectionConfig } from "../../framework/connection";
import { getIguanaApiUrl, getIguanaAuthHeaders, IguanaAuthConfig } from "./auth";

// ── Type Definitions ────────────────────────────────────────────────────────

export interface IguanaChannel {
  id: string;
  name: string;
  status: "running" | "stopped" | "paused" | "error";
  type: "llp_listener" | "http_listener" | "file_reader" | "database" | "webservice";
  sourceType: string;
  destinationType: string;
  createdDate: string;
  lastModifiedDate: string;
  description?: string;
  messageCount?: number;
  errorCount?: number;
  lastMessageDate?: string;
}

export interface IguanaMessage {
  id: string;
  channelId: string;
  status: "received" | "processed" | "error" | "pending";
  sourceType: string;
  messageType: string;
  receivedDate: string;
  processedDate?: string;
  content?: string;
  errorMessage?: string;
  retryCount?: number;
  hl7Type?: string;
}

export interface IguanaLLPListener {
  id: string;
  name: string;
  port: number;
  host: string;
  status: "listening" | "stopped" | "error";
  channelId: string;
  ackMode: "auto" | "manual" | "none";
  useTLS: boolean;
  createdAt: string;
}

export interface IguanaChannelConfig {
  id: string;
  name: string;
  source: {
    type: string;
    configuration: Record<string, any>;
  };
  destination: {
    type: string;
    configuration: Record<string, any>;
  };
  filters?: any[];
  translators?: any[];
  logging?: {
    level: string;
    logMessages: boolean;
    logErrors: boolean;
  };
}

export class IguanaClient {
  private client: HttpClient;
  private authConfig: IguanaAuthConfig;
  private authHeaders: Record<string, string>;

  constructor(config: ConnectionConfig) {
    this.authConfig = {
      baseUrl: config.baseUrl || "localhost:6543",
      apiKey: config.apiKey || "",
      username: config.username,
      password: config.password,
      useSSL: config.useSSL !== false,
    };
    this.authHeaders = getIguanaAuthHeaders(this.authConfig);

    this.client = new HttpClient({
      baseUrl: getIguanaApiUrl(this.authConfig),
      rateLimit: { maxRequestsPerSecond: 10 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
  }

  // ── Channel Management ──────────────────────────────────────────────────

  /**
   * List all channels
   */
  async listChannels(): Promise<IguanaChannel[]> {
    const res = await this.client.get<any>("/api/channels", this.authHeaders);
    return (res.data.channels || res.data || []).map((c: any) => ({
      id: c.id || c._id,
      name: c.name,
      status: c.status,
      type: c.type,
      sourceType: c.sourceType || c.source?.type,
      destinationType: c.destinationType || c.destination?.type,
      createdDate: c.createdDate || c.created_at,
      lastModifiedDate: c.lastModifiedDate || c.updated_at,
      description: c.description,
      messageCount: c.messageCount || c.message_count,
      errorCount: c.errorCount || c.error_count,
      lastMessageDate: c.lastMessageDate || c.last_message_date,
    }));
  }

  /**
   * Get channel details
   */
  async getChannel(channelId: string): Promise<IguanaChannel> {
    const res = await this.client.get<any>(
      `/api/channels/${channelId}`,
      this.authHeaders,
    );
    const c = res.data;
    return {
      id: c.id || c._id,
      name: c.name,
      status: c.status,
      type: c.type,
      sourceType: c.sourceType || c.source?.type,
      destinationType: c.destinationType || c.destination?.type,
      createdDate: c.createdDate || c.created_at,
      lastModifiedDate: c.lastModifiedDate || c.updated_at,
      description: c.description,
      messageCount: c.messageCount || c.message_count,
      errorCount: c.errorCount || c.error_count,
      lastMessageDate: c.lastMessageDate || c.last_message_date,
    };
  }

  /**
   * Start a channel
   */
  async startChannel(channelId: string): Promise<IguanaChannel> {
    const res = await this.client.post<any>(
      `/api/channels/${channelId}/start`,
      undefined,
      this.authHeaders,
    );
    return res.data;
  }

  /**
   * Stop a channel
   */
  async stopChannel(channelId: string): Promise<IguanaChannel> {
    const res = await this.client.post<any>(
      `/api/channels/${channelId}/stop`,
      undefined,
      this.authHeaders,
    );
    return res.data;
  }

  /**
   * Get channel configuration
   */
  async getChannelConfig(channelId: string): Promise<IguanaChannelConfig> {
    const res = await this.client.get<any>(
      `/api/channels/${channelId}/config`,
      this.authHeaders,
    );
    return res.data;
  }

  // ── Message Monitoring ──────────────────────────────────────────────────

  /**
   * List messages for a channel
   */
  async listMessages(
    channelId: string,
    limit: number = 50,
    offset: number = 0,
    status?: string,
  ): Promise<IguanaMessage[]> {
    let path = `/api/channels/${channelId}/messages?limit=${limit}&offset=${offset}`;
    if (status) path += `&status=${status}`;
    const res = await this.client.get<any>(path, this.authHeaders);
    return (res.data.messages || res.data || []).map((m: any) => ({
      id: m.id || m._id,
      channelId: m.channelId || m.channel_id,
      status: m.status,
      sourceType: m.sourceType || m.source_type,
      messageType: m.messageType || m.message_type,
      receivedDate: m.receivedDate || m.received_at,
      processedDate: m.processedDate || m.processed_at,
      content: m.content,
      errorMessage: m.errorMessage || m.error_message,
      retryCount: m.retryCount || m.retry_count,
      hl7Type: m.hl7Type || m.hl7_type,
    }));
  }

  /**
   * Get message details
   */
  async getMessage(channelId: string, messageId: string): Promise<IguanaMessage> {
    const res = await this.client.get<any>(
      `/api/channels/${channelId}/messages/${messageId}`,
      this.authHeaders,
    );
    const m = res.data;
    return {
      id: m.id || m._id,
      channelId: m.channelId || m.channel_id,
      status: m.status,
      sourceType: m.sourceType || m.source_type,
      messageType: m.messageType || m.message_type,
      receivedDate: m.receivedDate || m.received_at,
      processedDate: m.processedDate || m.processed_at,
      content: m.content,
      errorMessage: m.errorMessage || m.error_message,
      retryCount: m.retryCount || m.retry_count,
      hl7Type: m.hl7Type || m.hl7_type,
    };
  }

  /**
   * Re-process a message
   */
  async reprocessMessage(channelId: string, messageId: string): Promise<void> {
    await this.client.post(
      `/api/channels/${channelId}/messages/${messageId}/reprocess`,
      undefined,
      this.authHeaders,
    );
  }

  // ── LLP Listener Management ─────────────────────────────────────────────

  /**
   * List LLP listeners
   */
  async listLLPListeners(): Promise<IguanaLLPListener[]> {
    const res = await this.client.get<any>("/api/listeners", this.authHeaders);
    return (res.data.listeners || res.data || []).map((l: any) => ({
      id: l.id || l._id,
      name: l.name,
      port: l.port,
      host: l.host || "0.0.0.0",
      status: l.status,
      channelId: l.channelId || l.channel_id,
      ackMode: l.ackMode || l.ack_mode || "auto",
      useTLS: l.useTLS || l.use_tls || false,
      createdAt: l.createdAt || l.created_at,
    }));
  }

  // ── Health Check ────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.client.get("/api/health", this.authHeaders);
      return res.data?.status === "ok" || res.data?.healthy === true;
    } catch {
      return false;
    }
  }
}

/**
 * Create an Iguana client from stored connection config
 */
export function createIguanaClient(config: ConnectionConfig): IguanaClient {
  return new IguanaClient(config);
}