export interface OAuthState {
  provider: string;
  email: string;
  createdAt: number;
  verifier?: string;
}

export function validateOAuthState(
  state: OAuthState | undefined,
  currentEmail: string,
  now = Date.now(),
  ttlMs = 10 * 60 * 1000,
): string | null {
  if (!state || !state.provider || !state.email) return "invalid";
  if (state.email !== currentEmail) return "mismatch";
  if (!Number.isFinite(state.createdAt) || now < state.createdAt || now - state.createdAt > ttlMs) return "expired";
  return null;
}

/** Atomically consume in the caller's serialized state update; returns undefined on replay. */
export function consumeOAuthState(states: Record<string, OAuthState>, key: string): OAuthState | undefined {
  const value = states[key];
  if (value) delete states[key];
  return value;
}

export function usableOAuthToken(tokens: any): boolean {
  return typeof tokens?.accessToken === "string" && tokens.accessToken.trim().length >= 8;
}
