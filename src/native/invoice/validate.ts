/**
 * native/invoice/validate.ts — Phase 2.5 native INVOICE validation.
 *
 * Shape/syntax only. Existence checks (linkedDealRoomId in-tenant) happen in
 * the gate where the store is reachable — same split as deal rooms (2.4).
 * Fail-closed: unknown keys are dropped, ids are pattern-checked, and nothing
 * here ever trusts a client-supplied record id.
 */
import { MAX_CUSTOMER_EMAIL, MAX_LINE_DESCRIPTION, type InvoiceMutation } from "./types";
// SLICE 195a — the SHAPE rule for a client id, from the one module that owns
// it. Existence in THIS tenant is a store question answered by the gate.
import { isClientRefShape } from "../../lib/client-ref";

export type ValidateResult = { ok: true } | { ok: false; error: string };

/** Same shape rule as proposals' clientEmail (fail-closed, no MX check). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** True when the value is a single, syntactically valid email address. */
export function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && v.trim().length <= MAX_CUSTOMER_EMAIL && EMAIL_RE.test(v.trim());
}

/**
 * Validate the CUSTOMER RECIPIENT before it reaches the gate or the record.
 * A malformed value is a hard 400 — never coerced, never defaulted to a
 * real-looking address (an invoice must not be mailed to a guess).
 */
export function validateCustomerEmail(v: unknown): ValidateResult {
  if (typeof v !== "string") return { ok: false, error: "customerEmail must be a valid email address" };
  const trimmed = v.trim();
  if (trimmed.length === 0) return { ok: false, error: "customerEmail must be a valid email address" };
  if (trimmed.length > MAX_CUSTOMER_EMAIL) {
    return { ok: false, error: `customerEmail must be ≤ ${MAX_CUSTOMER_EMAIL} chars` };
  }
  if (!EMAIL_RE.test(trimmed)) return { ok: false, error: "customerEmail must be a valid email address" };
  return { ok: true };
}

/** Server-assigned invoice id pattern (inv_<random>). */
export function isInvoiceId(v: unknown): v is string {
  return typeof v === "string" && /^inv_[A-Za-z0-9_-]+$/.test(v);
}
/** Server-assigned deal room id pattern (dea_<random>). */
export function isDealRoomIdRef(v: unknown): v is string {
  return typeof v === "string" && /^dea_[A-Za-z0-9_-]+$/.test(v);
}
function checkStr(v: unknown, max: number, min = 0): boolean {
  if (typeof v !== "string") return false;
  const len = v.trim().length;
  return len >= min && len <= max;
}

/**
 * Validate a create payload. Only linkedDealRoomId is accepted (and required);
 * every other field is DERIVED by the gate from the linked deal room's
 * proposal — a client can never inject prices, currency, or line items.
 */
export function validateInvoiceMutation(m: InvoiceMutation, { requireDealRoom = false }: { requireDealRoom?: boolean } = {}): ValidateResult & { data?: InvoiceMutation } {
  const out: InvoiceMutation = {};
  // SLICE 195a — shape only; "required on create" and "exists in this tenant"
  // are both decided in the gate, which can see the client store.
  if (m.clientId !== undefined) {
    if (!isClientRefShape(m.clientId)) return { ok: false, error: "clientId must be a client id from this workspace" };
    out.clientId = m.clientId.trim();
  }
  if (m.linkedDealRoomId !== undefined) {
    if (!isDealRoomIdRef(m.linkedDealRoomId)) return { ok: false, error: "linkedDealRoomId must be a deal room id (dea_…)" };
    out.linkedDealRoomId = m.linkedDealRoomId;
  } else if (requireDealRoom) {
    return { ok: false, error: "linkedDealRoomId is required (invoices belong to a deal room)" };
  }
  if (m.customerEmail !== undefined) {
    const v = validateCustomerEmail(m.customerEmail);
    if (!v.ok) return v;
    out.customerEmail = m.customerEmail.trim();
  }
  return { ok: true, data: out };
}

/** Build an InvoiceMutation from a create request body (raw keys dropped). */
export function createInvoiceMutationFromInput(body: Record<string, unknown>): InvoiceMutation {
  const m: InvoiceMutation = {};
  // SLICE 195a — the client the invoice bills. Passed through as-is: the shape
  // check rejects a non-string, and the gate refuses a missing id outright
  // rather than falling back to the linked deal room's customer (a guess).
  if (typeof body.clientId === "string") m.clientId = body.clientId;
  if (typeof body.linkedDealRoomId === "string") m.linkedDealRoomId = body.linkedDealRoomId;
  if (typeof body.customerEmail === "string") m.customerEmail = body.customerEmail;
  return m;
}

/** Validate a snapshot line description bound (fail-closed in generate). */
export function isValidLineDescription(v: string): boolean {
  return checkStr(v, MAX_LINE_DESCRIPTION, 1);
}