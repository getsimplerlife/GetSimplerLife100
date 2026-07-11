export interface SMTPConfig { host: string; port: number; secure: boolean; username: string; password: string; fromName: string; fromEmail: string; }

export function createSMTPConnection(config: SMTPConfig): SMTPConfig { return config; }

export function buildSMTPUrl(config: SMTPConfig): string {
  return `${config.secure ? "smtps" : "smtp"}://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}`;
}