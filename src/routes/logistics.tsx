import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/logistics")({
  component: LogisticsPage,
});

const subWorkflows = [
  {
    id: "dispatcher-email-overload",
    title: "Dispatcher Email Overload",
    description: "AI dispatch agents monitor incoming partner and customer emails, reading structured details and scheduling instructions. Instantly draft automated booking acknowledgements and flag high-priority changes.",
    metric: "Reduces manual response workload by 80%"
  },
  {
    id: "route-optimization",
    title: "Route Optimization",
    description: "Analyzes geographical constraints, stop sequencing, weight parameters, and transit windows. Dynamically bundles nearby collections and recommends optimized multi-stop dispatches.",
    metric: "Improves fleet efficiency by 15-22%"
  },
  {
    id: "carrier-coordination",
    title: "Carrier Coordination",
    description: "Automate bid distribution, equipment status checking, and freight tracking. Keeps communication seamless with secondary third-party transport providers with zero phone chasing.",
    metric: "100% automated carrier bid blasts"
  },
  {
    id: "delivery-confirmation",
    title: "Delivery Confirmation & POD",
    description: "Scan incoming Proof of Delivery documents, parse handwritten signatures and time stamps using high-accuracy OCR, match them against load records, and upload them directly to the billing queue.",
    metric: "POD matching time under 1 minute"
  },
  {
    id: "freight-audit",
    title: "Freight Audit & Billing",
    description: "Compare final invoice structures against initial broker quotes and transport accessorial sheets. Highlights unexpected detention or fuel surcharge anomalies before payout authorization.",
    metric: "Detects invoice errors on 12% of loads"
  }
];

const packages = [
  {
    name: "Starter Team",
    price: "$7,500",
    description: "Perfect for automating 1-2 core logistics sub-workflows (e.g. POD parsing and automated tracking).",
    features: ["2 active AI agents", "3 target workflows", "TMS / Database integration", "30-day dedicated support", "Fully encrypted document store"],
    link: "https://buy.stripe.com/9B6eVe0wCcFe48ucot3Ru01"
  },
  {
    name: "Growth Team",
    price: "$15,000",
    description: "Best for comprehensive fleet coordination, active routing, and dispatcher load planning support.",
    features: ["5 active AI agents", "Cross-department dispatcher workflows", "TMS + Email + Carrier APIs", "60-day dedicated support", "Active metrics dashboards"],
    link: "https://buy.stripe.com/8x25kE5QW7kUdJ44W13Ru02",
    popular: true
  },
  {
    name: "Scale Team",
    price: "$30,000",
    description: "Enterprise-grade complete end-to-end multi-facility freight dispatching, audit, and coordination suite.",
    features: ["Unlimited custom AI workflows", "Fully tailored multi-system agents", "Advanced API and custom legacy ERP connections", "90-day custom dedicated engineering", "Active exception escalation alerts"],
    link: "https://buy.stripe.com/7sY4gAenscFefRccot3Ru03"
  }
];

function LogisticsPage() {
  return (
    <div className="bg-stone-950 text-white min-h-screen selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Header matching landing page style */}
      <header className="px-6 py-6 border-b border-stone-900 bg-stone-950/80 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-500 tracking-tight">
            Simpler Life 100
          </Link>
          <nav className="hidden md:flex gap-8 items-center">
            <Link to="/manufacturing" className="text-sm font-bold text-stone-300 hover:text-emerald-400 transition-colors">Manufacturing</Link>
            <Link to="/logistics" className="text-sm font-bold text-stone-300 hover:text-emerald-400 transition-colors">Logistics</Link>
            <Link to="/back-office" className="text-sm font-bold text-stone-300 hover:text-emerald-400 transition-colors">Back Office</Link>
            <Link to="/build" className="text-sm font-bold text-stone-300 hover:text-emerald-400 transition-colors">Builder</Link>
            <Link to="/support" className="text-sm font-bold text-stone-300 hover:text-emerald-400 transition-colors">Support</Link>
            <Link to="/audit-upload" className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-950/20">Free Audit</Link>
          </nav>
        </div>
      </header>

      <main className="pb-32">
        {/* Hero Section */}
        <section className="px-6 pt-20 pb-24 lg:pt-32 lg:pb-36 max-w-7xl mx-auto text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-full opacity-[0.05] pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#059669,transparent_70%)]" />
          </div>
          
          <div className="relative z-10 max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold mb-6">
              🚚 AI Dispatch Team for Logistics
            </div>
            <h1 className="text-5xl lg:text-7xl font-black tracking-tight mb-8 leading-[1.15]">
              Reduce Dispatcher Email Overload by <span className="text-emerald-400">80%</span>.
            </h1>
            <p className="text-xl lg:text-2xl text-stone-400 mb-12 leading-relaxed">
              Stop drowning in constant carrier rate quote requests, POD matching, routing issues, and back-and-forth broker coordination. Automate load planning, tracking, and auditing effortlessly.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/audit-upload" className="bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-950/30">
                Submit Sample Documents for Audit
              </Link>
              <a href="#workflows" className="bg-stone-900 border border-stone-800 text-stone-300 px-8 py-4 rounded-xl font-bold text-lg hover:bg-stone-800 transition-all">
                Explore Workflows ↓
              </a>
            </div>
          </div>
        </section>

        {/* Problem statement Section */}
        <section className="px-6 py-20 bg-stone-900/40 border-y border-stone-900 text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-black text-stone-300 uppercase tracking-widest mb-6">What repetitive work do you hate doing every day?</h2>
            <p className="text-lg lg:text-xl text-stone-400 leading-relaxed">
              Transportation managers spend an average of 4.5 hours a day sorting emails, copy-pasting load parameters into TMS databases, chasing signatures, and auditing carrier rate additions. Our AI Dispatch Team runs active monitoring, parsing, and update loops in near real-time, freeing your team for strategic customer acquisition.
            </p>
          </div>
        </section>

        {/* Workflow breakdown Section */}
        <section id="workflows" className="px-6 py-24 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-black mb-4 tracking-tight">Tailored Logistics & Dispatch Workflows</h2>
            <p className="text-lg text-stone-400 max-w-2xl mx-auto">
              Each active agent runs directly on your legacy TMS systems, databases, emails, or folders to process heavy workflows reliably.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {subWorkflows.map((flow) => (
              <div key={flow.id} id={flow.id} className="p-8 rounded-3xl bg-stone-900/50 border border-stone-900 hover:border-emerald-500/30 transition-all flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl mb-6">
                    ⚡
                  </div>
                  <h3 className="text-2xl font-black mb-4 text-stone-100">{flow.title}</h3>
                  <p className="text-stone-400 text-sm leading-relaxed mb-6">{flow.description}</p>
                </div>
                <div className="pt-4 border-t border-stone-900/80 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  📉 {flow.metric}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Action / Deployment Tiers */}
        <section className="px-6 py-24 bg-stone-900/30 border-t border-stone-900">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl lg:text-5xl font-black mb-4 tracking-tight">Deploy Your AI Dispatch Team</h2>
              <p className="text-lg text-stone-400 max-w-2xl mx-auto">
                Flat-rate transparent packages with full system integrations. Scale up your transport productivity.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {packages.map((pkg) => (
                <div key={pkg.name} className={`p-8 rounded-[2.5rem] bg-stone-900 border flex flex-col justify-between relative ${pkg.popular ? "border-emerald-500 shadow-xl shadow-emerald-950/20" : "border-stone-800"}`}>
                  {pkg.popular && (
                    <div className="absolute -top-4 right-10 bg-emerald-600 text-white px-4 py-1 rounded-full text-xs font-black tracking-widest uppercase">
                      Most Popular
                    </div>
                  )}
                  <div>
                    <h3 className="text-2xl font-black mb-2 text-stone-100">{pkg.name}</h3>
                    <p className="text-stone-400 text-sm mb-6">{pkg.description}</p>
                    <div className="text-4xl font-black text-emerald-400 mb-8">{pkg.price}</div>
                    
                    <ul className="space-y-4 mb-8">
                      {pkg.features.map((feat) => (
                        <li key={feat} className="flex items-center gap-3 text-sm text-stone-300 font-medium">
                          <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <a href={pkg.link} target="_blank" rel="noopener noreferrer" className={`block w-full py-4 rounded-xl font-bold text-center transition-all ${pkg.popular ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-950/30" : "bg-stone-800 text-stone-200 hover:bg-stone-700"}`}>
                    Deploy and Buy Now →
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-stone-900 bg-stone-950 text-center text-sm text-stone-500">
        <p>&copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.</p>
      </footer>
    </div>
  );
}
