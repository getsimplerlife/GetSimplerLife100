export function getSPApiHeaders(refreshToken: string, clientId: string, clientSecret: string, marketplaceId: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-amz-access-token": "", "x-amz-marketplace-id": marketplaceId };
}