/**
 * Marketo REST API authentication.
 *
 * Marketo uses OAuth 2.0 client_credentials grant. The access token is passed
 * via the Authorization: Bearer header. The canonical REST API host is
 * https://{restEndpoint}/rest where restEndpoint is the identity service URL
 * returned during OAuth (e.g. 123-ABC-456.mktorest.com).
 *
 * Credential shape:
 *   { accessToken, restEndpoint, clientId?, clientSecret? }
 */

export function getMarketoAuthHeaders(accessToken: string): Record<string, string> {
  if (!accessToken) throw new Error("Marketo accessToken is required");
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function getMarketoBaseUrl(restEndpoint: string): string {
  if (!restEndpoint) throw new Error("Marketo restEndpoint is required (e.g. 123-ABC-456.mktorest.com)");
  return `https://${restEndpoint}/rest`;
}

export interface MarketoCredential {
  accessToken: string;
  restEndpoint: string;
  clientId?: string;
  clientSecret?: string;
}

export function validateMarketoCredential(cred: Partial<MarketoCredential>): MarketoCredential {
  if (!cred.accessToken) throw new Error("Marketo credential requires accessToken");
  if (!cred.restEndpoint) throw new Error("Marketo credential requires restEndpoint (e.g. 123-ABC-456.mktorest.com)");
  return {
    accessToken: cred.accessToken,
    restEndpoint: cred.restEndpoint,
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
  };
}

/**
 * Obtain a Marketo access token via client_credentials grant.
 * POST /identity/oauth/token?grant_type=client_credentials&client_id=...&client_secret=...
 */
export async function obtainMarketoToken(
  restEndpoint: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `https://${restEndpoint}/identity/oauth/token?grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const r = await fetch(url, { method: "POST", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Marketo OAuth failed: HTTP ${r.status}`);
  const data = await r.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}
