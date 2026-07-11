export function getMetabaseHeaders(sessionToken: string): Record<string, string> {
  return { "X-Metabase-Session": sessionToken, "Content-Type": "application/json" };
}