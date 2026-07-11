export function getIntercomHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" };
}