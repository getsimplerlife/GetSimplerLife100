import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import { getUser } from "~/db/queries";

const getPageData = createServerFn({ method: "GET" }).handler(async () => {
  let businessName = "Simpler Life 100";
  try {
    const cfg = JSON.parse(await readFile("site.json", "utf8")) as {
      businessName?: string;
    };
    businessName = cfg.businessName?.trim() ?? "Simpler Life 100";
  } catch (_err) {
    // Ignore error
  }

  const user = await getUser();
  return { businessName, user };
});

export const Route = createFileRoute("/")({
  loader: () => getPageData(),
  component: Home,
});

const topVerticals = [
  { name: "Energy", slug: "energy", multiplier: "2.2x", icon: "⚡", color: "#059669", demo: "/demos/energy" },
  { name: "Manufacturing", slug: "manufacturing", multiplier: "2.1x", icon: "🏭", color: "#0891b2", demo: "/demos/manufacturing" },
  { name: "Automotive", slug: "automotive", multiplier: "2.1x", icon: "🚗", color: "#ca8a04" },
  { name: "Financial Services", slug: "financial-services", multiplier: "2.0x", icon: "💰", color: "#15803d" },
  { name: "Logistics", slug: "logistics", multiplier: "2.0x", icon: "🚚", color: "#d97706" },
];

const journeySteps = [
  {
    step: "01",
    name: "Efficiency Audit",
    benefit: "Find the Waste",
    description: "We analyze your operations against 26 vertical benchmarks to identify every manual friction point and quantify potential savings.",
    price: "FREE",
    cta: "Schedule Your Free Audit",
    link: "#contact"
  },
  {
    step: "02",
    name: "Automation Blueprint",
    benefit: "Map the Solution",
    description: "Receive a technical roadmap and ROI projection. We detail exactly which agents to deploy and how they'll integrate with your stack.",
    price: "$2,500",
    cta: "Get Your Blueprint",
    link: "/audit"
  },
  {
    step: "03",
    name: "Implementation",
    benefit: "Deploy the Agents",
    description: "Our engineers build and deploy your vertical-specific agents, integrating them with your CRM, ERP, and communication tools.",
    price: "From $7,500",
    cta: "View Packages",
    link: "#services"
  },
  {
    step: "04",
    name: "Managed Ops",
    benefit: "Scale the Gains",
    description: "Continuous monitoring and prompt optimization ensure your AI operations stay efficient as your business grows.",
    price: "From $750/mo",
    cta: "See Ops Tiers",
    link: "#services"
  }
];

function Home() {
  const { businessName, user } = Route.useLoaderData();
  
  return (
    <div className="flex flex-col min-h-screen selection:bg-indigo-100 selection:text-indigo-900">
      <header className="px-6 py-6 bg-white dark:bg-slate-900 sticky top-0 z-50 border-b border-slate-100 dark:border-slate-800 backdrop-blur-md bg-white/80 dark:bg-slate-900/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-indigo-600 tracking-tight">
            {businessName}
          </Link>
          <nav className="hidden md:flex gap-10 items-center">
            <a href="#journey" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">The Journey</a>
            <a href="#verticals" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">ROI Multipliers</a>
            <Link to="/roi-calculator" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Calculator</Link>
            {user ? (
              <Link to="/portal" className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100">Dashboard</Link>
            ) : (
              <Link to="/login" className="text-sm font-bold text-indigo-600 hover:text-indigo-700">Login</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 pt-24 pb-32 lg:pt-40 lg:pb-48 bg-white overflow-hidden relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full opacity-[0.03] pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#4f46e5,transparent_70%)]" />
          </div>
          <div className="max-w-5xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 text-sm font-bold uppercase tracking-wider mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
              ⚡ Up to 2.2x ROI Multiplier
            </div>
            <h1 className="text-6xl lg:text-8xl font-black tracking-tight mb-10 text-slate-900 leading-[1.1]">
              Automate the <span className="text-indigo-600">Waste</span>. <br />Reclaim Your Time.
            </h1>
            <p className="text-2xl text-slate-500 mb-12 max-w-3xl mx-auto leading-relaxed">
              We deploy vertical-specific AI agents that eliminate the operational friction eating your bottom line. Stop managing manual work and start scaling.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <a href="#contact" className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-bold text-xl hover:bg-indigo-700 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-indigo-200">
                Schedule Free Audit
              </a>
              <Link to="/roi-calculator" className="bg-white text-slate-900 border-2 border-slate-100 px-10 py-5 rounded-2xl font-bold text-xl hover:bg-slate-50 transition-all hover:border-slate-200">
                Calculate Your Savings
              </Link>
            </div>
            <div className="mt-16 flex items-center justify-center gap-8 grayscale opacity-40">
              <span className="font-black text-2xl tracking-tighter">HEALTHCARE</span>
              <span className="font-black text-2xl tracking-tighter">LOGISTICS</span>
              <span className="font-black text-2xl tracking-tighter">FINANCE</span>
              <span className="font-black text-2xl tracking-tighter">ENERGY</span>
            </div>
          </div>
        </section>

        {/* ROI Multipliers Section */}
        <section id="verticals" className="px-6 py-32 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20 text-center">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 text-slate-900 tracking-tight">Pre-Modeled ROI by Vertical</h2>
              <p className="text-xl text-slate-500 max-w-2xl mx-auto">
                We've already modeled the automation potential for 26 industries. Here are our top performers.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
              {topVerticals.map((v) => (
                <Link key={v.name} to={(v.demo || `/industries/${v.slug}`) as any}
                  className="group bg-white p-8 rounded-3xl border-2 border-transparent hover:border-indigo-600 transition-all hover:shadow-2xl hover:-translate-y-2"
                >
                  <span className="text-5xl mb-6 block transform group-hover:scale-110 transition-transform">{v.icon}</span>
                  <div className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">{v.name}</div>
                  <div className="text-4xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{v.multiplier}</div>
                  <div className="text-sm font-bold text-slate-500 mt-2">Modeled ROI</div>
                </Link>
              ))}
            </div>
            <div className="mt-16 text-center">
              <Link to="/audit" className="inline-flex items-center gap-2 font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                View all 26 industry benchmarks <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </div>
        </section>

        {/* The 4-Step Journey Section */}
        <section id="journey" className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="mb-24">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 text-slate-900 tracking-tight">The Road to 100% Efficiency</h2>
              <p className="text-xl text-slate-500 max-w-2xl leading-relaxed">
                We don't sell software. We sell the elimination of waste through a proven, technical deployment journey.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 relative">
              <div className="hidden lg:block absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -translate-y-1/2 z-0" />
              {journeySteps.map((s) => (
                <div key={s.step} className="relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-black mb-8 shadow-lg shadow-indigo-200">
                    {s.step}
                  </div>
                  <div className="text-indigo-600 font-bold uppercase tracking-widest text-xs mb-2">{s.benefit}</div>
                  <h3 className="text-2xl font-black text-slate-900 mb-4">{s.name}</h3>
                  <p className="text-slate-500 leading-relaxed mb-6">
                    {s.description}
                  </p>
                  <div className="text-lg font-black text-slate-900 mb-6">{s.price}</div>
                  <a href={s.link} className="inline-block bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-800 transition-all">
                    {s.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Risk Reversal Section */}
        <section className="px-6 py-32 bg-slate-900 text-white overflow-hidden relative">
          <div className="max-w-5xl mx-auto relative z-10">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div>
                <h2 className="text-4xl lg:text-6xl font-black mb-8 leading-tight">100% Focused on Your Outcome.</h2>
                <div className="space-y-8">
                  <div className="flex gap-6">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <h4 className="text-xl font-bold mb-2">Audit Fee Credit</h4>
                      <p className="text-slate-400">The $2,500 blueprint fee is applied directly to your implementation costs. We only win when you build.</p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <h4 className="text-xl font-bold mb-2">Fixed-Price Deployment</h4>
                      <p className="text-slate-400">No open-ended hourly billing. You pay for a working, deployed agent that achieves a specific efficiency benchmark.</p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <h4 className="text-xl font-bold mb-2">Guaranteed Uptime</h4>
                      <p className="text-slate-400">Our monthly operations tier covers every bug, prompt adjustment, and model update. Your automation never rots.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-lg p-12 rounded-[3rem] border border-white/10 text-center">
                <div className="text-indigo-400 font-bold uppercase tracking-widest text-xs mb-6">Start Today</div>
                <h3 className="text-4xl font-black mb-8">Ready to see the waste in your business?</h3>
                <a href="#contact" className="block w-full bg-white text-slate-950 py-5 rounded-2xl font-bold text-xl hover:bg-slate-100 transition-all">
                  Book Your Free 60-Min Audit
                </a>
                <p className="mt-6 text-slate-500 text-sm font-medium">No credit card required. 1-on-1 strategy call.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Detailed Services (Hidden by default, linked from journey) */}
        <section id="services" className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-black mb-12 text-slate-900">Service Specifications</h2>
            <div className="grid md:grid-cols-2 gap-20">
              <div>
                <h3 className="text-xl font-bold text-indigo-600 mb-6 uppercase tracking-widest">Implementations</h3>
                <div className="space-y-6">
                  <div className="flex justify-between items-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="font-bold text-slate-700 text-lg">Starter (2 Agents)</span>
                    <span className="font-black text-slate-900 text-xl">$7,500</span>
                  </div>
                  <div className="flex justify-between items-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="font-bold text-slate-700 text-lg">Growth (5 Agents)</span>
                    <span className="font-black text-slate-900 text-xl">$15,000</span>
                  </div>
                  <div className="flex justify-between items-center p-6 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-100">
                    <span className="font-bold text-lg">Scale (Unlimited Workflows)</span>
                    <span className="font-black text-xl">$30,000</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-indigo-600 mb-6 uppercase tracking-widest">Monthly Operations</h3>
                <div className="space-y-6">
                  <div className="flex justify-between items-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="font-bold text-slate-700 text-lg">Essential Monitoring</span>
                    <span className="font-black text-slate-900 text-xl">$750/mo</span>
                  </div>
                  <div className="flex justify-between items-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="font-bold text-slate-700 text-lg">Professional Ops</span>
                    <span className="font-black text-slate-900 text-xl">$2,000/mo</span>
                  </div>
                  <div className="flex justify-between items-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="font-bold text-slate-700 text-lg">Enterprise Dedicated</span>
                    <span className="font-black text-slate-900 text-xl">$5,000/mo+</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Contact Form Section */}
        <section id="contact" className="px-6 py-32 bg-slate-50">
          <div className="max-w-4xl mx-auto bg-white rounded-[3rem] p-12 lg:p-20 shadow-2xl shadow-slate-200 border border-slate-100">
            <div className="text-center mb-16">
              <h2 className="text-4xl lg:text-5xl font-black mb-4 text-slate-900">Get Your Free Efficiency Audit</h2>
              <p className="text-lg text-slate-500">Book a 60-minute strategy call with our integration architects.</p>
            </div>
            {/* Form would go here - current implementation uses #contact as an anchor to an external or simple email link in footer */}
            <div className="text-center">
              <a href="mailto:contact@simplerlife100.com" className="inline-block bg-indigo-600 text-white px-12 py-5 rounded-2xl font-bold text-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                Email contact@simplerlife100.com
              </a>
              <p className="mt-8 text-slate-400 font-medium italic">"The most productive 60 minutes your operations team will spend this quarter."</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t border-slate-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div>
            <div className="text-2xl font-black text-indigo-600 mb-4">{businessName}</div>
            <p className="text-slate-400 max-w-sm">Eliminating operational waste through vertical-specific AI agents. Work less, live more.</p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-6">
            <div className="flex gap-8 font-bold text-slate-600">
              <a href="#" className="hover:text-indigo-600">Twitter</a>
              <a href="#" className="hover:text-indigo-600">LinkedIn</a>
              <Link to="/demos/audit-portal" className="hover:text-indigo-600 underline underline-offset-4">Audit Workflow Demo</Link>
            </div>
            <div className="text-sm text-slate-400">
              &copy; {new Date().getFullYear()} {businessName}. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
