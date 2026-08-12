import { buildGraphAuthUrl, handleGraphCallback, refreshGraphToken, isGraphTokenExpired, type GraphOAuthInput } from "../microsoft-office/graph-auth";

export const EXCEL_SCOPES = ["Files.ReadWrite", "offline_access"];

export async function buildExcelAuthUrl(config: GraphOAuthInput) {
  return buildGraphAuthUrl({ ...config, scopes: EXCEL_SCOPES });
}

export async function handleExcelCallback(config: GraphOAuthInput, code: string, verifier: string) {
  return handleGraphCallback({ ...config, scopes: EXCEL_SCOPES }, code, verifier);
}

export async function refreshExcelToken(config: GraphOAuthInput, rt: string) {
  return refreshGraphToken({ ...config, scopes: EXCEL_SCOPES }, rt);
}

export { isGraphTokenExpired as isExcelTokenExpired };
