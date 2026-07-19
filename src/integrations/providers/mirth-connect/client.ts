/**
 * Mirth Connect Healthcare Connector — Client
 *
 * Typed API client for Mirth Connect REST API.
 * Supports channel deployment, message dashboard, connector management,
 * and HL7 message routing/transformation.
 */
import { HttpClient } from "../../framework/client";
import type { ConnectionConfig } from "../../framework/connection";
import { getMirthApiUrl, getMirthAuthHeaders, MirthAuthConfig } from "./auth";

// ── Type Definitions ────────────────────────────────────────────────────────

export interface MirthChannel {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  status: "STARTED" | "STOPPED" | "PAUSED" | "ERROR";
  version: string;
  revision: number;
  lastModified: string;
  sourceConnector: string;
  destinationConnectors: string[];
  preprocessingScript?: string;
  postprocessingScript?: string;
  deployedDate?: string;
  deployedBy?: string;
}

export interface MirthChannelGroup {
  id: string;
  name: string;
  description?: string;
  channels: string[];
}

export interface MirthConnector {
  id: string;
  name: string;
  type: string;
  transport: string;
  enabled: boolean;
  channelId?: string;
  configuration: Record<string, any>;
}

export interface MirthMessage {
  id: string;
  channelId: string;
  connectorName: string;
  status: "RECEIVED" | "FILTERED" | "TRANSFORMED" | "SENT" | "ERROR";
  receivedDate: string;
  processedDate?: string;
  rawContent?: string;
  transformedContent?: string;
  encodedContent?: string;
  errorMessage?: string;
  source?: string;
  destination?: string;
  metaData?: Record<string, string>;
  chainId?: number;
  orderId?: number;
}

export interface MirthDashboardStatus {
  channelId: string;
  name: string;
  state: string;
  deployedDate: string;
  received: number;
  filtered: number;
  queued: number;
  sent: number;
  error: number;
  lastMessageDate?: string;
}

export interface MirthChannelStatistics {
  channelId: string;
  name: string;
  received: number;
  sent: number;
  error: number;
  filtered: number;
  queued: number;
  total: number;
}

export class MirthClient {
  private client: HttpClient;
  private authConfig: MirthAuthConfig;
  private authHeaders: Record<string, string>;

  constructor(config: ConnectionConfig) {
    this.authConfig = {
      baseUrl: config.baseUrl || "localhost:8443",
      username: config.username || "admin",
      password: config.password || "admin",
      apiKey: config.apiKey,
      useSSL: config.useSSL !== false,
      version: config.version || "4.4",
    };
    this.authHeaders = getMirthAuthHeaders(this.authConfig);

    this.client = new HttpClient({
      baseUrl: getMirthApiUrl(this.authConfig),
      rateLimit: { maxRequestsPerSecond: 10 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
  }

  // ── Channel Management ──────────────────────────────────────────────────

  /**
   * List all channels
   */
  async listChannels(): Promise<MirthChannel[]> {
    const res = await this.client.get<any>("/channels", this.authHeaders);
    return (res.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      enabled: c.enabled || c.status === "STARTED",
      status: c.status,
      version: c.version,
      revision: c.revision,
      lastModified: c.lastModified,
      sourceConnector: c.sourceConnector?.name || "",
      destinationConnectors: (c.destinationConnectors || []).map((d: any) => d.name || ""),
      preprocessingScript: c.preprocessingScript,
      postprocessingScript: c.postprocessingScript,
      deployedDate: c.deployedDate,
      deployedBy: c.deployedBy,
    }));
  }

  /**
   * Get channel details
   */
  async getChannel(channelId: string): Promise<MirthChannel> {
    const res = await this.client.get<any>(
      `/channels/${channelId}`,
      this.authHeaders,
    );
    const c = res.data;
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      enabled: c.enabled || c.status === "STARTED",
      status: c.status,
      version: c.version,
      revision: c.revision,
      lastModified: c.lastModified,
      sourceConnector: c.sourceConnector?.name || "",
      destinationConnectors: (c.destinationConnectors || []).map((d: any) => d.name || ""),
      preprocessingScript: c.preprocessingScript,
      postprocessingScript: c.postprocessingScript,
      deployedDate: c.deployedDate,
      deployedBy: c.deployedBy,
    };
  }

  /**
   * Deploy a channel (start it)
   */
  async deployChannel(channelId: string): Promise<MirthChannel> {
    const res = await this.client.post<any>(
      `/channels/${channelId}/_deploy`,
      undefined,
      this.authHeaders,
    );
    return res.data;
  }

  /**
   * Undeploy a channel (stop it)
   */
  async undeployChannel(channelId: string): Promise<void> {
    await this.client.post(
      `/channels/${channelId}/_undeploy`,
      undefined,
      this.authHeaders,
    );
  }

  /**
   * Create or update a channel
   */
  async saveChannel(channel: Partial<MirthChannel>): Promise<MirthChannel> {
    const res = await this.client.put<any>(
      "/channels",
      JSON.stringify(channel),
      this.authHeaders,
    );
    return res.data;
  }

  /**
   * Delete a channel
   */
  async deleteChannel(channelId: string): Promise<void> {
    await this.client.delete(
      `/channels/${channelId}`,
      this.authHeaders,
    );
  }

  // ── Dashboard & Statistics ──────────────────────────────────────────────

  /**
   * Get dashboard status for all channels
   */
  async getDashboardStatus(): Promise<MirthDashboardStatus[]> {
    const res = await this.client.get<any>("/dashboard/statuses", this.authHeaders);
    return (res.data || []).map((d: any) => ({
      channelId: d.channelId,
      name: d.name,
      state: d.state,
      deployedDate: d.deployedDate,
      received: d.received || 0,
      filtered: d.filtered || 0,
      queued: d.queued || 0,
      sent: d.sent || 0,
      error: d.error || 0,
      lastMessageDate: d.lastMessageDate,
    }));
  }

  /**
   * Get channel statistics
   */
  async getChannelStatistics(channelId: string): Promise<MirthChannelStatistics> {
    const res = await this.client.get<any>(
      `/channels/${channelId}/statistics`,
      this.authHeaders,
    );
    const s = res.data;
    return {
      channelId: s.channelId || channelId,
      name: s.name,
      received: s.received || 0,
      sent: s.sent || 0,
      error: s.error || 0,
      filtered: s.filtered || 0,
      queued: s.queued || 0,
      total: (s.received || 0) + (s.sent || 0) + (s.error || 0),
    };
  }

  // ── Connector Management ────────────────────────────────────────────────

  /**
   * Get connectors for a channel
   */
  async getConnectors(channelId: string): Promise<MirthConnector[]> {
    const res = await this.client.get<any>(
      `/channels/${channelId}/connectors`,
      this.authHeaders,
    );
    return (res.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type || c.transportName,
      transport: c.transportName || c.type,
      enabled: c.enabled !== false,
      channelId: channelId,
      configuration: c.configuration || {},
    }));
  }

  // ── Message Operations ──────────────────────────────────────────────────

  /**
   * Search messages across channels
   */
  async searchMessages(
    channelId: string,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<MirthMessage[]> {
    let path = `/channels/${channelId}/messages?limit=${options?.limit || 50}&offset=${options?.offset || 0}`;
    if (options?.status) path += `&status=${options.status}`;
    if (options?.startDate) path += `&startDate=${options.startDate}`;
    if (options?.endDate) path += `&endDate=${options.endDate}`;

    const res = await this.client.get<any>(path, this.authHeaders);
    return (res.data || []).map((m: any) => ({
      id: m.id,
      channelId: m.channelId,
      connectorName: m.connectorName,
      status: m.status,
      receivedDate: m.receivedDate,
      processedDate: m.processedDate,
      rawContent: m.rawContent,
      transformedContent: m.transformedContent,
      encodedContent: m.encodedContent,
      errorMessage: m.errorMessage,
      source: m.source,
      destination: m.destination,
      metaData: m.metaData,
      chainId: m.chainId,
      orderId: m.orderId,
    }));
  }

  /**
   * Get message content
   */
  async getMessageContent(channelId: string, messageId: string): Promise<MirthMessage> {
    const res = await this.client.get<any>(
      `/channels/${channelId}/messages/${messageId}`,
      this.authHeaders,
    );
    const m = res.data;
    return {
      id: m.id,
      channelId: m.channelId,
      connectorName: m.connectorName,
      status: m.status,
      receivedDate: m.receivedDate,
      processedDate: m.processedDate,
      rawContent: m.rawContent,
      transformedContent: m.transformedContent,
      encodedContent: m.encodedContent,
      errorMessage: m.errorMessage,
      source: m.source,
      destination: m.destination,
      metaData: m.metaData,
      chainId: m.chainId,
      orderId: m.orderId,
    };
  }

  // ── Health Check ────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.client.get("/server/status", this.authHeaders);
      return res.data?.status === "ONLINE" || res.status === 200;
    } catch {
      return false;
    }
  }
}

/**
 * Create a Mirth Connect client from stored connection config
 */
export function createMirthClient(config: ConnectionConfig): MirthClient {
  return new MirthClient(config);
}