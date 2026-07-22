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

export const Route = createFileRoute('/how-it-works')({
  loader: () => getPageData(),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  const { businessName, user } = Route.useLoaderData();

  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-100 selection:text-emerald-900 bg-stone-50">
      <header className="px-6 py-6 bg-stone-950 sticky top-0 z-50 border-b border-stone-800 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-400 tracking-tight">
            {businessName}
          </Link>
          <nav className="flex gap-8 items-center">
            <Link to="/" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Home</Link>
            <Link to="/how-it-works" className="text-sm font-bold text-emerald-400 transition-colors">How It Works</Link>
            <Link to="/faq" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">FAQ</Link>
            <Link to="/about" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">About</Link>
            <Link to="/contact" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-20 lg:py-28 bg-stone-950 border-b border-stone-800 text-center">
          <div className="max-w-4xl mx-auto">
            <span className="inline-block px-3 py-1 mb-4 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              AGENT ARCHITECTURE
            </span>
            <h1 className="text-5xl lg:text-7xl font-black text-white tracking-tight mb-6 leading-tight">
              What is an AI Agent?
            </h1>
            <p className="text-xl lg:text-2xl text-stone-400 max-w-2xl mx-auto leading-relaxed">
              Think of an AI agent as a digital employee that lives inside your existing tools. Unlike traditional automation, agents can read, reason, decide, and act autonomously.
            </p>
          </div>
        </section>

        {/* Capabilities Grid */}
        <section className="px-6 py-20 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <h2 className="text-3xl lg:text-4xl font-black text-white tracking-tight">
                An AI Employee in your existing tool stack.
              </h2>
              <p className="text-lg text-stone-400 leading-relaxed">
                Traditional software requires perfect, structured data (like a database entry) to work. AI agents can reason through messy, unstructured real-world tasks. They understand normal human language, extract data from scanned PDFs, make logical conditional decisions, and handle exceptions.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  "Read & analyze emails",
                  "Update HubSpot & Salesforce",
                  "Generate reports & charts",
                  "Call REST, GraphQL & SOAP APIs",
                  "Interact with customers",
                  "Schedule and coordinate",
                  "Parse invoices & documents",
                  "Trigger automated alerts"
                ].map(task => (
                  <div key={task} className="flex items-center gap-2 text-stone-300 font-bold text-sm">
                    <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{task}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-stone-900 rounded-[2.5rem] p-10 lg:p-14 text-white shadow-2xl space-y-8">
              <h3 className="text-xl font-black text-emerald-400">Real Deployment Blueprints</h3>
              <div className="space-y-6">
                <div className="pb-6 border-b border-white/10">
                  <div className="text-white font-bold mb-2 text-lg">Example: Logistics Dispatch</div>
                  <p className="text-stone-400 text-sm leading-relaxed">
                    Agent monitors incoming carrier email dispatch updates, extracts rates and vehicle capabilities, crosses them with your primary TMS records, and automatically executes either an automated route assignment or sends a priority human review alert.
                  </p>
                </div>
                <div>
                  <div className="text-white font-bold mb-2 text-lg">Example: Patient Intake</div>
                  <p className="text-stone-400 text-sm leading-relaxed">
                    Agent scans the incoming fax directory, uses deep OCR parsing to extract handwritten patient medical records, triggers automatic online eligibility checks, and formats the output cleanly directly into your proprietary EMR system.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Traditional Automation vs AI Agent */}
        <section className="px-6 py-20 bg-stone-950 text-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight mb-4">Traditional Software vs. AI Agents</h2>
              <p className="text-stone-400">Why simple macro triggers fail, and how cognitive agents succeed.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-stone-400 font-mono text-xs uppercase tracking-wider">
                    <th className="py-4 pr-6">Feature</th>
                    <th className="py-4 px-6">Traditional Automation (Zapier/Macros)</th>
                    <th className="py-4 pl-6 text-emerald-400">AI Operations Coworker</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  <tr>
                    <td className="py-4 pr-6 font-bold">Data Requirement</td>
                    <td className="py-4 px-6 text-stone-300">Requires strict APIs and clean CSV inputs.</td>
                    <td className="py-4 pl-6 font-bold text-emerald-400">Processes messy emails, scanned images, handwritten PDFs, and voice.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-6 font-bold">Decision Capability</td>
                    <td className="py-4 px-6 text-stone-300">Simple If-This-Then-That rules. Breaks instantly on deviations.</td>
                    <td className="py-4 pl-6 font-bold text-emerald-400">Weighs context, evaluates rules, parses exceptions, and reasons logically.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-6 font-bold">Integration Scale</td>
                    <td className="py-4 px-6 text-stone-300">Locked to pre-existing tool integrations or basic connectors.</td>
                    <td className="py-4 pl-6 font-bold text-emerald-400">Fully compatible with all ERPs, CRMs, local files, faxes, and customized legacy portals.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-6 font-bold">Error Handling</td>
                    <td className="py-4 px-6 text-stone-300">Fails silently or crashes the entire sync pipeline.</td>
                    <td className="py-4 pl-6 font-bold text-emerald-400">Routes exceptions to a Human-in-the-Loop dashboard for manual sign-off.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Security & Reliability */}
        <section className="px-6 py-20 max-w-5xl mx-auto space-y-12">
          <div className="text-center">
            <h2 className="text-3xl lg:text-4xl font-black text-white tracking-tight">Security & Reliability First</h2>
            <p className="text-stone-400 mt-2">Enterprise-grade guardrails for complete peace of mind.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 bg-stone-950 border border-stone-800 rounded-3xl space-y-4">
              <div className="text-3xl">🛡️</div>
              <h4 className="text-lg font-black text-stone-900">Data Stays Local</h4>
              <p className="text-sm text-stone-400 leading-relaxed">
                Our agents connect directly within your existing systems (Salesforce, Google, etc.). We never store or resell your operational credentials.
              </p>
            </div>
            <div className="p-8 bg-stone-950 border border-stone-800 rounded-3xl space-y-4">
              <div className="text-3xl">👥</div>
              <h4 className="text-lg font-black text-stone-900">Human-In-The-Loop</h4>
              <p className="text-sm text-stone-400 leading-relaxed">
                High-stakes financial or logistical decisions can be routed to an approval dashboard. Your human employees maintain final authority where it counts.
              </p>
            </div>
            <div className="p-8 bg-stone-950 border border-stone-800 rounded-3xl space-y-4">
              <div className="text-3xl">🔄</div>
              <h4 className="text-lg font-black text-stone-900">Operational Redundancy</h4>
              <p className="text-sm text-stone-400 leading-relaxed">
                If an external API is down or model latency surges, our platform retries and auto-scales to ensure zero transaction drop-outs.
              </p>
            </div>
          </div>
        </section>

        {/* Action CTA */}
        <section className="px-6 py-20 bg-emerald-600 text-center text-white">
          <div className="max-w-4xl mx-auto space-y-8">
            <h2 className="text-3xl lg:text-5xl font-black leading-tight">Stop Copy-Pasting. Get a Free Automation Plan.</h2>
            <p className="text-lg text-emerald-100 max-w-2xl mx-auto">
              Our 30-minute operational assessment will outline the exact workflows, cost savings, and timelines for your custom AI employee.
            </p>
            <div className="flex justify-center">
              <Link to="/contact" className="bg-stone-950 text-emerald-400 px-10 py-4 rounded-xl font-black text-lg hover:bg-emerald-500/10 transition-all shadow-xl">
                Get Your Free Blueprint ➜
              </Link>
            </div>
          </div>
        </section>
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
