export function getAbbyyHeaders(applicationId: string, password: string): Record<string, string> {
  return { Authorization: "Basic " + Buffer.from(`${applicationId}:${password}`).toString("base64"), "Content-Type": "application/json" };
}