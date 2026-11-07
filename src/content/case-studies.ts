/**
 * case-studies.ts — Rebuilt for truthfulness (owner decision 08-29).
 *
 * Previous version contained 16 fabricated client stories (invented company
 * names + precise stats + named executive quotes) presented as "Real Results.
 * Real Impact." with no disclaimer. That is gone.
 *
 * This file describes INTEGRATION CAPABILITY PATTERNS: automated workflow
 * patterns built on the adapter lanes this repo ships (Xero, HubSpot, DocuSign,
 * Slack, Google Calendar, Microsoft 365, Google productivity). A lane is code
 * that calls a provider's own API once a tenant authorizes it — it is not
 * evidence that the call has ever run, and no client record has passed through
 * one. These are demonstrations of what the platform CAN do with a client's own
 * authorized systems — proof of capability, NOT delivered client results. No
 * invented companies, no fabricated outcomes.
 *
 * Where any metric or savings figure appears it is an ILLUSTRATIVE ESTIMATE,
 * clearly labeled as such, never attributed to a real or invented client.
 */
export interface CaseStudy {
  id: string;
  title: string;
  /** The verified workflow pattern this demonstration walks through. */
  pattern: string;
  /** Integrations this pattern runs across — adapter lanes this repo ships. */
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
    pattern:
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
      "Adapter lanes for Xero, DocuSign, HubSpot, Slack, Google productivity and Microsoft 365 call each system's own API once a tenant authorizes it; none of them has carried a client's live record yet. QuickBooks is inbound only — our import lane reads from it, and no live path posts into it.",
  },
  {
    id: "slack-orchestration",
    title: "Automation orchestration from Slack",
    pattern:
      "Operational AI automations that a team can task and monitor from Slack, with human-in-the-loop approval gates before any write.",
    integrations: ["slack", "xero", "hubspot"],
    walkthrough: [
      "A human posts a task request in Slack (e.g. \"create an invoice for the Acme deal\").",
      "The automation resolves the related records and stages the action.",
      "A fail-closed approval queue requires a human sign-off before any write executes.",
      "The approved write runs against the authorized accounting/CRM system and confirms back in Slack.",
    ],
    illustrativeEstimate: [
      { metric: "Illustrative: request-to-approved-action (est.)", value: "minutes" },
      { metric: "Governance", value: "every write gated behind human approval" },
    ],
    verificationNote:
      "Relies on the Slack provider webhook lane and the approval-queue gate: every write waits for a human before it runs.",
  },
  {
    id: "calendar-to-workflow",
    title: "Calendar-driven operations",
    pattern:
      "Automation triggered off a team's calendar events (our calendar lanes read through each provider's own API), feeding downstream tracking and comms.",
    integrations: ["google-calendar", "microsoft", "slack"],
    walkthrough: [
      "A scheduled business event is created/updated on a shared calendar.",
      "The platform reads the change through the calendar lane once the tenant authorizes it.",
      "Downstream records or notifications are produced in connected systems as configured.",
    ],
    illustrativeEstimate: [
      { metric: "Illustrative: event-to-action latency (est.)", value: "near real-time" },
    ],
    verificationNote:
      "Google Calendar and Microsoft 365 (including OneDrive) each have an adapter lane that calls that provider's own API once a tenant authorizes it; neither has run against a client's live account.",
  },
  {
    id: "document-filing",
    title: "Document generation and filing",
    pattern:
      "Automated document output routed into the tenant's own file storage, ready for records and reference.",
    integrations: ["google-drive", "microsoft-onedrive", "docusign"],
    walkthrough: [
      "A signed or generated document is captured from the workflow in progress.",
      "The platform files it into the authorized Google Drive or Microsoft OneDrive location.",
      "The file location is reported back into the channel where the work happened.",
    ],
    illustrativeEstimate: [],
    verificationNote:
      "Uses our Microsoft (OneDrive) and Google productivity adapter lanes, which call those providers' own APIs once a tenant authorizes them.",
  },
];
