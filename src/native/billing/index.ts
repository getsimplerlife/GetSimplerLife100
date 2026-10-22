/**
 * native/billing — P1-1 (owner 10-22) honest per-tenant billing READ.
 * See router.ts for the fail-closed contract + truthfulness guarantees.
 */
export { handleNativeBillingAuthed, centsToDollars, type NativeBillingView, type BillingSubscription, type BillingInvoice, type NativeBillingCtx } from "./router";