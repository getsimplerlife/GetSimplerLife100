export function getMondayHeaders(apiToken: string): Record<string, string> {
  return { Authorization: apiToken, "Content-Type": "application/json", "API-Version": "2024-01" };
}