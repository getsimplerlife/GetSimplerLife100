export function getTextractHeaders(accessKey: string, secretKey: string, region: string): Record<string, string> {
  return { "X-Amz-Access-Key": accessKey, "X-Amz-Secret-Key": secretKey, "X-Amz-Region": region, "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "TextractService.DetectDocumentText" };
}

export async function signTextractRequest(accessKey: string, secretKey: string, region: string, body: string): Promise<Record<string, string>> {
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = date.substring(0, 8) + "T" + date.substring(8, 14) + "Z";
  return { "X-Amz-Access-Key": accessKey, "X-Amz-Date": amzDate, "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "TextractService.DetectDocumentText" };
}