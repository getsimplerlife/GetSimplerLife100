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
  { name: "Energy", slug: "energy", result: "25–40 hours saved per analyst/mo", icon: "⚡", color: "#059669", demo: "/demos/energy" },
  { name: "Manufacturing", slug: "manufacturing", result: "Reduced order processing time by 85%", icon: "🏭", color: "#0891b2", demo: "/demos/manufacturing" },
  { name: "Automotive", slug: "automotive", result: "3-month implementation payback", icon: "🚗", color: "#ca8a04" },
  { name: "Financial Services", slug: "financial-services", result: "100% data extraction accuracy", icon: "💰", color: "#15803d" },
  { name: "Logistics", slug: "logistics", result: "Saved 140 labor hours every month", icon: "🚚", color: "#d97706" },
];

const industryExamples = [
  {
    industry: "Healthcare",
    examples: ["Patient intake automation", "Prior authorization review", "Insurance verification", "Appointment reminders"]
  },
  {
    industry: "Logistics",
    examples: ["Carrier dispatching", "Status communication", "POD collection & matching", "Invoice reconciliation"]
  },
  {
    industry: "Finance",
    examples: ["AP automation", "Document data extraction", "Compliance reporting", "Client onboarding"]
  }
];

const ecosystemLogos = [
  "Salesforce", "HubSpot", "Microsoft", "Google Workspace", "QuickBooks", "Slack", "Teams", "SAP"
];

const journeySteps = [
  {
    step: "01",
    name: "Discover",
    benefit: "Audit",
    description: "We learn where your team loses time and identify the manual work that can be handled by AI coworkers.",
    price: "FREE",
    cta: "Book Free Assessment",
    link: "#contact"
  },
  {
    step: "02",
    name: "Design",
    benefit: "Blueprint",
    description: "We build a technical roadmap and workflow that fits your business, showing exactly how the agents will work.",
    price: "$2,500",
    cta: "Get Your Blueprint",
    link: "/audit"
  },
  {
    step: "03",
    name: "Deploy",
    benefit: "Implementation",
    description: "Our engineers build and integrate the agents into your existing systems (CRM, ERP, Slack, Email).",
    price: "From $7,500",
    cta: "View Implementation",
    link: "#services"
  },
  {
    step: "04",
    name: "Optimize",
    benefit: "Managed Ops",
    description: "We continuously monitor and improve performance, ensuring your automations never rot and always deliver.",
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
            <a href="#examples" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Solutions</a>
            <a href="#industries" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Industries</a>
            <a href="#pricing" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Pricing</a>
            <Link to="/roi-calculator" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Calculator</Link>
            <a href="#contact" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Contact</a>
            {user ? (
              <Link to="/portal" className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-bold text-indigo-600 hover:text-indigo-700">Login</Link>
                <a href="#contact" className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100">Book Assessment</a>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 pt-24 pb-32 lg:pt-40 lg:pb-48 bg-white overflow-hidden relative border-b border-slate-50">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full opacity-[0.03] pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#4f46e5,transparent_70%)]" />
          </div>
          <div className="max-w-5xl mx-auto text-center relative z-10">
            <h1 className="text-6xl lg:text-8xl font-black tracking-tight mb-10 text-slate-900 leading-[1.1]">
              Cut repetitive operations by <span className="text-indigo-600">80%</span> with AI agents.
            </h1>
            <p className="text-2xl text-slate-500 mb-12 max-w-4xl mx-auto leading-relaxed">
              We design, deploy, and manage AI coworkers for operations teams in healthcare, logistics, manufacturing, finance, and energy—without adding another piece of software your team has to learn.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <a href="#contact" className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-bold text-xl hover:bg-indigo-700 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-indigo-200">
                Book Your Free AI Assessment
              </a>
              <a href="#examples" className="bg-white text-slate-900 border-2 border-slate-100 px-10 py-5 rounded-2xl font-bold text-xl hover:bg-slate-50 transition-all hover:border-slate-200">
                See Example Automations
              </a>
            </div>
            
            {/* Ecosystem Logos */}
            <div className="mt-24">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">Works with your existing stack</p>
              <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8 grayscale opacity-50">
                {ecosystemLogos.map(logo => (
                  <span key={logo} className="font-black text-xl tracking-tighter text-slate-900">{logo}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Problems Section */}
        <section className="px-6 py-32 bg-slate-50">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl lg:text-5xl font-black mb-12 text-slate-900 tracking-tight">Your team shouldn't spend hours copying data between systems.</h2>
            <p className="text-xl text-slate-600 leading-relaxed">
              Most operations teams are buried in manual work that software should already be doing: quoting, scheduling, CRM updates, invoicing, and document processing. We build AI coworkers that handle the repetitive parts so your people can focus on work that actually requires a human.
            </p>
          </div>
        </section>

        {/* What is an AI Agent? */}
        <section className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div>
                <h2 className="text-4xl lg:text-6xl font-black mb-8 text-slate-900 tracking-tight">What is an AI Agent?</h2>
                <p className="text-xl text-slate-500 mb-10 leading-relaxed">
                  Think of an AI agent as a digital employee that lives inside your existing tools. Unlike simple automation, agents can reason through tasks, read unstructured data, and make decisions based on your business rules.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    "Read emails", "Update CRMs", "Generate reports", "Call APIs",
                    "Answer customers", "Schedule appointments", "Process documents", "Trigger workflows"
                  ].map(task => (
                    <div key={task} className="flex items-center gap-2 text-slate-700 font-bold">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      {task}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl">
                <div className="space-y-6">
                  <div className="pb-6 border-b border-white/10">
                    <div className="text-indigo-400 font-bold mb-2">Example: Logistics Dispatch</div>
                    <p className="text-slate-400">Agent reads incoming carrier email, extracts rate and equipment type, checks it against the TMS, and either auto-replies with an offer or flags it for human review if it meets specific criteria.</p>
                  </div>
                  <div>
                    <div className="text-indigo-400 font-bold mb-2">Example: Patient Intake</div>
                    <p className="text-slate-400">Agent monitors the fax folder, uses OCR to extract patient data from handwritten forms, verifies insurance eligibility via API, and creates the record in the EMR—instantly.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Industry Examples Section */}
        <section id="examples" className="px-6 py-32 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20 text-center">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 text-slate-900 tracking-tight">Real Automations. Real Results.</h2>
              <p className="text-xl text-slate-500 max-w-2xl mx-auto">
                We don't build generic bots. We build industry-specific agents for your highest-friction workflows.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {industryExamples.map((item) => (
                <div key={item.industry} className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
                  <h3 className="text-2xl font-black text-slate-900 mb-6">{item.industry}</h3>
                  <ul className="space-y-4">
                    {item.examples.map(ex => (
                      <li key={ex} className="flex items-start gap-3 text-slate-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-2.5 shrink-0" />
                        <span className="font-medium">{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Customer Results Section */}
        <section className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="p-8 border-l-4 border-indigo-600 bg-slate-50 rounded-r-3xl">
                <div className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">Manufacturing Client</div>
                <div className="text-3xl font-black text-slate-900 mb-4">18 mins → 2 mins</div>
                <p className="text-slate-600 font-medium">Reduced manual order processing time by over 85% per transaction.</p>
              </div>
              <div className="p-8 border-l-4 border-indigo-600 bg-slate-50 rounded-r-3xl">
                <div className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">Logistics Client</div>
                <div className="text-3xl font-black text-slate-900 mb-4">140 hours / month</div>
                <p className="text-slate-600 font-medium">Total labor hours saved across the dispatch team in the first 30 days.</p>
              </div>
              <div className="p-8 border-l-4 border-indigo-600 bg-slate-50 rounded-r-3xl">
                <div className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">Healthcare Practice</div>
                <div className="text-3xl font-black text-slate-900 mb-4">73% Reduction</div>
                <p className="text-slate-600 font-medium">Decrease in scheduling-related phone calls via automated patient reminders.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ROI Table by Vertical */}
        <section id="industries" className="px-6 py-32 bg-slate-950 text-white">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 tracking-tight">Proven Time Savings by Industry</h2>
              <p className="text-xl text-slate-400 max-w-2xl">
                Average time reclaimed for clients within the first 6 months of deployment.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {topVerticals.map((v) => (
                <Link key={v.name} to={(v.demo || `/industries/${v.slug}`) as any}
                  className="group bg-white/5 p-8 rounded-3xl border border-white/10 hover:bg-white/10 transition-all"
                >
                  <span className="text-4xl mb-6 block">{v.icon}</span>
                  <div className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">{v.name}</div>
                  <div className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors leading-tight">{v.result}</div>
                </Link>
              ))}
            </div>
            <div className="mt-16 text-center">
              <Link to="/audit" className="inline-flex items-center gap-2 font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                View all 26 industry benchmarks <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </div>
        </section>

        {/* The 4-Step Journey Section */}
        <section id="journey" className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="mb-24">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 text-slate-900 tracking-tight">How We Get You There</h2>
              <p className="text-xl text-slate-500 max-w-2xl leading-relaxed">
                We don't just hand you a tool. we build AI coworkers that handle repetitive work so your people can focus on higher-value tasks.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 relative">
              <div className="hidden lg:block absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -translate-y-1/2 z-0" />
              {journeySteps.map((s) => (
                <div key={s.step} className="relative z-10 bg-white pr-4">
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

        {/* ROI Calculator CTA */}
        <section className="px-6 py-20 bg-indigo-600">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="text-white text-center md:text-left">
              <h2 className="text-3xl lg:text-4xl font-black mb-4">Calculate Your Potential Savings</h2>
              <p className="text-indigo-100 text-lg font-medium">Use our simple ROI tool to see how many hours your team could reclaim.</p>
            </div>
            <Link to="/roi-calculator" className="bg-white text-indigo-600 px-10 py-5 rounded-2xl font-black text-xl hover:bg-indigo-50 transition-all shadow-xl whitespace-nowrap">
              Open ROI Calculator →
            </Link>
          </div>
        </section>

        {/* Pricing / Services Section */}
        <section id="pricing" className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 text-slate-900 tracking-tight">Simple, Transparent Pricing.</h2>
              <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
                No hidden fees or open-ended hourly billing. You pay for working, deployed agents that handle specific business results.
              </p>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Implementations */}
              <div className="bg-slate-50 rounded-[3rem] p-12 border border-slate-100">
                <h3 className="text-xl font-bold text-indigo-600 mb-8 uppercase tracking-widest">Implementations</h3>
                <div className="space-y-4">
                  <div className="p-6 bg-white rounded-2xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-slate-900 text-xl">Starter Deployment</div>
                      <div className="text-sm text-slate-500 font-bold">2 AI Agents • 3 workflows</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-indigo-600 text-2xl">$7,500</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">One-Time</div>
                    </div>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-slate-900 text-xl">Growth Deployment</div>
                      <div className="text-sm text-slate-500 font-bold">5 AI Agents • Cross-department</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-indigo-600 text-2xl">$15,000</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">One-Time</div>
                    </div>
                  </div>
                  <div className="p-6 bg-indigo-600 rounded-2xl flex justify-between items-center text-white shadow-xl shadow-indigo-100">
                    <div>
                      <div className="font-black text-xl">Scale Deployment</div>
                      <div className="text-sm text-indigo-100 font-bold">Custom workflows • Unlimited scale</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-2xl">$30k+</div>
                      <div className="text-[10px] text-indigo-200 font-bold uppercase tracking-tighter">Custom</div>
                    </div>
                  </div>
                </div>
                <div className="mt-8">
                  <p className="text-sm text-slate-500 font-medium italic">*The $2,500 blueprint fee is credited toward any implementation.</p>
                </div>
              </div>

              {/* Monthly Ops */}
              <div className="bg-slate-50 rounded-[3rem] p-12 border border-slate-100">
                <h3 className="text-xl font-bold text-indigo-600 mb-8 uppercase tracking-widest">Managed Operations</h3>
                <div className="space-y-4">
                  <div className="p-6 bg-white rounded-2xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-slate-900 text-xl">Essential Ops</div>
                      <div className="text-sm text-slate-500 font-bold">Monitoring • Bug fixes</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-indigo-600 text-2xl">$750/mo</div>
                    </div>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-slate-900 text-xl">Professional Ops</div>
                      <div className="text-sm text-slate-500 font-bold">New automations • Strategy call</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-indigo-600 text-2xl">$2,000/mo</div>
                    </div>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-slate-900 text-xl">Enterprise Ops</div>
                      <div className="text-sm text-slate-500 font-bold">Dedicated engineer • Priority</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-indigo-600 text-2xl">$5,000/mo+</div>
                    </div>
                  </div>
                </div>
              </div>
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
                      <p className="text-slate-400">No open-ended billing. You pay for a working, integrated agent that achieves a specific time-saving result.</p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <h4 className="text-xl font-bold mb-2">Continuous Support</h4>
                      <p className="text-slate-400">Our managed operations covers every bug, prompt adjustment, and model update. Your automation never rots.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-lg p-12 rounded-[3rem] border border-white/10 text-center">
                <div className="text-indigo-400 font-bold uppercase tracking-widest text-xs mb-6">Start Today</div>
                <h3 className="text-4xl font-black mb-8">Identify where AI can save you the most time.</h3>
                <a href="#contact" className="block w-full bg-white text-slate-950 py-5 rounded-2xl font-bold text-xl hover:bg-slate-100 transition-all">
                  Book Your Free 60-Min Session
                </a>
                <p className="mt-6 text-slate-500 text-sm font-medium">No credit card required. One-on-one strategy call.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section id="contact" className="px-6 py-32 bg-slate-50">
          <div className="max-w-4xl mx-auto bg-white rounded-[3rem] p-12 lg:p-20 shadow-2xl shadow-slate-200 border border-slate-100 text-center">
            <h2 className="text-4xl lg:text-5xl font-black mb-8 text-slate-900 leading-tight">
              Every week your team spends hours on work that software should already be doing.
            </h2>
            <p className="text-2xl text-slate-500 mb-12 leading-relaxed">
              Let's identify where AI agents can save you the most time—in a free 60-minute strategy session.
            </p>
            <div className="flex flex-col items-center">
              <a href="mailto:contact@simplerlife100.com" className="inline-block bg-indigo-600 text-white px-12 py-5 rounded-2xl font-bold text-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95">
                Email contact@simplerlife100.com
              </a>
              <p className="mt-8 text-slate-400 font-medium italic">"The most productive 60 minutes your operations team will spend this quarter."</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div>
            <div className="text-2xl font-black text-indigo-600 mb-4">{businessName}</div>
            <p className="text-slate-400 max-w-sm">AI coworkers for operations teams. Work less, live more.</p>
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
