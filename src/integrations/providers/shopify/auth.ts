/**
 * Shopify Admin API authentication.
 *
 * Shopify uses API access tokens passed via the X-Shopify-Access-Token header.
 * The canonical host is https://{store}.myshopify.com/admin/api/{version}.
 *
 * Credential shape:
 *   { accessToken: string, storeName: string, apiVersion?: string }
 */

const DEFAULT_API_VERSION = "2024-01";

export function getShopifyAuthHeaders(
  accessToken: string,
): Record<string, string> {
  if (!accessToken) throw new Error("Shopify accessToken is required");
  return {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function getShopifyBaseUrl(
  storeName: string,
  apiVersion: string = DEFAULT_API_VERSION,
): string {
  if (!storeName) throw new Error("Shopify storeName is required");
  // e.g. my-store → https://my-store.myshopify.com/admin/api/2024-01
  return `https://${storeName}.myshopify.com/admin/api/${apiVersion}`;
}

export interface ShopifyCredential {
  accessToken: string;
  storeName: string;
  apiVersion?: string;
}

export function validateShopifyCredential(cred: Partial<ShopifyCredential>): ShopifyCredential {
  if (!cred.accessToken) throw new Error("Shopify credential requires accessToken");
  if (!cred.storeName) throw new Error("Shopify credential requires storeName (your-store.myshopify.com subdomain)");
  return {
    accessToken: cred.accessToken,
    storeName: cred.storeName,
    apiVersion: cred.apiVersion || DEFAULT_API_VERSION,
  };
}
