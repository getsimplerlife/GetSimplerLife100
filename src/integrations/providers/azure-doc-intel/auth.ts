export function getAzureDocIntelHeaders(apiKey: string): Record<string, string> {
  return { "Ocp-Apim-Subscription-Key": apiKey, "Content-Type": "application/json" };
}