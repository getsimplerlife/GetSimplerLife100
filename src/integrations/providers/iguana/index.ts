/**
 * Iguana Health Connector Integration — Module Export
 *
 * Integration for Iguana (by iNTERFACEWARE) healthcare interface engine.
 * Provides channel management, message monitoring, and LLP listener management.
 * Target: Healthcare Intake AI (healthcare_intake).
 */
export * from "./auth";
export * from "./client";
export * from "./actions";
export * from "./webhooks";
export const PROVIDER_ID = "iguana";
export const PROVIDER_NAME = "Iguana";
export const PROVIDER_CATEGORY = "healthcare";