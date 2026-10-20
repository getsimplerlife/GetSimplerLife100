/**
 * native/dedupe/match.ts — deterministic record matching + data-quality
 * evaluation over the tenant's own 1.4 rows (Phase 4.2).
 *
 * HONESTY BOUNDS:
 *   - matching is deterministic ONLY (exact or normalized string comparison).
 *     LLM-assisted matching is NOT enabled in this slice — the llmAssist flag
 *     is locked to false and every scan/rule carries the honest note.
 *   - suggestions are CANDIDATES with confidence 1.0 (a deterministic match),
 *     never fuzzy scores, and the run ledger records exactly what was produced.
 *   - quality rules are simple deterministic validators (required/email/phone/
 *     number-range/date-format); violations are counted per run, never "fixed".
 */
import type { DataRow, TableDef } from "../tables/types";
import { MAX_NORMALIZED_FIELD_CHARS } from "./types";

/** Normalize a field value for matching: trim, casefold, collapse whitespace,
 *  round-trip through String — numbers/booleans compare on their canonical
 *  string form (1.4 JSONB values). */
export function normalizeForMatch(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v).trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return s.length > MAX_NORMALIZED_FIELD_CHARS ? s.slice(0, MAX_NORMALIZED_FIELD_CHARS) : s;
}

/** Scalar string form for exact comparison (case- AND whitespace-sensitive —
 *  exact mode never trims; the test asserts `"   x"` ≠ `"x"`). */
function exactString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

/** Compare ONE field value from two rows under a match mode. */
export function fieldMatches(mode: "exact" | "normalized", a: unknown, b: unknown): boolean {
  if (mode === "exact") {
    const sa = exactString(a);
    return sa !== "" && sa === exactString(b);
  }
  const na = normalizeForMatch(a);
  return na !== "" && na === normalizeForMatch(b);
}

export interface RowPair {
  rowA: DataRow;
  rowB: DataRow;
  matchedFields: { field: string; value: string }[];
}

/**
 * Deterministic pairwise comparison of rows in one table under one rule.
 * Returns matched pairs (each pair once, row-id-ordered) bounded by
 * MAX_PAIR_COMPARISONS comparisons. `bounded` is set when the budget ran out
 * (the run ledger records it honestly — remaining rows were not compared).
 *
 * Superseded/survivor rows (already part of a record identity) are excluded
 * by the caller before this function is reached.
 */
export function matchPairsTable(
  rule: { fields: string[]; matchMode: "exact" | "normalized" },
  rows: DataRow[],
  maxComparisons: number,
): { pairs: RowPair[]; comparisons: number; bounded: boolean } {
  const pairs: RowPair[] = [];
  let comparisons = 0;
  let bounded = false;
  // Only rows that carry at least one non-empty matched field can match.
  const candidates = rows.filter((r) =>
    rule.fields.some((f) => normalizeForMatch(r.data[f]).length > 0),
  );
  outer: for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (comparisons >= maxComparisons) {
        bounded = true;
        break outer;
      }
      comparisons++;
      const a = candidates[i];
      const b = candidates[j];
      const matchedFields: { field: string; value: string }[] = [];
      let allMatch = true;
      for (const f of rule.fields) {
        const aVal = a.data[f];
        const bVal = b.data[f];
        const aEmpty = aVal === undefined || aVal === null || String(aVal).trim() === "";
        const bEmpty = bVal === undefined || bVal === null || String(bVal).trim() === "";
        // Fields empty in either row are ignored — never evidence of a match
        // nor of a disagreement. A row with `{ email }` under an email+name
        // rule still matches another row with the same email.
        if (aEmpty || bEmpty) continue;
        if (!fieldMatches(rule.matchMode, aVal, bVal)) {
          allMatch = false;
          break;
        }
        matchedFields.push({ field: f, value: normalizeForMatch(aVal) });
      }
      // At least ONE field must carry matching non-empty evidence (an
      // email-only row vs a name-only row shares no field → no false pair).
      if (allMatch && matchedFields.length > 0) pairs.push({ rowA: a, rowB: b, matchedFields });
    }
  }
  return { pairs, comparisons, bounded };
}

// ── Data-quality evaluation (deterministic) ─────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Evaluate a set of quality rules against a table's rows; returns per-rule
 *  violation counts (bounded total). Never modifies rows. */
export function evaluateQuality(
  rules: { id: string; field: string; ruleType: string; params: { min?: number; max?: number } }[],
  table: TableDef | null,
  rows: DataRow[],
  maxIssues: number,
): { ruleId: string; field: string; issues: number }[] {
  if (!table) return rules.map((r) => ({ ruleId: r.id, field: r.field, issues: 0 }));
  const fieldKeys = new Set(table.fields.map((f) => f.key));
  const out: { ruleId: string; field: string; issues: number }[] = [];
  let total = 0;
  for (const rule of rules) {
    if (!fieldKeys.has(rule.field) || total >= maxIssues) {
      out.push({ ruleId: rule.id, field: rule.field, issues: 0 });
      continue;
    }
    let issues = 0;
    for (const row of rows) {
      if (total >= maxIssues) break;
      const v = row.data[rule.field];
      if (!qualityViolation(rule.ruleType, v, rule.params)) continue;
      issues++;
      total++;
    }
    out.push({ ruleId: rule.id, field: rule.field, issues });
  }
  return out;
}

export function qualityViolation(ruleType: string, v: unknown, params: { min?: number; max?: number }): boolean {
  switch (ruleType) {
    case "required":
      return v === undefined || v === null || String(v).trim() === "";
    case "email":
      if (v === undefined || v === null || String(v).trim() === "") return false;
      return !EMAIL_RE.test(String(v).trim());
    case "phone": {
      if (v === undefined || v === null || String(v).trim() === "") return false;
      const digits = String(v).replace(/\D/g, "");
      return digits.length < 7;
    }
    case "number-range": {
      if (v === undefined || v === null || String(v).trim() === "") return false;
      const n = Number(v);
      if (!Number.isFinite(n)) return true;
      if (params.min !== undefined && n < params.min) return true;
      if (params.max !== undefined && n > params.max) return true;
      return false;
    }
    case "date-format": {
      if (v === undefined || v === null || String(v).trim() === "") return false;
      const s = String(v).trim();
      if (!DATE_RE.test(s)) return true;
      const d = new Date(`${s}T00:00:00Z`);
      return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s;
    }
    default:
      return false; // unknown rule type never flags (validated upstream anyway)
  }
}

/** Survivorship: the row with more non-empty fields wins; tie → the EARLIER
 *  createdAt (the original record stays canonical). Deterministic. */
export function chooseSurvivor(rows: DataRow[]): DataRow {
  const scored = rows.map((r) => ({
    row: r,
    score: Object.values(r.data).filter((v) => v !== undefined && v !== null && String(v).trim() !== "").length,
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.row.createdAt < b.row.createdAt ? -1 : a.row.createdAt > b.row.createdAt ? 1 : 0;
  });
  return scored[0].row;
}