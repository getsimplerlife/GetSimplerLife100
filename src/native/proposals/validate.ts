/**
 * native/proposals/validate.ts — fail-closed validation for proposal payloads.
 * Called BEFORE the gate (a never-valid write must never reach the queue) and
 * again inside the apply executor (defense in depth).
 */
import {
  MAX_CLIENT_COMPANY,
  MAX_CLIENT_EMAIL,
  MAX_CLIENT_NAME,
  MAX_LINE_ITEMS,
  MAX_QTY,
  MAX_TERMS_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_UNIT_PRICE,
  MAX_VALIDITY_DAYS,
  MIN_VALIDITY_DAYS,
  type ProposalLineItem,
  type ProposalMutation,
} from "./types";

export type ValidateResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const TWO_DP_RE = /^\d+(\.\d{1,2})?$/;

function checkTwoDp(value: unknown): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return TWO_DP_RE.test(String(value));
}

/** Validate a full create/update mutation (partials allowed for update). */
export function validateProposalMutation(m: ProposalMutation): ValidateResult {
  const check = (v: unknown, max: number, min?: number): boolean => {
    if (typeof v !== "string") return false;
    const len = v.trim().length;
    return len >= (min ?? 0) && len <= max;
  };
  if (m.title !== undefined && !check(m.title, MAX_TITLE_LENGTH, 1)) {
    return { ok: false, error: `title must be a 1..${MAX_TITLE_LENGTH}-char string` };
  }
  if (m.clientName !== undefined && !check(m.clientName, MAX_CLIENT_NAME, 1)) {
    return { ok: false, error: `clientName must be a 1..${MAX_CLIENT_NAME}-char string` };
  }
  if (m.clientEmail !== undefined && m.clientEmail !== "") {
    if (typeof m.clientEmail !== "string" || m.clientEmail.length > MAX_CLIENT_EMAIL || !EMAIL_RE.test(m.clientEmail.trim())) {
      return { ok: false, error: "clientEmail must be a valid email or empty" };
    }
  }
  if (m.clientCompany !== undefined && !check(m.clientCompany, MAX_CLIENT_COMPANY, 0)) {
    return { ok: false, error: `clientCompany must be ≤ ${MAX_CLIENT_COMPANY} chars` };
  }
  if (m.terms !== undefined && !check(m.terms, MAX_TERMS_LENGTH, 0)) {
    return { ok: false, error: `terms must be ≤ ${MAX_TERMS_LENGTH} chars` };
  }
  if (m.currency !== undefined) {
    if (typeof m.currency !== "string" || !CURRENCY_RE.test(m.currency.trim())) {
      return { ok: false, error: "currency must be a 3-letter ISO code (e.g. USD)" };
    }
  }
  if (m.validityDays !== undefined) {
    if (typeof m.validityDays !== "number" || !Number.isInteger(m.validityDays) || m.validityDays < MIN_VALIDITY_DAYS || m.validityDays > MAX_VALIDITY_DAYS) {
      return { ok: false, error: `validityDays must be ${MIN_VALIDITY_DAYS}..${MAX_VALIDITY_DAYS}` };
    }
  }
  if (m.lineItems !== undefined) {
    if (!Array.isArray(m.lineItems) || m.lineItems.length === 0 || m.lineItems.length > MAX_LINE_ITEMS) {
      return { ok: false, error: `lineItems must contain 1..${MAX_LINE_ITEMS} items` };
    }
    for (const li of m.lineItems) {
      const bad = validateLineItem(li);
      if (!bad.ok) return bad;
    }
  }
  return { ok: true };
}

export function validateLineItem(li: unknown): ValidateResult {
  if (!li || typeof li !== "object" || Array.isArray(li)) return { ok: false, error: "line item must be an object" };
  const it = li as Record<string, unknown>;
  if (typeof it.description !== "string" || it.description.trim().length === 0 || it.description.length > 400) {
    return { ok: false, error: "line item description must be a 1..400-char string" };
  }
  if (typeof it.qty !== "number" || it.qty <= 0 || it.qty > MAX_QTY || !checkTwoDp(it.qty)) {
    return { ok: false, error: `line item qty must be > 0 and ≤ ${MAX_QTY} (≤ 2 decimals)` };
  }
  if (typeof it.unitPrice !== "number" || it.unitPrice < 0 || it.unitPrice > MAX_UNIT_PRICE || !checkTwoDp(it.unitPrice)) {
    return { ok: false, error: `line item unitPrice must be 0..${MAX_UNIT_PRICE} (≤ 2 decimals)` };
  }
  return { ok: true };
}

/** Line item shape helper for router parsing — assign stable ids, drop unknowns. */
export function normalizeLineItems(raw: unknown): ProposalLineItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ProposalLineItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    const o = r as Record<string, unknown>;
    if (typeof o.description !== "string" || o.description.trim().length === 0) return null;
    if (typeof o.qty !== "number" || typeof o.unitPrice !== "number") return null;
    out.push({
      id: `li_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`,
      description: o.description.trim().slice(0, 400),
      qty: o.qty,
      unitPrice: o.unitPrice,
    });
  }
  return out;
}