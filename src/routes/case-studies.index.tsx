import { createFileRoute, Link } from '@tanstack/react-router';
import { caseStudies } from '~/content/case-studies';
import { Header } from '~/components/Header';

export const Route = createFileRoute('/case-studies/')({
  head: () => ({
    meta: [
      { title: "Case Studies | Simpler Life 100" },
      { name: "description", content: "Real results from AI Operations Teams. See how companies in logistics, manufacturing, healthcare, and retail automated their operations." },
    ],
  }),
  component: CaseStudiesIndexPage,
});

function CaseStudiesIndexPage() {
  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-500/30 selection:text-emerald-200 bg-stone-950">
      <Header businessName="Simpler Life 100" />
      <main className="flex-1 py-16 lg:py-24 px-6">
        <div className="max-w-7xl mx-auto space-y-16">
          {/* Hero */}
          <div className="text-center space-y-6">
            <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              CASE STUDIES
            </span>
            <h1 className="text-5xl lg:text-7xl font-black text-white tracking-tight">
              Real Results. <span className="text-emerald-500">Real Impact.</span>
            </h1>
            <p className="text-xl text-stone-400 max-w-2xl mx-auto">
              See how companies across industries use AI operations teams to reduce costs,
              eliminate errors, and scale their operations.
            </p>
          </div>

          {/* Case Studies Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {caseStudies.map((cs) => (
              <Link
                key={cs.id}
                to="/case-studies/$caseStudyId"
                params={{ caseStudyId: cs.id }}
                className="group bg-stone-900 border border-stone-800 rounded-2xl p-6 hover:border-emerald-500/30 transition-all hover:-translate-y-1"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-stone-800 text-stone-400 uppercase tracking-wider">
                    {cs.industry?.replace(/-/g, ' ') || 'General'}
                  </span>
                  {cs.results?.[0] && (
                    <span className="text-xs font-bold text-emerald-400">
                      {cs.results[0].metric}: {cs.results[0].value}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-white mb-2 group-hover:text-emerald-400 transition-colors">
                  {cs.title}
                </h3>
                <p className="text-sm text-stone-400 leading-relaxed line-clamp-3 mb-3">
                  {cs.challenge}
                </p>
                {cs.quote && (
                  <p className="text-xs text-stone-500 italic border-l-2 border-stone-700 pl-3">
                    "{cs.quote.text?.slice(0, 120)}..."
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-500 group-hover:underline">
                    Read full case study →
                  </span>
                  {cs.timeline && (
                    <span className="text-xs text-stone-500 ml-auto">{cs.timeline}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-10 lg:p-14 text-center space-y-6">
            <h3 className="text-2xl lg:text-3xl font-black text-white">
              Ready to transform your operations?
            </h3>
            <p className="text-stone-400 max-w-xl mx-auto text-sm leading-relaxed">
              Get a custom blueprint for your industry. Our deep-dive audit includes a technical
              roadmap, ROI projection, and implementation plan.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/build"
                className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm px-8 py-3.5 rounded-xl transition-all"
              >
                Build Your AI Team
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center bg-stone-800 hover:bg-stone-700 text-white font-black text-sm px-8 py-3.5 rounded-xl transition-all"
              >
                Talk to Our Team
              </Link>
            </div>
          </div>
        </div>
      </main>
      <footer className="px-6 py-12 border-t border-stone-800 bg-stone-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <div className="text-2xl font-black text-emerald-400 mb-2">Simpler Life 100</div>
            <p className="text-sm text-stone-400">AI coworkers for operations teams. Work less, live more.</p>
          </div>
          <div className="text-sm font-bold flex gap-6">
            <Link to="/" className="text-stone-400 hover:text-emerald-400">Home</Link>
            <Link to="/how-it-works" className="text-stone-400 hover:text-emerald-400">How It Works</Link>
            <Link to="/faq" className="text-stone-400 hover:text-emerald-400">FAQ</Link>
            <Link to="/about" className="text-stone-400 hover:text-emerald-400">About</Link>
            <Link to="/contact" className="text-stone-400 hover:text-emerald-400">Contact</Link>
          </div>
          <div className="text-xs text-stone-400">&copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.</div>
        </div>
      </footer>
    <Footer />
    </div>
  );
}
