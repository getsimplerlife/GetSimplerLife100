import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getB1OAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; baseUrl: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["api"], authorizeUrl: `${config.baseUrl.replace(/\/+$/, "")}/ServiceLayer/auth/login`, tokenUrl: `${config.baseUrl.replace(/\/+$/, "")}/ServiceLayer/auth/login`, flowType: "client_credentials" };
}
export async function handleB1Login(config: any, username: string, password: string): Promise<string> {
  const r = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/ServiceLayer/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ UserName: username, Password: password, CompanyDB: config.companyDB }) });
  const d = await r.json(); return d.SessionId || "";
}
export { isTokenExpired as isB1TokenExpired };