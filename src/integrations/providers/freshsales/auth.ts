export function getFreshsalesHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Token token=${apiKey}`, "Content-Type": "application/json" };
}