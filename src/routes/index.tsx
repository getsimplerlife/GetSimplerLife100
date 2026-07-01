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

const verticals = [
  { name: "Energy", slug: "energy", multiplier: "2.2x", icon: "⚡", color: "#059669", demo: "/demos/energy", top: true },
  { name: "Manufacturing", slug: "manufacturing", multiplier: "2.1x", icon: "🏭", color: "#0891b2", demo: "/demos/manufacturing", top: true },
  { name: "Automotive", slug: "automotive", multiplier: "2.1x", icon: "🚗", color: "#ca8a04", top: true },
  { name: "Financial Services", slug: "financial-services", multiplier: "2.0x", icon: "💰", color: "#15803d", top: true },
  { name: "Logistics", slug: "logistics", multiplier: "2.0x", icon: "🚚", color: "#d97706", top: true },
  { name: "Healthcare", slug: "healthcare", multiplier: "1.9x", icon: "🏥", color: "#059669" },
  { name: "Agriculture", slug: "agriculture", multiplier: "1.8x", icon: "🌾", color: "#16a34a" },
  { name: "Legal", slug: "legal", multiplier: "1.8x", icon: "⚖️", color: "#7c3aed" },
  { name: "Accounting", slug: "accounting", multiplier: "1.8x", icon: "📊", color: "#0d9488" },
  { name: "SaaS", slug: "saas", multiplier: "1.8x", icon: "☁️", color: "#4f46e5" },
  { name: "Technology", slug: "technology", multiplier: "1.7x", icon: "💻", color: "#1d4ed8" },
  { name: "Finance", slug: "finance", multiplier: "1.7x", icon: "💳", color: "#0891b2" },
  { name: "Agency", slug: "agency", multiplier: "1.7x", icon: "🎯", color: "#db2777" },
  { name: "Insurance", slug: "insurance", multiplier: "1.7x", icon: "🛡️", color: "#0284c7" },
  { name: "Telecommunications", slug: "telecommunications", multiplier: "1.6x", icon: "📡", color: "#c026d3" },
  { name: "Retail", slug: "retail", multiplier: "1.6x", icon: "🏬", color: "#dc2626" },
  { name: "Ecommerce", slug: "ecommerce", multiplier: "1.6x", icon: "🛒", color: "#ea580c" },
  { name: "Marketing", slug: "marketing", multiplier: "1.5x", icon: "📣", color: "#ec4899" },
  { name: "Construction", slug: "construction", multiplier: "1.5x", icon: "🏗️", color: "#d97706" },
  { name: "Real Estate", slug: "real-estate", multiplier: "1.5x", icon: "🏠", color: "#2563eb" },
  { name: "Government", slug: "government", multiplier: "1.4x", icon: "🏛️", color: "#475569" },
  { name: "Hospitality", slug: "hospitality", multiplier: "1.4x", icon: "🏨", color: "#e11d48" },
  { name: "Restaurants", slug: "restaurants", multiplier: "1.4x", icon: "🍽️", color: "#f97316" },
  { name: "Human Resources", multiplier: "1.4x", icon: "👥", slug: "human-resources", color: "#65a30d" },
  { name: "Education", slug: "education", multiplier: "1.3x", icon: "📚", color: "#9333ea" },
  { name: "Nonprofits", slug: "nonprofits", multiplier: "1.3x", icon: "🤝", color: "#78716c" },
];

const auditTiers = [
  {
    name: "60-minute Efficiency Audit",
    price: "FREE",
    description: "Discover exactly where AI will have the biggest impact on your team's workload.",
    features: ["1-on-1 strategy call", "Immediate 'Quick Wins' identification", "Automation feasibility check", "Live demo of relevant agents"],
    link: "#contact",
    cta: "Schedule Free Audit",
  },
  {
    name: "Deep-Dive AI Opportunity Audit",
    price: "$2,500",
    description: "A comprehensive diagnostic of your entire operational workflow to quantify ROI.",
    features: ["Full vertical-specific waste audit", "Cost savings analysis report", "Custom automation roadmap", "Credit toward implementation"],
    link: "https://buy.stripe.com/aFa5kD4ggghlbWe2WE08g0h",
    cta: "Buy Now — $2,500",
  },
  {
    name: "Enterprise Multi-Dept Audit",
    price: "$5,000+",
    description: "Deep diagnostic for multi-department organizations with complex cross-functional workflows.",
    features: ["Multi-department mapping", "Security & compliance review", "Custom business case for execs", "Dedicated project lead"],
    link: "#contact",
    cta: "Contact for Quote",
  },
];

const implementationPackages = [
  {
    name: "Starter Implementation",
    price: "$7,500",
    description: "Rapid deployment of your first 2 AI agents to solve your highest-friction workflows.",
    features: ["2 AI agents", "3 custom workflows", "CRM & Email integration", "30 days priority support"],
    link: "https://buy.stripe.com/fZudR98ww4yD0dw0Ow08g0i",
    cta: "Get Started — $7,500",
  },
  {
    name: "Growth Implementation",
    price: "$15,000",
    description: "Transform an entire department with a suite of 5 AI agents and cross-functional automation.",
    features: ["5 AI agents", "Full dept. cross-workflows", "CRM + ERP integrations", "Employee training sessions"],
    link: "https://buy.stripe.com/eVq9AT0004yD6BU54M08g0j",
    cta: "Scale Up — $15,000",
  },
  {
    name: "Scale Implementation",
    price: "$30,000",
    description: "Comprehensive AI transformation for organizations looking for maximum efficiency gains.",
    features: ["Unlimited workflows", "Custom trained agents", "Advanced data integrations", "Full project management"],
    link: "https://buy.stripe.com/cNi28r7ss7KP7FYeFm08g0k",
    cta: "Go Unlimited — $30,000",
  },
  {
    name: "Enterprise Implementation",
    price: "$50,000+",
    description: "Company-wide AI deployment with custom development, security, and enterprise SLA.",
    features: ["Custom security protocols", "Compliance-ready agents", "Dedicated engineering team", "White-glove deployment"],
    link: "#contact",
    cta: "Contact for Enterprise",
  },
];

const monthlyOps = [
  {
    name: "Essential Monthly Ops",
    price: "$750/mo",
    description: "Continuous monitoring and maintenance to ensure your AI agents stay 100% operational.",
    features: ["24/7 uptime monitoring", "Prompt & model updates", "Monthly performance report", "Standard support response"],
    link: "https://buy.stripe.com/6oU28r5kk0in0dwgNu08g0l",
    cta: "Subscribe — $750/mo",
  },
  {
    name: "Professional Monthly Ops",
    price: "$2,000/mo",
    description: "For growing teams that need ongoing optimization and new automation builds.",
    features: ["Priority bug fixes", "New minor automations", "Monthly strategy call", "Advanced model tuning"],
    link: "https://buy.stripe.com/28E3cv0000in2lE7cU08g0m",
    cta: "Subscribe — $2,000/mo",
  },
  {
    name: "Enterprise Monthly Ops",
    price: "$5,000/mo+",
    description: "Dedicated AI operations team for large-scale deployments with high volume requirements.",
    features: ["Unlimited optimization", "Dedicated AI engineer", "Quarterly strategic roadmap", "Instant priority support"],
    link: "#contact",
    cta: "Contact for Enterprise",
  },
];

const optionalAddOns = [
  { name: "Additional AI Agent", price: "$1,500" },
  { name: "CRM Integration", price: "$2,000" },
  { name: "ERP Integration", price: "$3,500" },
  { name: "Voice AI Receptionist", price: "$3,000" },
  { name: "AI Sales Assistant", price: "$4,000" },
  { name: "AI Customer Support Agent", price: "$4,000" },
  { name: "Custom Dashboard", price: "$2,500" },
  { name: "Document AI System", price: "$3,500" },
  { name: "Internal Knowledge Assistant", price: "$3,000" },
  { name: "Employee Training", price: "$1,500" },
  { name: "Additional Department Automation", price: "$5,000+" },
];

const verticalPricing = [
  { vertical: "Healthcare", startingPrice: "$20,000" },
  { vertical: "Manufacturing", startingPrice: "$25,000" },
  { vertical: "Financial Services", startingPrice: "$25,000" },
  { vertical: "Legal", startingPrice: "$15,000" },
  { vertical: "Logistics", startingPrice: "$20,000" },
  { vertical: "Construction", startingPrice: "$15,000" },
  { vertical: "Real Estate", startingPrice: "$12,000" },
  { vertical: "Retail & Ecommerce", startingPrice: "$12,000" },
  { vertical: "SaaS & Technology", startingPrice: "$15,000" },
  { vertical: "Insurance", startingPrice: "$20,000" },
  { vertical: "Government", startingPrice: "Custom Quote" },
  { vertical: "Hospitality & Restaurants", startingPrice: "$10,000" },
  { vertical: "Education", startingPrice: "$10,000" },
  { vertical: "Nonprofits", startingPrice: "$8,000" },
];

function Home() {
  const { businessName, user } = Route.useLoaderData();
  
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 py-4 border-b">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight">
            {businessName}
          </Link>
          <nav className="hidden md:flex gap-8 items-center">
            <a href="#verticals" className="text-sm font-medium hover:text-indigo-600 transition-colors">Verticals</a>
            <a href="#services" className="text-sm font-medium hover:text-indigo-600 transition-colors">Services</a>
            <Link to="/audit" className="text-sm font-medium hover:text-indigo-600 transition-colors">Audit</Link>
            {user ? (
              <Link to="/portal" className="text-sm font-bold text-indigo-600 border border-indigo-600 px-4 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">Dashboard</Link>
            ) : (
              <Link to="/login" className="text-sm font-medium hover:text-indigo-600 transition-colors">Login</Link>
            )}
            <a href="#contact" className="text-sm font-medium hover:text-indigo-600 transition-colors underline decoration-2 underline-offset-4">Get Started</a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 py-20 lg:py-32 bg-slate-50 dark:bg-slate-900/50">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-8">
              Work Less, <span className="text-indigo-600">Live More</span> with Vertical AI
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
              {businessName} automates the high-friction workflows unique to your industry. 100% focused on a simpler life for your team.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="#contact" className="bg-indigo-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-indigo-700 transition-colors">
                Schedule Your Free Audit
              </a>
              <a href="#verticals" className="bg-white text-gray-900 border border-gray-200 px-8 py-4 rounded-lg font-bold hover:bg-gray-50 transition-colors">
                Explore Verticals
              </a>
            </div>
          </div>
        </section>

        {/* Verticals Grid */}
        <section id="verticals" className="px-6 py-20 lg:py-32 max-w-7xl mx-auto">
          <div className="mb-16 text-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 mb-4 uppercase tracking-wider">
              Industry Benchmarks
            </span>
            <h2 className="text-3xl lg:text-5xl font-bold mb-4">Pre-Modeled ROI by Vertical</h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              We&apos;ve already modeled the automation ROI for 26 industries. Click any vertical to see the specific agent blueprint.
            </p>
          </div>

          {/* Top Tier */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xl">🏆</span>
              <h3 className="text-lg font-bold text-gray-800">Top Performers</h3>
              <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">2.0x – 2.2x ROI</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {verticals.filter(v => v.top).map((v) => (
                <Link key={v.name} to={(v.demo || `/industries/${v.slug}`) as any}
                  className="group relative overflow-hidden rounded-2xl border-2 p-5 flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white"
                  style={{ borderColor: v.color + '30' }}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 opacity-[0.04] rounded-bl-full" style={{ background: `radial-gradient(circle, ${v.color}, transparent)` }} />
                  <span className="text-3xl mb-3">{v.icon}</span>
                  <div className="text-sm font-bold text-gray-900 mb-1">{v.name}</div>
                  <div className="absolute inset-x-0 bottom-0 h-0.5 transition-all duration-300 group-hover:h-1" style={{ backgroundColor: v.color }} />
                </Link>
              ))}
            </div>
          </div>

          {/* Mid Tier */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xl">📈</span>
              <h3 className="text-lg font-bold text-gray-800">Strong Returns</h3>
              <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">1.5x – 1.9x ROI</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {verticals.filter(v => !v.top && parseFloat(v.multiplier) >= 1.5).map((v) => (
                <Link key={v.name} to={`/industries/${v.slug}` as any}
                  className="group relative overflow-hidden rounded-xl border p-4 flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 bg-white hover:border-gray-300"
                >
                  <span className="text-2xl mb-2">{v.icon}</span>
                  <div className="text-sm font-semibold text-gray-800">{v.name}</div>
                </Link>
              ))}
            </div>
          </div>

          {/* Standard Tier */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xl">⚙️</span>
              <h3 className="text-lg font-bold text-gray-800">Standard Automation</h3>
              <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">1.3x – 1.4x ROI</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {verticals.filter(v => parseFloat(v.multiplier) < 1.5).map((v) => (
                <Link key={v.name} to={`/industries/${v.slug}` as any}
                  className="group flex items-center gap-3 rounded-xl border border-gray-100 p-3.5 transition-all duration-300 hover:shadow-md hover:border-gray-200 bg-white"
                >
                  <span className="text-lg shrink-0">{v.icon}</span>
                  <div className="text-xs font-semibold text-gray-800 truncate">{v.name}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Service Tiers */}
        <section id="services" className="px-6 py-20 lg:py-32 bg-slate-50 dark:bg-slate-900/50">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16 text-center">
              <h2 className="text-3xl lg:text-5xl font-bold mb-4">Pricing & Service Models</h2>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Transparent pricing to suit every stage of your automation journey.
              </p>
            </div>

            {/* Audit Section */}
            <div className="mb-20">
              <h3 className="text-2xl font-bold mb-8 text-indigo-600 border-b-2 border-indigo-100 pb-2 inline-block">1. Efficiency Audits</h3>
              <div className="grid md:grid-cols-3 gap-8">
                {auditTiers.map((t) => (
                  <div key={t.name} className="flex flex-col p-8 bg-white dark:bg-slate-800 border rounded-2xl shadow-sm">
                    <h4 className="text-xl font-bold mb-2">{t.name}</h4>
                    <div className="text-3xl font-extrabold text-indigo-600 mb-4">{t.price}</div>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 flex-1">{t.description}</p>
                    <ul className="space-y-3 mb-8">
                      {t.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <a href={t.link} className="w-full text-center bg-gray-900 dark:bg-slate-700 text-white py-3 rounded-lg font-bold hover:opacity-90 transition-opacity">
                      {t.cta}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Implementation Section */}
            <div className="mb-20">
              <h3 className="text-2xl font-bold mb-8 text-indigo-600 border-b-2 border-indigo-100 pb-2 inline-block">2. Implementation Packages</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                {implementationPackages.map((t) => (
                  <div key={t.name} className="flex flex-col p-6 bg-white dark:bg-slate-800 border rounded-2xl shadow-sm">
                    <h4 className="text-lg font-bold mb-1">{t.name}</h4>
                    <div className="text-2xl font-extrabold text-indigo-600 mb-3">{t.price}</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex-1">{t.description}</p>
                    <ul className="space-y-2 mb-6">
                      {t.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs">
                          <svg className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <a href={t.link} className="w-full text-center bg-gray-900 dark:bg-slate-700 text-white py-2 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity">
                      {t.cta}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Ops Section */}
            <div className="mb-20">
              <h3 className="text-2xl font-bold mb-8 text-indigo-600 border-b-2 border-indigo-100 pb-2 inline-block">3. Monthly AI Operations</h3>
              <div className="grid md:grid-cols-3 gap-8">
                {monthlyOps.map((t) => (
                  <div key={t.name} className="flex flex-col p-8 bg-white dark:bg-slate-800 border rounded-2xl shadow-sm">
                    <h4 className="text-xl font-bold mb-2">{t.name}</h4>
                    <div className="text-3xl font-extrabold text-indigo-600 mb-4">{t.price}</div>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 flex-1">{t.description}</p>
                    <ul className="space-y-3 mb-8">
                      {t.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <a href={t.link} className="w-full text-center bg-gray-900 dark:bg-slate-700 text-white py-3 rounded-lg font-bold hover:opacity-90 transition-opacity">
                      {t.cta}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Tables Section */}
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Add-ons Table */}
              <div>
                <h3 className="text-2xl font-bold mb-6 text-indigo-600 border-b-2 border-indigo-100 pb-2 inline-block">4. Optional Add-ons</h3>
                <div className="bg-white dark:bg-slate-800 border rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-700">
                      <tr>
                        <th className="px-6 py-4 font-bold text-sm">Add-on</th>
                        <th className="px-6 py-4 font-bold text-sm text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optionalAddOns.map((item, i) => (
                        <tr key={item.name} className={i % 2 === 0 ? "bg-white dark:bg-slate-800" : "bg-slate-50/50 dark:bg-slate-700/50"}>
                          <td className="px-6 py-3 text-sm">{item.name}</td>
                          <td className="px-6 py-3 text-sm font-bold text-indigo-600 text-right">{item.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Vertical Pricing Table */}
              <div>
                <h3 className="text-2xl font-bold mb-6 text-indigo-600 border-b-2 border-indigo-100 pb-2 inline-block">5. Vertical-Specific Pricing</h3>
                <div className="bg-white dark:bg-slate-800 border rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-700">
                      <tr>
                        <th className="px-6 py-4 font-bold text-sm">Vertical</th>
                        <th className="px-6 py-4 font-bold text-sm text-right">Starting Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verticalPricing.map((item, i) => (
                        <tr key={item.vertical} className={i % 2 === 0 ? "bg-white dark:bg-slate-800" : "bg-slate-50/50 dark:bg-slate-700/50"}>
                          <td className="px-6 py-3 text-sm">{item.vertical}</td>
                          <td className="px-6 py-3 text-sm font-bold text-indigo-600 text-right">{item.startingPrice}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section id="contact" className="px-6 py-20 lg:py-32">
          <div className="max-w-4xl mx-auto bg-indigo-600 rounded-3xl p-8 lg:p-16 text-center text-white">
            <h2 className="text-3xl lg:text-5xl font-bold mb-6">Live a simpler life today.</h2>
            <p className="text-xl text-indigo-100 mb-10">
              Join leading operations teams using {businessName} to automate manual work and reclaim your team&apos;s time.
            </p>
            <a href="#contact" className="inline-block bg-white text-indigo-600 px-10 py-4 rounded-xl font-bold text-lg hover:bg-indigo-50 transition-colors shadow-xl">
              Schedule Your Free Audit
            </a>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-xl font-bold text-indigo-600">{businessName}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} {businessName}. All rights reserved.
          </div>
          <div className="flex flex-col items-center md:items-end gap-2">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
              <a href="mailto:contact@simplerlife100.com" className="hover:text-indigo-600 transition-colors">contact@simplerlife100.com</a>
            </div>
            <div className="flex gap-6">
              <a href="#" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">Twitter</a>
              <a href="#" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">LinkedIn</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
