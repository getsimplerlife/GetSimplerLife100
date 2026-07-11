export function getSNHeaders(user: string, pass: string): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`, "Content-Type": "application/json", Accept: "application/json" };
}