import { Link } from "@tanstack/react-router";
import type { Workflow as WorkflowType } from "~/content/workflows";

export default function WorkflowPage({ data }: { data: WorkflowType }) {
  const w = data;

  const priceMap = {
    starter: { name: "Starter", price: "$7,500" },
    growth: { name: "Growth", price: "$15,000" },
    scale: { name: "Scale", price: "$30,000" },
  };

  const currentPrice = priceMap[w.priceTier] || priceMap.starter;

  return (
    <div className="flex flex-col min-h-screen bg-stone-950 text-stone-100 font-sans">
      {/* Navigation Header */}
      <header className="px-6 py-4 border-b border-stone-850 bg-stone-950">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <span className="text-emerald-500">⚡</span> Simpler Life 100
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xs font-mono text-stone-400 hover:text-white transition-colors">
              [ Back to Home ]
            </Link>
            <Link to="/portal" className="bg-emerald-600 hover:bg-emerald-500 text-stone-950 px-4 py-1.5 rounded-lg text-xs font-bold font-mono transition-colors">
              Portal Dashboard →
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 py-20 lg:py-28 bg-gradient-to-b from-stone-950 to-stone-900/30 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/15 via-transparent to-transparent opacity-60 pointer-events-none" />
          <div className="max-w-4xl mx-auto relative z-10 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                ACTIVE WORKFLOW
              </span>
              <span className="text-[11px] font-mono text-stone-400 bg-stone-900 px-2.5 py-1 rounded-md border border-stone-800 uppercase">
                Tier: {currentPrice.name}
              </span>
            </div>
            
            <h1 className="text-3xl lg:text-6xl font-black tracking-tight text-white leading-tight">
              {w.name}
            </h1>

            {/* Industry Badges */}
            <div className="flex flex-wrap gap-2 pt-2">
              {w.industry.map((ind, i) => (
                <Link
                  key={i}
                  to="/"
                  className="text-xs font-mono font-bold text-stone-400 hover:text-emerald-400 bg-stone-900 hover:bg-stone-850 px-3 py-1 rounded-full border border-stone-800 hover:border-emerald-500/30 transition-all uppercase"
                >
                  #{ind.replace(/-/g, " ")}
                </Link>
              ))}
            </div>

            <p className="text-lg text-stone-300 leading-relaxed pt-4">
              {w.description}
            </p>
          </div>
        </section>

        {/* Metrics Bar */}
        <section className="px-6 py-10 border-y border-stone-900 bg-stone-900/10">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-stone-950/40 border border-stone-900 rounded-2xl">
              <div className="text-stone-500 font-mono text-[10px] tracking-widest uppercase mb-1">⏱ Labor Efficiency</div>
              <div className="text-xl font-bold text-emerald-400">{w.timeSaved}</div>
            </div>
            <div className="p-6 bg-stone-950/40 border border-stone-900 rounded-2xl">
              <div className="text-stone-500 font-mono text-[10px] tracking-widest uppercase mb-1">🎯 Operational Accuracy</div>
              <div className="text-xl font-bold text-emerald-400">{w.accuracyGain}</div>
            </div>
            <div className="p-6 bg-stone-950/40 border border-stone-900 rounded-2xl">
              <div className="text-stone-500 font-mono text-[10px] tracking-widest uppercase mb-1">📈 Payback Period</div>
              <div className="text-xl font-bold text-emerald-400">{w.roiTimeline} average</div>
            </div>
          </div>
        </section>

        {/* The Problem Section */}
        <section className="px-6 py-16 max-w-4xl mx-auto">
          <div className="p-8 bg-rose-500/5 border border-rose-500/10 rounded-3xl space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <h2 className="text-base font-mono font-bold tracking-widest text-rose-400 uppercase">The Pain Point This Solves</h2>
            </div>
            <p className="text-sm text-stone-300 leading-relaxed">
              {w.painPoint}
            </p>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="px-6 py-16 max-w-4xl mx-auto space-y-12">
          <div className="space-y-2">
            <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">[ Step-By-Step Mechanics ]</span>
            <h2 className="text-3xl font-black text-white">How the Autonomous Coworker Operates</h2>
          </div>

          <div className="relative border-l border-stone-850 pl-6 ml-4 space-y-10">
            {w.howItWorks.map((step, i) => (
              <div key={i} className="relative">
                {/* Number node */}
                <span className="absolute -left-[38px] top-0.5 h-6 w-6 rounded-full bg-stone-900 border border-stone-800 text-[11px] font-mono font-bold text-emerald-400 flex items-center justify-center">
                  0{i + 1}
                </span>
                <p className="text-stone-200 text-sm leading-relaxed font-semibold">
                  {step}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Systems Required Section */}
        <section className="px-6 py-16 max-w-4xl mx-auto border-t border-stone-900">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <h2 className="text-2xl font-black text-white">Required Integrations & Connectors</h2>
              <p className="text-sm text-stone-400 leading-relaxed">
                This workflow connects cleanly to your existing tools. Our engineering team handles all credentials and secure endpoints.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {w.systemsRequired.map((sys, i) => (
                <div key={i} className="px-4 py-2.5 bg-stone-900/60 border border-stone-850 rounded-xl text-xs font-mono font-bold text-stone-300 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {sys}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Tier Section */}
        <section className="px-6 py-16 bg-stone-900/20 border-t border-stone-900">
          <div className="max-w-4xl mx-auto p-8 bg-stone-950 border border-stone-850 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">[ One-time setup fee ]</span>
              <h3 className="text-2xl font-black text-white">{currentPrice.name} Automated Deployment</h3>
              <p className="text-stone-400 text-xs">Includes 30 days of hyper-care engineering support and workflow customization.</p>
            </div>
            <div className="text-center md:text-right shrink-0">
              <div className="text-4xl font-mono font-black text-white mb-2">{currentPrice.price}</div>
              <a
                href={w.priceTier === 'starter' ? 'https://buy.stripe.com/aFa3cxah18k7aXx0nm2Fa01' : w.priceTier === 'growth' ? 'https://buy.stripe.com/5kQdRbah1asf1mX7PO2Fa02' : 'https://buy.stripe.com/4gM9AV74P1VJ9Tt9XW2Fa03'}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-emerald-600 hover:bg-emerald-500 text-stone-950 px-6 py-2.5 rounded-xl text-xs font-bold uppercase font-mono tracking-wider transition-colors"
              >
                Buy Now — {currentPrice.price} →
              </a>
            </div>
          </div>
        </section>

        {/* Global CTA */}
        <section className="px-6 py-20 text-center relative overflow-hidden border-t border-stone-900">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-950/20 via-transparent to-transparent opacity-50" />
          <div className="max-w-2xl mx-auto relative z-10 space-y-6">
            <h2 className="text-3xl lg:text-5xl font-black text-white">Get This Workflow Automated</h2>
            <p className="text-sm text-stone-400">
              Stop letting manual keystrokes, validation, and status updates drain your team's output. We deploy turnkey autonomous solutions.
            </p>
            <div className="pt-4">
              <Link to="/build" className="bg-white hover:bg-stone-200 text-stone-950 px-8 py-3.5 rounded-xl text-sm font-black inline-block transition-all transform hover:-translate-y-0.5 shadow-xl">
                Configure This Agent In Portal
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-stone-900 bg-stone-950 text-stone-600 text-center">
        <div className="max-w-7xl mx-auto space-y-4">
          <p className="text-xs font-mono">Simpler Life 100 &copy; 2026. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
