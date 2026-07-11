/**
 * Integration Framework — Main Export
 *
 * Re-exports all framework utilities for easy import by providers
 * and the Agent Runtime.
 */

export * from "./registry";
export * from "./oauth";
export * from "./connection";
export * from "./client";

export type {
  ProviderMetadata,
  ProviderAction,
  ProviderTrigger,
  ProviderCategory,
  AuthType,
} from "./registry";

export type {
  OAuthConfig,
  OAuthTokens,
  OAuthFlowType,
  OAuthState,
} from "./oauth";

export type {
  Connection,
  ConnectionConfig,
} from "./connection";

export type {
  HttpClientOptions,
  HttpClientResponse,
} from "./client";