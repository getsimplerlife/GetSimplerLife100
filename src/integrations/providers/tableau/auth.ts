export function getTableauHeaders(personalAccessToken: string, _siteId: string): Record<string, string> {
  return { "X-Tableau-Auth": personalAccessToken, "Content-Type": "application/json" };
}