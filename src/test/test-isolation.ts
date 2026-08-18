/**
 * HARD TEST ISOLATION — #230 post-incident (2026-08-18): connection-lifecycle
 * test fixtures (`tenant@example.com:*`) once clobbered the REAL Neon
 * `tenant_oauth_credentials.json` row. Root cause: the durable key is the FILE
 * BASENAME, so any tmp-dir write of a file with that name maps onto the
 * production row whenever the durable store is enabled (a leaked DATABASE_URL
 * from `.env`/platform secrets). The live store was restored by the lead from
 * `/var/lib/simplerlife100/.data`; this guard makes the failure mode impossible.
 */
import { durableEnabled, durableResetOptions } from "../lib/durable-store";

/**
 * Fail-closed suite guard. Call from `src/test/setup.ts` (runs for EVERY test
 * file) and from any test that touches the credential store:
 *  - ABORTS the suite when a DATABASE_URL is present that could reach a real
 *    store. Tests may only run with DATABASE_URL unset, or with an explicit
 *    isolated `TEST_DATABASE_URL` (opt-in) that is NOT the production store.
 *  - Disables the durable store entirely, so `durableSet`/`queueUpsert` become
 *    no-ops and `writeJSON` lands only on the isolated tmp data dirs (disk).
 */
export function enforceTestDurableIsolation(opts: { allowTestDatabaseUrl?: boolean } = {}): void {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const isolated = opts.allowTestDatabaseUrl && process.env.TEST_DATABASE_URL && dbUrl === process.env.TEST_DATABASE_URL;
    if (!isolated) {
      const redacted = dbUrl.replace(/\/\/[^@]*@/, "//***@").slice(0, 80);
      throw new Error(
        "HARD TEST ISOLATION VIOLATION: DATABASE_URL is set (" + redacted + "…). Tests must NEVER connect to " +
        "or write the real Neon durable store. Unset DATABASE_URL (or set TEST_DATABASE_URL to an ISOLATED " +
        "database and opt in with { allowTestDatabaseUrl: true }). Aborting suite — no test writes ran.",
      );
    }
  }
  // Durable store DISABLED for every test: durableSet becomes a no-op, so no
  // fixture write (e.g. basename-keyed tenant_oauth_credentials.json in a tmp
  // dir) can ever reach Neon. Reads fall through to the file layer.
  durableResetOptions();
}

/** Second line of defense for files that seed credential fixtures. */
export function assertDurableDisabled(): void {
  if (durableEnabled()) {
    throw new Error(
      "HARD TEST ISOLATION VIOLATION: durable store is ENABLED inside a test that writes credential fixtures — " +
      "a basename-keyed write could reach real Neon. Call enforceTestDurableIsolation() in src/test/setup.ts.",
    );
  }
}
