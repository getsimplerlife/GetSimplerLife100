export * from "./auth"; export * from "./client"; export * from "./actions"; export * from "./webhooks";
export const PROVIDER_ID = "tableau"; export const PROVIDER_NAME = "Tableau"; export const PROVIDER_CATEGORY = "business-intelligence";
export { getGSuiteOAuthConfig as getTableauOAuthConfig } from "../gsuite/auth";