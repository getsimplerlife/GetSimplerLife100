import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { workflows } from "~/content/workflows";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/")({
  head: () => pageHead("/"),

  component: Home,
});

const topVerticals = [
  { name: "Energy", slug: "energy", result: "Automates invoice & compliance data entry", icon: "⚡", color: "#059669", demo: "/demos/energy" },
  { name: "Manufacturing", slug: "manufacturing", result: "Automates order & invoice processing", icon: "🏭", color: "#0891b2", demo: "/demos/manufacturing" },
  { name: "Automotive", slug: "automotive", result: "Automates supplier & purchase-order workflows", icon: "🚗", color: "#ca8a04" },
  { name: "Financial Services", slug: "financial-services", result: "Automates document & ledger data entry", icon: "💰", color: "#15803d" },
  { name: "Logistics", slug: "logistics", result: "Automates dispatch & routing workflows", icon: "🚚", color: "#d97706" },
];

const allIndustries = [
  { name: "Aerospace", id: "aerospace", icon: "✈️" },
  { name: "Agriculture", id: "agriculture", icon: "🌾" },
  { name: "Automotive", id: "automotive", icon: "🚗" },
  { name: "Construction", id: "construction", icon: "🏗️" },
  { name: "E-Commerce", id: "e-commerce", icon: "🛒" },
  { name: "Education", id: "education", icon: "📚" },
  { name: "Energy", id: "energy", icon: "⚡" },
  { name: "Financial Services", id: "financial-services", icon: "💰" },
  { name: "Government", id: "government", icon: "🏛️" },
  { name: "Healthcare", id: "healthcare", icon: "🏥" },
  { name: "Hospitality", id: "hospitality", icon: "🏨" },
  { name: "Insurance", id: "insurance", icon: "🛡️" },
  { name: "Legal", id: "legal", icon: "⚖️" },
  { name: "Logistics", id: "logistics", icon: "🚚" },
  { name: "Manufacturing", id: "manufacturing", icon: "🏭" },
  { name: "Media", id: "media", icon: "🎬" },
  { name: "Pharmaceuticals", id: "pharmaceuticals", icon: "💊" },
  { name: "Professional Services", id: "professional-services", icon: "💼" },
  { name: "Real Estate", id: "real-estate", icon: "🏠" },
  { name: "Retail", id: "retail", icon: "🛍️" },
  { name: "Technology", id: "technology", icon: "💻" },
  { name: "Telecom", id: "telecom", icon: "📡" },
  { name: "Transportation", id: "transportation", icon: "🚆" },
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
  "Xero", "HubSpot", "Slack", "Microsoft 365", "Google Workspace", "DocuSign"
];

const journeySteps = [
  {
    step: "01",
    name: "Discover",
    benefit: "Audit",
    description: "In 30 minutes, we'll identify your top automation opportunities, estimate the time and cost savings, and recommend the best next step. If we don't find a meaningful opportunity, we'll tell you.",
    price: "FREE",
    cta: "Stop Copy-Pasting. Get Your Blueprint ➜",
    link: "/audit"
  },
  {
    step: "02",
    name: "Design",
    benefit: "Design",
    description: "We build a technical roadmap and workflow that fits your business, showing exactly how the AI employees will work.",
    price: "Included in Build",
    cta: "Start Your Build",
    link: "/pricing"
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
    price: "Monthly per AI employee",
    cta: "View Pricing",
    link: "/pricing"
  }
];

const blueprintTemplates = {
  invoice: {
    title: "Invoice & AP Integration Map",
    steps: [
      { label: "Intake Trigger", icon: "📥", desc: "Monitors incoming email attachments & files." },
      { label: "OCR Extraction", icon: "🧠", desc: "Extracts table line items, totals, and invoice IDs." },
      { label: "ERP/GL Match", icon: "🔌", desc: "Synchronizes validated bills directly into Xero (QuickBooks in development)." },
      { label: "Dispatch Ping", icon: "💬", desc: "Dispatches structural audit log to Slack #finance channel." }
    ]
  },
  dispatch: {
    title: "Carrier Dispatch Automation Map",
    steps: [
      { label: "Carrier Inquiry", icon: "📧", desc: "Monitors and filters high-volume carrier bid streams." },
      { label: "TMS Rule Evaluation", icon: "🧠", desc: "Queries shipment matching criteria against your TMS rules." },
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
  const businessName = 'Simpler Life 100';

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
      
      <Header businessName={businessName} />
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
                Your proposal-to-cash runs on copy-paste. We automate it end to end.
              </h1>
              <p className="text-lg lg:text-xl text-stone-400 max-w-xl leading-relaxed">
For professional-services firms on Xero and HubSpot. Every signed proposal currently means hours of re-keying deals into HubSpot, drafting invoices, and chasing file saves. That step disappears — automatically.
              </p>

              {/* Stats Bar */}
              <div className="flex flex-wrap gap-4 text-[10px] font-mono text-stone-400">
                <span className="bg-stone-900 border border-stone-800 px-3 py-1.5 rounded-lg">💼 AI Employees on demand</span>
                <span className="bg-stone-900 border border-stone-800 px-3 py-1.5 rounded-lg">🧰 Full portal toolkit</span>
                <span className="bg-stone-900 border border-stone-800 px-3 py-1.5 rounded-lg">🏭 Industry-specific agents</span>
                <span className="bg-stone-900 border border-stone-800 px-3 py-1.5 rounded-lg"><span className="text-emerald-400 font-bold">🔐</span> Real Credential Validation</span>
              </div>

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
                    className="w-full bg-stone-950 border border-stone-900 rounded-xl p-3 text-xs font-medium leading-relaxed outline-none focus:border-stone-400 placeholder-stone-400 resize-none text-stone-200"
                    placeholder="E.g. Auto-read scanned invoice PDFs, extract line-items, update QuickBooks and notify Slack..."
                  />
                </div>

                {/* Quick Examples Tag Pills */}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] text-stone-400 font-mono">QUICK EXAMPLES:</span>
                  {[
                    { label: "Proposal → e-sign", prompt: "Send the signed proposal to e-signature, then move it into our workflow" },
                    { label: "Deal → HubSpot", prompt: "Create the HubSpot deal and contact from every signed proposal" },
                    { label: "Invoice → Xero", prompt: "Draft the invoice in Xero and notify the team on Slack" }
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
                  <div className="bg-stone-950 border border-stone-800/80 rounded-2xl p-4 space-y-4 animate-fadeIn">
                    <div className="flex justify-between items-center border-b border-stone-800 pb-2.5">
                      <h4 className="text-xs font-black text-white font-mono tracking-tight">{activeTemplate.title}</h4>
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-black">SAMPLE BLUEPRINT</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {activeTemplate.steps.map((st, i) => (
                        <div key={i} className="p-3 bg-stone-900 rounded-xl space-y-1 relative border border-stone-900">
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
                <h3 className="text-lg font-black tracking-tight text-white">Quote-to-Cash Time, Reclaimed</h3>
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

        {/* ─── How an AI Operations Team Works ─── */}
        <section className="px-4 py-16 bg-stone-900 border-b border-stone-800/80">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="border-l-4 border-emerald-600 pl-4">
              <span className="text-[10px] font-mono font-bold tracking-widest text-stone-400 uppercase block">HOW AN AI OPERATIONS TEAM WORKS</span>
              <h2 className="text-3xl font-black tracking-tight text-stone-950">From bottleneck to automation blueprint</h2>
            </div>

            <div className="bg-stone-950 border border-stone-900 rounded-[2.5rem] p-6 lg:p-12 shadow-black/20 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Context Block */}
              <div className="lg:col-span-7 space-y-6">
                <h3 className="text-2xl font-black text-stone-100 leading-tight">
                  Tell us your most repetitive manual process. We map the workflow, choose the right AI employees, and connect your tools.
                </h3>
                <div className="space-y-4 text-stone-400 text-sm leading-relaxed">
                  <p>
                    Every Simpler Life 100 deployment starts the same way: you describe a specific operational bottleneck, and we build the AI operations team around it — the right employees, the right workflows, and the integrations already live on the platform (Xero, Slack, Google, Microsoft, HubSpot, and DocuSign today).
                  </p>
                  <p>
                    Nothing is claimed as working until it is verified. Every integration is live-tested before it is listed, and every AI action goes through a human approval queue before it touches your systems.
                  </p>
                </div>
              </div>

              {/* Process Steps */}
              <div className="lg:col-span-5 bg-stone-900 border border-stone-900 rounded-3xl p-6 sm:p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-stone-300 uppercase font-black">1 · Describe the bottleneck</div>
                    <p className="text-sm text-stone-400">You tell us which manual process eats the most time.</p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-stone-300 uppercase font-black">2 · We map the workflow</div>
                    <p className="text-sm text-stone-400">We lay out the steps, choose the AI employees, and plan the integrations.</p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-stone-300 uppercase font-black">3 · Deploy with approvals</div>
                    <p className="text-sm text-stone-400">Your team reviews every action before it runs, with connections kept valid and monitored.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What's Inside Your Portal Section */}
        <section className="px-6 py-16 sm:py-32 bg-stone-900">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                YOUR COMMAND CENTER
              </span>
              <h2 className="text-4xl lg:text-6xl font-black text-white tracking-tight">What's Inside Your Portal</h2>
              <p className="text-xl text-stone-400 max-w-2xl mx-auto">
                Every Simpler Life 100 deployment comes with a full-featured operations portal — your team's command center for AI workforce management.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: "🛒", title: "AI Marketplace", desc: "Browse & deploy AI employees with real Stripe payment links" },
                { icon: "🔌", title: "Full Provider Support", desc: "Connect any business tool with credential-validated connections" },
                { icon: "🔗", title: "Connected Accounts", desc: "Monitor, edit credentials, test connections per integration" },
                { icon: "✅", title: "Task Queue", desc: "Track all AI employee work with status filtering" },
                { icon: "⚡", title: "Workflows", desc: "8 pre-built automation templates ready to deploy across your stack" },
                { icon: "👑", title: "Admin Panel", desc: "Full platform analytics, user management, audit logs (owner only)" },
                { icon: "🔐", title: "Purchase Gating", desc: "Workflows & AI deployments require purchase or owner assignment" },
                { icon: "📥", title: "Approvals", desc: "AI actions wait for human review before execution" },
              ].map((feat) => (
                <div key={feat.title} className="bg-stone-950 p-8 rounded-2xl border border-stone-800 hover:border-emerald-500/30 transition-all group">
                  <span className="text-3xl mb-5 block">{feat.icon}</span>
                  <h3 className="text-lg font-black text-white mb-2 group-hover:text-emerald-400 transition-colors">{feat.title}</h3>
                  <p className="text-sm text-stone-400 leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ROI Calculator CTA */}
        <section className="px-6 py-16 bg-emerald-600">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="text-white text-center md:text-left">
              <h2 className="text-3xl lg:text-4xl font-black mb-4">Calculate Your Potential Savings</h2>
              <p className="text-emerald-100 text-lg font-medium">Use our simple ROI tool to see how many hours your team could reclaim.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/roi-calculator" className="bg-stone-950 text-emerald-400 px-10 py-4 rounded-2xl font-black text-xl hover:bg-emerald-500/10 transition-all shadow-xl whitespace-nowrap min-h-[50px] flex items-center justify-center">
                Open ROI Calculator →
              </Link>
              <Link to="/build" className="bg-stone-950/50 text-white border border-white/20 px-10 py-4 rounded-2xl font-black text-xl hover:bg-stone-950 hover:border-emerald-400/50 transition-all shadow-xl whitespace-nowrap min-h-[50px] flex items-center justify-center">
                Browse Marketplace →
              </Link>
            </div>
          </div>
        </section>

        {/* Industry Examples Section */}
        <section id="examples" className="px-6 py-16 sm:py-32 bg-stone-900 border-y border-stone-900">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20 text-center space-y-6">
              <h2 className="text-3xl sm:text-4xl lg:text-6xl font-black text-white tracking-tight">Real Automations. Real Results.</h2>
              <p className="text-lg text-stone-400 max-w-2xl mx-auto">
                We don't build generic bots. We build industry-specific agents for your highest-friction workflows.
              </p>
              
              {/* Workflow Visual */}
              <div className="max-w-5xl mx-auto bg-stone-950 p-8 lg:p-12 rounded-[3rem] shadow-black/20 border border-stone-900">
                <h3 className="text-2xl font-black text-white mb-10">How an AI Coworker handles an inquiry</h3>
                <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
                  {[
                    { label: "Customer Email", icon: "📧", color: "bg-blue-500/10 text-blue-400" },
                    { label: "AI reads & extracts", icon: "🧠", color: "bg-emerald-500/10 text-emerald-600" },
                    { label: "Updates CRM", icon: "📊", color: "bg-emerald-500/10 text-emerald-600" },
                    { label: "Creates Invoice", icon: "🧾", color: "bg-amber-500/10 text-amber-600" },
                    { label: "Sends Confirmation", icon: "✅", color: "bg-violet-500/10 text-violet-400" },
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
                <div key={item.industry} className="bg-stone-950 p-10 rounded-[2.5rem] shadow-black/20 border border-stone-900">
                  <h3 className="text-2xl font-black text-white mb-6">{item.industry}</h3>
                  <ul className="space-y-4">
                    {item.examples.map(ex => (
                      <li key={ex} className="flex items-start gap-3 text-stone-400">
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

        {/* What We Build — honest capabilities */}
        <section className="px-6 py-16 sm:py-32 bg-stone-950">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="p-8 border-l-4 border-emerald-600 bg-stone-900 rounded-r-3xl">
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">Built around your real workflow</div>
                <p className="text-stone-400 font-medium">We start from the specific process you describe — not a generic template — and map the steps, tools, and AI employees that fit it.</p>
              </div>
              <div className="p-8 border-l-4 border-emerald-600 bg-stone-900 rounded-r-3xl">
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">Live integrations only</div>
                <p className="text-stone-400 font-medium">Xero, Slack, Google, Microsoft, HubSpot, and DocuSign are connected and verified today. Everything else in the catalog is marked in development until it's proven.</p>
              </div>
              <div className="p-8 border-l-4 border-emerald-600 bg-stone-900 rounded-r-3xl">
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">Humans stay in control</div>
                <p className="text-stone-400 font-medium">Every AI action runs through an approval queue, and connections keep alive on their own — failures escalate loudly, never silently.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Automation Opportunities by Industry */}
        <section id="industries" className="px-6 py-16 sm:py-32 bg-stone-950 text-white">
          <div className="max-w-7xl mx-auto">
            <div className="mb-20 space-y-4">
              <h2 className="text-4xl lg:text-6xl font-black tracking-tight">Automation Opportunities by Industry</h2>
              <p className="text-xl text-stone-400 max-w-2xl">
                The highest-friction workflows we automate across industries.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {topVerticals.map((v) => (
                <Link key={v.name} to={`/industries/${v.slug}` as any}
                  className="group bg-stone-900/50 p-8 rounded-3xl border border-white/10 hover:bg-stone-800/80 transition-all"
                >
                  <span className="text-4xl mb-6 block">{v.icon}</span>
                  <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-2">{v.name}</div>
                  <div className="text-xl font-black text-white group-hover:text-emerald-400 transition-colors leading-tight">{v.result}</div>
                </Link>
              ))}
            </div>
            <div className="mt-16 text-center">
              <Link to="/assessment" className="inline-flex items-center gap-2 font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                View all industry workflows <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
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
                  className="group bg-stone-950 p-8 rounded-[2rem] border border-stone-800 hover:border-emerald-500/30 transition-all flex flex-col justify-between"
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
        <section id="journey" className="px-6 py-16 sm:py-32 bg-stone-950">
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
                  <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-2xl font-black mb-8 shadow-lg shadow-emerald-900/30">
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
        <section id="pricing" className="px-6 py-16 sm:py-32 bg-stone-950 border-t border-stone-900">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20 space-y-6">
              <h2 className="text-4xl lg:text-6xl font-black text-white tracking-tight">Simple, Transparent Pricing.</h2>
              <p className="text-xl text-stone-400 max-w-2xl mx-auto leading-relaxed">
                No hidden fees or open-ended hourly billing. You pay for working, deployed agents that handle specific business results.
              </p>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Implementation Packages */}
              <div className="bg-stone-900 rounded-[3rem] p-12 border border-stone-900">
                <h3 className="text-xl font-bold text-emerald-400 mb-8 uppercase tracking-widest">Implementation Packages</h3>
                <div className="space-y-4">
                  <div className="p-6 bg-stone-950 rounded-2xl border border-stone-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-white text-xl">Small Team</div>
                      <div className="text-sm text-stone-400 font-bold">2 AI Agents • 3 Workflows • 1 CRM Connection</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-400 text-2xl">$7,500</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase tracking-tighter">One-Time</div>
                    </div>
                  </div>
                  <div className="p-6 bg-stone-950 rounded-2xl border border-stone-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-white text-xl">Growth</div>
                      <div className="text-sm text-stone-400 font-bold">5 AI Agents • Cross-Department • 1 CRM Connection</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-400 text-2xl">$15,000</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase tracking-tighter">One-Time</div>
                    </div>
                  </div>
                  <div className="p-6 bg-emerald-600 rounded-2xl flex justify-between items-center text-white shadow-xl shadow-emerald-900/30">
                    <div>
                      <div className="font-black text-xl">Scale</div>
                      <div className="text-sm text-emerald-100 font-bold">Unlimited Agents • Custom Modeling • 1 CRM Connection</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-2xl">$30,000</div>
                      <div className="text-[10px] text-emerald-200 font-bold uppercase tracking-tighter">One-Time</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly per AI Employee */}
              <div className="bg-stone-900 rounded-[3rem] p-12 border border-stone-900">
                <h3 className="text-xl font-bold text-emerald-400 mb-8 uppercase tracking-widest">Monthly per AI Employee</h3>
                <p className="text-sm text-stone-400 mb-6">
                  In addition to the one-time build package, you pay a monthly fee for each AI employee you deploy at that employee's listed price. Live integrations today: Xero, Slack, Google, Microsoft 365, HubSpot, and DocuSign (QuickBooks in development), with more added on request.
                </p>
              </div>
            </div>

            <div className="mt-20 text-center space-y-4">
              <Link to="/build" className="inline-flex items-center justify-center bg-emerald-600 text-white px-12 py-5 rounded-2xl font-bold text-2xl hover:bg-emerald-700 transition-all shadow-lg min-h-[56px]">
                Stop Copy-Pasting. Start Your Build ➜
              </Link>
              <p className="text-stone-400 font-medium">Choose your package and deploy AI coworkers in weeks, not months.</p>
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
                      <h4 className="text-xl font-bold mb-2">One-Time Build Package</h4>
                      <p className="text-stone-400">A fixed build package ($7,500 / $15,000 / $30,000) plus a monthly fee per AI employee, deployed to achieve specific time-saving results.</p>
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
              <div className="bg-stone-900/50 backdrop-blur-lg p-12 rounded-[3rem] border border-white/10 space-y-8">
                <div className="text-emerald-400 font-bold uppercase tracking-widest text-xs">Start Today</div>
                <h3 className="text-4xl font-black leading-tight">That's our day, too. Here's what disappears.</h3>
                <p className="text-stone-400 text-sm md:text-base leading-relaxed max-w-3xl mx-auto">
                  Your ops lead knows the quote-to-cash drill by heart. A proposal gets signed, then a human spends
                  hours re-keying the deal into HubSpot, drafting the Xero invoice, drafting the Slack message, and
                  filing the PDF somewhere it'll never be found again.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left text-stone-300">
                  {[
                    { icon: "📝", t: "Proposal", d: "Prepared and sent for e-signature." },
                    { icon: "✍️", t: "DocuSign", d: "Signed, and we're notified the moment it lands." },
                    { icon: "🤝", t: "HubSpot", d: "Deal + contact created and updated automatically." },
                    { icon: "🧾", t: "Xero", d: "Invoice drafted and ready for your review." },
                    { icon: "💬", t: "Slack", d: "Team notified — nothing siloed." },
                    { icon: "📁", t: "Google / Microsoft", d: "Docs filed where they belong." }
                  ].map((st) => (
                    <div key={st.t} className="flex items-start gap-3 bg-stone-950/40 border border-stone-900 rounded-2xl p-4">
                      <span className="text-xl">{st.icon}</span>
                      <div>
                        <div className="text-xs font-black text-white uppercase tracking-wider">{st.t}</div>
                        <div className="text-xs text-stone-400 mt-0.5">{st.d}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-stone-950/50 border border-emerald-500/20 rounded-2xl p-6 text-left">
                  <div className="text-emerald-400 text-xs font-black uppercase tracking-widest mb-2">Built on honest, verified integration</div>
                  <p className="text-stone-400 text-sm leading-relaxed">
                    Xero, HubSpot, DocuSign, Slack, and Google/Microsoft connections are real and live-tested — nothing on
                    this page is claimed working until it is. Every action passes a human approval queue before it runs.
                    QuickBooks is in development and will be added soon.
                  </p>
                  <div className="mt-4 text-sm text-stone-200">
                    <span className="font-black text-white">Design-Partner Program: </span>
                    we're onboarding a small number of professional-services firms for early access and discounted
                    onboarding in exchange for being a reference. If that's you, start the assessment below.
                  </div>
                </div>
                <Link to="/contact" className="inline-flex items-center justify-center w-full bg-stone-950 text-stone-100 py-5 rounded-2xl font-bold text-xl hover:bg-stone-900 transition-all min-h-[56px]">
                  Start the 30-Second Assessment ➜
                </Link>
                <p className="text-stone-400 text-sm font-medium">Returns a personalized quote-to-cash plan you can keep. No credit card required.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section id="contact" className="px-6 py-16 sm:py-32 bg-stone-900">
          <div className="max-w-4xl mx-auto bg-stone-950 rounded-[3rem] p-12 lg:p-20 shadow-2xl shadow-stone-900/30 border border-stone-800 text-center space-y-12">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
              Every week your team spends hours on work that software should already be doing.
            </h2>
            <p className="text-xl sm:text-2xl text-stone-400 leading-relaxed">
              In 30 minutes, we'll identify your top automation opportunities, estimate the time and cost savings, and recommend the best next step.
            </p>
            <div className="flex flex-col items-center space-y-8">
              <Link to="/contact" className="inline-flex items-center justify-center bg-emerald-600 text-white px-12 py-5 rounded-2xl font-bold text-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/30 min-h-[56px]">
                Stop Copy-Pasting. Get Deployed ➜
              </Link>
              <p className="text-stone-400 font-medium italic">"The most productive 30 minutes your operations team will spend this quarter."</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t border-stone-800 bg-stone-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div>
            <div className="text-2xl font-black text-emerald-400 mb-4">{businessName}</div>
            <p className="text-stone-400 max-w-sm">AI coworkers for operations teams. Work less, live more.</p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-6">
            <div className="flex flex-wrap justify-center gap-8 font-bold text-stone-600">
              <Link to="/build" className="hover:text-emerald-400">Builder</Link>
              <Link to="/support" className="hover:text-emerald-400">Support</Link>
              <Link to="/how-it-works" className="hover:text-emerald-400">How It Works</Link>
              <Link to="/faq" className="hover:text-emerald-400">FAQ</Link>
              <Link to="/about" className="hover:text-emerald-400">About</Link>
              <Link to="/demos/audit-portal" className="hover:text-emerald-400 underline underline-offset-4">Audit Workflow Demo</Link>
            </div>
            <div className="text-sm text-stone-400">
              &copy; {new Date().getFullYear()} {businessName}. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    <Footer />
    </div>
  );
}
