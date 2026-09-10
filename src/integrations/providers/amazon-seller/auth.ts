export function getSPApiHeaders(_refreshToken: string, _clientId: string, _clientSecret: string, marketplaceId: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-amz-access-token": "", "x-amz-marketplace-id": marketplaceId };
}