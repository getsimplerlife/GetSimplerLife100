import { buildGraphAuthUrl, handleGraphCallback, refreshGraphToken, isGraphTokenExpired, type GraphOAuthInput } from "../microsoft-office/graph-auth";

/**
 * OneDrive — Microsoft Graph OAuth.
 *
 * Previously this module re-exported the Dynamics 365 auth flow, which
 * requests CRM scopes (https://{tenant}.crm.dynamics.com/.default) — wrong for
 * OneDrive and would fail with "invalid_scope". Fixed to use the shared Graph
 * flow with Files scopes against the canonical login.microsoftonline.com host.
 */
export const ONEDRIVE_SCOPES = ["Files.ReadWrite", "offline_access"];

export async function buildODAuthUrl(config: GraphOAuthInput) {
  return buildGraphAuthUrl({ ...config, scopes: ONEDRIVE_SCOPES });
}

export async function handleODCallback(config: GraphOAuthInput, code: string, verifier: string) {
  return handleGraphCallback({ ...config, scopes: ONEDRIVE_SCOPES }, code, verifier);
}

export async function refreshODToken(config: GraphOAuthInput, rt: string) {
  return refreshGraphToken({ ...config, scopes: ONEDRIVE_SCOPES }, rt);
}

export { isGraphTokenExpired as isODTokenExpired };
