import { Link } from "@tanstack/react-router";
import type { CaseStudy as CaseStudyType } from "~/content/case-studies";
import { caseStudies } from "~/content/case-studies";

export default function CaseStudyPage({ data }: { data: CaseStudyType }) {
  const cs = data;
  const related = caseStudies.filter(other => other.id !== cs.id).slice(0, 2);

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
                CUSTOMER CASE STUDY
              </span>
              <span className="text-[11px] font-mono text-stone-400 bg-stone-900 px-2.5 py-1 rounded-md border border-stone-800 uppercase">
                {cs.industry.replace(/-/g, " ")}
              </span>
            </div>
            
            <h1 className="text-3xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              {cs.title}
            </h1>

            <p className="text-lg text-stone-300 font-medium">
              Client: <span className="text-emerald-400 font-bold">{cs.company}</span> &mdash; Timeline: {cs.timeline}
            </p>
          </div>
        </section>

        {/* Results Metrics Grid */}
        <section className="px-6 py-12 border-y border-stone-900 bg-stone-900/10">
          <div className="max-w-4xl mx-auto space-y-4">
            <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">[ Verifiable Outcomes ]</span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {cs.results.map((res, i) => (
                <div key={i} className="p-6 bg-stone-950 border border-stone-850 rounded-2xl flex flex-col justify-between hover:border-emerald-500/20 transition-all">
                  <div className="text-2xl lg:text-3xl font-black text-emerald-400 flex items-center gap-1">
                    <span>{res.value}</span>
                    <span className="text-emerald-500 text-sm">↑</span>
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-2">{res.metric}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Challenge & Solution Side-by-Side */}
        <section className="px-6 py-16 max-w-4xl mx-auto grid md:grid-cols-2 gap-10">
          {/* Challenge */}
          <div className="space-y-4 p-6 bg-rose-500/5 border border-rose-500/10 rounded-3xl">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <h2 className="text-sm font-mono font-bold tracking-widest text-rose-400 uppercase">The Challenge</h2>
            </div>
            <p className="text-sm text-stone-300 leading-relaxed">
              {cs.challenge}
            </p>
          </div>

          {/* Solution */}
          <div className="space-y-4 p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚀</span>
              <h2 className="text-sm font-mono font-bold tracking-widest text-emerald-400 uppercase">Our Solution</h2>
            </div>
            <p className="text-sm text-stone-300 leading-relaxed">
              {cs.solution}
            </p>
          </div>
        </section>

        {/* Testimonial Quote Block */}
        <section className="px-6 py-16 max-w-4xl mx-auto border-t border-stone-900/60">
          <blockquote className="p-8 bg-stone-900/40 border border-stone-850 rounded-3xl relative overflow-hidden">
            <div className="absolute top-4 left-4 text-7xl text-emerald-500/10 font-serif leading-none pointer-events-none">
              “
            </div>
            <p className="text-lg text-stone-200 italic leading-relaxed relative z-10">
              "{cs.quote.text}"
            </p>
            <footer className="mt-6 text-sm">
              <div className="font-bold text-emerald-400">{cs.quote.attribution}</div>
            </footer>
          </blockquote>
        </section>

        {/* Workflows and Integrations Used */}
        <section className="px-6 py-16 max-w-4xl mx-auto border-t border-stone-900">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <h3 className="text-base font-mono font-bold tracking-wider text-stone-400 uppercase">Deployed AI Workflows</h3>
              <div className="flex flex-wrap gap-2">
                {cs.workflowsUsed.map((wf, idx) => (
                  <div key={idx} className="px-3 py-1.5 bg-stone-900 border border-stone-850 rounded-xl text-xs font-mono text-stone-300 uppercase">
                    🤖 {wf.replace(/-/g, " ")}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-mono font-bold tracking-wider text-stone-400 uppercase">Integrated Stack</h3>
              <div className="flex flex-wrap gap-2">
                {cs.integrationsUsed.map((intName, idx) => (
                  <div key={idx} className="px-3 py-1.5 bg-stone-900 border border-stone-850 rounded-xl text-xs font-mono text-stone-300 uppercase">
                    🔌 {intName}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Related Case Studies */}
        {related.length > 0 && (
          <section className="px-6 py-16 bg-stone-900/20 border-t border-stone-900">
            <div className="max-w-4xl mx-auto space-y-6">
              <h2 className="text-2xl font-black text-white">Related Case Studies</h2>
              <div className="grid gap-4">
                {related.map((rcs) => (
                  <div key={rcs.id} className="p-6 bg-stone-950 border border-stone-850 rounded-2xl hover:border-emerald-500/20 transition-all flex justify-between items-center">
                    <div>
                      <span className="text-xs font-mono text-stone-500 uppercase tracking-widest block mb-1">
                        {rcs.industry}
                      </span>
                      <h4 className="text-sm font-bold text-white leading-snug">{rcs.title}</h4>
                    </div>
                    <Link to={`/case-studies/${rcs.id}` as any} className="text-xs font-mono text-emerald-400 whitespace-nowrap ml-4 shrink-0">
                      View case study →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Global CTA */}
        <section className="px-6 py-24 text-center relative overflow-hidden border-t border-stone-900">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-950/20 via-transparent to-transparent opacity-50" />
          <div className="max-w-2xl mx-auto relative z-10 space-y-6">
            <h2 className="text-3xl lg:text-5xl font-black text-white">Get Results Like {cs.company}</h2>
            <p className="text-sm text-stone-400">
              Let us analyze your business bottlenecks and deploy targeted AI coworkers to reduce operational waste.
            </p>
            <div className="pt-4">
              <Link to="/build" className="bg-white hover:bg-stone-200 text-stone-950 px-8 py-3.5 rounded-xl text-sm font-black inline-block transition-all transform hover:-translate-y-0.5 shadow-xl">
                Configure Your Solution
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
