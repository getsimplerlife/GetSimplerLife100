import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/features")({
  head: () => pageHead("/features"),
  component: FeaturesPage,
});

const CAPABILITIES = [
  {
    icon: "👁️",
    title: "Understand & Read",
    description:
      "AI automations connect to your authorized systems and read operational context — invoices, bills, contacts, documents, calendars, and more — through verified, read-only contracts.",
  },
  {
    icon: "📡",
    title: "Monitor",
    description:
      "Webhook-based monitoring watches for the events that matter (invoice created, bill created, and more) and dispatches to the right AI automation — gated per organization, fail-closed on unknown tenants.",
  },
  {
    icon: "⚙️",
    title: "Automate & Write",
    description:
      "Client-requested tasks are executed safely: every artifact is created labeled, kept in place, and never deleted inside your accounts. Deletion happens only on explicit client request.",
  },
  {
    icon: "📁",
    title: "Cross-Workspace Files",
    description:
      "Create files in Google Workspace or Microsoft 365 — your choice per tenant — with native links and connection badges, routed through a fail-closed resolver that never guesses a provider.",
  },
  {
    icon: "🧑‍💼",
    title: "Client Portal",
    description:
      "A secure session-gated portal for connections, billing, file library, and audit logs — fully tenant-isolated with per-tenant audit trails.",
  },
  {
    icon: "🔌",
    title: "One Platform, Every Capability",
    description:
      "Records, forms, docs & e-sign, webhooks, booking, boards, AI extraction, surveys/NPS, transforms/EDI, dashboards/BI, and automations — all natively in one platform, in every tier. Each plan includes one CRM or ERP Connection Pack — your choice.",
  },
  {
    icon: "🛡️",
    title: "Fail-Closed Security",
    description:
      "Tenant-scoped data everywhere, no guessed provider URLs, signed webhook verification, constant-time key checks, and per-tenant audit logs. If a check fails, we refuse — we never guess.",
  },
  {
    icon: "🔐",
    title: "Credentials That Stay Fresh",
    description:
      "OAuth credentials are stored durably and refreshed automatically — including single-use refresh-token rotation, so your connections keep working around the clock.",
  },
];

function FeaturesPage() {
  return (
    <div className="flex flex-col min-h-screen bg-stone-950 text-stone-200">
      <Header businessName="Simpler Life 100" />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-16">
        <section className="text-center max-w-3xl mx-auto">
          <span className="eyebrow block">Capabilities</span>
          <h1 className="page-title mt-4 text-4xl sm:text-5xl leading-tight">
            One platform that understands, monitors, and automates your operations.
          </h1>
          <p className="mt-5 text-stone-400 text-lg leading-relaxed">
            Simpler Life 100's platform runs AI automations that understand your operational context,
            monitor your authorized systems, and safely automate client-requested tasks — across industries.
          </p>
        </section>
        <section className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6" aria-label="Product capabilities">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title} className="premium-card rounded-2xl p-7">
              <div className="text-3xl">{cap.icon}</div>
              <h2 className="mt-4 text-lg font-bold text-white">{cap.title}</h2>
              <p className="mt-2 text-sm text-stone-400 leading-relaxed">{cap.description}</p>
            </div>
          ))}
        </section>
        <section className="mt-16 text-center">
          <Link
            to="/pricing"
            className="inline-block bg-emerald-500 hover:bg-emerald-400 text-black px-8 py-4 rounded-xl font-bold transition-all shadow-md text-sm"
          >
            View Pricing →
          </Link>
          <Link
            to="/workflows"
            className="inline-block ml-4 text-sm font-bold text-stone-400 hover:text-white transition-colors"
          >
            Browse the workflow library
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}