export function getCopperHeaders(apiKey: string, email: string) {
  return { "X-PW-AccessToken": apiKey, "X-PW-Application": "developer_api", "X-PW-UserEmail": email, "Content-Type": "application/json" };
}
export type CopperAuthConfig = { apiKey: string; email: string };