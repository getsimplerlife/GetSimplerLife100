export function getLookerHeaders(clientId: string, clientSecret: string): { headers: Record<string, string>; expiresAt: number } {
  return { headers: { Authorization: `token ${clientId}:${clientSecret}`, "Content-Type": "application/json" }, expiresAt: Date.now() + 3600000 };
}