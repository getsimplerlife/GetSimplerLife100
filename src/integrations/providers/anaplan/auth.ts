/**
 * Anaplan API authentication.
 *
 * Anaplan supports two auth modes:
 * 1. Token-based: Authorization: AnaplanAuthToken {token}
 * 2. Basic Auth: Authorization: Basic {base64(user:pass)}
 *
 * Canonical host: https://api.anaplan.com/2/0
 *
 * Credential shape:
 *   { authToken, workspaceId? } or { user, password }
 */

export function getAnaplanAuthHeaders(authToken: string): Record<string, string> {
  if (!authToken) throw new Error("Anaplan authToken is required");
  return {
    Authorization: `AnaplanAuthToken ${authToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function getAnaplanBasicAuthHeaders(user: string, password: string): Record<string, string> {
  if (!user || !password) throw new Error("Anaplan Basic Auth requires user and password");
  return {
    Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export const ANAPLAN_BASE_URL = "https://api.anaplan.com/2/0";

export interface AnaplanCredential {
  authToken: string;
  workspaceId?: string;
  modelId?: string;
  user?: string;
  password?: string;
}

export function validateAnaplanCredential(cred: Partial<AnaplanCredential>): AnaplanCredential {
  const hasToken = Boolean(cred.authToken);
  const hasBasic = Boolean(cred.user && cred.password);
  if (!hasToken && !hasBasic) throw new Error("Anaplan credential requires authToken or user+password");
  return {
    authToken: cred.authToken || "",
    workspaceId: cred.workspaceId,
    modelId: cred.modelId,
    user: cred.user,
    password: cred.password,
  };
}
