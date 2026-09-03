import { Link } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { Route } from "~/routes/after-purchase";

const businessName = "Simpler Life 100";

/** "What happens after you buy" — concrete customer journey (P2.3). */
export default function AfterPurchasePage() {
  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-500/30 selection:text-emerald-200 bg-stone-950">
      <Header businessName={businessName} />
      <main className="flex-1 px-6 py-16 lg:py-24">
        <div className="max-w-5xl mx-auto space-y-16">
          {/* Hero */}
          <div className="text-center space-y-6">
            <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              What happens after you buy
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
              Day 1 to deployed — here's the journey.
            </h1>
            <p className="text-lg text-stone-400 max-w-2xl mx-auto leading-relaxed">
              No mystery, no open-ended timeline. Here's the concrete sequence from purchase to your first AI employee
              working — with a human approving.
            </p>
          </div>

          {/* Timeline */}
          <section className="space-y-5">
            {[
              {
                when: "Day 1",
                icon: "🧭",
                title: "Discovery",
                d: "We meet with your team, map the process you want to automate, and identify the systems it touches. You get a clear plan of exactly what will be automated and where your team still approves.",
              },
              {
                when: "Days 2–3",
                icon: "📐",
                title: "Workflow design",
                d: "We design the workflow end to end: triggers, steps, connections, and every approval point. You review and sign off on the design before any build starts.",
              },
              {
                when: "Week 1",
                icon: "🔧",
                title: "Build + integrations",
                d: "We build the workflow and wire the integrations across your stack — CRM, accounting, e-signature, messaging, document storage. Every connection is verified against your real systems.",
              },
              {
                when: "Week 2",
                icon: "🧪",
                title: "Testing + deploy + human approval",
                d: "We test the workflow end to end, confirm every write pauses for human approval, deploy it, and show your team how to use the approval queue and audit log.",
              },
              {
                when: "Ongoing",
                icon: "📡",
                title: "Monitoring + support",
                d: "We monitor connections 24/7, self-heal what we can, alert you loudly when something needs you, and support the workflow as your business changes.",
              },
            ].map((s) => (
              <div key={s.when} className="flex gap-5 p-6 bg-stone-900/40 border border-stone-800 rounded-2xl">
                <div className="text-3xl shrink-0">{s.icon}</div>
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">{s.when}</span>
                    <h3 className="text-lg font-black text-white">{s.title}</h3>
                  </div>
                  <p className="mt-1.5 text-sm text-stone-400 leading-relaxed max-w-2xl">{s.d}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Reassurance */}
          <section className="p-8 bg-stone-900/40 border border-emerald-500/30 rounded-3xl space-y-4">
            <h2 className="text-2xl font-black text-white">What you don't have to worry about</h2>
            <ul className="space-y-3 text-stone-400 leading-relaxed">
              <li className="flex gap-3"><span className="text-emerald-400">✓</span> You don't learn automation or configure workflows — we build them.</li>
              <li className="flex gap-3"><span className="text-emerald-400">✓</span> You don't manage AI agents or monitor connections — we do.</li>
              <li className="flex gap-3"><span className="text-emerald-400">✓</span> You don't lose control — every write pauses for your team's approval.</li>
              <li className="flex gap-3"><span className="text-emerald-400">✓</span> You see everything — approval queue, audit log, and live connection health in one portal.</li>
            </ul>
          </section>

          {/* CTA */}
          <section className="p-8 bg-gradient-to-br from-emerald-900/30 to-stone-900 border border-emerald-500/20 rounded-3xl text-center space-y-4">
            <h2 className="text-2xl lg:text-3xl font-black text-white">Start with the first step — it's free.</h2>
            <p className="text-stone-400 max-w-xl mx-auto">
              30-second assessment. No credit card. We'll show you the workflow worth automating first and how we'd
              build it.
            </p>
            <Link
              to="/assessment"
              className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-emerald-600 px-8 py-3.5 font-bold text-white hover:bg-emerald-500 transition-all shadow-lg"
            >
              Find the first process worth automating ➜
            </Link>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}