export function getAuthHeaders(connStr: string): Record<string, string> {
  return { "X-Connection-String": Buffer.from(connStr).toString("base64"), "Content-Type": "application/json" };
}
