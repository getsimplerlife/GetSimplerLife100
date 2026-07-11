export function getGreenhouseHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, "Content-Type": "application/json", "On-Behalf-Of": "api" };
}