import { buildGraphAuthUrl, handleGraphCallback, refreshGraphToken, isGraphTokenExpired, type GraphOAuthInput } from "../microsoft-office/graph-auth";

export const POWERPOINT_SCOPES = ["Files.ReadWrite", "offline_access"];

export async function buildPowerPointAuthUrl(config: GraphOAuthInput) {
  return buildGraphAuthUrl({ ...config, scopes: POWERPOINT_SCOPES });
}

export async function handlePowerPointCallback(config: GraphOAuthInput, code: string, verifier: string) {
  return handleGraphCallback({ ...config, scopes: POWERPOINT_SCOPES }, code, verifier);
}

export async function refreshPowerPointToken(config: GraphOAuthInput, rt: string) {
  return refreshGraphToken({ ...config, scopes: POWERPOINT_SCOPES }, rt);
}

export { isGraphTokenExpired as isPowerPointTokenExpired };
