import { buildGraphAuthUrl, handleGraphCallback, refreshGraphToken, isGraphTokenExpired, type GraphOAuthInput } from "../microsoft-office/graph-auth";

export const WORD_SCOPES = ["Files.ReadWrite", "offline_access"];

export async function buildWordAuthUrl(config: GraphOAuthInput) {
  return buildGraphAuthUrl({ ...config, scopes: WORD_SCOPES });
}

export async function handleWordCallback(config: GraphOAuthInput, code: string, verifier: string) {
  return handleGraphCallback({ ...config, scopes: WORD_SCOPES }, code, verifier);
}

export async function refreshWordToken(config: GraphOAuthInput, rt: string) {
  return refreshGraphToken({ ...config, scopes: WORD_SCOPES }, rt);
}

export { isGraphTokenExpired as isWordTokenExpired };
