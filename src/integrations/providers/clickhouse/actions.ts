/**
 * ClickHouse Integration — Actions
 *
 * Action definitions for the Agent Runtime.
 * Wraps ClickHouse client operations as typed LLM-callable actions.
 */
import { createClickHouseClient } from "./client";
import type { ConnectionConfig } from "../../framework/connection";

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (config: ConnectionConfig, params: Record<string, any>) => Promise<any>;
}

// ── Query Actions ────────────────────────────────────────────────────────────

export const executeQuery: ActionDefinition = {
  name: "clickhouseQuery",
  description: "Execute a SQL query on ClickHouse and return JSON results",
  inputSchema: {
    type: "object",
    properties: {
      sql: { type: "string", description: "SQL query to execute" },
    },
    required: ["sql"],
  },
  handler: async (config, params) => {
    const client = createClickHouseClient(config);
    return client.query(params.sql);
  },
};

export const executeQueryRaw: ActionDefinition = {
  name: "clickhouseQueryRaw",
  description: "Execute a SQL query on ClickHouse and return raw tab-separated output",
  inputSchema: {
    type: "object",
    properties: {
      sql: { type: "string", description: "SQL query to execute" },
    },
    required: ["sql"],
  },
  handler: async (config, params) => {
    const client = createClickHouseClient(config);
    return client.queryRaw(params.sql);
  },
};

// ── Schema Actions ───────────────────────────────────────────────────────────

export const listTables: ActionDefinition = {
  name: "clickhouseListTables",
  description: "List all tables in the ClickHouse database",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createClickHouseClient(config);
    return client.listTables();
  },
};

export const getTableSchema: ActionDefinition = {
  name: "clickhouseGetTableSchema",
  description: "Get schema information for a ClickHouse table",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Table name" },
    },
    required: ["tableName"],
  },
  handler: async (config, params) => {
    const client = createClickHouseClient(config);
    return client.getTableSchema(params.tableName);
  },
};

export const getDatabaseSchema: ActionDefinition = {
  name: "clickhouseGetDatabaseSchema",
  description: "Get the complete schema of the ClickHouse database",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createClickHouseClient(config);
    return client.getDatabaseSchema();
  },
};

// ── Data Ingestion Actions ───────────────────────────────────────────────────

export const ingestData: ActionDefinition = {
  name: "clickhouseIngestData",
  description: "Insert JSON records into a ClickHouse table",
  inputSchema: {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Target table name" },
      records: { type: "array", items: { type: "object" }, description: "Array of JSON records to insert" },
    },
    required: ["tableName", "records"],
  },
  handler: async (config, params) => {
    const client = createClickHouseClient(config);
    return client.ingest(params.tableName, params.records);
  },
};

// ── Monitoring Actions ──────────────────────────────────────────────────────

export const getRecentQueries: ActionDefinition = {
  name: "clickhouseGetRecentQueries",
  description: "Get recent queries from the ClickHouse query log",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Maximum number of queries to return (default: 20)" },
    },
  },
  handler: async (config, params) => {
    const client = createClickHouseClient(config);
    return client.getRecentQueries(params.limit || 20);
  },
};

export const getQueryMetrics: ActionDefinition = {
  name: "clickhouseGetQueryMetrics",
  description: "Get query performance metrics for the last 24 hours",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createClickHouseClient(config);
    return client.getQueryMetrics();
  },
};

export const getTableMetrics: ActionDefinition = {
  name: "clickhouseGetTableMetrics",
  description: "Get table sizes and row counts for the database",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createClickHouseClient(config);
    return client.getTableMetrics();
  },
};

// ── Health Check ────────────────────────────────────────────────────────────

export const healthCheck: ActionDefinition = {
  name: "clickhouseHealthCheck",
  description: "Check if the ClickHouse connection is healthy",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createClickHouseClient(config);
    const healthy = await client.healthCheck();
    return { healthy, provider: "clickhouse" };
  },
};

// ── All Actions Export ──────────────────────────────────────────────────────

export const clickhouseActions: ActionDefinition[] = [
  executeQuery,
  executeQueryRaw,
  listTables,
  getTableSchema,
  getDatabaseSchema,
  ingestData,
  getRecentQueries,
  getQueryMetrics,
  getTableMetrics,
  healthCheck,
];