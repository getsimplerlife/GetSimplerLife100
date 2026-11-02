/**
 * SLICE 180 — the customer-facing copy for an invoice status.
 *
 * WHY THIS EXISTS: `/deal-rooms/share/:slug` rendered
 * `inv.status === "sent" ? "Sent" : "Draft"`. The server can emit FOUR statuses
 * (`INVOICE_STATUSES` in src/native/invoice/types.ts): a `failed` invoice — one
 * whose delivery the mail lane refused — therefore rendered as "Draft", i.e.
 * work in progress, on the page the customer reads. `queued` did too.
 *
 * THE RULE: every state the server can emit has its own label and its own tone,
 * and the maps are typed `Record<InvoiceStatus, …>`, so adding a status without
 * copy is a COMPILE ERROR rather than a silent fall-through. A status the server
 * does not emit is shown as its raw value — never mapped onto a friendlier one.
 */
import { INVOICE_STATUSES, type InvoiceStatus } from "~/native/invoice/types";

export type InvoiceStatusTone = "success" | "warning" | "danger" | "stone";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  // Written BEFORE the outbound attempt; the terminal status replaces it.
  queued: "Sending",
  sent: "Sent",
  // Delivery was refused — nothing reached the customer. Never "Draft".
  failed: "Not delivered",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, InvoiceStatusTone> = {
  draft: "stone",
  queued: "warning",
  sent: "success",
  failed: "danger",
};

const isInvoiceStatus = (value: unknown): value is InvoiceStatus =>
  typeof value === "string" && (INVOICE_STATUSES as readonly string[]).includes(value);

/** The label for a server status; an unknown value is shown verbatim. */
export function invoiceStatusLabel(status: string | null | undefined): string {
  if (isInvoiceStatus(status)) return INVOICE_STATUS_LABEL[status];
  return typeof status === "string" && status.length > 0 ? status : "Unknown";
}

/** The Badge tone for a server status; an unknown value gets no verdict tone. */
export function invoiceStatusTone(status: string | null | undefined): InvoiceStatusTone {
  return isInvoiceStatus(status) ? INVOICE_STATUS_TONE[status] : "stone";
}
