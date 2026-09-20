/**
 * native/proposals/validate.ts — fail-closed validation for proposal payloads.
 * Called BEFORE the gate (a never-valid write must never reach the queue) and
 * again inside the apply executor (defense in depth).
 */
import {
  MAX_CLIENT_COMPANY,
  MAX_CLIENT_EMAIL,
  MAX_CLIENT_NAME,
  MAX_DRAWN_SIGNATURE_BYTES,
  MAX_INITIALS_LENGTH,
  MAX_LINE_ITEMS,
  MAX_QTY,
  MAX_SIGNER_NAME,
  MAX_TERMS_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_UNIT_PRICE,
  MAX_VALIDITY_DAYS,
  MIN_VALIDITY_DAYS,
  type ProposalLineItem,
  type ProposalMutation,
  type ProposalSignatureInput,
} from "./types";
import { sha256Of } from "../documents/store";

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

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const INITIALS_RE = /^[A-Za-z0-9 .'\-]+$/;

/**
 * Validate a signature captured on the share page (Phase 2.2 e-sign).
 * Fail-closed: name/initials bounds, strict base64 PNG data-URL shape,
 * decoded-size cap and PNG magic-byte sniffing. Returns the normalized input
 * plus a durable sha256 payloadHash. Runs BEFORE the gate — a never-valid
 * signature never queues (400).
 */
export function validateSignatureInput(value: unknown): { ok: true; signature: ProposalSignatureInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "signature must be an object" };
  const v = value as Record<string, unknown>;
  const signerName = typeof v.signerName === "string" ? v.signerName.trim() : "";
  if (signerName.length < 1 || signerName.length > MAX_SIGNER_NAME) {
    return { ok: false, error: `signerName must be 1..${MAX_SIGNER_NAME} chars` };
  }
  const signatureType = v.signatureType;
  if (signatureType !== "typed" && signatureType !== "drawn") {
    return { ok: false, error: "signatureType must be \"typed\" or \"drawn\"" };
  }
  let initials: string | undefined;
  let drawnDataUrl: string | undefined;
  if (signatureType === "typed") {
    const raw = typeof v.initials === "string" ? v.initials.trim() : "";
    if (raw.length < 1 || raw.length > MAX_INITIALS_LENGTH) {
      return { ok: false, error: `initials must be 1..${MAX_INITIALS_LENGTH} chars` };
    }
    if (!INITIALS_RE.test(raw)) return { ok: false, error: "initials may only contain letters, digits, spaces, dots, apostrophes and hyphens" };
    initials = raw;
  } else {
    const url = typeof v.drawnDataUrl === "string" ? v.drawnDataUrl.trim() : "";
    if (!DATA_URL_RE.test(url)) return { ok: false, error: "drawnDataUrl must be a base64 PNG data URL" };
    let bytes: Uint8Array;
    try {
      const b64 = url.slice("data:image/png;base64,".length);
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      return { ok: false, error: "drawnDataUrl is not valid base64" };
    }
    if (bytes.byteLength === 0) return { ok: false, error: "drawn signature is empty" };
    if (bytes.byteLength > MAX_DRAWN_SIGNATURE_BYTES) {
      return { ok: false, error: `drawn signature exceeds ${MAX_DRAWN_SIGNATURE_BYTES} bytes` };
    }
    for (let i = 0; i < 4; i++) {
      if (bytes[i] !== PNG_MAGIC[i]) return { ok: false, error: "drawn signature must be a PNG image (magic bytes)" };
    }
    drawnDataUrl = url;
  }
  const canonical = JSON.stringify({ signerName, signatureType, initials: initials ?? null, drawnDataUrl: drawnDataUrl ?? null });
  const payloadHash = sha256Of(new TextEncoder().encode(canonical));
  return { ok: true, signature: { signerName, signatureType, initials, drawnDataUrl, payloadHash } };
}
