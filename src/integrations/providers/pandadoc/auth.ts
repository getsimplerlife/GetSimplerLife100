export function getPandaDocHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `API-Key ${apiKey}`, "Content-Type": "application/json" };
}