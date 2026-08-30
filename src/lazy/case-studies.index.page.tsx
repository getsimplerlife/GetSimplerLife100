import { Link } from "@tanstack/react-router";
import { caseStudies } from "~/content/case-studies";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
function CaseStudiesIndexPage() {
  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-500/30 selection:text-emerald-200 bg-stone-950">
      <Header businessName="Simpler Life 100" />
      <main className="flex-1 py-16 lg:py-24 px-6">
        <div className="max-w-7xl mx-auto space-y-16">
          {/* Hero */}
          <div className="text-center space-y-6">
            <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              LIVE DEMONSTRATIONS
            </span>
            <h1 className="text-5xl lg:text-7xl font-black text-white tracking-tight">
              Verified Automation. <span className="text-emerald-500">Real Capability.</span>
            </h1>
            <p className="text-xl text-stone-400 max-w-2xl mx-auto">
              We run these workflows on our own live-verified integrations — Xero, HubSpot,
              DocuSign, Slack, Google, and Microsoft 365. Each is a demonstration of what the
              platform can do with your own authorized systems. We don't publish client results
              we can't prove.
            </p>
          </div>

          {/* Verified capability grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {caseStudies.map((cs) => (
              <Link
                key={cs.id}
                to="/case-studies/$caseStudyId"
                params={{ caseStudyId: cs.id }}
                className="group bg-stone-900 border border-stone-800 rounded-2xl p-6 hover:border-emerald-500/30 transition-all hover:-translate-y-1"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-stone-800 text-emerald-400 uppercase tracking-wider">
                    Verified Blueprint
                  </span>
                  {cs.illustrativeEstimate?.[0] && (
                    <span className="text-xs font-bold text-stone-400">
                      {cs.illustrativeEstimate[0].metric}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-white mb-2 group-hover:text-emerald-400 transition-colors">
                  {cs.title}
                </h3>
                <p className="text-sm text-stone-400 leading-relaxed line-clamp-3 mb-3">
                  {cs.blueprint}
                </p>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-bold text-emerald-500 group-hover:underline">
                    View demonstration →
                  </span>
                  <span className="text-xs text-stone-500">
                    {cs.integrations.join(" · ")}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Disclaimer */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
            <p className="text-xs text-stone-400 leading-relaxed">
              <span className="font-bold text-stone-300">Illustrative estimates.</span> Any
              timing or efficiency figure on these pages is an illustrative estimate of a
              typical workflow, not a delivered result for any client. We make no claim about
              outcomes at a specific company. Integrations shown are live-verified by our team;
              a few (e.g. QuickBooks) are code-ready and pending live credentials.
            </p>
          </div>

          {/* Bottom CTA */}
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-10 lg:p-14 text-center space-y-6">
            <h3 className="text-2xl lg:text-3xl font-black text-white">
              See these run in your stack.
            </h3>
            <p className="text-stone-400 max-w-xl mx-auto text-sm leading-relaxed">
              We'll map your operational bottlenecks to verified automation patterns and give
              you a technical roadmap — no fabricated promises.
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
      <Footer />
    </div>
  );
}
export default CaseStudiesIndexPage;
