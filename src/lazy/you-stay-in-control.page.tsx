import { Link } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { Route } from "~/routes/you-stay-in-control";

const businessName = "Simpler Life 100";

/** "You stay in control" — human approval system, audit trail, fail-closed, self-healing connections. */
export default function YouStayInControlPage() {
  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-500/30 selection:text-emerald-200 bg-stone-950">
      <Header businessName={businessName} />
      <main className="flex-1 px-6 py-16 lg:py-24">
        <div className="max-w-5xl mx-auto space-y-16">
          {/* Hero */}
          <div className="text-center space-y-6">
            <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              You stay in control
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
              AI doesn't get to make the final decision.{" "}
              <span className="text-emerald-500">Your team does.</span>
            </h1>
            <p className="text-lg text-stone-400 max-w-2xl mx-auto leading-relaxed">
              Every AI employee we deploy is built around one hard rule: nothing writes to your systems without a
              human approving it. Everything else — the draft, the connection, the monitoring — is our job.
            </p>
          </div>

          {/* The core promise */}
          <section className="p-8 bg-stone-900/40 border border-emerald-500/30 rounded-3xl space-y-4">
            <h2 className="text-2xl font-black text-white">The human approval queue</h2>
            <p className="text-stone-400 leading-relaxed">
              When an AI employee wants to take a write action — draft an invoice, update a deal, send a message,
              file a document — it doesn't do it. It creates a pending action in a queue your team sees in the portal.
              A human reviews it and approves or rejects it. Only then does the action run.
            </p>
            <div className="mt-4 space-y-2.5 text-sm text-stone-300">
              <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950 px-4 py-3">
                <span>Draft Xero invoice — $4,800</span>
                <span className="font-bold text-amber-400">Awaiting review</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950 px-4 py-3">
                <span>Create HubSpot deal — Acme Co.</span>
                <span className="font-bold text-emerald-400">Approved</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950 px-4 py-3">
                <span>Post to Slack — #revenue</span>
                <span className="font-bold text-rose-400">Rejected</span>
              </div>
            </div>
            <p className="mt-4 text-xs text-stone-500">
              Fail-closed by default: if no one approves, nothing happens.
            </p>
          </section>

          {/* The pillars */}
          <section className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black text-white">The six ways you stay in control</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: "🧑‍⚖️",
                  title: "Human approval queue",
                  d: "Every write pauses for a named human decision. No exceptions, no silent auto-runs.",
                },
                {
                  icon: "📜",
                  title: "Audit trail",
                  d: "Every action logged: what, which system, when, and who approved it. Reviewable anytime in your portal.",
                },
                {
                  icon: "🔒",
                  title: "Fail-closed behavior",
                  d: "When something can't be verified, it doesn't run. We never guess on a write.",
                },
                {
                  icon: "🔁",
                  title: "Connections that self-heal",
                  d: "Integrations are monitored and reconnected automatically where possible — never silently lost.",
                },
                {
                  icon: "🔔",
                  title: "Notifications + one-click reconnect",
                  d: "If a connection needs you, you're alerted immediately and can re-authorize in one click from the portal.",
                },
                {
                  icon: "🚧",
                  title: "Permission controls",
                  d: "You decide what each AI employee can and cannot touch — which systems, which scopes, which actions.",
                },
              ].map((c) => (
                <div key={c.title} className="p-6 bg-stone-900/40 border border-stone-800 rounded-2xl space-y-2">
                  <div className="text-3xl">{c.icon}</div>
                  <h3 className="text-lg font-black text-white">{c.title}</h3>
                  <p className="text-sm text-stone-400 leading-relaxed">{c.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Why it matters */}
          <section className="p-8 bg-stone-900/40 border border-stone-800 rounded-3xl space-y-4">
            <h2 className="text-2xl font-black text-white">Why this matters</h2>
            <p className="text-stone-400 leading-relaxed">
              Automation fails when it makes decisions people didn't ask for. Our approach is the opposite: the AI
              does the tedious work — reading, drafting, filing, matching — and every operation that touches your
              data stops at a human. Your team keeps final authority everywhere that counts.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                to="/security"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-700 px-5 py-2.5 text-sm font-bold text-stone-200 hover:border-emerald-500/50 hover:text-white transition-all"
              >
                Read the security page →
              </Link>
              <Link
                to="/demo"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-700 px-5 py-2.5 text-sm font-bold text-stone-200 hover:border-emerald-500/50 hover:text-white transition-all"
              >
                See the approval queue in the demo
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}