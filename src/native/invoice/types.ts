/**
 * native/invoice/types.ts — Phase 2.5 native INVOICE (quote-to-cash slice 5,
 * the FINAL slice). Builds a customer invoice from an existing DEAL ROOM.
 *
 * Discipline (mirrors P2.1–P2.4 exactly):
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.invoice.* audit on every mutation,
 *   - server-assigned ids (inv_…) — forged id on create → 400 BEFORE any
 *     normalization; unknown id on update/ops → 404/400 fail-closed,
 *   - linkedDealRoomId is REQUIRED and must exist IN THE TENANT (404-no-IDOR);
 *     the invoice SNAPSHOTS the deal room's linked proposal line items into
 *     integer cents at create (2dp money in minor units — no float drift),
 *   - every write rides the Approval Queue (verb-first action names
 *     createInvoice/generateInvoice/sendInvoice/deleteInvoice),
 *   - lifecycle draft → sent (sent is TERMINAL; regenerating or deleting a
 *     sent invoice fails closed — it is a legal record),
 *   - the PDF is generated via Phase 1.2 renderHtmlDocument (all client
 *     strings HTML-escaped, no template injection) and stored in the per-tenant
 *     auto-bucket as an ADD-ONLY doc (draft v1, send v2) — the record only
 *     carries a docId reference; bytes live in the doc store,
 *   - posting to the customer's accounting books (Xero/QBO) is OUT OF SCOPE
 *     (owner 09-20): that remains the existing verified external adapters.
 */
export type InvoiceStatus = "draft" | "sent";

/** One billed line — a snapshot of the linked proposal line item in cents. */
export interface InvoiceLineItem {
  /** Stable line id (li_… from the source proposal / server-assigned). */
  id: string;
  description: string; // 1..400
  qty: number; // > 0, ≤ 2 decimals (proposal discipline)
  unitPriceCents: number; // integer cents (minor units of currency)
}

export interface InvoiceRecord {
  id: string; // inv_<random> — server-assigned
  tenantId: string;
  /** Human invoice number, per-tenant sequence (INV-0001, INV-0002, …). */
  invoiceNumber: string;
  /** Linked deal room — REQUIRED, must exist in-tenant (404-no-IDOR). */
  linkedDealRoomId: string; // dea_<random>
  currency: string; // ISO 4217 uppercase (from the linked proposal)
  /** Snapshot of the deal room's proposal line items in integer cents. */
  lineItems: InvoiceLineItem[];
  /** Total due in integer cents (sum of qty × unitPriceCents). */
  amountDueCents: number;
  status: InvoiceStatus;
  /** Latest generated PDF (Phase 1.2 doc store, add-only versions). */
  docId: string | null;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  sentAt?: string;
  sentBy?: string;
}

/** Create payload — linkedDealRoomId required; everything else derived. */
export interface InvoiceMutation {
  linkedDealRoomId?: string;
}

/**
 * Gated-write ops. ACTION NAMES are verb-first (createInvoice/generateInvoice/
 * sendInvoice/deleteInvoice) so the Approval Queue isWriteAction classifies
 * them as writes — same rule as 2.1/2.3/2.4 (never a verb-last name).
 */
export type InvoiceOp = "create" | "generate" | "send" | "delete";

export interface PendingInvoiceWrite {
  id: string; // ipw_<random>
  tenantId: string;
  invoiceId: string | null; // null for create (record not yet inserted)
  op: InvoiceOp;
  payload: {
    data?: InvoiceMutation;
    via?: string; // "portal"
  };
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { status: InvoiceStatus; invoiceId: string };
  appliedAt?: string;
  appliedBy?: string;
  error?: string;
}

// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_INVOICES_PER_TENANT = 50;
export const MAX_PENDING_INVOICE_WRITES = 50;
export const MAX_INVOICE_LINE_ITEMS = 50;
export const MAX_LINE_DESCRIPTION = 400;

// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_INVOICES_KEY = "native_invoices.json";
export const NATIVE_INVOICES_AUDIT_KEY = "native_invoices_audit.json";