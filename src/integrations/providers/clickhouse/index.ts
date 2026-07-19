/**
 * ClickHouse Integration — Module Export
 *
 * Analytical database connector for FP&A AI and Audit Logger AI.
 * Uses ClickHouse HTTP interface for SQL queries, schema discovery,
 * data ingestion, and query performance monitoring.
 */
export * from "./auth";
export * from "./client";
export * from "./actions";
export * from "./webhooks";
export const PROVIDER_ID = "clickhouse";
export const PROVIDER_NAME = "ClickHouse";
export const PROVIDER_CATEGORY = "analytics";