export function getAircallHeaders(apiKey: string, apiSecret: string): Record<string, string> {
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return { Authorization: `Basic ${basic}`, "Content-Type": "application/json" };
}