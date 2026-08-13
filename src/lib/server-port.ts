/**
 * server-port.ts — canonical server port resolution (fixes the publish
 * PORT quirk, confirmed live 2026-08-13 by lead).
 *
 * ROOT CAUSE: `publish_site` runs `bun run prod-server.ts` with no PORT
 * override. The platform shell exports PORT=80, and shell env beats .env
 * (verified: `env PORT=3100 bun -e 'console.log(process.env.PORT)'` → 3100
 * even with PORT=3000 in .env). prod-server previously bound
 * `Number(process.env.PORT || 3000)` → port 80 in the publish environment,
 * while the publish health check probes port 3000 → "The published site did
 * not answer on port 3000".
 *
 * Canonical port is 3000. The platform default PORT=80 is treated as NOT an
 * explicit override (fail-closed to 3000). Any other numeric PORT (e.g.
 * "3100", "3999" for isolated test instances) is honored so explicit
 * overrides keep working.
 *
 * This module is PURE (no I/O) so the resolution rules are unit-testable.
 */
export const CANONICAL_SERVER_PORT = 3000;
/** The platform shell's default PORT export — must be ignored. */
export const PLATFORM_DEFAULT_PORT = 80;

/**
 * Resolve the port the server should bind.
 *
 * - undefined / "" / non-numeric → 3000 (fail-closed)
 * - "80" → 3000 (platform default exported by the host shell — ignored)
 * - any other numeric string ("3000", "3100", "3999", ...) → that number
 *   (explicit overrides for isolated test instances must keep working)
 */
export function resolveServerPort(envPort: string | undefined): number {
  if (envPort === undefined || envPort === "") return CANONICAL_SERVER_PORT;
  const trimmed = envPort.trim();
  if (trimmed === "") return CANONICAL_SERVER_PORT;
  if (!/^\d+$/.test(trimmed)) return CANONICAL_SERVER_PORT; // non-numeric → fail closed
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return CANONICAL_SERVER_PORT; // safety net
  if (n === PLATFORM_DEFAULT_PORT) return CANONICAL_SERVER_PORT; // platform default ignored
  return n;
}
