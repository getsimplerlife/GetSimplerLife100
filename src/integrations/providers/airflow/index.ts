/**
 * Airflow Orchestration Integration — Module Export
 *
 * REST API client for Apache Airflow DAG triggering, monitoring,
 * and log reading. Target: IT Operations AI and Dispatch Logistics AI.
 */
export * from "./auth";
export * from "./client";
export * from "./actions";
export * from "./webhooks";
export const PROVIDER_ID = "airflow";
export const PROVIDER_NAME = "Apache Airflow";
export const PROVIDER_CATEGORY = "automation";