/**
 * employee-attention.ts — portal dashboard "needs attention" truth (#232 item 2).
 *
 * The old dashboard counted ANY employee whose status wasn't Active/Idle as a
 * failure. The catalog seeds AI employees with status "available"/"Paused" and
 * no recent activity, so a brand-new customer (and the owner) saw a sea of red
 * ("17 AIs need attention") that was never a real problem.
 *
 * This module computes `needsAttention` from REAL failure signals only:
 *   - explicit error on the employee record: status "failed", lastError set,
 *     or lastRun failed/error;
 *   - a connection health record (from the #230 heartbeat) that this employee
 *     depends on is reconnect_required / degraded / auth_failed.
 * Unconfigured/purchasable catalog entries get needsAttention=false.
 */
import { connectionHealthSnapshot } from "./connection-health";

const FAILED_STATUSES = new Set(["reconnect_required", "degraded", "auth_failed"]);

export function enrichEmployeesAttention(
  employees: any[],
  email: string,
  dataDir: string,
): any[] {
  const unhealthyProviders = new Set<string>();
  try {
    for (const h of connectionHealthSnapshot(dataDir)) {
      if (h.email && h.email !== email) continue; // strict per-tenant isolation
      if (h.provider && FAILED_STATUSES.has(String(h.status || ""))) {
        unhealthyProviders.add(h.provider);
      }
    }
  } catch {
    /* health is best-effort — explicit record checks still apply */
  }
  return (employees || []).map((e: any) => {
    const s = String(e.status || "").toLowerCase();
    const explicitFailure =
      s === "failed" ||
      Boolean(e.lastError) ||
      e.lastRun === "failed" ||
      e.lastRun === "error" ||
      (e.lastRun && e.lastRun.status === "failed");
    const provider = String(e.providerId || e.provider || "");
    const connectionFailure = Boolean(provider && unhealthyProviders.has(provider));
    return { ...e, needsAttention: explicitFailure || connectionFailure };
  });
}