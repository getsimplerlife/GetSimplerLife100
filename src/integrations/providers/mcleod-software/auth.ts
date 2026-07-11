export function getMcLeodHeaders(apiKey: string): Record<string, string> {
  return { "X-API-Key": apiKey, "Content-Type": "application/json" };
}