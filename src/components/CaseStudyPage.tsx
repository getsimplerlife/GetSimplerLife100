import { Link } from "@tanstack/react-router";
import type { CaseStudy as CaseStudyType } from "~/content/case-studies";
import { caseStudies } from "~/content/case-studies";
export default function CaseStudyPage({ data }: { data: CaseStudyType }) {
  const cs = data;
  const related = caseStudies.filter(other => other.id !== cs.id).slice(0, 2);
  return (
    <div className="flex flex-col min-h-screen bg-stone-950 text-stone-100 font-sans">
      <header className="px-6 py-4 border-b border-stone-850 bg-stone-950">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <span className="text-emerald-500">⚡</span> Simpler Life 100
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xs font-mono text-stone-400 hover:text-white transition-colors">
              [ Back to Home ]
            </Link>
            <Link to="/case-studies" className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors">
              [ All demonstrations ]
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <section className="px-6 py-16 lg:py-20 bg-gradient-to-b from-stone-950 to-stone-900/30 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/15 via-transparent to-transparent opacity-60 pointer-events-none" />
          <div className="max-w-4xl mx-auto relative z-10 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                VERIFIED BLUEPRINT
              </span>
            </div>
            <h1 className="text-3xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              {cs.title}
            </h1>
            <p className="text-lg text-stone-300 font-medium leading-relaxed">{cs.blueprint}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              {cs.integrations.map((it) => (
                <span key={it} className="text-[11px] font-mono text-stone-300 bg-stone-900 px-2.5 py-1 rounded-md border border-stone-800 uppercase">
                  🔌 {it}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* How it runs */}
        <section className="px-6 py-12 max-w-4xl mx-auto">
          <h2 className="text-sm font-mono font-bold tracking-widest text-emerald-400 uppercase mb-6">
            [ How the automation runs ]
          </h2>
          <ol className="space-y-3">
            {cs.walkthrough.map((step, i) => (
              <li key={i} className="flex gap-3 items-start p-4 bg-stone-900/50 border border-stone-850 rounded-xl text-sm text-stone-300">
                <span className="text-emerald-400 font-mono font-bold shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Verification note */}
        <section className="px-6 py-12 max-w-4xl mx-auto border-t border-stone-900/60">
          <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✅</span>
              <h2 className="text-sm font-mono font-bold tracking-widest text-emerald-400 uppercase">Verification</h2>
            </div>
            <p className="text-sm text-stone-300 leading-relaxed">{cs.verificationNote}</p>
          </div>
        </section>

        {/* Illustrative estimate */}
        {cs.illustrativeEstimate && cs.illustrativeEstimate.length > 0 && (
          <section className="px-6 py-12 max-w-4xl mx-auto border-t border-stone-900/60">
            <h2 className="text-sm font-mono font-bold tracking-widest text-stone-400 uppercase mb-4">
              [ Illustrative estimate ]
            </h2>
            <p className="text-xs text-stone-500 mb-4">
              Estimates of a typical workflow, not delivered client results.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cs.illustrativeEstimate.map((res, i) => (
                <div key={i} className="p-5 bg-stone-950 border border-stone-850 rounded-2xl">
                  <div className="text-sm font-bold text-stone-400">{res.metric}</div>
                  <div className="text-lg font-black text-emerald-400 mt-1">{res.value}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related blueprints */}
        {related.length > 0 && (
          <section className="px-6 py-16 bg-stone-900/20 border-t border-stone-900">
            <div className="max-w-4xl mx-auto space-y-6">
              <h2 className="text-2xl font-black text-white">More demonstrations</h2>
              <div className="grid gap-4">
                {related.map((rcs) => (
                  <div key={rcs.id} className="p-6 bg-stone-950 border border-stone-850 rounded-2xl hover:border-emerald-500/20 transition-all flex justify-between items-center">
                    <div>
                      <span className="text-xs font-mono text-stone-500 uppercase tracking-widest block mb-1">
                        {rcs.integrations.join(" · ")}
                      </span>
                      <h4 className="text-sm font-bold text-white leading-snug">{rcs.title}</h4>
                    </div>
                    <Link to={`/case-studies/${rcs.id}` as any} className="text-xs font-mono text-emerald-400 whitespace-nowrap ml-4 shrink-0">
                      View demonstration →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="px-6 py-24 text-center relative overflow-hidden border-t border-stone-900">
          <div className="max-w-2xl mx-auto relative z-10 space-y-6">
            <h2 className="text-3xl lg:text-5xl font-black text-white">Run this in your stack.</h2>
            <p className="text-sm text-stone-400">
              We map your operational bottlenecks to verified automation patterns and build the
              AI employees that run them safely against your own systems.
            </p>
            <div className="pt-4">
              <Link to="/build" className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3.5 rounded-xl text-sm font-black inline-block transition-all transform hover:-translate-y-0.5 shadow-xl">
                Configure Your Solution
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="px-6 py-12 border-t border-stone-900 bg-stone-950 text-stone-600 text-center">
        <div className="max-w-7xl mx-auto space-y-4">
          <p className="text-xs font-mono">Simpler Life 100 &copy; 2026. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
