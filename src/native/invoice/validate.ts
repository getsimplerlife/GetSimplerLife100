/**
 * native/invoice/validate.ts — Phase 2.5 native INVOICE validation.
 *
 * Shape/syntax only. Existence checks (linkedDealRoomId in-tenant) happen in
 * the gate where the store is reachable — same split as deal rooms (2.4).
 * Fail-closed: unknown keys are dropped, ids are pattern-checked, and nothing
 * here ever trusts a client-supplied record id.
 */
import { MAX_LINE_DESCRIPTION, type InvoiceMutation } from "./types";

export type ValidateResult = { ok: true } | { ok: false; error: string };

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
  if (m.linkedDealRoomId !== undefined) {
    if (!isDealRoomIdRef(m.linkedDealRoomId)) return { ok: false, error: "linkedDealRoomId must be a deal room id (dea_…)" };
    out.linkedDealRoomId = m.linkedDealRoomId;
  } else if (requireDealRoom) {
    return { ok: false, error: "linkedDealRoomId is required (invoices belong to a deal room)" };
  }
  return { ok: true, data: out };
}

/** Build an InvoiceMutation from a create request body (raw keys dropped). */
export function createInvoiceMutationFromInput(body: Record<string, unknown>): InvoiceMutation {
  const m: InvoiceMutation = {};
  if (typeof body.linkedDealRoomId === "string") m.linkedDealRoomId = body.linkedDealRoomId;
  return m;
}

/** Validate a snapshot line description bound (fail-closed in generate). */
export function isValidLineDescription(v: string): boolean {
  return checkStr(v, MAX_LINE_DESCRIPTION, 1);
}