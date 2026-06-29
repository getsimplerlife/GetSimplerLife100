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

const tiers = [
  {
    name: "QuickScan™ Audit",
    price: "$997",
    description: "Quick diagnostic of your biggest automation opportunities across one workflow. 24-hour turnaround.",
    features: ["1 industry package diagnostic", "Executive summary", "Risk score", "24-hour turnaround"],
    link: "https://buy.stripe.com/14AeVdaEE2qv5xQbta08g0b",
    cta: "Buy Now — $997",
  },
  {
    name: "Deep Audit™",
    price: "$4,997",
    description: "Full vertical-specific waste audit: map waste points, quantify automation ROI, deliver a custom roadmap.",
    features: ["Full industry diagnostic", "Cost savings analysis", "Custom automation roadmap", "Compliance review"],
    link: "https://buy.stripe.com/7sYcN52880in0dwdBi08g0c",
    cta: "Buy Now — $4,997",
  },
  {
    name: "Starter Package",
    price: "$1,500",
    description: "Up to 3 custom workflow automations. Perfect for testing automation in one department.",
    features: ["Up to 3 workflow automations", "Lead capture & response", "Calendar sync", "Email support"],
    link: "https://buy.stripe.com/28E9AT6oofdhaSaeFm08g0d",
    cta: "Buy Now — $1,500",
  },
  {
    name: "Growth Package",
    price: "$3,000",
    description: "Up to 8 workflow automations with CRM integration and priority support.",
    features: ["Up to 8 workflow automations", "CRM integration & data sync", "Client onboarding automation", "Monthly optimization review"],
    link: "https://buy.stripe.com/cNi28r9AA1mr4tMbta08g0e",
    cta: "Buy Now — $3,000",
  },
  {
    name: "Scale Package",
    price: "$5,000",
    description: "Unlimited workflow automations with multi-app integration and dedicated support.",
    features: ["Unlimited custom workflows", "Multi-app integration", "Custom AI agent training", "Weekly performance reports"],
    link: "https://buy.stripe.com/5kQbJ14ggc150dwgNu08g0f",
    cta: "Buy Now — $5,000",
  },
  {
    name: "Managed Automation™",
    price: "$997/mo",
    description: "Ongoing automation management with monitoring, governance, and continuous improvement.",
    features: ["Continuous monitoring", "Monthly performance reports", "AI governance", "Ongoing maintenance"],
    link: "https://buy.stripe.com/5kQeVd1443uz1hAcxe08g0g",
    cta: "Subscribe — $997/mo",
  },
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
              <a href="https://buy.stripe.com/dRm6oHeUUfdh8K27cU08g09" className="bg-indigo-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-indigo-700 transition-colors">
                Book an Efficiency Audit
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
              <h2 className="text-3xl lg:text-5xl font-bold mb-4">Service Models</h2>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Flexible engagement options to suit your automation maturity.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {tiers.map((t) => (
                <div key={t.name} className="flex flex-col p-8 bg-white dark:bg-slate-800 border rounded-2xl shadow-sm">
                  <h3 className="text-xl font-bold mb-2">{t.name}</h3>
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
        </section>

        {/* CTA Section */}
        <section id="contact" className="px-6 py-20 lg:py-32">
          <div className="max-w-4xl mx-auto bg-indigo-600 rounded-3xl p-8 lg:p-16 text-center text-white">
            <h2 className="text-3xl lg:text-5xl font-bold mb-6">Live a simpler life today.</h2>
            <p className="text-xl text-indigo-100 mb-10">
              Join leading operations teams using {businessName} to automate manual work and reclaim your team&apos;s time.
            </p>
            <a href="https://buy.stripe.com/dRm6oHeUUfdh8K27cU08g09" className="inline-block bg-white text-indigo-600 px-10 py-4 rounded-xl font-bold text-lg hover:bg-indigo-50 transition-colors shadow-xl">
              Get Your ROI Audit
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
