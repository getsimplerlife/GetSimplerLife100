import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { readFile } from 'node:fs/promises';
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

export const Route = createFileRoute('/about')({
  loader: () => getPageData(),
  component: AboutPage,
});

function AboutPage() {
  const { businessName } = Route.useLoaderData();

  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-100 selection:text-emerald-900 bg-stone-50">
      <header className="px-6 py-6 bg-white sticky top-0 z-50 border-b border-stone-100 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-600 tracking-tight">
            {businessName}
          </Link>
          <nav className="flex gap-8 items-center">
            <Link to="/" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Home</Link>
            <Link to="/how-it-works" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">How It Works</Link>
            <Link to="/faq" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">FAQ</Link>
            <Link to="/about" className="text-sm font-bold text-emerald-600 transition-colors">About</Link>
            <Link to="/contact" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 py-16 lg:py-24 px-6">
        <div className="max-w-4xl mx-auto space-y-16">
          
          {/* Header */}
          <div className="text-center">
            <span className="inline-block px-3 py-1 mb-4 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">
              ABOUT US
            </span>
            <h1 className="text-5xl lg:text-7xl font-black text-stone-900 tracking-tight mb-6">
              Our Mission
            </h1>
            <p className="text-xl text-stone-500 max-w-2xl mx-auto leading-relaxed">
              We build AI operations teams to liberate people from the soul-crushing burden of repetitive, manual data entry.
            </p>
          </div>

          {/* Mission Card */}
          <div className="bg-white p-12 lg:p-20 rounded-[3rem] shadow-xl border border-stone-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full -mr-32 -mt-32 opacity-50" />
            <div className="relative z-10 space-y-8">
              <h2 className="text-3xl lg:text-4xl font-black text-stone-900 leading-tight">
                Software was supposed to make work easier. <span className="text-emerald-600">AI actually does.</span>
              </h2>
              <div className="text-lg lg:text-xl text-stone-600 space-y-6 leading-relaxed">
                <p>
                  We started Simpler Life 100 because we saw operations teams buried in manual work that software should have solved a decade ago. Copying data between tabs, manually reviewing documents, and chasing status updates isn't "work"—it's waste.
                </p>
                <p className="font-bold text-stone-900">
                  We don't sell generic software. We build AI employees that work inside the systems you already own.
                </p>
                <p>
                  Our goal is to give your team their time back, so they can focus on growth, strategy, and the human parts of your business that no computer could ever replicate.
                </p>
              </div>
              
              <div className="pt-8 border-t border-stone-100 flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center text-white text-2xl font-black shadow-lg">
                  SL
                </div>
                <div>
                  <div className="font-black text-stone-900 text-lg">Simpler Life 100</div>
                  <div className="text-stone-500 font-bold text-sm">The Operations AI Team</div>
                </div>
              </div>
            </div>
          </div>

          {/* Core Values / Principles */}
          <div className="space-y-8">
            <h3 className="text-2xl font-black text-stone-900 tracking-tight text-center">
              Our Core Principles
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: "Outcome Over Output",
                  desc: "We don't bill by open-ended hours or report on meaningless progress. We build, integrate, and deploy fully functional AI employees that deliver real, measurable business results."
                },
                {
                  title: "Respect for Human Labor",
                  desc: "Copying numbers from a PDF to an ERP is an insult to human intelligence. We automate the mechanical work so people can spend their energy on work that requires intuition, empathy, and judgment."
                },
                {
                  title: "Radical Simplicity",
                  desc: "We don't add more complex portals for your team to learn. Our agents live and work inside the communication tools and platforms your team is already using every single day."
                },
                {
                  title: "Continuous Adaptation",
                  desc: "Businesses change, APIs update, and systems evolve. Through our managed operations support, we ensure your automations remain perfectly adaptive, responsive, and reliable over time."
                }
              ].map((val, idx) => (
                <div key={idx} className="p-8 bg-white border border-stone-100 rounded-3xl space-y-2 hover:border-emerald-200 transition-colors shadow-sm">
                  <h4 className="text-lg font-black text-stone-900">{val.title}</h4>
                  <p className="text-sm text-stone-600 leading-relaxed">{val.desc}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>

      <footer className="px-6 py-12 border-t border-stone-200 bg-white text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <div className="text-2xl font-black text-emerald-600 mb-2">{businessName}</div>
            <p className="text-sm text-stone-400">AI coworkers for operations teams. Work less, live more.</p>
          </div>
          <div className="text-sm font-bold flex gap-6">
            <Link to="/" className="hover:text-emerald-600">Home</Link>
            <Link to="/how-it-works" className="hover:text-emerald-600">How It Works</Link>
            <Link to="/faq" className="hover:text-emerald-600">FAQ</Link>
            <Link to="/about" className="hover:text-emerald-600">About</Link>
            <Link to="/contact" className="hover:text-emerald-600">Contact</Link>
          </div>
          <div className="text-xs text-stone-400">&copy; {new Date().getFullYear()} {businessName}. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
