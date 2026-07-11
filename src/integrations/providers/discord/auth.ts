export function getDiscordHeaders(botToken: string): Record<string, string> {
  return { Authorization: `Bot ${botToken}`, "Content-Type": "application/json", "User-Agent": "SimplerLife100/1.0" };
}