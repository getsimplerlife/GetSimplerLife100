export function getSigmaHeaders(clientId: string, clientSecret: string): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/json" };
}