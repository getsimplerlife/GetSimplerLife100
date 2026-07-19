/**
 * Mirth Connect Healthcare Connector Integration — Module Export
 *
 * Integration for Mirth Connect (NextGen Healthcare) interface engine.
 * Provides channel deployment, message dashboard, connector management,
 * and HL7 message routing/transformation.
 * Target: Healthcare Intake AI (healthcare_intake).
 */
export * from "./auth";
export * from "./client";
export * from "./actions";
export * from "./webhooks";
export const PROVIDER_ID = "mirth-connect";
export const PROVIDER_NAME = "Mirth Connect";
export const PROVIDER_CATEGORY = "healthcare";