export function getQlikHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Qlik-User": "Administrator" };
}