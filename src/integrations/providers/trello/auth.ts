export function getTrelloHeaders(_apiKey: string, _token: string): Record<string, string> {
  return { "Content-Type": "application/json" };
}
export function getTrelloAuthParams(apiKey: string, token: string): string {
  return `key=${apiKey}&token=${token}`;
}