import { Link } from "@tanstack/react-router";
import type { Integration as IntegrationType } from "~/content/integrations";

export default function IntegrationPage({ data }: { data: IntegrationType }) {
  const i = data;

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
            <div className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              {i.category} CONNECTOR
            </div>
            
            <h1 className="text-4xl lg:text-7xl font-black tracking-tight text-white leading-tight">
              {i.name} Integration
            </h1>

            <p className="text-lg lg:text-xl text-stone-300 leading-relaxed max-w-2xl">
              {i.description}
            </p>
          </div>
        </section>

        {/* Capabilities Section */}
        <section className="px-6 py-16 max-w-4xl mx-auto border-t border-stone-900/40">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">[ Core Competencies ]</span>
              <h2 className="text-3xl font-black text-white">Out-of-the-Box Capabilities</h2>
              <p className="text-sm text-stone-400 leading-relaxed">
                Our AI operational coworkers communicate bi-directionally with {i.name} via official APIs, files, or custom databases to fetch context and update system records.
              </p>
            </div>
            <ul className="space-y-4">
              {i.capabilities.map((cap, index) => (
                <li key={index} className="p-4 bg-stone-900/50 border border-stone-850 rounded-2xl flex items-start gap-3">
                  <span className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0">
                    ✓
                  </span>
                  <span className="text-sm text-stone-200">{cap}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Industries Supported Section */}
        <section className="px-6 py-16 max-w-4xl mx-auto border-t border-stone-900">
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-white">Supported Verticals</h2>
            <div className="flex flex-wrap gap-2">
              {i.industries.map((ind, index) => (
                <Link
                  key={index}
                  to="/"
                  className="text-xs font-mono font-bold text-stone-300 bg-stone-900 hover:bg-stone-850 hover:text-emerald-400 px-4 py-2 rounded-xl border border-stone-800 hover:border-emerald-500/30 transition-all uppercase"
                >
                  #{ind.replace(/-/g, " ")}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Related Workflows Section */}
        <section className="px-6 py-16 bg-stone-900/20 border-t border-stone-900">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">[ Workflows Enabled ]</span>
              <h2 className="text-3xl font-black text-white">Related AI Workflows</h2>
              <p className="text-sm text-stone-400 leading-relaxed max-w-xl">
                Deploy these automated workflows that utilize the {i.name} connector to streamline daily business operations.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {i.relatedWorkflows.map((wf, index) => (
                <Link
                  key={index}
                  to="/portal"
                  className="p-6 bg-stone-950 border border-stone-850 rounded-2xl hover:border-emerald-500/30 hover:bg-stone-900/60 transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">[ Deployable Workflow ]</span>
                    <h3 className="text-base font-bold text-white mt-2 mb-2 uppercase tracking-wide">{wf.replace(/-/g, " ")}</h3>
                    <p className="text-xs text-stone-400 leading-relaxed">
                      Click to configure and assign an AI operations team coworker for {wf.replace(/-/g, " ")}.
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-stone-900 text-xs font-mono text-emerald-400">
                    Deploy →
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Global CTA Section */}
        <section className="px-6 py-24 text-center relative overflow-hidden border-t border-stone-900">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-950/20 via-transparent to-transparent opacity-50" />
          <div className="max-w-2xl mx-auto relative z-10 space-y-6">
            <h2 className="text-3xl lg:text-5xl font-black text-white">Integrate {i.name} With Your AI Team</h2>
            <p className="text-sm text-stone-400 max-w-lg mx-auto">
              Our integration engineers handle everything securely. Your credentials remain safe and encrypted in our localized vault.
            </p>
            <div className="pt-4">
              <Link to="/build" className="bg-white hover:bg-stone-200 text-stone-950 px-8 py-3.5 rounded-xl text-sm font-black inline-block transition-all transform hover:-translate-y-0.5 shadow-xl">
                Configure {i.name} Connection Now
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
