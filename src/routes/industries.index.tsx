import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { readFile } from 'node:fs/promises';
import { Header } from '~/components/Header';
import { industries } from '~/content/industries';
import { getUser } from '~/db/queries';

const getPageData = createServerFn({ method: 'GET' }).handler(async () => {
  let businessName = 'Simpler Life 100';
  try {
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

export const Route = createFileRoute('/industries/')({
  loader: () => getPageData(),
  component: IndustriesIndexPage,
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
              23 Industries. <span className="text-emerald-500">One AI Operations Platform.</span>
            </h1>
            <p className="text-xl text-stone-400 max-w-2xl mx-auto">
              Purpose-built AI operations teams for every industry. Choose your vertical to see
              specialized agents, workflows, integrations, and real customer results.
            </p>
          </div>

          {/* Industry Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {industries.map((industry) => (
              <Link
                key={industry.id}
                to="/industries/$industryId"
                params={{ industryId: industry.id }}
                className="group bg-stone-900 border border-stone-800 rounded-2xl p-6 hover:border-emerald-500/30 transition-all hover:-translate-y-1"
              >
                <span className="text-4xl mb-4 block">{industry.icon}</span>
                <h3 className="text-lg font-black text-white mb-1.5 group-hover:text-emerald-400 transition-colors">
                  {industry.name}
                </h3>
                <p className="text-sm text-stone-400 leading-relaxed">
                  {industry.tagline}
                </p>
              </Link>
            ))}
          </div>

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
    </div>
  );
}
