import { Link } from "@tanstack/react-router";
import { createServerFn } from "~/lib/server-fn-polyfill";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { industries } from "~/content/industries";
import { getUser } from "~/db/queries";
import { Route } from "~/routes/industries.index";

export const getPageData = createServerFn({ method: 'GET' }).handler(async () => {
  let businessName = 'Simpler Life 100';
  try {
    const { readFile } = await import('node:fs/promises');
    const cfg = JSON.parse(await readFile('site.json', 'utf8')) as {
      businessName?: string;
    };
    businessName = cfg.businessName?.trim() ?? 'Simpler Life 100';
  } catch (_err) {
    // Ignore error
  }
  const user = await getUser();
  return { businessName, user };
});



function IndustriesIndexPage() {
  const { businessName, user } = Route.useLoaderData();

  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-500/30 selection:text-emerald-200 bg-stone-950">
      <Header businessName={businessName} user={user} />

      <main className="flex-1 py-16 lg:py-24 px-6">
        <div className="max-w-7xl mx-auto space-y-16">
          {/* Hero */}
          <div className="text-center space-y-6">
            <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              INDUSTRY SOLUTIONS
            </span>
            <h1 className="text-5xl lg:text-7xl font-black text-white tracking-tight">
              7 Industries. <span className="text-emerald-500">One AI Operations Platform.</span>
            </h1>
            <p className="text-xl text-stone-400 max-w-2xl mx-auto">
              We start with the seven verticals where the operational pain is sharpest — claims, billing,
              intake, margins, compliance. Choose yours to see the specific problem, the workflows we
              automate, the AI coworkers we deploy, and how they fit your existing stack.
            </p>
          </div>

          {/* Focused Industries */}
          {(() => {
            const focusedIds = ["insurance", "legal", "real-estate", "healthcare", "construction", "professional-services", "financial-services"];
            const focused = industries.filter((i) => focusedIds.includes(i.id));
            const rest = industries.filter((i) => !focusedIds.includes(i.id));
            const problemLines: Record<string, string> = {
              insurance: "Claims processing is manual, slow, and error-prone — adjusters lose days per file to data re-keying.",
              legal: "Firms lose 15+ billable hours a week to time entry, matter setup, and invoice assembly.",
              "real-estate": "Speed-to-lead decides the deal — manual listing sync and follow-up lose hours of momentum.",
              healthcare: "Patient intake, scheduling, and compliance paperwork consume staff hours that should go to care.",
              construction: "Estimates, field reports, and change orders are re-keyed by hand — margins leak at every handoff.",
              "professional-services": "10–15% of billable time never gets billed because tracking and invoicing are manual.",
              "financial-services": "Regulatory reporting and client onboarding are re-keyed across systems — audit exposure grows.",
            };
            return (
              <>
                <div className="mb-4">
                  <div className="text-xs font-mono font-bold tracking-widest text-emerald-400 uppercase">Focus verticals</div>
                  <p className="text-sm text-stone-500 mt-1">Where the operational pain is sharpest — built first, proven first.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {focused.map((industry) => (
                    <Link
                      key={industry.id}
                      to="/industries/$industryId"
                      params={{ industryId: industry.id }}
                      className="group bg-stone-900 border border-emerald-500/20 rounded-2xl p-6 hover:border-emerald-500/50 transition-all hover:-translate-y-1 flex flex-col gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{industry.icon}</span>
                        <h3 className="text-lg font-black text-white group-hover:text-emerald-400 transition-colors">
                          {industry.name}
                        </h3>
                      </div>
                      <p className="text-sm font-bold text-emerald-300 leading-relaxed">
                        {problemLines[industry.id] ?? industry.tagline}
                      </p>
                      <p className="text-xs text-stone-500 leading-relaxed mt-auto">
                        {industry.tagline}
                      </p>
                    </Link>
                  ))}
                </div>
                {rest.length > 0 && (
                  <div className="mt-14 pt-10 border-t border-stone-800">
                    <div className="mb-4">
                      <div className="text-xs font-mono font-bold tracking-widest text-stone-500 uppercase">All industries</div>
                      <p className="text-sm text-stone-600 mt-1">The platform adapts to any vertical — these pages remain live.</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {rest.map((industry) => (
                        <Link
                          key={industry.id}
                          to="/industries/$industryId"
                          params={{ industryId: industry.id }}
                          className="group bg-stone-900/60 border border-stone-800 rounded-xl px-4 py-3 hover:border-stone-600 transition-all flex items-center gap-2.5"
                        >
                          <span className="text-xl">{industry.icon}</span>
                          <span className="text-sm font-bold text-stone-300 group-hover:text-white transition-colors">{industry.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Bottom CTA */}
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-10 lg:p-14 text-center space-y-6">
            <h3 className="text-2xl lg:text-3xl font-black text-white">
              Don't see your industry?
            </h3>
            <p className="text-stone-400 max-w-xl mx-auto text-sm leading-relaxed">
              We build custom AI operations teams for any vertical. Contact us to discuss your
              specific operational challenges.
            </p>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm px-8 py-3.5 rounded-xl transition-all"
            >
              Talk to Our Team
            </Link>
          </div>
        </div>
      </main>

      <footer className="px-6 py-12 border-t border-stone-800 bg-stone-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <div className="text-2xl font-black text-emerald-400 mb-2">{businessName}</div>
            <p className="text-sm text-stone-400">AI coworkers for operations teams. Work less, live more.</p>
          </div>
          <div className="text-sm font-bold flex gap-6">
            <Link to="/" className="text-stone-400 hover:text-emerald-400">Home</Link>
            <Link to="/how-it-works" className="text-stone-400 hover:text-emerald-400">How It Works</Link>
            <Link to="/faq" className="text-stone-400 hover:text-emerald-400">FAQ</Link>
            <Link to="/about" className="text-stone-400 hover:text-emerald-400">About</Link>
            <Link to="/contact" className="text-stone-400 hover:text-emerald-400">Contact</Link>
          </div>
          <div className="text-xs text-stone-400">&copy; {new Date().getFullYear()} {businessName}. All rights reserved.</div>
        </div>
      </footer>
    <Footer />
    </div>
  );
}

export default IndustriesIndexPage;
