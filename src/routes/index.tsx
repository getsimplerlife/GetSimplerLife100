import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import { useState } from "react";
import { getUser } from "~/db/queries";
import { workflows } from "~/content/workflows";

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
    cta: "Stop Copy-Pasting. Get Your Blueprint ➜",
    link: "/contact"
  },
  {
    step: "02",
    name: "Design",
    benefit: "Blueprint",
    description: "We build a technical roadmap and workflow that fits your business, showing exactly how the agents will work.",
    price: "$2,500",
    cta: "Get Your Custom Blueprint",
    link: "https://buy.stripe.com/fZufZj2OzdEr6Hh0nm2Fa00"
  },
  {
    step: "03",
    name: "Build",
    benefit: "Implementation",
    description: "Our engineers build and integrate the agents into your existing systems (CRM, ERP, Slack, Email).",
    price: "From $7,500",
    cta: "Stop Copy-Pasting. Start Your Build ➜",
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

const blueprintTemplates = {
  invoice: {
    title: "Invoice & AP Integration Map",
    steps: [
      { label: "Intake Trigger", icon: "📥", desc: "Ivy Invoice monitors incoming email attachments & files." },
      { label: "OCR Extraction", icon: "🧠", desc: "Extracts table line items, totals, and invoice IDs." },
      { label: "ERP/GL Match", icon: "🔌", desc: "Synchronizes validated bills directly into QuickBooks/SAP." },
      { label: "Dispatch Ping", icon: "💬", desc: "Dispatches structural audit log to Slack #finance channel." }
    ]
  },
  dispatch: {
    title: "Carrier Dispatch Automation Map",
    steps: [
      { label: "Carrier Inquiry", icon: "📧", desc: "Monitors and filters high-volume carrier bid streams." },
      { label: "TMS Rule Evaluation", icon: "🧠", desc: "Quentin Quote queries shipment matching criteria." },
      { label: "Conditional Review", icon: "🎛️", desc: "Routes outliers above budget thresholds for manual signoff." },
      { label: "Auto-Confirm", icon: "✅", desc: "Dispatches route confirmation to carrier, closing loop." }
    ]
  },
  intake: {
    title: "Patient Intake & EMR Map",
    steps: [
      { label: "Scanned Intake", icon: "📄", desc: "Monitors scanned patient intake folders and medical faxes." },
      { label: "Eligibility Check", icon: "🧠", desc: "Extracts patient variables and runs insurance status checks." },
      { label: "EMR Push", icon: "💾", desc: "Cleanly registers new user records directly into your EMR." },
      { label: "Patient Invite", icon: "📅", desc: "Sends patient a text confirmation with intake details." }
    ]
  },
  custom: {
    title: "Custom Operational AI Map",
    steps: [
      { label: "Operational Event", icon: "⚡", desc: "Monitors operational events or legacy system updates." },
      { label: "Agent Reasoning", icon: "🧠", desc: "AI worker reads unstructured datasets and plans next steps." },
      { label: "Action Dispatch", icon: "🔌", desc: "Updates legacy ERPs/CRMs via customized APIs." },
      { label: "Audit Trace", icon: "💬", desc: "Dispatches completed trace telemetry reports directly to your Slack." }
    ]
  }
};

function Home() {
  const { businessName, user } = Route.useLoaderData();

  // Prompt compiler state
  const [promptText, setPromptText] = useState("Auto-read scanned invoice PDFs, extract line-items, update QuickBooks and notify Slack");
  const [compilingState, setCompilingState] = useState<'idle' | 'analyzing' | 'mapping' | 'done'>('done');

  // ROI Calculator sliders state
  const [teamSize, setTeamSize] = useState(10);
  const [hoursWasted, setHoursWasted] = useState(8);
  const [hourlyRate, setHourlyRate] = useState(35);

  const hoursReclaimed = teamSize * hoursWasted * 4;
  const monthlySavings = hoursReclaimed * hourlyRate;
  const annualSavings = monthlySavings * 12;
  const paybackDays = Math.max(7, Math.round((10000 / Math.max(1, monthlySavings)) * 30));

  const handleCompile = () => {
    setCompilingState('analyzing');
    setTimeout(() => {
      setCompilingState('mapping');
      setTimeout(() => {
        setCompilingState('done');
      }, 1000);
    }, 1000);
  };

  const getActiveTemplate = () => {
    const text = promptText.toLowerCase();
    if (text.includes("invoice") || text.includes("billing") || text.includes("quickbooks") || text.includes("ap") || text.includes("ledger")) {
      return blueprintTemplates.invoice;
    }
    if (text.includes("dispatch") || text.includes("carrier") || text.includes("logistics") || text.includes("load") || text.includes("tms")) {
      return blueprintTemplates.dispatch;
    }
    if (text.includes("patient") || text.includes("medical") || text.includes("intake") || text.includes("clinical") || text.includes("emr")) {
      return blueprintTemplates.intake;
    }
    return blueprintTemplates.custom;
  };

  const activeTemplate = getActiveTemplate();

  return (
    <div className="flex flex-col min-h-screen bg-stone-950">
      
      {/* ─── Header ─── */}
      <header className="px-6 py-4 bg-stone-950/95 backdrop-blur-md sticky top-0 z-50 border-b border-stone-900">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-400 tracking-tight">
            {businessName}
          </Link>
          <nav className="hidden md:flex gap-8 items-center">
            <a href="#examples" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Solutions</a>
            <Link to="/how-it-works" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">How It Works</Link>
            <div className="relative group">
              <button className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer">
                Tools
                <svg className="w-3 h-3 mt-0.5 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-xl shadow-black/30 p-2 min-w-[220px] space-y-0.5">
                  <Link to="/tools/ai-advisor" className="block px-3.5 py-2 text-sm font-bold rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors">🤖 AI Advisor</Link>
                  <Link to="/tools/can-we-automate-this" className="block px-3.5 py-2 text-sm font-bold rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors">🔍 Can We Automate This?</Link>
                  <Link to="/tools/assessment" className="block px-3.5 py-2 text-sm font-bold rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors">📋 AI Automation Assessment</Link>
                  <Link to="/roi-calculator" className="block px-3.5 py-2 text-sm font-bold rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors">📊 ROI Calculator</Link>
                </div>
              </div>
            </div>
            <Link to="/about" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">About</Link>
            <Link to="/faq" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">FAQ</Link>
            <a href="#pricing" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Pricing</a>
            <a href="#contact" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Contact</a>
            {user ? (
              <Link to="/portal" className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-bold text-emerald-400 hover:text-emerald-700">Login</Link>
                <Link to="/contact" className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md text-xs min-h-[44px] flex items-center justify-center">
                  Stop Copy-Pasting. Start Free Plan ➜
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        
        {/* ─── Interactive Hero Section ─── */}
        <section className="px-4 py-12 lg:py-24 bg-stone-950 border-b border-stone-800 overflow-hidden relative">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
            
            {/* Left Column: Heading, Pain CTA, Prompt Compiler */}
            <div className="lg:col-span-7 space-y-8">
              <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                ACTIVE COGNITIVE WORKFORCES
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight text-white leading-[1.1] max-w-2xl">
                Stop copy-pasting. Reclaim <span className="text-emerald-600">80%</span> of your team's time.
              </h1>
              <p className="text-lg lg:text-xl text-stone-400 max-w-xl leading-relaxed">
                Describe your worst operational bottleneck in English. Our AI analyzes, maps, and compiles a custom automation blueprint instantly.
              </p>

              {/* Prompt Compiler Widget */}
              <div className="bg-stone-900 border border-stone-900 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                <div>
                  <label className="block text-[10px] font-mono tracking-wider uppercase text-stone-400 mb-2">
                    Describe your repetitive manual process:
                  </label>
                  <textarea
                    rows={2}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-900 rounded-xl p-3 text-xs font-medium leading-relaxed outline-none focus:border-stone-400 placeholder-stone-400 resize-none text-stone-800"
                    placeholder="E.g. Auto-read scanned invoice PDFs, extract line-items, update QuickBooks and notify Slack..."
                  />
                </div>

                {/* Quick Examples Tag Pills */}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] text-stone-400 font-mono">QUICK EXAMPLES:</span>
                  {[
                    { label: "AP/Invoice Parsing", prompt: "Auto-read scanned invoice PDFs, extract line-items, update QuickBooks and notify Slack" },
                    { label: "Logistics Dispatching", prompt: "Filter incoming carrier route bid faxes, match capacity on TMS, and send confirmation" },
                    { label: "Patient Registration", prompt: "Process patient registration faxes, run eligibility checks, and update clinical EMR data" }
                  ].map(ex => (
                    <button
                      key={ex.label}
                      onClick={() => {
                        setPromptText(ex.prompt);
                        setCompilingState('done');
                      }}
                      className="text-[10px] bg-stone-950 hover:bg-stone-900 text-stone-400 font-bold px-2.5 py-1 rounded-full border border-stone-900 transition-colors min-h-[28px]"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>

                {/* Action button */}
                <button
                  onClick={handleCompile}
                  disabled={compilingState === 'analyzing' || compilingState === 'mapping'}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs font-mono py-3 px-4 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 min-h-[44px]"
                >
                  {compilingState === 'analyzing' ? (
                    "🧠 Analyzing instructions..."
                  ) : compilingState === 'mapping' ? (
                    "🔗 Mapping system integrations..."
                  ) : (
                    "🪄 Compile AI Blueprint Plan"
                  )}
                </button>

                {/* Simulated Generated Result Card */}
                {compilingState === 'done' && (
                  <div className="bg-stone-950 border border-stone-200/80 rounded-2xl p-4 space-y-4 animate-fadeIn">
                    <div className="flex justify-between items-center border-b border-stone-800 pb-2.5">
                      <h4 className="text-xs font-black text-white font-mono tracking-tight">{activeTemplate.title}</h4>
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-black">99.2% ACCURACY</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {activeTemplate.steps.map((st, i) => (
                        <div key={i} className="p-3 bg-stone-900 rounded-xl space-y-1 relative border border-stone-100">
                          <span className="text-xl block mb-1">{st.icon}</span>
                          <div className="text-[10px] font-black text-white leading-tight">{st.label}</div>
                          <div className="text-[8px] text-stone-400 leading-normal line-clamp-2">{st.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Hero ROI Reclaim Sliders */}
            <div className="lg:col-span-5 bg-stone-950 text-white rounded-[2.5rem] p-6 sm:p-8 space-y-6 shadow-2xl border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="space-y-1 relative z-10">
                <h3 className="text-lg font-black tracking-tight text-white">Live ROI Calculator</h3>
                <p className="text-stone-400 text-xs font-mono">Calculate your team's labor savings instantly</p>
              </div>

              {/* Sliders */}
              <div className="space-y-5 relative z-10">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-stone-400 font-bold uppercase">Team Size</span>
                    <span className="text-emerald-400 font-black">{teamSize} Employees</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={teamSize}
                    onChange={(e) => setTeamSize(Number(e.target.value))}
                    className="w-full h-1.5 bg-stone-850 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-stone-400 font-bold uppercase">Hours Wasted / Week</span>
                    <span className="text-emerald-400 font-black">{hoursWasted} Hours</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="40"
                    value={hoursWasted}
                    onChange={(e) => setHoursWasted(Number(e.target.value))}
                    className="w-full h-1.5 bg-stone-850 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-stone-400 font-bold uppercase">Hourly Loaded Cost</span>
                    <span className="text-emerald-400 font-black">${hourlyRate}/hr</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="150"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value))}
                    className="w-full h-1.5 bg-stone-850 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>

              {/* Live Savings Stats Display */}
              <div className="bg-stone-900 border border-white/5 rounded-2xl p-5 space-y-4 relative z-10">
                <div className="grid grid-cols-2 gap-4 divide-x divide-white/5">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-mono text-stone-400 uppercase block tracking-wider">Hours Reclaimed</span>
                    <span className="text-2xl font-black text-white">{hoursReclaimed} hrs/mo</span>
                  </div>
                  <div className="space-y-0.5 pl-4">
                    <span className="text-[9px] font-mono text-stone-400 uppercase block tracking-wider">Payback Period</span>
                    <span className="text-2xl font-black text-emerald-400">{paybackDays} Days</span>
                  </div>
                </div>
                <div className="border-t border-white/5 pt-3.5 space-y-0.5">
                  <span className="text-[9px] font-mono text-stone-400 uppercase block tracking-wider">Monthly Reclaimed Labor</span>
                  <div className="text-4xl font-black text-white tracking-tight">${monthlySavings.toLocaleString()} / mo</div>
                </div>
                <div className="text-[10px] text-stone-400 font-mono flex items-center justify-between bg-black/30 p-2.5 rounded-lg">
                  <span>ANNUALIZED GAIN:</span>
                  <span className="text-emerald-400 font-black">${annualSavings.toLocaleString()} / yr</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Detailed Case Study Card ( fold-area ) ─── */}
        <section className="px-4 py-16 bg-stone-900 border-b border-stone-200/80">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="border-l-4 border-emerald-600 pl-4">
              <span className="text-[10px] font-mono font-bold tracking-widest text-stone-400 uppercase block">CUSTOMER TRIAL SUCCESS</span>
              <h2 className="text-3xl font-black tracking-tight text-stone-950">Vanguard Precision Manufacturing</h2>
            </div>

            <div className="bg-stone-950 border border-stone-900 rounded-[2.5rem] p-6 lg:p-12 shadow-black/20 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Context Block */}
              <div className="lg:col-span-7 space-y-6">
                <div>
                  <span className="text-[9px] font-mono bg-stone-900 text-stone-400 border border-stone-900 px-2 py-0.5 rounded font-bold uppercase mr-2">INDUSTRY</span>
                  <span className="text-xs text-stone-400 font-bold">Aviation & Aerospace Defense (50-person manufacturer)</span>
                </div>
                <h3 className="text-2xl font-black text-stone-100 leading-tight">
                  Reclaiming AP labor: Reducing fax and PDF processing from 18 minutes to 2 minutes.
                </h3>
                <div className="space-y-4 text-stone-400 text-sm leading-relaxed">
                  <p>
                    Vanguard precision manufacturing processed hundreds of supply-chain supplier invoice PDFs, handwritten faxes, and delivery logs manually. Staff was burdened copying records, tracking line-items, and verifying data values against ERP entries.
                  </p>
                  <p>
                    Simpler Life deployed **Ivy Invoice (Billing Coordinator)** to auto-monitor accounts, utilize advanced OCR to parse table records, reconcile items against standard inventories, and sync clean logs.
                  </p>
                </div>
              </div>

              {/* Visual Before/After & Metrics Block */}
              <div className="lg:col-span-5 bg-stone-900 border border-stone-900 rounded-3xl p-6 sm:p-8 space-y-6">
                
                {/* Timeline Visual comparison */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-stone-400 uppercase font-black">
                      <span>BEFORE (Manual Entry)</span>
                      <span className="text-rose-600">18 minutes / bill</span>
                    </div>
                    <div className="w-full bg-stone-200 h-3 rounded-full overflow-hidden">
                      <div className="bg-rose-600 h-full rounded-full" style={{ width: "100%" }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-stone-400 uppercase font-black">
                      <span>AFTER (Simpler Life Employee)</span>
                      <span className="text-emerald-600">2 minutes / bill</span>
                    </div>
                    <div className="w-full bg-stone-200 h-3 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-full rounded-full animate-pulse" style={{ width: "11%" }} />
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-4 border-t border-stone-900 pt-5 text-center">
                  <div className="space-y-1">
                    <div className="text-[9px] font-mono text-stone-400 uppercase block font-bold">Labor Reclaimed</div>
                    <div className="text-xl font-black text-stone-900">$12,000 / mo</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-mono text-stone-400 uppercase block font-bold">Data Accuracy</div>
                    <div className="text-xl font-black text-stone-900">100% Correct</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problems Section */}
        <section className="px-6 py-16 sm:py-32 bg-stone-100">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">Your team shouldn't spend hours copying data between systems.</h2>
            <p className="text-lg text-stone-400 leading-relaxed">
              Most operations teams are buried in manual work that software should already be doing: quoting, scheduling, CRM updates, invoicing, and document processing. We build AI coworkers that handle the repetitive parts so your people can focus on work that actually requires a human.
            </p>
          </div>
        </section>

        {/* ROI Calculator CTA */}
        <section className="px-6 py-16 bg-emerald-600">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="text-white text-center md:text-left">
              <h2 className="text-3xl lg:text-4xl font-black mb-4">Calculate Your Potential Savings</h2>
              <p className="text-emerald-100 text-lg font-medium">Use our simple ROI tool to see how many hours your team could reclaim.</p>
            </div>
            <Link to="/roi-calculator" className="bg-stone-950 text-emerald-400 px-10 py-4 rounded-2xl font-black text-xl hover:bg-emerald-500/10 transition-all shadow-xl whitespace-nowrap min-h-[50px] flex items-center justify-center">
              Open ROI Calculator →
            </Link>
          </div>
        </section>

        {/* Industry Examples Section */}
        <section id="examples" className="px-6 py-16 sm:py-32 bg-stone-900 border-y border-stone-100">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20 text-center space-y-6">
              <h2 className="text-3xl sm:text-4xl lg:text-6xl font-black text-white tracking-tight">Real Automations. Real Results.</h2>
              <p className="text-lg text-stone-400 max-w-2xl mx-auto">
                We don't build generic bots. We build industry-specific agents for your highest-friction workflows.
              </p>
              
              {/* Workflow Visual */}
              <div className="max-w-5xl mx-auto bg-stone-950 p-8 lg:p-12 rounded-[3rem] shadow-black/20 border border-stone-100">
                <h3 className="text-2xl font-black text-white mb-10">How an AI Coworker handles an inquiry</h3>
                <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
                  {[
                    { label: "Customer Email", icon: "📧", color: "bg-blue-50 text-blue-600" },
                    { label: "AI reads & extracts", icon: "🧠", color: "bg-emerald-500/10 text-emerald-600" },
                    { label: "Updates CRM", icon: "📊", color: "bg-emerald-500/10 text-emerald-600" },
                    { label: "Creates Invoice", icon: "🧾", color: "bg-amber-500/10 text-amber-600" },
                    { label: "Sends Confirmation", icon: "✅", color: "bg-violet-50 text-violet-600" },
                    { label: "Slack Notification", icon: "💬", color: "bg-rose-500/10 text-rose-600" }
                  ].map((step, i, arr) => (
                    <div key={step.label} className="flex flex-col lg:flex-row items-center gap-4 flex-1">
                      <div className="flex flex-col items-center text-center group">
                        <div className={`w-16 h-16 rounded-2xl ${step.color} flex items-center justify-center text-3xl mb-3 shadow-black/20 group-hover:scale-110 transition-transform`}>
                          {step.icon}
                        </div>
                        <div className="text-xs font-black uppercase tracking-tighter text-stone-400 max-w-[80px] leading-tight">
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
                <div key={item.industry} className="bg-stone-950 p-10 rounded-[2.5rem] shadow-black/20 border border-stone-100">
                  <h3 className="text-2xl font-black text-white mb-6">{item.industry}</h3>
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

        {/* Customer Results Section */}
        <section className="px-6 py-16 sm:py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="p-8 border-l-4 border-emerald-600 bg-stone-900 rounded-r-3xl">
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">Manufacturing Client</div>
                <div className="text-3xl font-black text-white mb-4">18 mins → 2 mins</div>
                <p className="text-stone-400 font-medium">Reduced manual order processing time by over 85% per transaction.</p>
              </div>
              <div className="p-8 border-l-4 border-emerald-600 bg-stone-900 rounded-r-3xl">
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">Logistics Client</div>
                <div className="text-3xl font-black text-white mb-4">140 hours / month</div>
                <p className="text-stone-400 font-medium">Total labor hours saved across the dispatch team in the first 30 days.</p>
              </div>
              <div className="p-8 border-l-4 border-emerald-600 bg-stone-900 rounded-r-3xl">
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">Healthcare Practice</div>
                <div className="text-3xl font-black text-white mb-4">73% Reduction</div>
                <p className="text-stone-400 font-medium">Decrease in scheduling-related phone calls via automated patient reminders.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ROI Table by Industry */}
        <section id="industries" className="px-6 py-16 sm:py-32 bg-stone-950 text-white">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20 space-y-4">
              <h2 className="text-4xl lg:text-6xl font-black tracking-tight">Proven Time Savings by Industry</h2>
              <p className="text-xl text-stone-400 max-w-2xl">
                Average time reclaimed for clients within the first 6 months of deployment.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {topVerticals.map((v) => (
                <Link key={v.name} to={`/industries/${v.slug}` as any}
                  className="group bg-white/5 p-8 rounded-3xl border border-white/10 hover:bg-white/10 transition-all"
                >
                  <span className="text-4xl mb-6 block">{v.icon}</span>
                  <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">{v.name}</div>
                  <div className="text-xl font-black text-white group-hover:text-emerald-400 transition-colors leading-tight">{v.result}</div>
                </Link>
              ))}
            </div>
            <div className="mt-16 text-center">
              <Link to="/assessment" className="inline-flex items-center gap-2 font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                View all industry benchmarks <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </div>
        </section>

        {/* Featured AI Workflows Section */}
        <section id="workflows" className="px-6 py-16 sm:py-32 bg-stone-900 text-white border-t border-stone-800">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20 text-center space-y-4">
              <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                ACTIVE AI WORKFLOWS
              </span>
              <h2 className="text-4xl lg:text-6xl font-black tracking-tight">Active AI Workflows</h2>
              <p className="text-xl text-stone-400 max-w-2xl mx-auto">
                Deploy turn-key, pre-configured workflows that run autonomously inside your business.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {workflows.slice(0, 4).map((w) => (
                <Link key={w.id} to={`/workflows/${w.id}` as any}
                  className="group bg-stone-950 p-8 rounded-[2rem] border border-stone-850 hover:border-emerald-500/30 transition-all flex flex-col justify-between"
                >
                  <div>
                    <span className="text-3xl mb-6 block">🤖</span>
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors leading-tight">
                      {w.name}
                    </h3>
                    <p className="text-xs text-stone-400 leading-relaxed line-clamp-3 mb-6">
                      {w.description}
                    </p>
                  </div>
                  <div className="text-xs font-mono text-emerald-400 font-bold border-t border-stone-900 pt-4 flex justify-between">
                    <span>⏱ {w.timeSaved.split(" — ")[0]}</span>
                    <span>→ View Workflow</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* The 4-Step Journey Section */}
        <section id="journey" className="px-6 py-16 sm:py-32 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="mb-24 space-y-4">
              <h2 className="text-4xl lg:text-6xl font-black text-white tracking-tight">How We Get You There</h2>
              <p className="text-xl text-stone-400 max-w-2xl leading-relaxed">
                We don't just hand you a tool. We build AI coworkers that work inside the systems you already own.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 relative">
              <div className="hidden lg:block absolute top-1/2 left-0 w-full h-0.5 bg-stone-900 -translate-y-1/2 z-0" />
              {journeySteps.map((s) => (
                <div key={s.step} className="relative z-10 bg-stone-950 pr-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-2xl font-black mb-8 shadow-lg shadow-emerald-200">
                    {s.step}
                  </div>
                  <div className="text-emerald-400 font-bold uppercase tracking-widest text-xs mb-2">{s.benefit}</div>
                  <h3 className="text-2xl font-black text-white mb-4">{s.name}</h3>
                  <p className="text-stone-400 leading-relaxed mb-6">
                    {s.description}
                  </p>
                  <div className="text-lg font-black text-white mb-6">{s.price}</div>
                  <a href={s.link} className="inline-flex items-center justify-center bg-stone-900 hover:bg-stone-850 text-white px-6 py-3 rounded-xl font-bold text-sm min-h-[44px]">
                    {s.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing / Services Section */}
        <section id="pricing" className="px-6 py-16 sm:py-32 bg-stone-950 border-t border-stone-100">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20 space-y-6">
              <h2 className="text-4xl lg:text-6xl font-black text-white tracking-tight">Simple, Transparent Pricing.</h2>
              <p className="text-xl text-stone-400 max-w-2xl mx-auto leading-relaxed">
                No hidden fees or open-ended hourly billing. You pay for working, deployed agents that handle specific business results.
              </p>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Implementations */}
              <div className="bg-stone-900 rounded-[3rem] p-12 border border-stone-100">
                <h3 className="text-xl font-bold text-emerald-400 mb-8 uppercase tracking-widest">Implementations</h3>
                <div className="space-y-4">
                  <div className="p-6 bg-stone-950 rounded-2xl border border-stone-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-white text-xl">Small Team</div>
                      <div className="text-sm text-stone-400 font-bold">2 AI Agents • 3 workflows</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-400 text-2xl">Starting at $7,500</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase tracking-tighter">One-Time</div>
                    </div>
                  </div>
                  <div className="p-6 bg-stone-950 rounded-2xl border border-stone-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-white text-xl">Growing Business</div>
                      <div className="text-sm text-stone-400 font-bold">5 AI Agents • Cross-department</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-400 text-2xl">$15,000</div>
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
                  <p className="text-sm text-stone-400 font-medium italic">*The $2,500 blueprint fee is credited toward any implementation.</p>
                </div>
              </div>

              {/* Monthly Ops */}
              <div className="bg-stone-900 rounded-[3rem] p-12 border border-stone-100">
                <h3 className="text-xl font-bold text-emerald-400 mb-8 uppercase tracking-widest">Managed Operations</h3>
                <div className="space-y-4">
                  <div className="p-6 bg-stone-950 rounded-2xl border border-stone-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-white text-xl">Essential Ops</div>
                      <div className="text-sm text-stone-400 font-bold">Monitoring • Bug fixes</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-400 text-2xl">$750/mo</div>
                    </div>
                  </div>
                  <div className="p-6 bg-stone-950 rounded-2xl border border-stone-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-white text-xl">Professional Ops</div>
                      <div className="text-sm text-stone-400 font-bold">New automations • Strategy call</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-400 text-2xl">$2,000/mo</div>
                    </div>
                  </div>
                  <div className="p-6 bg-stone-950 rounded-2xl border border-stone-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-white text-xl">Enterprise Ops</div>
                      <div className="text-sm text-stone-400 font-bold">Dedicated AI engineer • Priority</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-400 text-2xl">$5,000/mo+</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-20 text-center space-y-4">
              <Link to="/contact" className="inline-flex items-center justify-center bg-emerald-600 text-white px-12 py-5 rounded-2xl font-bold text-2xl hover:bg-emerald-700 transition-all shadow-lg min-h-[56px]">
                Stop Copy-Pasting. Start Your Plan ➜
              </Link>
              <p className="text-stone-400 font-medium">Identify your best opportunities before you commit to a build.</p>
            </div>
          </div>
        </section>

        {/* Risk Reversal Section */}
        <section className="px-6 py-16 sm:py-32 bg-stone-900 text-white overflow-hidden relative">
          <div className="max-w-5xl mx-auto relative z-10">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div className="space-y-8">
                <h2 className="text-4xl lg:text-6xl font-black leading-tight">100% Focused on Your Outcome.</h2>
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
              <div className="bg-white/5 backdrop-blur-lg p-12 rounded-[3rem] border border-white/10 text-center space-y-8">
                <div className="text-emerald-400 font-bold uppercase tracking-widest text-xs">Start Today</div>
                <h3 className="text-4xl font-black leading-tight">Identify where AI can save you the most time.</h3>
                <Link to="/contact" className="inline-flex items-center justify-center w-full bg-stone-950 text-stone-100 py-5 rounded-2xl font-bold text-xl hover:bg-stone-900 transition-all min-h-[56px]">
                  Stop Copy-Pasting. Reclaim Your Time ➜
                </Link>
                <p className="text-stone-400 text-sm font-medium">No credit card required. 30-minute assessment.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section id="contact" className="px-6 py-16 sm:py-32 bg-stone-50">
          <div className="max-w-4xl mx-auto bg-stone-950 rounded-[3rem] p-12 lg:p-20 shadow-2xl shadow-stone-200 border border-stone-800 text-center space-y-12">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
              Every week your team spends hours on work that software should already be doing.
            </h2>
            <p className="text-xl sm:text-2xl text-stone-400 leading-relaxed">
              In 30 minutes, we'll identify your top automation opportunities, estimate the time and cost savings, and recommend the best next step.
            </p>
            <div className="flex flex-col items-center space-y-8">
              <Link to="/contact" className="inline-flex items-center justify-center bg-emerald-600 text-white px-12 py-5 rounded-2xl font-bold text-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 min-h-[56px]">
                Stop Copy-Pasting. Get Deployed ➜
              </Link>
              <p className="text-stone-400 font-medium italic">"The most productive 30 minutes your operations team will spend this quarter."</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t border-stone-800 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div>
            <div className="text-2xl font-black text-emerald-400 mb-4">{businessName}</div>
            <p className="text-stone-400 max-w-sm">AI coworkers for operations teams. Work less, live more.</p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-6">
            <div className="flex flex-wrap justify-center gap-8 font-bold text-stone-600">
              <Link to="/build" className="hover:text-emerald-600">Builder</Link>
              <Link to="/support" className="hover:text-emerald-600">Support</Link>
              <Link to="/how-it-works" className="hover:text-emerald-600">How It Works</Link>
              <Link to="/faq" className="hover:text-emerald-600">FAQ</Link>
              <Link to="/about" className="hover:text-emerald-600">About</Link>
              <Link to="/demos/audit-portal" className="hover:text-emerald-400 underline underline-offset-4">Audit Workflow Demo</Link>
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
