/**
 * native/proposals/delivery.ts — the proposal LAST MILE: actually email it.
 *
 * Why this module exists (SLICE 176): `send` used to render the final PDF,
 * store it, stamp the record "sent", write an audit line and fire a webhook
 * with ZERO mail calls. The client received nothing and the portal said the
 * proposal was sent. That is the same status lie the invoice lane closed in
 * slice 170, and this module is the same answer applied to proposals.
 *
 * The rules are deliberately identical to `src/native/invoice/delivery.ts`:
 *
 *   - the EXISTING lane sends the message — `sendEmail()` from
 *     src/integrations/email.ts (SMTP when configured — the live Brevo lane —
 *     otherwise SendGrid HTTP). No new provider, no second credential store.
 *   - only a PROVIDER ACKNOWLEDGEMENT counts as delivered. The mock/simulation
 *     fallback never is.
 *   - when the lane is unconfigured we do NOT dispatch at all and report
 *     `unconfigured`; the caller stores that verbatim and the UI says so.
 *   - the message carries a LINK to the public share page, where the client
 *     reads the proposal and downloads the PDF. The PDF is never regenerated
 *     here — `gate.ts` rendered it before calling us.
 */
import { sendEmail, emailLaneStatus, type EmailOptions } from "../../integrations/email";
import { escapeHtmlValue } from "../documents/pdf";
import type { ProposalRecord } from "./types";

/** Public origin used in customer-facing links (house pattern: SITE_ORIGIN). */
export function proposalPublicOrigin(): string {
  return (process.env.SITE_ORIGIN || "https://www.simplerlife100.com").replace(/\/+$/, "");
}
/** Path of the public, read-only proposal page (signed slug). */
export function proposalSharePath(slug: string): string {
  return `/proposals/share/${slug}`;
}
export function proposalShareUrl(slug: string): string {
  return `${proposalPublicOrigin()}${proposalSharePath(slug)}`;
}

/** `USD 1234.50` — same minor-unit discipline as the store (no float drift). */
export function formatProposalTotal(p: Pick<ProposalRecord, "lineItems" | "currency">): string {
  const cents = p.lineItems.reduce((sum, li) => sum + Math.round(Math.round(li.unitPrice * 100) * li.qty), 0);
  return `${p.currency} ${(cents / 100).toFixed(2)}`;
}

export interface ProposalEmailInput {
  proposal: ProposalRecord;
  /** Public share URL the client opens to read + download the PDF. */
  shareUrl: string;
  /** Who the proposal is from — the workspace display name only, never the
   *  tenant id and never an entity id: the customer reads this. */
  issuerName: string;
}

export interface ProposalDeliveryResult {
  channel: "sendgrid" | "smtp" | "none";
  outcome: "sent" | "failed" | "unconfigured";
  messageId?: string;
  error?: string;
}

/** Build the customer email (plain text + a small escaped HTML body). */
export function buildProposalEmail(input: ProposalEmailInput): EmailOptions {
  const { proposal: p, shareUrl, issuerName } = input;
  const total = formatProposalTotal(p);
  const lines = p.lineItems
    .map((li) => `  - ${li.description} — ${li.qty} × ${p.currency} ${li.unitPrice.toFixed(2)}`)
    .join("\n");
  const text = [
    `Hello ${p.clientName},`,
    "",
    `Please find our proposal "${p.title}" from ${issuerName}.`,
    "",
    `  Proposal: ${p.title}`,
    `  Total:    ${total}`,
    `  Valid:    ${p.validityDays} days from issue`,
    "",
    "Line items:",
    lines,
    ...(p.terms ? ["", "Terms:", p.terms] : []),
    "",
    "Read the proposal and download the PDF:",
    shareUrl,
    "",
    `— ${issuerName}, sent via Simpler Life 100`,
  ].join("\n");
  const e = escapeHtmlValue;
  const rows = p.lineItems
    .map(
      (li) =>
        `<tr><td>${e(li.description)}</td><td align="right">${e(String(li.qty))}</td><td align="right">${e(`${p.currency} ${li.unitPrice.toFixed(2)}`)}</td></tr>`,
    )
    .join("");
  const html = [
    `<p>Hello ${e(p.clientName)},</p>`,
    `<p>Please find our proposal <strong>${e(p.title)}</strong> from ${e(issuerName)}.</p>`,
    `<table><tbody>${rows}</tbody></table>`,
    `<p><strong>Total:</strong> ${e(total)}<br /><strong>Valid:</strong> ${e(String(p.validityDays))} days from issue</p>`,
    ...(p.terms ? [`<p>${e(p.terms)}</p>`] : []),
    `<p><a href="${e(shareUrl)}">Read the proposal and download the PDF</a></p>`,
    `<p>— ${e(issuerName)}, sent via Simpler Life 100</p>`,
  ].join("\n");
  return { to: p.clientEmail, subject: `Proposal "${p.title}" from ${issuerName} — ${total}`, text, html };
}

/**
 * Dispatch the proposal email through the existing lane.
 * NEVER throws: every failure mode comes back as an explicit outcome so the
 * caller can store the truth (and the UI can show it).
 */
export async function deliverProposalEmail(input: ProposalEmailInput): Promise<ProposalDeliveryResult> {
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
    const res = await sendEmail(buildProposalEmail(input));
    // sendEmail may fall through to another configured lane, so the channel we
    // REPORT is the one that actually answered, not merely the preferred one.
    const usedChannel = res.channel && res.channel !== "none" ? res.channel : lane.channel;
    if (res.isMock) {
      return {
        channel: usedChannel,
        outcome: "failed",
        error: "The email lane fell back to simulation (no delivery) — not reported as sent.",
      };
    }
    if (res.success && res.messageId) {
      return { channel: usedChannel, outcome: "sent", messageId: res.messageId };
    }
    return {
      channel: usedChannel,
      outcome: "failed",
      error: res.error || "The email provider did not acknowledge the message.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { channel: lane.channel, outcome: "failed", error: msg };
  }
}
