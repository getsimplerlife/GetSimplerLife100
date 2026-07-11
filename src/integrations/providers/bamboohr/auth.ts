export function getBambooHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, "Content-Type": "application/json" };
}