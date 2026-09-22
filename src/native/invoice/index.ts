/**
 * native/invoice/index.ts — Phase 2.5 native INVOICE (quote-to-cash slice 5,
 * FINAL slice). Barrel. Authed tenant CRUD + gated lifecycle writes
 * (create/generate/send/delete) ride the Approval Queue; the native invoice
 * PDF is generated via Phase 1.2 and stored add-only in the doc store; typed
 * native.invoice.* events (Phase 1.1 outbound). Surfaces in the deal room and
 * /portal/invoices. Posting to accounting books = existing verified adapters
 * (out of scope here, owner 09-20).
 */
import {
  handleNativeInvoicesAuthed,
  registerBuiltinNativeInvoiceEventTypes,
  type NativeInvoicesCtx,
} from "./router";
import { submitInvoiceWrite, executePendingInvoiceWrite, noteOwnerDecision } from "./gate";
import { renderInvoicePdf, invoiceHtml, invoiceTotalCents, formatCurrency } from "./generate";
export {
  handleNativeInvoicesAuthed,
  registerBuiltinNativeInvoiceEventTypes,
  submitInvoiceWrite,
  executePendingInvoiceWrite,
  noteOwnerDecision,
  renderInvoicePdf,
  invoiceHtml,
  invoiceTotalCents,
  formatCurrency,
};
export type { NativeInvoicesCtx };