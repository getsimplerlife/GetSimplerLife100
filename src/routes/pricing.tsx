import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/pricing")({
  head: () => pageHead("/pricing"),
  component: PricingPage,
});

/**
 * LOCKED PLATFORM PRICING (owner decision 09-27):
 * ONE platform — every tier includes 100% of the native capability layer.
 * No per-AI-employee selling, no per-feature upsell. Tiers differ by
 * scale limits, governance (multi-step approvals + autonomy allow-lists)
 * and support; Enterprise adds custom on-demand vendor-API builds.
 * Live native layer (all live-verified, Phases 1-3.7). Subscription
 * products are being set up at checkout after the owner's Stripe switch;
 * the one-time Automation Sprint ($2,500) is the live low-risk entry now.
 */
const PLATFORM_TIERS = [
  {
    name: "Starter",
    monthly: 199,
    setup: 500,
    setupLabel: "$500 one-time onboarding",
    forLabel: "Professional-services firms ~10\u201330 people",
    priceNote: "$199/mo + $500 one-time onboarding",
    description: "The full platform for your first automated workflows.",
    features: [
      "100% of native capabilities \u2014 records, forms, docs/e-sign, webhooks, booking, boards, AI extraction, surveys/NPS, transforms/EDI, dashboards/BI, automations",
      "Approval-queue control with per-workflow autonomy allow-lists",
      "1 Connection Pack (CRM or ERP — your choice)",
      "Standard support (email)",
    ],
    cta: "Start with the Sprint",
    ctaHref: "/pricing#sprint",
  },
  {
    name: "Growth",
    monthly: 599,
    setup: 1500,
    setupLabel: "$1,500 one-time onboarding",
    forLabel: "Professional-services firms ~30\u2013100 people",
    priceNote: "$599/mo + $1,500 one-time onboarding",
    description: "Scale limits and governance for a growing operations team.",
    features: [
      "100% of native capabilities \u2014 the full live platform (as Starter)",
      "Higher scale limits (records, documents, automations run volume)",
      "Multi-step approvals + autonomy allow-lists",
      "Priority support",
    ],
    highlight: true,
    cta: "Start with the Sprint",
    ctaHref: "/pricing#sprint",
  },
  {
    name: "Enterprise",
    monthly: 1499,
    setup: 0,
    setupLabel: "setup included",
    forLabel: "Larger or regulated operations",
    priceNote: "$1,499/mo \u2014 setup included",
    description: "Larger teams, stricter governance, and custom builds on demand.",
    features: [
      "100% of native capabilities \u2014 the full live platform (as Growth)",
      "Highest scale limits",
      "Advanced governance: multi-step approvals + autonomy allow-lists",
      "Dedicated support",
      "Custom on-demand vendor-API builds (e.g. SAP BAPI, SuiteScript)",
    ],
    cta: "Start with the Sprint",
    ctaHref: "/pricing#sprint",
  },
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
          One platform. Every capability.
        </h1>
        <p className="text-stone-400 text-lg max-w-2xl mx-auto">
          One platform subscription, three tiers, and 100% of the native capability layer in every
          tier — records, forms, docs &amp; e-sign, webhooks, booking, boards, AI extraction,
          surveys/NPS, transforms/EDI, dashboards/BI, and automations. No per-employee fees. No
          per-feature upsells. Tiers differ by scale limits, governance, and support.
        </p>
      </section>

      {/* Platform Tiers */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-6">
          {PLATFORM_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`premium-card relative rounded-2xl p-6 flex flex-col ${
                tier.highlight
                  ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                  : "border-stone-800 bg-stone-900/50"
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              <h3 className="text-lg font-bold text-white">{tier.name}</h3>
              <p className="text-[11px] text-stone-500 mt-0.5">{tier.forLabel}</p>
              <div className="mt-3 mb-1">
                <span className="text-3xl font-black text-white">${tier.monthly}</span>
                <span className="text-stone-500 text-sm">/mo</span>
              </div>
              <div className="text-xs text-stone-500 mb-4">{tier.setupLabel}</div>
              <p className="text-stone-400 text-sm mb-4">{tier.description}</p>
              <ul className="space-y-2 mb-6 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-stone-300">
                    <span className="text-emerald-400 mt-0.5 shrink-0">✓</span> {f}
                  </li>
                ))}
              </ul>
              <a
                href={tier.ctaHref}
                className={`block text-center py-3 rounded-xl font-bold text-sm transition-all ${
                  tier.highlight
                    ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                    : "bg-stone-800 hover:bg-stone-700 text-white"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-500 mt-6 text-center max-w-2xl mx-auto">
          Subscription products are being set up at checkout after the payment-account switch.
          In the meantime the one-time Automation Sprint below is the live, low-risk entry — and the
          free assessment costs nothing.
        </p>
      </section>

      {/* Automation Sprint — low-risk entry (P3) */}
      <section id="sprint" className="max-w-6xl mx-auto px-6 pb-16">
        <div className="premium-card premium-card-accent rounded-3xl p-8 md:p-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold tracking-wider mb-6">
            ⚡ LOW-RISK START
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-white mb-3">Automation Sprint</h2>
          <p className="text-stone-400 text-lg max-w-2xl mx-auto mb-6">
            The low-risk first step: one $2,500 one-time engagement where we{" "}
            <span className="text-white font-bold">identify and build one high-value workflow</span>{" "}
            end-to-end. If it works, expand into a full platform subscription.
          </p>
          <div className="text-5xl font-black text-white mb-2">
            $2,500<span className="text-stone-500 text-lg font-normal"> one-time</span>
          </div>
          <p className="text-sm text-stone-400 max-w-xl mx-auto mb-8">
            We map one process end-to-end, design the workflow, and deliver a build-ready plan.{" "}
            <span className="text-stone-300 font-bold">The fee is credited toward a build package</span>{" "}
            when you move forward.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://buy.stripe.com/14AbJ3cp91VJc1Bfig2Fa2N"
              target="_blank"
              rel="noopener noreferrer"
              className="premium-btn inline-flex items-center justify-center text-white px-8 py-3.5 rounded-xl font-bold text-sm"
            >
              Start the Sprint →
            </a>
            <Link
              to="/assessment"
              className="inline-flex items-center justify-center border border-stone-700 hover:border-emerald-500/50 text-stone-200 hover:text-white px-8 py-3.5 rounded-xl font-bold text-sm transition-all"
            >
              Prefer to map it first? Free assessment →
            </Link>
          </div>
          <p className="text-xs text-stone-500 mt-5 max-w-xl mx-auto">
            At checkout you'll see the item as "Industry Blueprint Assessment" — the same $2,500 one-time engagement. The site calls it Automation Sprint; the catalog name is the
            owner's to update.
          </p>
        </div>
      </section>

      {/* What's live in every tier */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-black text-center mb-2">What's live in every tier</h2>
        <p className="text-stone-500 text-center text-sm mb-8 max-w-2xl mx-auto">
          Everything below is shipped and live-verified — nothing is claimed until it runs. Full
          capability map: <Link to="/integrations" className="text-emerald-400 hover:text-emerald-300 font-bold">integrating with what you already use</Link>.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            ["🗂️", "Records & tables", "Structured data store with per-tenant isolation, audit, and approval-gated writes."],
            ["📝", "Forms", "Build forms that write into records — through the approval queue."],
            ["📄", "Docs, PDF & e-sign", "Create, fill, sign and file documents natively."],
            ["🔌", "Webhooks", "Typed events out and in — the backbone of every workflow."],
            ["🗓️", "Booking", "Publish availability, take requests, confirm — timezone-exact."],
            ["📋", "Boards", "Kanban-style work tracking with typed events."],
            ["🤖", "AI extraction", "Pull structured fields from documents — output is always a draft."],
            ["📊", "Surveys & NPS", "Publish surveys, collect responses, aggregate feedback."],
            ["🔄", "Transforms & EDI", "JSON/CSV/XML/EDIFACT/X12 in-app with XXE-safe parsers."],
            ["📈", "Dashboards & BI", "Reports, charts, scheduled delivery, threshold alerts."],
            ["⚙️", "Automations", "Trigger → conditions → actions. Fail-closed by default, ledger-audited."],
            ["🛡️", "Approval queue", "Human approval by default; autonomy only via explicit allow-lists."],
          ].map(([icon, t, d]) => (
            <div key={t} className="premium-card rounded-xl p-5">
              <div className="text-2xl mb-2">{icon}</div>
              <div className="font-bold text-white text-sm">{t}</div>
              <p className="text-stone-400 text-xs leading-relaxed mt-1">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Assessment CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="premium-card rounded-2xl p-8 text-center">
          <div className="text-4xl mb-4">🧭</div>
          <h2 className="text-2xl font-black text-white mb-2">Need help deciding?</h2>
          <p className="text-stone-400 max-w-lg mx-auto mb-6">
            Start with the free 30-second assessment — we'll map your workflows and recommend the
            right first step (the Sprint or a platform tier).
          </p>
          <Link
            to="/assessment"
            className="premium-btn inline-block text-white px-8 py-3 rounded-xl font-bold text-sm"
          >
            Find the first process worth automating →
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
