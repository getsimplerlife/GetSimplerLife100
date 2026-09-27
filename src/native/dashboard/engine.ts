/**
 * native/dashboard/engine.ts — PURE deterministic computation for Phase 3.6
 * native dashboards/BI. NO LLM, no network, no randomness:
 *   - reduceReport: read 1.4 rows (read-only, already tenant-scoped) →
 *     grouped rows [{label,value}] + headline (number-viz) — aggs
 *     count|sum|avg|min|max; unknown/foreign table id is resolved by the
 *     caller (tables store getTable) BEFORE this runs (404-no-IDOR),
 *   - csvArtifact / pdfArtifact: deterministic CSV (RFC-4180 quoting) and a
 *     dependency-free PDF via the 1.2 writer (renderVaultPdf) — the "1.2
 *     docs+PDF reuse" from the matrix row,
 *   - scheduleAnchor: next-run computation for daily/weekly/monthly cadences
 *     at a UTC "HH:MM" anchor (pure),
 *   - evaluateThreshold: alert op over a metric (pure).
 * Every function is a pure function of its inputs — replay-safe at apply time.
 */
import { renderVaultPdf, type RenderBlock } from "../../lib/vault-creation";
import {
  AGG_KINDS,
  MAX_REPORT_ROWS,
  SCHEDULE_CADENCES,
  TIME_UTC_RE,
  type AggKind,
  type AlertOp,
  type ReportDef,
  type ScheduleCadence,
} from "./types";
import type { DataRow } from "../tables/types";

export interface ReducedRow {
  label: string | null;
  value: number;
}
export interface ReduceOutcome {
  rows: ReducedRow[];
  headline: number | null;
  rowCount: number;
  sourceRowsExamined: number;
}
const NUM = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && NUM.test(v.trim())) return Number(v.trim());
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}
function coerceLabel(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return ""; }
}
/** Aggregate a list of numbers. count ignores values (row count). */
function aggregate(kind: AggKind, values: number[], count: number): number {
  switch (kind) {
    case "count": return count;
    case "sum": return values.reduce((a, b) => a + b, 0);
    case "avg": return count === 0 ? 0 : values.reduce((a, b) => a + b, 0) / count;
    case "min": return count === 0 ? 0 : Math.min(...values);
    case "max": return count === 0 ? 0 : Math.max(...values);
  }
}
/**
 * Reduce 1.4 rows into report output. `def` is assumed validated (field refs
 * exist in the source table schema — enforced by gate BEFORE the queue).
 * `rows` MUST already be tenant-scoped to the report's owner.
 */
export function reduceReport(def: ReportDef, rows: DataRow[]): ReduceOutcome {
  const examined = rows.length;
  const groupKey = def.groupBy?.trim() || null;
  const valueKey = def.valueField?.trim() || null;
  if (def.viz === "number" || !groupKey) {
    // Single number: aggregate over ALL rows. count = row count; sum/avg/min/
    // max run over the metric values that are present (avg = mean of non-null).
    const values: number[] = [];
    let counted = 0;
    for (const r of rows) {
      if (!valueKey) {
        values.push(1);
        counted += 1;
      } else {
        const n = toNumber(r.data[valueKey]);
        if (n !== null) {
          values.push(n);
          counted += 1;
        }
      }
    }
    const headline = aggregate(def.agg, values, counted);
    return { rows: [{ label: null, value: headline }], headline, rowCount: 1, sourceRowsExamined: examined };
  }
  // Grouped: bucket by groupKey label, aggregate valueKey over each bucket.
  const buckets = new Map<string, { values: number[]; count: number }>();
  for (const r of rows) {
    const label = coerceLabel(r.data[groupKey]);
    const b = buckets.get(label) ?? { values: [], count: 0 };
    b.count += 1;
    if (valueKey) {
      const n = toNumber(r.data[valueKey]);
      if (n !== null) b.values.push(n);
    }
    buckets.set(label, b);
  }
  let out: ReducedRow[] = [];
  for (const [label, b] of buckets) {
    out.push({ label: label === "" ? "(blank)" : label, value: aggregate(def.agg, b.values, b.count) });
  }
  if (def.sortDir === "desc") out.sort((a, b) => b.value - a.value);
  else out.sort((a, b) => a.value - b.value);
  out = out.slice(0, Math.max(1, Math.min(MAX_REPORT_ROWS, def.limit)));
  const total = out.reduce((a, b) => a + b.value, 0);
  return { rows: out, headline: out.length === 1 ? out[0]!.value : total, rowCount: out.length, sourceRowsExamined: examined };
}
function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
/** Deterministic CSV artifact from a reduce outcome. */
export function csvArtifact(def: ReportDef, out: ReduceOutcome): string {
  const lines: string[] = [];
  lines.push("label,value");
  for (const r of out.rows) lines.push(`${csvEscape(r.label ?? "")},${String(r.value)}`);
  lines.push(`report,${csvEscape(def.name)}`);
  lines.push(`rows,${String(out.rowCount)}`);
  return lines.join("\r\n");
}
/** Dependency-free PDF artifact via the 1.2 writer (reused, never new deps). */
export function pdfArtifact(def: ReportDef, out: ReduceOutcome): Uint8Array {
  const blocks: RenderBlock[] = [
    { kind: "h1", text: def.name },
    { kind: "p", text: `Generated ${new Date().toISOString()} · ${def.viz} · ${def.agg} over ${out.sourceRowsExamined} rows` },
  ];
  if (out.headline !== null && out.headline !== undefined && out.rows.length <= 1) {
    blocks.push({ kind: "h2", text: String(out.headline) });
  }
  for (const r of out.rows) {
    blocks.push({ kind: "li", text: `${r.label ?? "(total)"}: ${String(r.value)}` });
  }
  return renderVaultPdf(def.name, blocks);
}
/** Pure next-run computation from a UTC "HH:MM" anchor + cadence. */
export function scheduleAnchor(cadence: ScheduleCadence, timeUtc: string, after: Date): Date {
  if (!TIME_UTC_RE.test(timeUtc)) throw new Error("timeUtc must be HH:MM (UTC)");
  const [hh, mm] = timeUtc.split(":").map(Number) as [number, number];
  const anchor = new Date(after.getTime());
  anchor.setUTCHours(hh!, mm!, 0, 0);
  // If anchor <= after (or anchor is "now-ish"), push to the NEXT occurrence.
  let base = new Date(anchor.getTime());
  if (base.getTime() <= after.getTime()) {
    if (cadence === "daily") base = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    else if (cadence === "weekly") base = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    else {
      // monthly: advance to the same HH:MM on the 1st of the next month.
      const d = new Date(base.getTime());
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      base = d;
    }
    while (base.getTime() <= after.getTime()) {
      if (cadence === "daily") base = new Date(base.getTime() + 24 * 60 * 60 * 1000);
      else if (cadence === "weekly") base = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
      else {
        const d2 = new Date(base.getTime());
        d2.setUTCDate(1);
        d2.setUTCMonth(d2.getUTCMonth() + 1);
        base = d2;
      }
    }
  }
  return base;
}
/** Pure threshold evaluation. */
export function evaluateThreshold(metric: number, op: AlertOp, threshold: number): boolean {
  switch (op) {
    case "gt": return metric > threshold;
    case "gte": return metric >= threshold;
    case "lt": return metric < threshold;
    case "lte": return metric <= threshold;
    case "eq": return Math.abs(metric - threshold) < 1e-9;
    case "neq": return Math.abs(metric - threshold) >= 1e-9;
  }
}
// Re-export consts used by the gate for validation completeness.
export { AGG_KINDS, SCHEDULE_CADENCES }; // eslint-disable-line no-redeclare