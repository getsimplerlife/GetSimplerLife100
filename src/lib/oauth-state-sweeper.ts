/**
 * oauth-state-sweeper.ts — periodic purge of stale OAuth CSRF states.
 *
 * OAuth states (oauth_states.json) are consumed on use and carry a 10-minute
 * TTL at consume time, but are never expired when a flow is abandoned — over
 * time they accumulate. This sweeper purges entries OLDER than `ttlMs`
 * (default 24h) and is strictly fail-safe:
 *
 *  - never removes an entry younger than the TTL;
 *  - never removes entries whose age cannot be determined (no valid
 *    `createdAt`) — keep, don't guess;
 *  - never touches any other key/file (only oauth_states.json);
 *  - reads/writes through the same readJSON→writeJSON→durableSet path as the
 *    rest of the runtime (so the Neon mirror stays consistent).
 */
import { join } from "path";
import { readJSONLive, writeJSON } from "./data-store";
import { durableFlush } from "./durable-store";

export interface OAuthStateSweepResult {
  checked: number;
  removed: number;
  ttlMs: number;
  errors: string[];
}

export const OAUTH_STATE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Purge OAuth states older than ttlMs from `oauth_states.json` in `dataDir`.
 * Idempotent: a second run with the same TTL removes nothing more.
 *
 * `nowMs` is injectable for deterministic tests (defaults to Date.now()).
 */
export async function sweepExpiredOAuthStates(
  dataDir: string,
  ttlMs: number = OAUTH_STATE_TTL_MS,
  nowMs: number = Date.now(),
): Promise<OAuthStateSweepResult> {
  const file = join(dataDir, "oauth_states.json");
  const result: OAuthStateSweepResult = { checked: 0, removed: 0, ttlMs, errors: [] };
  try {
    // LIVE read (multi-instance fix #232): a stale per-process cache must never
    // prune (or resurrect) states another instance wrote.
    const states = await readJSONLive(file);
    // Fail-safe: only sweep a plain object we recognize. Arrays, primitives,
    // and unparseable data are left untouched (repair logic lives elsewhere).
    if (!states || typeof states !== "object" || Array.isArray(states)) {
      return result;
    }
    const now = nowMs;
    const kept: Record<string, unknown> = {};
    let removed = 0;
    for (const [state, entry] of Object.entries(states)) {
      const createdAt =
        entry && typeof entry === "object" && typeof (entry as { createdAt?: unknown }).createdAt === "number"
          ? (entry as { createdAt: number }).createdAt
          : NaN;
      // Strictly older than TTL — a state exactly at the boundary is kept.
      if (Number.isFinite(createdAt) && now - createdAt > ttlMs) {
        removed += 1;
      } else {
        kept[state] = entry;
      }
    }
    result.checked = Object.keys(states).length;
    result.removed = removed;
    if (removed > 0) {
      writeJSON(file, kept);
      await durableFlush();
    }
    return result;
  } catch (e: any) {
    result.errors.push(e?.message || String(e));
    return result;
  }
}
