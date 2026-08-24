import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/pricing")({
  head: () => pageHead("/pricing"),
  component: PricingPage,
});

const agents = [
  { name: "Invoice Processor", price: 950, link: "https://buy.stripe.com/dRm3cx60Lbwj7Lleec2Fa29", desc: "Automatically reads invoices, extracts line items, and syncs to Xero accounting (QuickBooks in development)", icon: "🧾" },
  { name: "CRM Sync Agent", price: 2000, link: "https://buy.stripe.com/5kQ5kFexhcAn5Ddgmk2Fa2j", desc: "Keeps HubSpot contacts, deals, and pipelines in sync with real-time updates (Salesforce and Pipedrive in development)", icon: "🔄" },
  { name: "Email Assistant", price: 1800, link: "https://buy.stripe.com/eVq28t60LgQDc1Bgmk2Fa2f", desc: "Drafts, categorizes, and routes emails based on context — works with Gmail, Microsoft Outlook, and Slack", icon: "✉️" },
  { name: "Data Entry Bot", price: 499, link: "https://buy.stripe.com/6oUbJ3cp9dErghRc642Fa24", desc: "Copies data between Google Sheets, Microsoft Excel, and HubSpot — zero manual entry", icon: "🤖" },
  { name: "Compliance Auditor", price: 750, link: "https://buy.stripe.com/eVq28t60Lbwj8Pp1rq2Fa25", desc: "Reviews records against regulatory rules, flags anomalies, generates audit trails", icon: "🔍" },
  { name: "Inventory Tracker", price: 1200, link: "https://buy.stripe.com/28E00l2Oz1VJghRda82Fa2a", desc: "Monitors stock levels and flags low-stock items for reorder (NetSuite, Shopify, and Zoho integrations in development)", icon: "📦" },
  { name: "Production Scheduler", price: 850, link: "https://buy.stripe.com/28EbJ374P8k71mX8TS2Fa27", desc: "Optimizes production timelines based on demand forecasts (SAP and Monday.com integrations in development)", icon: "📅" },
  { name: "HR Onboarding Agent", price: 850, link: "https://buy.stripe.com/4gMfZjfBlasf3v56LK2Fa26", desc: "Automates new hire paperwork and onboarding tasks via Slack, Google Workspace, and Microsoft 365 (BambooHR and Workday in development)", icon: "👋" },
  { name: "Social Media Manager", price: 1200, link: "https://buy.stripe.com/dRm5kF0GrdEr6Hh6LK2Fa2b", desc: "Plans and drafts content with approval routing via Slack (LinkedIn, Meta, and Hootsuite publishing in development)", icon: "📱" },
  { name: "Route Optimizer", price: 1800, link: "https://buy.stripe.com/3cI28tgFp7g37Llb202Fa2g", desc: "Plans optimal delivery routes to save fuel and time (Google Maps and Onfleet dispatch integrations in development)", icon: "🗺️" },
  { name: "Support Triage Agent", price: 1800, link: "https://buy.stripe.com/dRm7sN74PfMzaXx9XW2Fa2h", desc: "Categorizes and routes incoming support requests to the right team via Slack and shared inboxes (Zendesk, Intercom, and Freshdesk in development)", icon: "🎫" },
  { name: "Lead Scoring Agent", price: 2000, link: "https://buy.stripe.com/7sYeVf4WHcAn2r1b202Fa2k", desc: "Scores and prioritizes leads in HubSpot based on behavior (Salesforce and Marketo integrations in development)", icon: "🎯" },
  { name: "Customer Onboarding", price: 1500, link: "https://buy.stripe.com/dRm4gBah1cAn7Ll8TS2Fa2e", desc: "Guides new customers through setup, sends welcome sequences, configures accounts", icon: "🚀" },
  { name: "Support Ticket Router", price: 1800, link: "https://buy.stripe.com/dRm9AV88T6bZ0iT3zy2Fa2i", desc: "Intelligently routes support requests to the right team via Slack and email (Jira and ServiceNow integrations in development)", icon: "🎯" },
  { name: "Sales Follow-Up", price: 1200, link: "https://buy.stripe.com/7sYfZj3SD0RF7Ll1rq2Fa2c", desc: "Automates follow-up sequences in HubSpot after meetings (Salesforce and Outreach integrations in development)", icon: "📞" },
  { name: "PO Management", price: 1200, link: "https://buy.stripe.com/fZubJ3dtdcAnghR1rq2Fa2d", desc: "Processes purchase orders with approval routing via Slack and email (SAP Ariba, Coupa, and QuickBooks in development)", icon: "📋" },
  { name: "Payroll Reconciliation", price: 850, link: "https://buy.stripe.com/fZucN74WH7g3e9J1rq2Fa28", desc: "Reconciles payroll against timesheets in Google Sheets and Microsoft Excel (ADP, Gusto, and QuickBooks Payroll in development)", icon: "💰" },
];

const builderTiers = [
  { name: "Starter", price: 7500, link: "https://buy.stripe.com/3cI8wR88Tasfc1B9XW2Fa2K", desc: "2 AI employees + 3 workflows", features: ["2 AI employees", "3 workflows", "1 Connection Pack (CRM or ERP — your choice)", "Standard setup & deployment", "Email support"] },
  { name: "Growth", price: 15000, link: "https://buy.stripe.com/5kQ6oJbl5dErc1B1rq2Fa2L", desc: "5 AI employees + full integrations", features: ["5 AI employees", "Full integrations", "All workflow templates", "Priority support", "1 Connection Pack (CRM or ERP — your choice)"], highlight: true },
  { name: "Scale", price: 30000, link: "https://buy.stripe.com/aFa7sN60LdErc1B5HG2Fa2M", desc: "Unlimited AI employees", features: ["Unlimited AI employees", "Custom workflows", "Dedicated account manager", "24/7 support", "1 Connection Pack (CRM or ERP — your choice)", "API access", "SLA guarantee"] },
];

function PricingPage() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 selection:bg-emerald-500 selection:text-stone-950">
      <Header businessName="Simpler Life 100" />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-xs font-mono font-bold tracking-wider mb-6">
          💰 TRANSPARENT PRICING
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
          AI Operations Teams
        </h1>
        <p className="text-stone-400 text-lg max-w-2xl mx-auto">
          One-time build package plus a monthly fee per AI employee. Live integrations today: Xero, Slack, Google, Microsoft, HubSpot and DocuSign (QuickBooks in development). No long-term contracts.
        </p>
      </section>

      {/* Builder Packages */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-black text-center mb-8">Builder Packages</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {builderTiers.map((tier) => (
            <div key={tier.name} className={`relative rounded-2xl border p-6 flex flex-col ${
              tier.highlight
                ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                : "border-stone-800 bg-stone-900/50"
            }`}>
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-full">Most Popular</div>
              )}
              <h3 className="text-lg font-bold text-white">{tier.name}</h3>
              <div className="mt-3 mb-4">
                <span className="text-3xl font-black text-white">${tier.price.toLocaleString("en-US")}</span>
                <span className="text-stone-500 text-sm"> one-time</span>
              </div>
              <p className="text-stone-400 text-sm mb-4">{tier.desc}</p>
              <ul className="space-y-2 mb-6 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-stone-300">
                    <span className="text-emerald-400 mt-0.5 shrink-0">✓</span> {f}
                  </li>
                ))}
              </ul>
              <a
                href={tier.link}
                target="_blank"
                rel="noopener noreferrer"
                className={`block text-center py-3 rounded-xl font-bold text-sm transition-all ${
                  tier.highlight
                    ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                    : "bg-stone-800 hover:bg-stone-700 text-white"
                }`}
              >
                Buy Package
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Individual Agents */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-black text-center mb-2">Individual AI Employees</h2>
        <p className="text-stone-500 text-center text-sm mb-8">$499–$2,000/mo each. Deploy instantly with Stripe checkout.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div key={agent.name} className="bg-stone-900/50 border border-stone-800 rounded-xl p-5 hover:border-stone-700 transition-all flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{agent.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm truncate">{agent.name}</div>
                  <div className="text-emerald-400 font-black text-lg">${agent.price}<span className="text-stone-500 text-xs font-normal">/mo</span></div>
                </div>
              </div>
              <p className="text-stone-400 text-xs leading-relaxed mb-4 flex-1">{agent.desc}</p>
              <a
                href={agent.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center bg-stone-800 hover:bg-emerald-600 text-stone-300 hover:text-white py-2.5 rounded-xl text-xs font-bold transition-all"
              >
                Deploy Agent →
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Industry Audits */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h2 className="text-2xl font-black text-white mb-2">Industry Blueprint Assessment</h2>
          <p className="text-stone-400 max-w-lg mx-auto mb-6">
            Get a custom AI operations blueprint for your industry. We analyze your workflows and recommend the right agents.
          </p>
          <div className="text-3xl font-black text-white mb-4">$2,500</div>
          <a
            href="https://buy.stripe.com/aFa7sN60LdErc1B5HG2Fa2M"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold text-sm transition-all"
          >
            Get Your Blueprint →
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
