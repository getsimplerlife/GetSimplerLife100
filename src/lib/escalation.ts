/**
 * src/lib/escalation.ts — SERVER-SIDE ONLY. Do NOT import in any .tsx file.
 *
 * BETTER ESCALATION / ANOMALY DETECTION (capability upgrade #5).
 *
 * Two additive pieces on the fail-closed core:
 *  1. `detectAnomaly` — deterministic statistical delta of a current metric
 *     against the FIRM'S OWN recent history (from per-firm memory, #3). Pure
 *     classification/reporting: it only returns a WARN-ish reason; it NEVER
 *     executes a write. With insufficient history it returns `isAnomaly:false`
 *     so behavior falls back to today's (additive/back-compat).
 *  2. `routeAlert` / `AlertRouting` — categorize an alert as
 *     read_recommendation ("here's a heads-up") vs requires_approval ("you need
 *     to decide: approve/reject"). Mirrors fail-closed behavior — the heads-up
 *     path never executes anything; a requires_approval alert is still gated
 *     ONLY by the unchanged Approval Queue.
 *
 * SAFETY: no new execution path; strictly per-tenant (baselines are read from
 * the tenant's own metricHistory); LLM off; works with zero provider creds.
 */
import type { MetricSnapshot } from "./firm-memory";

export type AlertRouting = "read_recommendation" | "requires_approval";

export interface AnomalyResult {
  isAnomaly: boolean;
  /** Signed percent delta vs baseline (e.g. 40 means "40% above"). */
  delta: number;
  /** Concrete human-readable reason ("Spend is 40% above the firm's recent baseline"). */
  reason: string;
  /** Reference baseline value the delta was computed against. */
  baseline: number;
  /** Which metric key triggered. */
  key: string;
}

export interface DetectAnomalyOptions {
  /** Minimum number of prior samples required to compute a baseline (default 2). */
  minSamples?: number;
  /** |delta %| beyond which the value is flagged (default 25). */
  thresholdPercent?: number;
  /** Direction to flag when over-threshold: "up" | "down" | "both" (default "both"). */
  direction?: "up" | "down" | "both";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Pull the prior baseline values for `key` from the firm's metric history.
 *  In the processor flow, `escalation.metricHistory` is captured BEFORE the
 *  current run records, and the current value is passed separately to
 *  detectAnomaly — so every snapshot here is a genuine prior baseline. */
export function priorValues(history: MetricSnapshot[], key: string): number[] {
  const out: number[] = [];
  for (const snap of history) {
    const v = snap.values[key];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * Detect whether a current metric deviates from the firm's own recent baseline.
 * Fail-soft: returns isAnomaly:false when there isn't enough history or the
 * baseline is degenerate. Never throws.
 */
export function detectAnomaly(
  key: string,
  current: number,
  history: MetricSnapshot[],
  opts: DetectAnomalyOptions = {},
): AnomalyResult {
  const minSamples = opts.minSamples ?? 2;
  const threshold = opts.thresholdPercent ?? 25;
  const direction = opts.direction ?? "both";
  const prior = priorValues(history, key);
  const baseline: AnomalyResult = {
    isAnomaly: false,
    delta: 0,
    reason: `${key} is within the firm's recent baseline.`,
    baseline: 0,
    key,
  };

  if (prior.length < minSamples) return baseline;
  if (!Number.isFinite(current)) return baseline;

  const sum = prior.reduce((a, b) => a + b, 0);
  const mean = sum / prior.length;
  if (!Number.isFinite(mean) || mean === 0) return baseline;

  const deltaPct = ((current - mean) / mean) * 100;
  const abs = Math.abs(deltaPct);

  // Respect direction: only flag when the signed delta matches the requested sense.
  const above = deltaPct > threshold;
  const below = deltaPct < -threshold;
  const isAnomaly = direction === "both"
    ? abs > threshold
    : direction === "up" ? above : below;

  const label = deltaPct >= 0 ? "above" : "below";
  return {
    isAnomaly,
    delta: round2(deltaPct),
    reason: isAnomaly
      ? `${key} is ${abs.toFixed(0)}% ${label} the firm's recent baseline (${round2(mean)}).`
      : `${key} is within the firm's recent baseline.`,
    baseline: round2(mean),
    key,
  };
}

/**
 * Categorize an alert for the portal/UI:
 *  - `requires_approval` — a decision is needed (approve/reject); ties to a
 *    proposed write still gated by the Approval Queue.
 *  - `read_recommendation` — a heads-up; nothing executes on this path.
 */
export function routeAlert(requiresDecision: boolean): AlertRouting {
  return requiresDecision ? "requires_approval" : "read_recommendation";
}

/** Sign helper for messages. */
export function pct(n: number): string {
  return `${Math.round(Math.abs(n))}%`;
}
