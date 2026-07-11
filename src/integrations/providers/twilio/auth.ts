export function getTwilioHeaders(accountSid: string, authToken: string): Record<string, string> {
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" };
}