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

export const Route = createFileRoute('/faq')({
  loader: () => getPageData(),
  component: FaqPage,
});

const faqCategories = [
  {
    category: "Capabilities & Scope",
    items: [
      {
        q: "Will this replace our employees?",
        a: "No. Our agents are designed to take over the repetitive, high-volume tasks that burn people out (such as manual ledger copying or invoice checking). This frees your human team to focus on higher-value growth work that requires actual judgment, creativity, and real relationship management."
      },
      {
        q: "What happens if the AI makes a mistake?",
        a: "Reliability is our absolute priority. Every agent blueprint includes strict 'Human-in-the-Loop' review dashboards for high-stakes decisions (like final payment approvals or carrier selection over budget thresholds), ensuring your team retains ultimate oversight."
      },
      {
        q: "How many agents can we deploy?",
        a: "There are no architectural limits. We have clients running a single billing agent, while others run entire cross-department operations teams consisting of 10+ interconnected agents sharing real-time message streams."
      }
    ]
  },
  {
    category: "Integrations & Tech",
    items: [
      {
        q: "Will it work with our existing software?",
        a: "Yes. Our agents are pre-integrated directly with standard systems like Salesforce, HubSpot, Microsoft 365, Google Workspace, Slack, Teams, QuickBooks, SAP, and most modern APIs. If you have legacy on-prem software, we custom-build secure API connectors during development."
      },
      {
        q: "How long does it take to deploy?",
        a: "Most standard AI agents are fully operational within 2 to 4 weeks. Custom enterprise implementations with complex legacy database mappings typically take 6 to 8 weeks."
      },
      {
        q: "Do we need an internal IT team to maintain this?",
        a: "Not at all. Under our Managed Operations tiers, our team handles all model updates, prompt tweaking, system monitoring, API patches, and security auditing for you."
      }
    ]
  },
  {
    category: "Security & Trust",
    items: [
      {
        q: "Is our business data secure?",
        a: "Absolutely. We follow strict data privacy standards. Your data stays within your existing systems (Salesforce, Google, internal servers, etc.), and we use bank-level encryption protocols. We do not store, copy, or resell your proprietary operational credentials."
      },
      {
        q: "Do you train models on our company data?",
        a: "Never. All AI agents utilize closed, private API endpoints. Your corporate data, logs, and interaction histories are never used to train public LLMs."
      }
    ]
  }
];

function FaqPage() {
  const { businessName } = Route.useLoaderData();

  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-100 selection:text-emerald-900 bg-stone-50">
      <header className="px-6 py-6 bg-stone-950 sticky top-0 z-50 border-b border-stone-800 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-400 tracking-tight">
            {businessName}
          </Link>
          <nav className="flex gap-8 items-center">
            <Link to="/" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Home</Link>
            <Link to="/how-it-works" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">How It Works</Link>
            <Link to="/faq" className="text-sm font-bold text-emerald-400 transition-colors">FAQ</Link>
            <Link to="/about" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">About</Link>
            <Link to="/contact" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 py-16 lg:py-24 px-6">
        <div className="max-w-5xl mx-auto space-y-16">
          
          {/* Header */}
          <div className="text-center">
            <span className="inline-block px-3 py-1 mb-4 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              RESOURCES
            </span>
            <h1 className="text-5xl lg:text-7xl font-black text-white tracking-tight mb-6">
              Common Questions
            </h1>
            <p className="text-xl text-stone-400 max-w-2xl mx-auto">
              Everything you need to know before we build, deploy, and scale your AI operations team.
            </p>
          </div>

          {/* Grid of Categories */}
          <div className="space-y-12">
            {faqCategories.map((cat, idx) => (
              <div key={idx} className="space-y-6">
                <h3 className="text-xs font-mono font-bold tracking-widest text-stone-400 uppercase border-b border-stone-900 pb-3">
                  {cat.category}
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  {cat.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="p-8 bg-stone-950 border border-stone-800 rounded-3xl space-y-3 hover:border-emerald-200 transition-colors shadow-sm">
                      <h4 className="text-lg lg:text-xl font-black text-white leading-snug">
                        {item.q}
                      </h4>
                      <p className="text-sm text-stone-400 leading-relaxed">
                        {item.a}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Fallback Objections Section */}
          <div className="bg-stone-950 text-white rounded-[2.5rem] p-10 lg:p-14 text-center space-y-6">
            <h3 className="text-2xl lg:text-3xl font-black">Have a specific technical question?</h3>
            <p className="text-stone-400 max-w-xl mx-auto text-sm leading-relaxed">
              We build custom integrations for high-security healthcare, logistics, and financial environments. Let's discuss your specific API requirements.
            </p>
            <div className="flex justify-center">
              <Link to="/contact" className="bg-stone-950 text-stone-100 font-black text-sm px-8 py-3.5 rounded-xl hover:bg-stone-900 transition-all">
                Talk to an Integration Engineer
              </Link>
            </div>
          </div>

        </div>
      </main>

      <footer className="px-6 py-12 border-t border-stone-900 bg-stone-950 text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <div className="text-2xl font-black text-emerald-400 mb-2">{businessName}</div>
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
