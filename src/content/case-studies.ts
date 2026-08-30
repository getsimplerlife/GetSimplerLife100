/**
 * case-studies.ts — Rebuilt for truthfulness (owner decision 08-29).
 *
 * Previous version contained 16 fabricated client stories (invented company
 * names + precise stats + named executive quotes) presented as "Real Results.
 * Real Impact." with no disclaimer. That is gone.
 *
 * This file now describes REAL, VERIFIED INTEGRATION CAPABILITY BLUEPRINTS:
 * automated workflow patterns that run on integrations we have live-verified
 * (Xero, HubSpot, DocuSign, Slack, Google Calendar, Microsoft 365, Google
 * productivity). These are demonstrations of what the platform CAN do with a
 * client's own authorized systems — proof of capability, NOT delivered client
 * results. No invented companies, no fabricated outcomes.
 *
 * Where any metric or savings figure appears it is an ILLUSTRATIVE ESTIMATE,
 * clearly labeled as such, never attributed to a real or invented client.
 */
export interface CaseStudy {
  id: string;
  title: string;
  /** The verified workflow pattern this blueprint demonstrates. */
  blueprint: string;
  /** Live-verified integrations involved in this pattern. */
  integrations: string[];
  /** What the automated pattern actually does end-to-end. */
  walkthrough: string[];
  /** Clearly-labeled illustrative estimate of typical impact (never delivered results). */
  illustrativeEstimate?: { metric: string; value: string }[];
  /** Optional note on verification status of the integrations involved. */
  verificationNote: string;
}

export const caseStudies: CaseStudy[] = [
  {
    id: "quote-to-cash",
    title: "Quote-to-Cash: from proposal to filed invoice",
    blueprint:
      "An end-to-end automation that moves a deal from proposal to a filed invoice across the connected CRM, e-signature, accounting, and messaging stack.",
    integrations: ["hubspot", "docusign", "xero", "slack", "google-drive", "microsoft-onedrive"],
    walkthrough: [
      "A proposal is created and sent from the CRM (HubSpot deal).",
      "The counterparty e-signs via DocuSign; the platform watches for the completion webhook.",
      "On signature, a HubSpot deal/contact is updated and an invoice draft is created in Xero.",
      "The team is notified in Slack with a link to the draft.",
      "The signed document is filed into the tenant's Google Drive or Microsoft OneDrive folder.",
    ],
    illustrativeEstimate: [
      { metric: "Illustrative: signature-to-invoice-draft (est.)", value: "minutes, hands-free" },
      { metric: "Illustrative: manual steps removed (est.)", value: "every step above" },
    ],
    verificationNote:
      "Builds on integrations the team has live-verified: Xero (self-healing refresh + reconnect), DocuSign, HubSpot, Slack, Google productivity and Microsoft 365. QuickBooks invoice-draft code is shipped, pending live Intuit credentials.",
  },
  {
    id: "slack-orchestration",
    title: "AI employee orchestration from Slack",
    blueprint:
      "Operational AI employees that a team can task and monitor from Slack, with human-in-the-loop approval gates before any write.",
    integrations: ["slack", "xero", "hubspot"],
    walkthrough: [
      "A human posts a task request in Slack (e.g. \"create an invoice for the Acme deal\").",
      "The AI employee resolves the related records and stages the action.",
      "A fail-closed approval queue requires a human sign-off before any write executes.",
      "The approved write runs against the authorized accounting/CRM system and confirms back in Slack.",
    ],
    illustrativeEstimate: [
      { metric: "Illustrative: request-to-approved-action (est.)", value: "minutes" },
      { metric: "Governance", value: "every write gated behind human approval" },
    ],
    verificationNote:
      "Relies on the Slack provider webhook (verified) and the approval-queue gate (26-test suite).",
  },
  {
    id: "xero-resilience",
    title: "Accounting connection resilience",
    blueprint:
      "Automated refresher and health monitoring that keeps accounting integrations connected and escalates loudly if a reconnect is ever needed.",
    integrations: ["xero", "google-workspace"],
    walkthrough: [
      "OAuth tokens are proactively refreshed before expiry; connections self-heal on transient failures.",
      "Per-tenant health heartbeats run real reads against authorized systems.",
      "If a connection is ever unrenewable, it is marked reconnect-required with a one-click re-consent and an owner alert — never silently lost.",
    ],
    illustrativeEstimate: [],
    verificationNote:
      "Directly reflects live-verified reliability tooling: keep-alive refresh, self-healing Xero, external liveness watchdog, and loud escalation on failure.",
  },
  {
    id: "calendar-to-workflow",
    title: "Calendar-driven operations",
    blueprint:
      "Automation triggered off a team's calendar events (available integrations live-verified), feeding downstream tracking and comms.",
    integrations: ["google-calendar", "microsoft", "slack"],
    walkthrough: [
      "A scheduled business event is created/updated on a shared calendar.",
      "The platform detects the change through a live calendar integration.",
      "Downstream records or notifications are produced in connected systems as configured.",
    ],
    illustrativeEstimate: [
      { metric: "Illustrative: event-to-action latency (est.)", value: "near real-time" },
    ],
    verificationNote:
      "Google Calendar and Microsoft 365 (incl. OneDrive) providers are live-verified.",
  },
  {
    id: "document-filing",
    title: "Document generation and filing",
    blueprint:
      "Automated document output routed into the tenant's own file storage, ready for records and reference.",
    integrations: ["google-drive", "microsoft-onedrive", "docusign"],
    walkthrough: [
      "A signed or generated document is captured from the workflow in progress.",
      "The platform files it into the authorized Google Drive or Microsoft OneDrive location.",
      "The file location is reported back into the channel where the work happened.",
    ],
    illustrativeEstimate: [],
    verificationNote:
      "Uses live-verified Microsoft (OneDrive) and Google productivity providers.",
  },
];
