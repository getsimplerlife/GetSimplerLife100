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
    description: "In 30 minutes, we'll identify your top automation opportunities, estimate the time and cost savings, and recommend the best next step. If we don't find a meaningful opportunity, we'll tell you.",
    price: "FREE",
    cta: "Book Your Free AI Workflow Assessment",
    link: "/audit-upload"
  },
  {
    step: "02",
    name: "Design",
    benefit: "Blueprint",
    description: "We build a technical roadmap and workflow that fits your business, showing exactly how the agents will work.",
    price: "$2,500",
    cta: "Get Your Blueprint",
    link: "https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00"
  },
  {
    step: "03",
    name: "Build",
    benefit: "Implementation",
    description: "Our engineers build and integrate the agents into your existing systems (CRM, ERP, Slack, Email).",
    price: "From $7,500",
    cta: "View Implementation",
    link: "/build"
  },
  {
    step: "04",
    name: "Support",
    benefit: "Managed Ops",
    description: "We keep every automation running, improving, and adapting as your business changes.",
    price: "From $750/mo",
    cta: "See Support Tiers",
    link: "/support"
  }
];

function Home() {
  const { businessName, user } = Route.useLoaderData();
  
  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-100 selection:text-emerald-900">
      <header className="px-6 py-6 bg-white dark:bg-stone-900 sticky top-0 z-50 border-b border-stone-100 dark:border-stone-800 backdrop-blur-md bg-white/80 dark:bg-stone-900/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-600 tracking-tight">
            {businessName}
          </Link>
          <nav className="hidden md:flex gap-10 items-center">
            <a href="#solutions" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Solutions</a>
            <a href="#industries" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Industries</a>
            <Link to="/build" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Builder</Link>
            <Link to="/support" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Support</Link>
            <a href="#pricing" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Pricing</a>
            <a href="#contact" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Contact</a>
            {user ? (
              <Link to="/portal" className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-bold text-emerald-600 hover:text-emerald-700">Login</Link>
                <Link to="/audit-upload" className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100">Book Free AI Workflow Assessment</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 pt-24 pb-32 lg:pt-40 lg:pb-48 bg-white overflow-hidden relative border-b border-stone-50">
          <div className="absolute top-0 left-1/2 -transtone-x-1/2 w-full max-w-7xl h-full opacity-[0.03] pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#4f46e5,transparent_70%)]" />
          </div>
          <div className="max-w-5xl mx-auto text-center relative z-10">
            <h1 className="text-6xl lg:text-8xl font-black tracking-tight mb-10 text-stone-900 leading-[1.1]">
              Cut repetitive operations by <span className="text-emerald-600">80%</span> with AI agents.
            </h1>
            <p className="text-2xl text-stone-500 mb-12 max-w-4xl mx-auto leading-relaxed">
              We build AI employees that take repetitive operations work off your team's plate.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Link to="/audit-upload" className="bg-emerald-600 text-white px-10 py-5 rounded-2xl font-bold text-xl hover:bg-emerald-700 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-emerald-200">
                Book Your Free AI Workflow Assessment
              </Link>
              <a href="#examples" className="bg-white text-stone-900 border-2 border-stone-100 px-10 py-5 rounded-2xl font-bold text-xl hover:bg-stone-50 transition-all hover:border-stone-200">
                See Example Automations
              </a>
            </div>
            
            {/* Ecosystem Logos */}
            <div className="mt-24">
              <p className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-8 text-center">We work inside the software your team already uses</p>
              <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6">
                {ecosystemLogos.map(logo => (
                  <div key={logo} className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    <span className="font-bold text-stone-600">{logo}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Problems Section */}
        <section className="px-6 py-32 bg-stone-50">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl lg:text-5xl font-black mb-12 text-stone-900 tracking-tight">Your team shouldn't spend hours copying data between systems.</h2>
            <p className="text-xl text-stone-600 leading-relaxed">
              Most operations teams are buried in manual work that software should already be doing: quoting, scheduling, CRM updates, invoicing, and document processing. We build AI coworkers that handle the repetitive parts so your people can focus on work that actually requires a human.
            </p>
          </div>
        </section>

        {/* ROI Calculator CTA */}
        <section className="px-6 py-20 bg-emerald-600">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="text-white text-center md:text-left">
              <h2 className="text-3xl lg:text-4xl font-black mb-4">Calculate Your Potential Savings</h2>
              <p className="text-emerald-100 text-lg font-medium">Use our simple ROI tool to see how many hours your team could reclaim.</p>
            </div>
            <Link to="/roi-calculator" className="bg-white text-emerald-600 px-10 py-5 rounded-2xl font-black text-xl hover:bg-emerald-50 transition-all shadow-xl whitespace-nowrap">
              Open ROI Calculator →
            </Link>
          </div>
        </section>

        {/* Industry Examples Section */}
        <section id="examples" className="px-6 py-32 bg-stone-50 border-y border-stone-100">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20 text-center">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 text-stone-900 tracking-tight">Real Automations. Real Results.</h2>
              <p className="text-xl text-stone-500 max-w-2xl mx-auto mb-16">
                We don't build generic bots. We build industry-specific agents for your highest-friction workflows.
              </p>
              
              {/* Workflow Visual */}
              <div className="max-w-5xl mx-auto mb-20 bg-white p-8 lg:p-12 rounded-[3rem] shadow-xl border border-stone-100">
                <h3 className="text-2xl font-black text-stone-900 mb-10">How an AI Coworker handles an inquiry</h3>
                <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
                  {[
                    { label: "Customer Email", icon: "📧", color: "bg-blue-50 text-blue-600" },
                    { label: "AI reads & extracts", icon: "🧠", color: "bg-emerald-50 text-emerald-600" },
                    { label: "Updates CRM", icon: "📊", color: "bg-emerald-50 text-emerald-600" },
                    { label: "Creates Invoice", icon: "🧾", color: "bg-amber-50 text-amber-600" },
                    { label: "Sends Confirmation", icon: "✅", color: "bg-violet-50 text-violet-600" },
                    { label: "Slack Notification", icon: "💬", color: "bg-rose-50 text-rose-600" }
                  ].map((step, i, arr) => (
                    <div key={step.label} className="flex flex-col lg:flex-row items-center gap-4 flex-1">
                      <div className="flex flex-col items-center text-center group">
                        <div className={`w-16 h-16 rounded-2xl ${step.color} flex items-center justify-center text-3xl mb-3 shadow-sm group-hover:scale-110 transition-transform`}>
                          {step.icon}
                        </div>
                        <div className="text-xs font-black uppercase tracking-tighter text-stone-500 max-w-[80px] leading-tight">
                          {step.label}
                        </div>
                      </div>
                      {i < arr.length - 1 && (
                        <div className="rotate-90 lg:rotate-0 text-stone-200">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {industryExamples.map((item) => (
                <div key={item.industry} className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-stone-100">
                  <h3 className="text-2xl font-black text-stone-900 mb-6">{item.industry}</h3>
                  <ul className="space-y-4">
                    {item.examples.map(ex => (
                      <li key={ex} className="flex items-start gap-3 text-stone-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2.5 shrink-0" />
                        <span className="font-medium">{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What is an AI Agent? */}
        <section className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div>
                <h2 className="text-4xl lg:text-6xl font-black mb-8 text-stone-900 tracking-tight">What is an AI Agent?</h2>
                <p className="text-xl text-stone-500 mb-10 leading-relaxed">
                  Think of an AI agent as a digital employee that lives inside your existing tools. Unlike simple automation, agents can reason through tasks, read unstructured data, and make decisions based on your business rules.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    "Read emails", "Update CRMs", "Generate reports", "Call APIs",
                    "Answer customers", "Schedule appointments", "Process documents", "Trigger workflows"
                  ].map(task => (
                    <div key={task} className="flex items-center gap-2 text-stone-700 font-bold">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      {task}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-stone-900 rounded-[3rem] p-12 text-white shadow-2xl">
                <div className="space-y-6">
                  <div className="pb-6 border-b border-white/10">
                    <div className="text-emerald-400 font-bold mb-2">Example: Logistics Dispatch</div>
                    <p className="text-stone-400">Agent reads incoming carrier email, extracts rate and equipment type, checks it against the TMS, and either auto-replies with an offer or flags it for human review if it meets specific criteria.</p>
                  </div>
                  <div>
                    <div className="text-emerald-400 font-bold mb-2">Example: Patient Intake</div>
                    <p className="text-stone-400">Agent monitors the fax folder, uses OCR to extract patient data from handwritten forms, verifies insurance eligibility via API, and creates the record in the EMR—instantly.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Customer Results Section */}
        <section className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="p-8 border-l-4 border-emerald-600 bg-stone-50 rounded-r-3xl">
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">Manufacturing Client</div>
                <div className="text-3xl font-black text-stone-900 mb-4">18 mins → 2 mins</div>
                <p className="text-stone-600 font-medium">Reduced manual order processing time by over 85% per transaction.</p>
              </div>
              <div className="p-8 border-l-4 border-emerald-600 bg-stone-50 rounded-r-3xl">
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">Logistics Client</div>
                <div className="text-3xl font-black text-stone-900 mb-4">140 hours / month</div>
                <p className="text-stone-600 font-medium">Total labor hours saved across the dispatch team in the first 30 days.</p>
              </div>
              <div className="p-8 border-l-4 border-emerald-600 bg-stone-50 rounded-r-3xl">
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">Healthcare Practice</div>
                <div className="text-3xl font-black text-stone-900 mb-4">73% Reduction</div>
                <p className="text-stone-600 font-medium">Decrease in scheduling-related phone calls via automated patient reminders.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ROI Table by Industry */}
        <section id="industries" className="px-6 py-32 bg-stone-950 text-white">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 tracking-tight">Proven Time Savings by Industry</h2>
              <p className="text-xl text-stone-400 max-w-2xl">
                Average time reclaimed for clients within the first 6 months of deployment.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {topVerticals.map((v) => (
                <Link key={v.name} to={(v.demo || `/industries/${v.slug}`) as any}
                  className="group bg-white/5 p-8 rounded-3xl border border-white/10 hover:bg-white/10 transition-all"
                >
                  <span className="text-4xl mb-6 block">{v.icon}</span>
                  <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">{v.name}</div>
                  <div className="text-xl font-black text-white group-hover:text-emerald-400 transition-colors leading-tight">{v.result}</div>
                </Link>
              ))}
            </div>
            <div className="mt-16 text-center">
              <Link to="/audit" className="inline-flex items-center gap-2 font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                View all 26 industry benchmarks <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </div>
        </section>

        {/* The 4-Step Journey Section */}
        <section id="journey" className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="mb-24">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 text-stone-900 tracking-tight">How We Get You There</h2>
              <p className="text-xl text-stone-500 max-w-2xl leading-relaxed">
                We don't just hand you a tool. we build AI coworkers that handle repetitive work so your people can focus on higher-value tasks.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 relative">
              <div className="hidden lg:block absolute top-1/2 left-0 w-full h-0.5 bg-stone-100 -transtone-y-1/2 z-0" />
              {journeySteps.map((s) => (
                <div key={s.step} className="relative z-10 bg-white pr-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-2xl font-black mb-8 shadow-lg shadow-emerald-200">
                    {s.step}
                  </div>
                  <div className="text-emerald-600 font-bold uppercase tracking-widest text-xs mb-2">{s.benefit}</div>
                  <h3 className="text-2xl font-black text-stone-900 mb-4">{s.name}</h3>
                  <p className="text-stone-500 leading-relaxed mb-6">
                    {s.description}
                  </p>
                  <div className="text-lg font-black text-stone-900 mb-6">{s.price}</div>
                  <a href={s.link} className="inline-block bg-stone-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-stone-800 transition-all">
                    {s.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Founder / Personality Section */}
        <section className="px-6 py-32 bg-stone-50">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white p-12 lg:p-20 rounded-[3rem] shadow-xl border border-stone-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full -mr-32 -mt-32 opacity-50" />
              <div className="relative z-10">
                <div className="text-emerald-600 font-bold mb-6 flex items-center gap-2">
                  <div className="w-8 h-1 bg-emerald-600 rounded-full" />
                  Our Mission
                </div>
                <h2 className="text-4xl lg:text-5xl font-black text-stone-900 mb-8 leading-tight">
                  Software was supposed to make work easier. <span className="text-emerald-600">AI actually does.</span>
                </h2>
                <div className="text-xl text-stone-600 space-y-6 leading-relaxed">
                  <p>
                    We started Simpler Life 100 because we saw operations teams buried in manual work that software should have solved a decade ago. Copying data between tabs, manually reviewing documents, and chasing status updates isn't "work"—it's waste.
                  </p>
                  <p className="font-bold text-stone-900">
                    We don't sell software. We build AI employees that work inside the systems you already own.
                  </p>
                  <p>
                    Our goal is to give your team their time back, so they can focus on growth, strategy, and the human parts of your business that no computer could ever replicate.
                  </p>
                </div>
                <div className="mt-12 pt-12 border-t border-stone-100 flex items-center gap-4">
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
          </div>
        </section>

        {/* FAQ / Objections Section */}
        <section className="px-6 py-32 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl lg:text-5xl font-black text-stone-900 tracking-tight">Common Questions</h2>
              <p className="text-xl text-stone-500 mt-4">Everything you need to know before we build.</p>
            </div>
            <div className="grid gap-6">
              {[
                { q: "Will this replace our employees?", a: "No. Our agents are designed to take over the repetitive, high-volume tasks that burn people out. This frees your team to focus on higher-value work that requires judgment, creativity, and human connection." },
                { q: "Is our business data secure?", a: "Absolutely. We use enterprise-grade security protocols. Your data stays within your existing systems (Salesforce, Google, etc.), and we follow strict data privacy standards." },
                { q: "How long does it take to deploy?", a: "Most AI agents are fully operational within 2 to 4 weeks. We handle the heavy lifting, from design to technical integration." },
                { q: "Will it work with our existing software?", a: "Yes. Our agents integrate directly with Salesforce, HubSpot, Microsoft 365, Google Workspace, Slack, QuickBooks, SAP, and most modern APIs." },
                { q: "How much work is required from my team?", a: "Minimal. Beyond the initial 60-minute assessment and a few workflow reviews, we handle the technical build, deployment, and ongoing management." },
                { q: "What happens if the AI makes a mistake?", a: "Reliability is our priority. Every agent includes 'Human-in-the-Loop' review workflows for high-stakes decisions, ensuring your team has final oversight where it matters most." }
              ].map((item, i) => (
                <div key={i} className="p-8 bg-stone-50 rounded-3xl border border-stone-100 hover:border-emerald-200 transition-colors">
                  <h4 className="text-xl font-black text-stone-900 mb-3">{item.q}</h4>
                  <p className="text-stone-600 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing / Services Section */}
        <section id="pricing" className="px-6 py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl lg:text-6xl font-black mb-6 text-stone-900 tracking-tight">Simple, Transparent Pricing.</h2>
              <p className="text-xl text-stone-500 max-w-2xl mx-auto leading-relaxed">
                No hidden fees or open-ended hourly billing. You pay for working, deployed agents that handle specific business results.
              </p>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Implementations */}
              <div className="bg-stone-50 rounded-[3rem] p-12 border border-stone-100">
                <h3 className="text-xl font-bold text-emerald-600 mb-8 uppercase tracking-widest">Implementations</h3>
                <div className="space-y-4">
                  <div className="p-6 bg-white rounded-2xl border border-stone-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-stone-900 text-xl">Small Team</div>
                      <div className="text-sm text-stone-500 font-bold">2 AI Agents • 3 workflows</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-600 text-2xl">Starting at $7,500</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase tracking-tighter">One-Time</div>
                    </div>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-stone-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-stone-900 text-xl">Growing Business</div>
                      <div className="text-sm text-stone-500 font-bold">5 AI Agents • Cross-department</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-600 text-2xl">$15,000</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase tracking-tighter">One-Time</div>
                    </div>
                  </div>
                  <div className="p-6 bg-emerald-600 rounded-2xl flex justify-between items-center text-white shadow-xl shadow-emerald-100">
                    <div>
                      <div className="font-black text-xl">Enterprise</div>
                      <div className="text-sm text-emerald-100 font-bold">Custom workflows • Unlimited scale</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-2xl">$30k+</div>
                      <div className="text-[10px] text-emerald-200 font-bold uppercase tracking-tighter">Custom</div>
                    </div>
                  </div>
                </div>
                <div className="mt-8">
                  <p className="text-sm text-stone-500 font-medium italic">*The $2,500 blueprint fee is credited toward any implementation.</p>
                </div>
              </div>

              {/* Monthly Ops */}
              <div className="bg-stone-50 rounded-[3rem] p-12 border border-stone-100">
                <h3 className="text-xl font-bold text-emerald-600 mb-8 uppercase tracking-widest">Managed Operations</h3>
                <div className="space-y-4">
                  <div className="p-6 bg-white rounded-2xl border border-stone-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-stone-900 text-xl">Essential Ops</div>
                      <div className="text-sm text-stone-500 font-bold">Monitoring • Bug fixes</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-600 text-2xl">$750/mo</div>
                    </div>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-stone-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-stone-900 text-xl">Professional Ops</div>
                      <div className="text-sm text-stone-500 font-bold">New automations • Strategy call</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-600 text-2xl">$2,000/mo</div>
                    </div>
                  </div>
                  <div className="p-6 bg-white rounded-2xl border border-stone-100 flex justify-between items-center">
                    <div>
                      <div className="font-black text-stone-900 text-xl">Enterprise Ops</div>
                      <div className="text-sm text-stone-500 font-bold">Dedicated engineer • Priority</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-600 text-2xl">$5,000/mo+</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-20 text-center">
              <Link to="/contact" className="inline-block bg-emerald-600 text-white px-12 py-5 rounded-2xl font-bold text-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
                Book Your Free AI Workflow Assessment
              </Link>
              <p className="mt-4 text-stone-500 font-medium">Identify your best opportunities before you commit to a build.</p>
            </div>
          </div>
        </section>

        {/* Risk Reversal Section */}
        <section className="px-6 py-32 bg-stone-900 text-white overflow-hidden relative">
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
                      <p className="text-stone-400">The $2,500 blueprint fee is applied directly to your implementation costs. We only win when you build.</p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <h4 className="text-xl font-bold mb-2">Fixed-Price Deployment</h4>
                      <p className="text-stone-400">No open-ended billing. You pay for a working, integrated agent that achieves a specific time-saving result.</p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <h4 className="text-xl font-bold mb-2">Continuous Support</h4>
                      <p className="text-stone-400">Our managed operations covers every bug, prompt adjustment, and model update. Your automation never rots.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-lg p-12 rounded-[3rem] border border-white/10 text-center">
                <div className="text-emerald-400 font-bold uppercase tracking-widest text-xs mb-6">Start Today</div>
                <h3 className="text-4xl font-black mb-8">Identify where AI can save you the most time.</h3>
                <Link to="/contact" className="block w-full bg-white text-stone-950 py-5 rounded-2xl font-bold text-xl hover:bg-stone-100 transition-all">
                  Book Your Free AI Workflow Assessment
                </Link>
                <p className="mt-6 text-stone-500 text-sm font-medium">No credit card required. 30-minute assessment.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section id="contact" className="px-6 py-32 bg-stone-50">
          <div className="max-w-4xl mx-auto bg-white rounded-[3rem] p-12 lg:p-20 shadow-2xl shadow-stone-200 border border-stone-100 text-center">
            <h2 className="text-4xl lg:text-5xl font-black mb-8 text-stone-900 leading-tight">
              Every week your team spends hours on work that software should already be doing.
            </h2>
            <p className="text-2xl text-stone-500 mb-12 leading-relaxed">
              In 30 minutes, we'll identify your top automation opportunities, estimate the time and cost savings, and recommend the best next step.
            </p>
            <div className="flex flex-col items-center">
              <Link to="/contact" className="inline-block bg-emerald-600 text-white px-12 py-5 rounded-2xl font-bold text-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 hover:scale-105 active:scale-95">
                Start Your Free Assessment
              </Link>
              <p className="mt-8 text-stone-400 font-medium italic">"The most productive 30 minutes your operations team will spend this quarter."</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t border-stone-100 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div>
            <div className="text-2xl font-black text-emerald-600 mb-4">{businessName}</div>
            <p className="text-stone-400 max-w-sm">AI coworkers for operations teams. Work less, live more.</p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-6">
            <div className="flex gap-8 font-bold text-stone-600">
              <Link to="/build" className="hover:text-emerald-600">Builder</Link>
              <Link to="/support" className="hover:text-emerald-600">Support</Link>
              <a href="#" className="hover:text-emerald-600">Twitter</a>
              <a href="#" className="hover:text-emerald-600">LinkedIn</a>
              <Link to="/demos/audit-portal" className="hover:text-emerald-600 underline underline-offset-4">Audit Workflow Demo</Link>
            </div>
            <div className="text-sm text-stone-400">
              &copy; {new Date().getFullYear()} {businessName}. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
// re-triggering build
