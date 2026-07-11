export interface IMAPConfig { host: string; port: number; tls: boolean; username: string; password: string; }

export function createIMAPConnection(config: IMAPConfig): IMAPConfig {
  return config; // Config stored in connection config, actual IMAP connection uses Node.js net/tls
}

export function buildIMAPUrl(config: IMAPConfig): string {
  return `${config.tls ? "imaps" : "imap"}://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}`;
}