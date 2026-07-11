export function getOCRSpaceHeaders(apiKey: string): Record<string, string> {
  return { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" };
}