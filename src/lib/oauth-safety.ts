export interface OAuthState { provider: string; email?: string; createdAt: number; verifier?: string }

export function validateOAuthState(state: OAuthState | undefined, currentEmail: string, now = Date.now(), ttlMs = 10 * 60 * 1000): string | null {
  if (!state) return "invalid";
  if (!state.email || state.email !== currentEmail) return "mismatch";
  if (now - state.createdAt > ttlMs) return "expired";
  return null;
}

export function consumeOAuthState(states: Record<string, OAuthState>, key: string): OAuthState | undefined {
  const value = states[key];
  if (value) delete states[key];
  return value;
}

export function usableOAuthToken(tokens: any): boolean {
  return typeof tokens?.accessToken === "string" && tokens.accessToken.trim().length >= 8;
}
