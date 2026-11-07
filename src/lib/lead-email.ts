/**
 * lead-email.ts — SLICE 185. The owner-notification email built when a lead
 * fills in one of the public tools.
 *
 * WHY THIS MOVED OUT OF prod-server.ts
 * ------------------------------------
 * It lived in prod-server.ts, so no test could reach it: importing the server
 * entry starts a listener. That is exactly how the setup-fee copy survived
 * three weeks after the owner dropped setup fees (2026-10-30) — the email
 * quoted an upfront charge alongside each tier's monthly price
 * while the site and Stripe charged the monthly price and nothing else. The
 * exact figures are deliberately NOT reproduced here: the setup-fee guard in
 * `src/test/setup-fee-removal.test.ts` scans raw source, comments included, so
 * that a fee claim cannot hide in prose — and it should not be weakened for
 * the sake of a comment. A pure function that builds customer-facing copy
 * belongs somewhere a test can call it.
 *
 * THE RULE THIS FILE ENFORCES
 * ---------------------------
 * Every price in this email is DERIVED from `TIER_SPECS` in
 * `entitlements.ts` — the same spec the pricing page renders and the same
 * numbers Stripe bills — so the email can never
 * quote a price the site does not show. There is no setup fee: the owner
 * dropped them, so this file must not contain one, and it must not invent an
 * "onboarding included" claim either.
 */

import { TIER_SPECS, type PaidTier } from "./entitlements";

export interface LeadEmailResult {
  subject: string;
  body: string;
  matchedAgents: { name: string }[];
  bestPlan: string;
  planLink: string;
}

/**
 * "$199/mo" — the monthly label the site shows, read from the SAME tier spec
 * /pricing renders (`TIER_SPECS[tier].monthlyUsd`), grouped like the site.
 * A price that changes in entitlements changes here; there is no second copy.
 */
export function monthlyPriceLabel(tier: PaidTier): string {
  return `$${TIER_SPECS[tier].monthlyUsd.toLocaleString("en-US")}/mo`;
}

export function buildLeadEmail(email: string, toolName: string, result: any): LeadEmailResult {
  // Cleanup (c): the AI-employee roster is retired — "matched" are now the
  // automation/workflow names the tool itself returned (no per-agent pricing,
  // payment links, or catalog lookups).
  const matched: { name: string }[] = [];
  const seen = new Set<string>();
  const addName = (n: string) => {
    if (n && !seen.has(n)) { seen.add(n); matched.push({ name: n }); }
  };

  let processInfo = "";

  if (toolName === "can-we-automate-this" && result.topMatch) {
    addName(typeof result.topMatch === "string" ? result.topMatch : (result.topMatch.name || ""));
    processInfo = (result.processDescription || "Automation workflow");
    if (result.savingsSummary) processInfo += "\nSavings: " + result.savingsSummary;
  } else if (toolName === "assessment" && result.topWorkflows) {
    const wfs = Array.isArray(result.topWorkflows) ? result.topWorkflows.slice(0, 5) : [];
    for (const wf of wfs) {
      const wfName = typeof wf === 'string' ? wf : (wf.name || '');
      addName(wfName);
    }
  } else if (toolName === "ai-advisor" && result.messages) {
    // No catalog matcher remains — the advisor surfaces nothing sku-like;
    // its suggestions appear under the can-we-automate/assessment tools.
  }

  // Plan recommendation: locked platform tiers (owner 09-27) — one platform,
  // every capability in every tier. Tiers differ by scale, governance, support.
  // SLICE 185: the price is the MONTHLY price only, derived from the table
  // Stripe bills. Setup fees were dropped on 2026-10-30; nothing here may add
  // one back, and nothing may claim onboarding is "included" or priced.
  const count = matched.length;
  let bestPlan: string, planLink: string, planPrice: string, planIncludes: string;
  if (count <= 3) {
    bestPlan = "Starter"; planLink = "/pricing"; planPrice = monthlyPriceLabel("starter");
    planIncludes = "100% of native capabilities (records, forms, docs/e-sign, webhooks, booking, boards, AI extraction, surveys/NPS, transforms/EDI, dashboards/BI, automations) • Standard support";
  } else if (count <= 7) {
    bestPlan = "Growth"; planLink = "/pricing"; planPrice = monthlyPriceLabel("growth");
    planIncludes = "100% of native capabilities • Higher scale limits • Multi-step approvals + autonomy allow-lists • Priority support";
  } else {
    bestPlan = "Enterprise"; planLink = "/pricing"; planPrice = monthlyPriceLabel("enterprise");
    planIncludes = "100% of native capabilities • Highest scale limits • Advanced governance + allow-lists • Dedicated support • Custom on-demand vendor-API builds (SAP/SuiteScript)";
  }

  // Build email body
  const L = "\n";
  let body = "New Lead Captured from Simple Life 100" + L + L;
  body += "Email: " + email + L;
  body += "Tool: " + toolName + L;
  if (processInfo) body += L + processInfo + L;
  body += L;

  // Suggested automations (capability names only — no per-agent pricing, no SKU links)
  if (matched.length) {
    body += "SUGGESTED AUTOMATIONS:" + L;
    for (const a of matched) body += "  \u2022 " + a.name + L;
    body += L;
  }
  // Recommended platform tier
  body += "═══════════════════════════════════" + L;
  body += "RECOMMENDED PLAN: " + bestPlan.toUpperCase() + " — " + planPrice + L;
  body += "═══════════════════════════════════" + L + L;
  body += planIncludes + L;
  body += L + "VIEW PRICING: https://www.simplerlife100.com" + planLink + L;

  const subject = "New Lead: " + email + " - " + toolName;
  return { subject, body, matchedAgents: matched, bestPlan, planLink };
}
