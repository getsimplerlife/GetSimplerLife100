/**
 * extraction-parse.ts — Phase 1.5b: hostile-input-safe parsing of model output.
 *
 * The LLM returns JSON (possibly wrapped in fences/commentary). We extract the
 * FIRST balanced top-level JSON object, validate every field, clamp confidence
 * into 0..1, normalize money/date types, and NEVER trust unknown categories or
 * out-of-range flags. Anything that cannot be validated becomes a quality flag
 * or a parse failure — never silent garbage.
 */
import {
  DOC_CATEGORIES,
  clampConfidence,
  EXTRACTION_MIN_CONFIDENCE,
  EXTRACTION_MAX_LINE_ITEMS,
  type DocCategory,
  type ExtractionField,
  type ExtractionLineItem,
  type ExtractionQuality,
  type ExtractionQualityFlag,
} from "./extraction-types";
import { EXTRACTION_FIELD_SCHEMAS, type ExtractionFieldSpec } from "./extraction-prompts";

function extractJsonObject(text: string): Record<string, any> | null {
  // Fence stripping first (```json ... ``` or ``` ... ```).
  let cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(cleaned.slice(start, i + 1));
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Strip a money string → number|null (never NaN, never junk). */
export function normalizeAmount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[$€£¥\s,]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned !== "" ? n : null;
}

/** Accepts YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY-ish, and full ISO datetimes. */
export function normalizeDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return null;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const mo = Number(us[1]);
    const d = Number(us[2]);
    const y = Number(us[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const FLAG_CODES: ExtractionQualityFlag["code"][] = [
  "blurry",
  "unreadable",
  "wrong-orientation",
  "oversize",
  "empty-text",
  "handwritten",
];

function normalizeFlags(raw: unknown): ExtractionQualityFlag[] {
  if (!Array.isArray(raw)) return [];
  const flags: ExtractionQualityFlag[] = [];
  for (const f of raw) {
    const code = String(f || "").toUpperCase();
    const match = FLAG_CODES.find((c) => code === c.toUpperCase() || code.includes(c.replace("-", "")));
    // model-reported codes that are not in the allow-list are DROPPED (never
    // trust an unknown flag string — it could be prompt injection).
    if (match) flags.push({ code: match, source: "model" });
  }
  return flags;
}

interface ParsedField {
  value: unknown;
  confidence: unknown;
}

export interface ParsedModelOutput {
  category: DocCategory | null;
  categoryConfidence: number;
  fields: Array<{ key: string; label: string; raw?: unknown; value: string; numberValue?: number | null; dateValue?: string | null; confidence: number }>;
  lineItems: ExtractionLineItem[];
  flags: ExtractionQualityFlag[];
  readable: boolean;
  suggestedRoute?: string;
  suggestedTags: string[];
  note?: string;
}

const FREE_TEXT_KEYS = new Set(["summary", "obligations", "subject", "renewal", "category", "title", "note"]);

/** Parse + validate the model's JSON into a typed intermediate. */
export function parseModelOutput(content: string, expectedCategory: DocCategory): ParsedModelOutput {
  const obj = extractJsonObject(content);
  const flags: ExtractionQualityFlag[] = [];
  if (!obj) {
    // Unparseable → category null so the runner can route to the error/
    // review lane instead of fabricating a classification.
    return {
      category: null,
      categoryConfidence: 0,
      fields: [],
      lineItems: [],
      flags: [{ code: "unreadable", source: "model", detail: "model output did not parse" }],
      readable: false,
      suggestedTags: [],
    };
  }

  const rawCategory = String(obj.category || "").toLowerCase() as DocCategory;
  const category = DOC_CATEGORIES.includes(rawCategory) ? rawCategory : expectedCategory;
  const categoryConfidence = clampConfidence(obj.categoryConfidence, 0.5);

  const specMap = new Map<string, ExtractionFieldSpec>((EXTRACTION_FIELD_SCHEMAS[category] || []).map((s) => [s.key, s]));
  const rawFields: Record<string, ParsedField> =
    obj.fields && typeof obj.fields === "object" && !Array.isArray(obj.fields) ? obj.fields : {};

  const fields: ExtractionField[] = [];
  for (const [key, spec] of specMap) {
    const entry = rawFields[key] ?? (rawFields as any)[spec.label];
    const rawVal = entry?.value !== undefined ? entry.value : (obj as any)[key];
    const conf = clampConfidence(entry?.confidence, rawVal === null || rawVal === undefined ? 0 : 0.6);
    const strVal = rawVal === null || rawVal === undefined ? "" : String(rawVal);
    const field: ExtractionField = {
      key,
      label: spec.label,
      value: strVal,
      confidence: conf,
    };
    if (spec.kind === "money") {
      const n = normalizeAmount(strVal);
      field.numberValue = n;
      if (n === null && strVal !== "") field.confidence = Math.min(field.confidence, 0.2); // bad number = low trust
    } else if (spec.kind === "date") {
      const d = normalizeDate(strVal);
      field.dateValue = d;
      if (d === null && strVal !== "") field.confidence = Math.min(field.confidence, 0.2);
    } else if (spec.kind === "qty") {
      field.numberValue = normalizeAmount(strVal);
    }
    fields.push(field);
  }
  // Preserve any extra text-ish fields the model returned that we don't schema
  // but that are clearly free text (keeps long obligations/summaries visible).
  for (const [key, entry] of Object.entries(rawFields)) {
    if (specMap.has(key)) continue;
    const rawVal = (entry as ParsedField)?.value;
    if (rawVal === null || rawVal === undefined) continue;
    const strVal = String(rawVal);
    if (!strVal.trim()) continue;
    if (FREE_TEXT_KEYS.has(key.toLowerCase())) {
      fields.push({
        key,
        label: key,
        value: strVal.slice(0, 2000),
        confidence: clampConfidence((entry as ParsedField)?.confidence, 0.6),
      });
    }
  }

  const lineItems: ExtractionLineItem[] = [];
  if (Array.isArray(obj.lineItems)) {
    for (const li of obj.lineItems.slice(0, EXTRACTION_MAX_LINE_ITEMS)) {
      if (!li || typeof li !== "object") continue;
      const description = String(li.description || "").trim();
      if (!description) continue;
      lineItems.push({
        description,
        quantity: normalizeAmount(li.quantity),
        unitPrice: normalizeAmount(li.unitPrice),
        amount: normalizeAmount(li.amount),
        confidence: clampConfidence(li.confidence, 0.6),
      });
    }
  }

  const qualityFlags = normalizeFlags(obj.quality?.flags);
  const readable = obj.quality?.readable !== false;
  if (!readable) qualityFlags.push({ code: "unreadable", source: "model" });
  qualityFlags.push(...flags);

  const suggestedRouteRaw = obj.suggestedRoute;
  let suggestedRoute: string | undefined;
  if (typeof suggestedRouteRaw === "string" && suggestedRouteRaw.trim() && !/^null$/i.test(suggestedRouteRaw.trim())) {
    suggestedRoute = suggestedRouteRaw.trim().slice(0, 300);
  }
  const suggestedTags: string[] = Array.isArray(obj.suggestedTags)
    ? obj.suggestedTags.map((t: unknown) => String(t).trim().slice(0, 60)).filter((t: string) => t.length > 0).slice(0, 12)
    : [];
  const note = typeof obj.quality?.note === "string" ? obj.quality.note.slice(0, 300) : undefined;

  return {
    category,
    categoryConfidence,
    fields,
    lineItems,
    flags: qualityFlags,
    readable,
    suggestedRoute,
    suggestedTags,
    note,
  };
}

/** Combine parsed output + deterministic signals into the final quality view.
 *  `lowConfidence` (category or any field below the floor) forces the
 *  human-review lane — low-confidence results can never auto-apply. */
export function buildQuality(
  parsedFlags: ExtractionQualityFlag[],
  deterministicFlags: ExtractionQualityFlag[],
  readableScore: number,
  lowConfidence = false,
): ExtractionQuality {
  const seen = new Set<string>();
  const flags: ExtractionQualityFlag[] = [];
  for (const f of [...deterministicFlags, ...parsedFlags]) {
    const key = `${f.code}:${f.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flags.push(f);
  }
  return {
    flags,
    readableScore: clampConfidence(readableScore, 0.8),
    requiresReview: flags.length > 0 || lowConfidence,
  };
}