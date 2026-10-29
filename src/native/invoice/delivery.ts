/**
 * native/invoice/delivery.ts — the invoice LAST MILE: actually email it.
 *
 * Why this module exists: `send` used to flip the record to "sent" while
 * nothing left the building (a status lie — audit finding 2026-10-29). The
 * rule now is:
 *
 *   - the EXISTING lane sends the message — `sendEmail()` from
 *     src/integrations/email.ts (SendGrid HTTP when SENDGRID_API_KEY is set,
 *     SMTP when configured). No new provider, no new credential store.
 *   - only a PROVIDER ACKNOWLEDGEMENT counts as delivered. SendGrid's 202 is
 *     the acknowledgement; the mock/simulation fallback never is.
 *   - when the lane is unconfigured we do NOT dispatch at all (so nothing can
 *     be logged as if it were sent) and report `unconfigured` — the caller
 *     stores that verbatim and the UI says so plainly.
 *   - the message carries a LINK to the already-generated invoice PDF on the
 *     public signed-slug page — the PDF is never regenerated here.
 *
 * The email deliberately contains no payment link and no pay button: taking
 * payment is out of scope (owner decision pending), so the copy says payment
 * is arranged directly with the issuer.
 */
import { sendEmail, emailLaneStatus, type EmailOptions } from "../../integrations/email";
import { escapeHtmlValue } from "../documents/pdf";
import { formatCurrency, invoiceTotalCents } from "./generate";
import type { InvoiceRecord } from "./types";

/** Public origin used in customer-facing links (house pattern: SITE_ORIGIN). */
export function publicOrigin(): string {
  return (process.env.SITE_ORIGIN || "https://simplerlife100.ctonew.app").replace(/\/+$/, "");
}
/** Path of the public, read-only invoice page (signed slug). */
export function invoiceSharePath(slug: string): string {
  return `/invoices/share/${slug}`;
}
export function invoiceShareUrl(slug: string): string {
  return `${publicOrigin()}${invoiceSharePath(slug)}`;
}

export interface InvoiceEmailInput {
  invoice: InvoiceRecord;
  /** Customer name from the deal room (already validated upstream). */
  customerName: string;
  /** Who the invoice is from — the tenant's own workspace account. */
  issuerName: string;
  shareUrl: string;
}

export interface InvoiceDeliveryResult {
  channel: "sendgrid" | "smtp" | "none";
  outcome: "sent" | "failed" | "unconfigured";
  messageId?: string;
  error?: string;
}

function issuedDate(inv: InvoiceRecord): string {
  return new Date(inv.createdAt).toISOString().slice(0, 10);
}

/** Build the customer email (plain text + a small escaped HTML body). */
export function buildInvoiceEmail(input: InvoiceEmailInput): EmailOptions {
  const { invoice: inv, customerName, issuerName, shareUrl } = input;
  const amount = formatCurrency(invoiceTotalCents(inv), inv.currency);
  const subject = `Invoice ${inv.invoiceNumber} from ${issuerName} — ${amount}`;
  const lines = inv.lineItems
    .map((li) => `  - ${li.description} — ${li.qty} × ${formatCurrency(li.unitPriceCents, inv.currency)}`)
    .join("\n");
  const text = [
    `Hello ${customerName},`,
    "",
    `Please find invoice ${inv.invoiceNumber} from ${issuerName}.`,
    "",
    `  Invoice:  ${inv.invoiceNumber}`,
    `  Issued:   ${issuedDate(inv)}`,
    `  Due:      ${inv.dueDate} (net 30)`,
    `  Amount:   ${amount}`,
    "",
    "Line items:",
    lines,
    "",
    "View the invoice and download the PDF:",
    shareUrl,
    "",
    `Payment is arranged directly with ${issuerName} — this message and the invoice page do not take payment.`,
    "",
    `— ${issuerName}, sent via Simpler Life 100`,
  ].join("\n");
  const e = escapeHtmlValue;
  const rows = inv.lineItems
    .map(
      (li) =>
        `<tr><td>${e(li.description)}</td><td align="right">${e(String(li.qty))}</td><td align="right">${e(formatCurrency(li.unitPriceCents, inv.currency))}</td></tr>`,
    )
    .join("");
  const html = [
    `<p>Hello ${e(customerName)},</p>`,
    `<p>Please find invoice <strong>${e(inv.invoiceNumber)}</strong> from ${e(issuerName)}.</p>`,
    `<table><tbody>${rows}</tbody></table>`,
    `<p><strong>Total due:</strong> ${e(amount)}<br /><strong>Due:</strong> ${e(inv.dueDate)} (net 30)<br /><strong>Issued:</strong> ${e(issuedDate(inv))}</p>`,
    `<p><a href="${e(shareUrl)}">View the invoice and download the PDF</a></p>`,
    `<p>Payment is arranged directly with ${e(issuerName)} — this message and the invoice page do not take payment.</p>`,
    `<p>— ${e(issuerName)}, sent via Simpler Life 100</p>`,
  ].join("\n");
  return { to: inv.customerEmail, subject, text, html };
}

/**
 * Dispatch the invoice email through the existing lane.
 * NEVER throws: every failure mode comes back as an explicit outcome so the
 * caller can store the truth (and the UI can show it).
 */
export async function deliverInvoiceEmail(input: InvoiceEmailInput): Promise<InvoiceDeliveryResult> {
  const lane = emailLaneStatus();
  if (!lane.configured) {
    // No real lane → no dispatch at all. Nothing may claim delivery.
    return {
      channel: "none",
      outcome: "unconfigured",
      error: "Email is not configured on this workspace (no SENDGRID_API_KEY and no SMTP credentials) — nothing was dispatched.",
    };
  }
  try {
    const res = await sendEmail(buildInvoiceEmail(input));
    if (res.isMock) {
      return {
        channel: lane.channel,
        outcome: "failed",
        error: "The email lane fell back to simulation (no delivery) — not reported as sent.",
      };
    }
    if (res.success && res.messageId) {
      return { channel: lane.channel, outcome: "sent", messageId: res.messageId };
    }
    return {
      channel: lane.channel,
      outcome: "failed",
      error: res.error || "The email provider did not acknowledge the message.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { channel: lane.channel, outcome: "failed", error: msg };
  }
}
