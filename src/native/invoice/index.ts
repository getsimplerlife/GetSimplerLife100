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
  handleNativeInvoiceShare,
  registerBuiltinNativeInvoiceEventTypes,
  type NativeInvoicesCtx,
  type NativeInvoicePublicCtx,
} from "./router";
import { submitInvoiceWrite, executePendingInvoiceWrite, noteOwnerDecision } from "./gate";
import { renderInvoicePdf, invoiceHtml, invoiceTotalCents, formatCurrency } from "./generate";
import { resolveIssuerDisplayName, NEUTRAL_ISSUER_LABEL } from "./issuer";
import { getTenantStripeStatus, connectTenantStripe, disconnectTenantStripe, validateStripeSecretKey } from "./stripe-connect";
import { createTenantCheckoutSession } from "./stripe-checkout";
import { handleTenantInvoiceStripeWebhook, type InvoiceWebhookCtx } from "./stripe-webhook";
export {
  handleNativeInvoicesAuthed,
  handleNativeInvoiceShare,
  registerBuiltinNativeInvoiceEventTypes,
  submitInvoiceWrite,
  executePendingInvoiceWrite,
  noteOwnerDecision,
  renderInvoicePdf,
  invoiceHtml,
  invoiceTotalCents,
  formatCurrency,
  resolveIssuerDisplayName,
  NEUTRAL_ISSUER_LABEL,
  // Slice 134 — the tenant's OWN Stripe account (pay link on the public
  // invoice). `loadTenantStripeSecret` is deliberately NOT exported here: the
  // decrypted key never leaves the server-side checkout module.
  getTenantStripeStatus,
  connectTenantStripe,
  disconnectTenantStripe,
  validateStripeSecretKey,
  createTenantCheckoutSession,
  // Slice 155 — the tenant's own Stripe webhook: the ONLY writer of a
  // confirmed payment. Unauthenticated by design (the signature is the
  // authenticator, resolved per tenant from the path token).
  handleTenantInvoiceStripeWebhook,
};
export type { NativeInvoicesCtx, NativeInvoicePublicCtx, InvoiceWebhookCtx };