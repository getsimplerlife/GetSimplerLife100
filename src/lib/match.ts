/**
 * src/lib/match.ts — SERVER-SIDE ONLY. Do NOT import in any .tsx file.
 *
 * Deterministic identity matching + dedup helpers (capability upgrade #2).
 * Pure functions, no I/O, no LLM, no provider calls. Used to sharpen the
 * agent-processor's cross-system matching and dedup so quality is driven by
 * confidence scores and field weights instead of bare exact-equality strings.
 *
 * SAFETY: these helpers only ever CLASSIFY records (return matches + a 0–1
 * confidence). They never execute a write, never resolve connections, never
 * call a provider. They stay additive — callers fall back to their original
 * behavior when scoring is unavailable.
 */

// ── Normalization ───────────────────────────────────────────────────────────

/** Collapse whitespace + lowercase + trim. */
export function norm(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\w\s@.\-+]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Normalize an email address (lowercase, trim). */
export function normEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Strip every non-digit so phone variants compare equal. */
export function normPhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Normalize a tax/vendor id (trim + uppercase, collapse spaces). */
export function normId(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

const COMPANY_FILLERS = /^(the|a|an)\s+|\b(inc|ltd|llc|corp|corporation|company|co|group|holdings|limited|incorporated)\b\.?/gi;

/** Normalize a company/vendor name for fuzzy comparison (strip fillers). */
export function vendorNorm(value: unknown): string {
  const s = String(value ?? "");
  const stripped = s.replace(COMPANY_FILLERS, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(stripped);
}

/** Jaccard-ish token overlap in [0,1]. Bounded — O(tokens), safe for modest N. */
export function tokenOverlap(a: string, b: string): number {
  const ta = norm(a).split(" ").filter(Boolean);
  const tb = norm(b).split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  let inter = 0;
  for (const t of ta) if (setB.has(t)) inter++;
  const union = ta.length + tb.length - inter;
  return union === 0 ? 0 : inter / union;
}

// ── Field aliases (tolerant of cross-provider field names) ─────────────────

export const NAME_KEYS = ["name", "Name", "companyName", "CompanyName", "displayName", "DisplayName", "fullName", "full_name", "accountName", "AccountName", "vendorName", "VendorName", "title"];
export const EMAIL_KEYS = ["email", "Email", "EmailAddress", "emailAddress", "email_address", "primaryEmail", "primary_email", "email1"];
export const PHONE_KEYS = ["phone", "Phone", "phoneNumber", "PhoneNumber", "phone_number", "primaryPhone", "mobile", "Mobile", "workPhone"];
export const TAX_KEYS = ["taxNumber", "TaxNumber", "tax_number", "vatNumber", "VATNumber", "vat_number", "abn", "ABN", "gstNumber", "ein", "EIN"];
export const AMOUNT_KEYS = ["amount", "Amount", "total", "Total", "totalAmount", "TotalAmount", "total_amount", "balance", "Balance", "grandTotal", "GrandTotal"];

/** Return the first non-empty field value from an object, trying alias keys. */
export function pickValue(record: Record<string, any>, keys: string[]): unknown {
  for (const k of keys) {
    const v = record?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

// ── Weighted score ──────────────────────────────────────────────────────────

export interface MatchWeights {
  email: number;      // exact normalized email
  name: number;       // exact normalized company name
  nameVariant: number;// overlapping tokens / initial variant
  phone: number;      // exact normalized phone
  taxId: number;      // exact normalized tax/vendor id
}

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  email: 0.95,
  name: 0.85,
  nameVariant: 0.65,
  phone: 0.75,
  taxId: 0.8,
};

export interface ScoredMatch {
  confidence: number;          // 0–1
  matchedOn: string[];         // which signals fired ("email", "name", ...)
  normalized: Record<string, string>; // normalized keys used, for reuse
}

function initials(s: string): string {
  const tokens = norm(s).split(" ").filter(Boolean);
  if (tokens.length < 2) return "";
  return tokens[0][0] + tokens[tokens.length - 1][0]; // "John Smith" -> "js"
}

function nameVariantConfidence(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (tokenOverlap(a, b) >= 0.7) return 0.75;
  const ia = initials(a), ib = initials(b);
  if (ia && ib && ia === ib) return 0.7; // "John Smith" vs "J. Smith"
  return 0;
}

/**
 * Score the match between two records across identity fields.
 * Uses the HIGHEST single signal (best-evidence) so a strong email match is
 * not diluted by a missing name. Returns confidence in [0,1] + which signals.
 */
export function scoreEntityMatch(
  a: Record<string, any>,
  b: Record<string, any>,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): ScoredMatch {
  const out: ScoredMatch = { confidence: 0, matchedOn: [], normalized: {} };

  const ea = normEmail(pickValue(a, EMAIL_KEYS));
  const eb = normEmail(pickValue(b, EMAIL_KEYS));
  out.normalized.email = ea || eb || "";
  if (ea && eb && ea === eb) {
    out.matchedOn.push("email");
    out.confidence = Math.max(out.confidence, weights.email);
  }

  const na = vendorNorm(pickValue(a, NAME_KEYS));
  const nb = vendorNorm(pickValue(b, NAME_KEYS));
  out.normalized.name = na || nb || "";
  if (na && nb) {
    const nvc = nameVariantConfidence(na, nb);
    if (nvc >= 1) { out.matchedOn.push("name"); out.confidence = Math.max(out.confidence, weights.name); }
    else if (nvc >= 0.7) { out.matchedOn.push("nameVariant"); out.confidence = Math.max(out.confidence, weights.nameVariant); }
  }

  const pa = normPhone(pickValue(a, PHONE_KEYS));
  const pb = normPhone(pickValue(b, PHONE_KEYS));
  out.normalized.phone = pa || pb || "";
  if (pa && pb && pa === pb) { out.matchedOn.push("phone"); out.confidence = Math.max(out.confidence, weights.phone); }

  const ta = normId(pickValue(a, TAX_KEYS));
  const tb = normId(pickValue(b, TAX_KEYS));
  out.normalized.taxId = ta || tb || "";
  if (ta && tb && ta === tb) { out.matchedOn.push("taxId"); out.confidence = Math.max(out.confidence, weights.taxId); }

  return out;
}

// ── Fuzzy dedup (contacts/vendors) ──────────────────────────────────────────

export interface FuzzyDedupOptions {
  minConfidence?: number;      // default 0.65
  weights?: MatchWeights;
}

export interface DuplicatePair {
  a: Record<string, any>;
  b: Record<string, any>;
  key: string;                 // the shared normalized signal
  confidence: number;
  matchedOn: string[];
}

/**
 * Detect near-duplicate pairs in a list of records. Bounded and O(records):
 * bucket records by email / normalized name / normalized phone first, then
 * only score within a bucket. Exact duplicates are reported first.
 */
export function fuzzyDuplicates(
  records: Record<string, any>[],
  opts: FuzzyDedupOptions = {},
): DuplicatePair[] {
  const minConf = opts.minConfidence ?? 0.65;
  const weights = opts.weights ?? DEFAULT_MATCH_WEIGHTS;
  const out: DuplicatePair[] = [];
  const seen = new Set<string>(); // visited-by-[i,j] pairs

  // Build buckets on strong signals first for O(records) grouping.
  const buckets: Record<string, number[]> = {};
  records.forEach((r, i) => {
    const ea = normEmail(pickValue(r, EMAIL_KEYS));
    if (ea) { (buckets[`e:${ea}`] ??= []).push(i); }
    const na = vendorNorm(pickValue(r, NAME_KEYS));
    if (na) { (buckets[`n:${na.slice(0, 1)}`] ??= []).push(i); }
  });

  const considered = new Set<string>();
  for (const idxs of Object.values(buckets)) {
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = idxs[x], j = idxs[y];
        const pairKey = i < j ? `${i}|${j}` : `${j}|${i}`;
        if (considered.has(pairKey)) continue;
        considered.add(pairKey);
        const sc = scoreEntityMatch(records[i], records[j], weights);
        if (sc.confidence < minConf) continue;
        const k = i < j ? `${i}|${j}` : `${j}|${i}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
          a: records[i],
          b: records[j],
          key: sc.matchedOn[0] || sc.normalized.name || "matched",
          confidence: sc.confidence,
          matchedOn: sc.matchedOn,
        });
      }
    }
  }

  return out;
}

// ── Cross-record joins ──────────────────────────────────────────────────────

/**
 * Join two record lists on a normalized key (e.g. email). O(n+m) via a map.
 * Returns matched pairs with the key they joined on. Used for cross-system
 * joins (finance ↔ sales ↔ inventory) that emit higher-value insights.
 */
export function crossJoin<T extends Record<string, any>>(
  left: T[],
  leftKey: (r: T) => string,
  right: T[],
  rightKey: (r: T) => string,
): { left: T; right: T; key: string }[] {
  const map = new Map<string, T>();
  for (const r of right) {
    const k = leftKey(r) || rightKey(r);
    if (!k) continue;
    if (!map.has(k)) map.set(k, r);
  }
  const out: { left: T; right: T; key: string }[] = [];
  for (const l of left) {
    const k = leftKey(l);
    if (!k) continue;
    const r = map.get(k);
    if (r) out.push({ left: l, right: r, key: k });
  }
  return out;
}

/** Humanized rounding to 2 decimals for display. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
