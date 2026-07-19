/**
 * ClickHouse Integration — Client
 *
 * Typed HTTP client for ClickHouse HTTP interface.
 * Supports query execution, schema discovery, data ingestion,
 * and query monitoring.
 */
import { HttpClient } from "../../framework/client";
import type { ConnectionConfig } from "../../framework/connection";
import { buildClickHouseUrl, getClickHouseAuthHeaders, buildClickHouseParams, ClickHouseAuthConfig } from "./auth";

export interface ClickHouseTableSchema {
  name: string;
  database: string;
  engine: string;
  columns: ClickHouseColumn[];
  createTableQuery?: string;
}

export interface ClickHouseColumn {
  name: string;
  type: string;
  defaultType?: string;
  defaultExpression?: string;
  comment?: string;
  isNullable?: boolean;
}

export interface ClickHouseQueryResult {
  data: Record<string, any>[];
  meta: { name: string; type: string }[];
  rows: number;
  statistics: { elapsed: number; rowsRead: number; bytesRead: number };
}

export interface ClickHouseIngestResult {
  success: boolean;
  rowsWritten: number;
  queryId?: string;
}

export class ClickHouseClient {
  private client: HttpClient;
  private baseUrl: string;
  private authConfig: ClickHouseAuthConfig;
  private authHeaders: Record<string, string>;

  constructor(config: ConnectionConfig) {
    this.authConfig = {
      host: config.host || "localhost",
      port: config.port || 8123,
      protocol: config.protocol || "http",
      username: config.username || "default",
      password: config.password || "",
      database: config.database || "default",
      isCloud: config.isCloud || false,
    };
    this.baseUrl = buildClickHouseUrl(this.authConfig);
    this.authHeaders = getClickHouseAuthHeaders(this.authConfig);
    this.client = new HttpClient({
      baseUrl: this.baseUrl,
      rateLimit: { maxRequestsPerSecond: 20 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 60000, // Queries can be long-running
    });
  }

  // ── Query Execution ─────────────────────────────────────────────────────

  /**
   * Execute a SQL query and return results in JSON format
   */
  async query(sql: string): Promise<ClickHouseQueryResult> {
    const params = buildClickHouseParams(this.authConfig, { default_format: "JSONEachRow" });
    const url = `/?${params.toString()}`;
    const res = await this.client.post<any>(
      url,
      sql,
      { ...this.authHeaders, "Content-Type": "text/plain" },
    );
    return res.data;
  }

  /**
   * Execute a SQL query and return raw tab-separated output
   */
  async queryRaw(sql: string): Promise<string> {
    const params = buildClickHouseParams(this.authConfig, { default_format: "TabSeparated" });
    const url = `/?${params.toString()}`;
    const res = await this.client.post<any>(
      url,
      sql,
      { ...this.authHeaders, "Content-Type": "text/plain" },
    );
    return typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  }

  // ── Schema Discovery ────────────────────────────────────────────────────

  /**
   * List all tables in the current database
   */
  async listTables(): Promise<{ name: string; engine: string; comment: string }[]> {
    const result = await this.query(
      `SELECT name, engine, comment FROM system.tables WHERE database = '${this.authConfig.database}' ORDER BY name`,
    );
    return result.data || [];
  }

  /**
   * Get column information for a table
   */
  async getTableSchema(tableName: string): Promise<ClickHouseTableSchema> {
    const columns = await this.query(
      `SELECT name, type, default_kind AS defaultType, default_expression AS defaultExpression, comment, is_in_primary_key AS isPrimaryKey FROM system.columns WHERE database = '${this.authConfig.database}' AND table = '${tableName}' ORDER BY position`,
    );
    const tableInfo = await this.query(
      `SELECT engine, create_table_query AS createTableQuery FROM system.tables WHERE database = '${this.authConfig.database}' AND name = '${tableName}'`,
    );
    const tableData = tableInfo.data?.[0] || {};
    return {
      name: tableName,
      database: this.authConfig.database,
      engine: tableData.engine || "Unknown",
      columns: (columns.data || []).map((c: any) => ({
        name: c.name,
        type: c.type,
        defaultType: c.defaultType,
        defaultExpression: c.defaultExpression,
        comment: c.comment,
      })),
      createTableQuery: tableData.createTableQuery,
    };
  }

  /**
   * Get the complete database schema
   */
  async getDatabaseSchema(): Promise<ClickHouseTableSchema[]> {
    const tables = await this.listTables();
    const schemas: ClickHouseTableSchema[] = [];
    for (const table of tables) {
      const schema = await this.getTableSchema(table.name);
      schemas.push(schema);
    }
    return schemas;
  }

  // ── Data Ingestion ──────────────────────────────────────────────────────

  /**
   * Insert data into a ClickHouse table using JSONEachRow format
   */
  async ingest(tableName: string, records: Record<string, any>[]): Promise<ClickHouseIngestResult> {
    if (records.length === 0) {
      return { success: true, rowsWritten: 0 };
    }
    const jsonData = records.map((r) => JSON.stringify(r)).join("\n");
    const params = buildClickHouseParams(this.authConfig, { default_format: "JSONEachRow" });
    const url = `/?${params.toString()}&query=INSERT INTO ${tableName} FORMAT JSONEachRow`;
    const res = await this.client.post<any>(
      url,
      jsonData,
      { ...this.authHeaders, "Content-Type": "application/x-ndjson" },
    );
    return {
      success: true,
      rowsWritten: records.length,
      queryId: res.headers?.get("x-clickhouse-query-id") || undefined,
    };
  }

  /**
   * Bulk insert using CSV format
   */
  async ingestCSV(tableName: string, csvData: string): Promise<ClickHouseIngestResult> {
    const params = buildClickHouseParams(this.authConfig, { default_format: "CSV" });
    const url = `/?${params.toString()}&query=INSERT INTO ${tableName} FORMAT CSV`;
    const res = await this.client.post<any>(
      url,
      csvData,
      { ...this.authHeaders, "Content-Type": "text/csv" },
    );
    // Count rows by newlines
    const rows = csvData.trim().split("\n").length;
    return {
      success: true,
      rowsWritten: rows,
      queryId: res.headers?.get("x-clickhouse-query-id") || undefined,
    };
  }

  // ── Query Monitoring ────────────────────────────────────────────────────

  /**
   * Get recent queries from the query log
   */
  async getRecentQueries(limit: number = 20): Promise<any[]> {
    const result = await this.query(
      `SELECT query_id, query, user, elapsed, read_rows, read_bytes, memory_usage, query_start_time FROM system.query_log WHERE type = 'QueryFinish' ORDER BY query_start_time DESC LIMIT ${limit}`,
    );
    return result.data || [];
  }

  /**
   * Get query performance metrics
   */
  async getQueryMetrics(): Promise<any> {
    const result = await this.query(
      `SELECT COUNT(*) AS totalQueries, AVG(elapsed) AS avgDuration, MAX(elapsed) AS maxDuration, SUM(read_rows) AS totalRowsRead, SUM(read_bytes) AS totalBytesRead FROM system.query_log WHERE type = 'QueryFinish' AND query_start_time > now() - INTERVAL 1 DAY`,
    );
    return result.data?.[0] || {};
  }

  /**
   * Get table sizes and row counts
   */
  async getTableMetrics(): Promise<any[]> {
    const result = await this.query(
      `SELECT table, database, SUM(rows) AS totalRows, SUM(bytes) AS totalBytes, SUM(data_uncompressed_bytes) AS uncompressedBytes FROM system.parts WHERE active AND database = '${this.authConfig.database}' GROUP BY table, database ORDER BY totalBytes DESC`,
    );
    return result.data || [];
  }

  // ── Health Check ────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.client.get("/ping");
      return res.data === "Ok.";
    } catch {
      return false;
    }
  }
}

/**
 * Create a ClickHouse client from stored connection config
 */
export function createClickHouseClient(config: ConnectionConfig): ClickHouseClient {
  return new ClickHouseClient(config);
}