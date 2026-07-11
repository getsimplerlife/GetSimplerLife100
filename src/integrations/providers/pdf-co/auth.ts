export function getPDFCoHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey, "Content-Type": "application/json" };
}