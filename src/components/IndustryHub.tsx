import { Link } from "@tanstack/react-router";
import type { IndustryHub as IndustryHubType } from "~/content/industries";
import { IndustryRecommendationEngine } from "./IndustryRecommendationEngine";
import { HowItWorksTimeline } from "./HowItWorksTimeline";

export default function IndustryHub({ data }: { data: IndustryHubType }) {
  const c = data;

  return (
    <div className="flex flex-col min-h-screen bg-stone-950 text-stone-100 font-sans selection:bg-emerald-500 selection:text-stone-950">
      {/* Navigation Header */}
      <header className="px-6 py-6 border-b border-stone-900 bg-stone-950 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <span className="text-emerald-500 font-bold">✨</span> Simpler Life 100
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xs font-mono text-stone-400 hover:text-white transition-colors uppercase tracking-widest border border-stone-850 hover:border-stone-700 px-4 py-2 rounded-xl">
              ← Exit to Home
            </Link>
            <Link to="/login" className="bg-emerald-600 hover:bg-emerald-500 text-stone-950 px-5 py-2.5 rounded-xl text-xs font-bold font-mono transition-colors shadow-md shadow-emerald-950/20">
              Portal Login →
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 py-20 lg:py-32 bg-gradient-to-b from-stone-950 to-stone-900/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/20 via-transparent to-transparent opacity-60 pointer-events-none" />
          <div className="max-w-5xl mx-auto text-center relative z-10 space-y-6">
            <span className="inline-block text-6xl mb-2 filter drop-shadow-lg animate-pulse">{c.icon}</span>
            <div className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-widest rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              {c.name} AI Operations Team
            </div>
            <h1 className="text-4xl lg:text-7xl font-black tracking-tight text-white leading-tight">
              AI-Powered Operations for <span style={{ color: c.accent }}>{c.name}</span>
            </h1>
            <p className="text-lg lg:text-2xl text-stone-300 max-w-3xl mx-auto leading-relaxed">
              {c.tagline}
            </p>
            <p className="text-sm lg:text-base text-stone-400 max-w-2xl mx-auto leading-relaxed">
              {c.hook}
            </p>
            <div className="pt-4 flex flex-wrap justify-center gap-4">
              <a href="#recommendations" className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 px-8 py-3.5 rounded-xl text-sm font-bold transition-all transform hover:-translate-y-0.5 shadow-lg shadow-emerald-950/20">
                Run Operational Audit
              </a>
              <a href="#timeline" className="bg-stone-900 hover:bg-stone-800 text-white border border-stone-800 px-8 py-3.5 rounded-xl text-sm font-bold transition-all">
                See How It Works
              </a>
            </div>
          </div>
        </section>

        {/* KPI Displays */}
        <section className="px-6 py-8 max-w-5xl mx-auto relative z-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {c.kpis.map((kpi, i) => (
              <div key={i} className="p-6 bg-stone-900/60 border border-stone-850 rounded-2xl shadow-xl hover:border-stone-700 transition-colors text-center">
                <div className="text-3xl lg:text-4xl font-black mb-1 text-emerald-400">{kpi.value}</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">{kpi.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Dynamic Recommendation Engine Section */}
        <section id="recommendations" className="px-6 py-20 max-w-7xl mx-auto">
          <IndustryRecommendationEngine industry={c} />
        </section>

        {/* Animated Implementation Timeline Section */}
        <section id="timeline" className="px-6 py-20 bg-stone-900/10 border-y border-stone-900">
          <div className="max-w-6xl mx-auto">
            <HowItWorksTimeline />
          </div>
        </section>

        {/* Integrations Section */}
        <section className="px-6 py-20 bg-stone-950 border-b border-stone-900">
          <div className="max-w-5xl mx-auto text-center space-y-4">
            <span className="text-xs font-mono font-bold tracking-widest text-stone-500 uppercase">[ Compatible Stack ]</span>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-white">Integrates Directly With Your Stack</h2>
            <p className="text-stone-400 text-sm max-w-md mx-auto leading-relaxed">
              Our AI Operation Teams work directly within the business systems and communication tools your team already relies on.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-6">
              {c.integrations.map((intName, i) => (
                <div key={i} className="px-4 py-2.5 bg-stone-900/50 border border-stone-850 rounded-xl text-xs font-mono font-bold text-stone-300 flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {intName.toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Audit Packages Side-by-Side */}
        <section id="audit" className="px-6 py-20 bg-stone-900/10 border-b border-stone-900">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16 space-y-3">
              <span className="text-xs font-mono font-bold tracking-widest text-emerald-400 uppercase">[ Where to start ]</span>
              <h2 className="text-3xl lg:text-5xl font-extrabold text-white">Simple, Risk-Free Onboarding</h2>
              <p className="text-stone-400 text-xs lg:text-sm max-w-md mx-auto leading-relaxed">
                Start with a free data-driven scan or select our comprehensive technical blueprint.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {/* Quick Scan */}
              <div className="p-8 bg-stone-950 border border-stone-800 rounded-3xl flex flex-col justify-between hover:border-stone-700 transition-colors">
                <div>
                  <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">[ Step 01 ]</span>
                  <h3 className="text-2xl font-black text-white mt-2 mb-1">Efficiency Assessment</h3>
                  <p className="text-stone-400 text-sm mb-6">Let us find your highest leverage automation opportunities.</p>
                  <div className="text-4xl font-mono font-black text-white mb-6">
                    {c.auditPackages.efficiency.price}
                  </div>
                  <ul className="space-y-3.5 mb-8 border-t border-stone-900 pt-6">
                    {c.auditPackages.efficiency.features.map((feat, i) => (
                      <li key={i} className="text-xs text-stone-400 flex items-start gap-2.5">
                        <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link to="/assessment" className="w-full bg-emerald-600 hover:bg-emerald-500 text-stone-950 text-center py-3 rounded-xl text-sm font-bold transition-colors shadow-md">
                  Launch Free AI Assessment Tool
                </Link>
              </div>

              {/* Deep Dive */}
              <div className="p-8 bg-stone-950 border-2 border-emerald-500/20 rounded-3xl flex flex-col justify-between shadow-lg shadow-emerald-950/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-emerald-500 text-stone-950 text-[10px] font-mono font-bold uppercase tracking-widest px-4 py-1.5 rounded-bl-xl">
                  Popular
                </div>
                <div>
                  <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">[ Step 02 ]</span>
                  <h3 className="text-2xl font-black text-white mt-2 mb-1">Deep-Dive Operations Audit</h3>
                  <p className="text-stone-400 text-sm mb-6">Full technical roadmap, ROI projection, and blueprint.</p>
                  <div className="text-4xl font-mono font-black text-white mb-6">
                    {c.auditPackages.deepDive.price}
                  </div>
                  <ul className="space-y-3.5 mb-8 border-t border-stone-900 pt-6">
                    {c.auditPackages.deepDive.features.map((feat, i) => (
                      <li key={i} className="text-xs text-stone-400 flex items-start gap-2.5">
                        <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <a
                  href="https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full bg-white hover:bg-stone-200 text-stone-950 text-center py-3 rounded-xl text-sm font-bold transition-all"
                >
                  Buy Blueprint Assessment Now
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Case Studies Section */}
        {c.relatedCaseStudies && c.relatedCaseStudies.length > 0 && (
          <section className="px-6 py-20 bg-stone-950 border-b border-stone-900">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-16 space-y-3">
                <span className="text-xs font-mono font-bold tracking-widest text-stone-500 uppercase">[ Verifiable Results ]</span>
                <h2 className="text-3xl lg:text-5xl font-extrabold text-white mt-2">Measurable Customer Success</h2>
                <p className="text-stone-400 text-xs lg:text-sm max-w-md mx-auto leading-relaxed">
                  See how other leading organizations have scaled operations with custom AI coworkers.
                </p>
              </div>
              <div className="grid gap-6">
                {c.relatedCaseStudies.map((csId, i) => (
                  <div key={i} className="p-8 bg-stone-900/40 border border-stone-900 rounded-3xl flex flex-col md:flex-row gap-6 justify-between items-center hover:bg-stone-900/60 transition-colors">
                    <div className="space-y-4">
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        {c.name} Case Study
                      </span>
                      <h3 className="text-xl font-bold text-white">{csId.replace(/-/g, " ").toUpperCase()}</h3>
                      <p className="text-sm text-stone-400 leading-relaxed max-w-2xl">
                        A deep dive into how {c.name.toLowerCase()} businesses use autonomous AI coworkers to cut overhead costs by up to 50% in the first 30 days.
                      </p>
                    </div>
                    <Link to="/portal" className="bg-stone-900 hover:bg-stone-800 text-white border border-stone-800 px-6 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-colors font-mono">
                      [ Read Case Study ]
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="px-6 py-24 bg-stone-900 text-center relative overflow-hidden border-t border-stone-800">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-950/30 via-transparent to-transparent opacity-50" />
          <div className="max-w-3xl mx-auto relative z-10 space-y-6">
            <h2 className="text-4xl lg:text-6xl font-black tracking-tight text-white leading-tight">
              {c.resultsHeadline}
            </h2>
            <p className="text-stone-400 text-base max-w-xl mx-auto leading-relaxed">
              Automate your key business units, free up your high-value employees, and cut daily operations costs by up to 80%.
            </p>
            <div className="pt-6">
              <Link to="/register" className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 px-8 py-3.5 rounded-xl text-sm font-black tracking-wide inline-block transition-all transform hover:-translate-y-0.5 shadow-lg shadow-emerald-950/20">
                Get Started on Simpler Life 100
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-stone-900 bg-stone-950 text-stone-600 text-center">
        <div className="max-w-7xl mx-auto space-y-4">
          <p className="text-xs font-mono">Simpler Life 100 &copy; 2026. All rights reserved.</p>
          <div className="flex justify-center gap-6 text-[11px] font-mono">
            <Link to="/support" className="hover:text-stone-400">Support</Link>
            <Link to="/contact" className="hover:text-stone-400">Contact</Link>
            <Link to="/portal" className="hover:text-stone-400">Portal Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
