import { Link } from "@tanstack/react-router";

export interface IndustryConfig {
  id: string;
  name: string;
  icon: string;
  accent: string;
  bgLight: string;
  tagline: string;
  hook: string;
  painPoints: string[];
  quickScanFeatures: string[];
  deepAuditFeatures: string[];
  kpiOne: { value: string; label: string };
  kpiTwo: { value: string; label: string };
  kpiThree: { value: string; label: string };
  services?: { name: string; description: string }[];
}

export default function IndustryLanding({ config }: { config: IndustryConfig }) {
  const c = config;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <header className="px-6 py-4 border-b bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight">
            Simpler Life 100
          </Link>
          <Link to="/" className="text-sm font-medium hover:text-indigo-600 transition-colors underline decoration-2 underline-offset-4">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className={`px-6 py-20 lg:py-28 ${c.bgLight} dark:bg-slate-900/50`}>
          <div className="max-w-5xl mx-auto text-center">
            <span className="inline-block text-5xl mb-6">{c.icon}</span>
            <div className="inline-block px-3 py-1 mb-4 text-sm font-semibold rounded-full bg-white/80 dark:bg-slate-800 shadow-sm">
              Simpler Life 100 &mdash; {c.name} Solutions
            </div>
            <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6" style={{ color: c.accent }}>
              {c.name} AI Coworkers
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto mb-4">
              {c.tagline}
            </p>
            <p className="text-base text-gray-500 dark:text-gray-400 max-w-3xl mx-auto">
              {c.hook}
            </p>
          </div>
        </section>

        {/* KPIs */}
        <section className="px-6 py-16 max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-8 bg-white dark:bg-slate-800 border rounded-2xl shadow-sm">
              <div className="text-4xl font-black mb-2" style={{ color: c.accent }}>{c.kpiOne.value}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{c.kpiOne.label}</div>
            </div>
            <div className="text-center p-8 bg-white dark:bg-slate-800 border rounded-2xl shadow-sm">
              <div className="text-4xl font-black mb-2" style={{ color: c.accent }}>{c.kpiTwo.value}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{c.kpiTwo.label}</div>
            </div>
            <div className="text-center p-8 bg-white dark:bg-slate-800 border rounded-2xl shadow-sm">
              <div className="text-4xl font-black mb-2" style={{ color: c.accent }}>{c.kpiThree.value}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{c.kpiThree.label}</div>
            </div>
          </div>
        </section>

        {/* Pain Points */}
        <section className="px-6 py-16 bg-slate-50 dark:bg-slate-900/30">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">Pain Points We Eliminate</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {c.painPoints.map((pp, i) => (
                <div key={i} className="flex gap-3 p-4 bg-white dark:bg-slate-800 border rounded-xl">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{ backgroundColor: c.accent }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{pp}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Audit Tiers */}
        <section className="px-6 py-16 max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold mb-4 text-center">Where is your team losing time?</h2>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-12 max-w-2xl mx-auto">
            Choose how you want to start. We'll identify your best opportunities for AI and build a roadmap to automate them.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Efficiency Audit */}
            <div className="flex flex-col p-8 bg-white dark:bg-slate-800 border rounded-2xl shadow-sm">
              <h3 className="text-xl font-bold mb-2">Efficiency Audit</h3>
              <div className="text-3xl font-extrabold mb-4" style={{ color: c.accent }}>FREE</div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                60-minute strategy call to find your best AI opportunities.
              </p>
              <ul className="space-y-2 mb-8 flex-1">
                {c.quickScanFeatures.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: c.accent }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/#contact"
                className="w-full text-center text-white py-3 rounded-lg font-bold hover:opacity-90 transition-opacity"
                style={{ backgroundColor: c.accent }}
              >
                Schedule Free Audit
              </Link>
            </div>

            {/* Deep-Dive Audit */}
            <div className="flex flex-col p-8 bg-white dark:bg-slate-800 border-2 rounded-2xl shadow-md relative">
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 text-white text-xs font-bold rounded-full"
                style={{ backgroundColor: c.accent }}
              >
                Most Popular
              </div>
              <h3 className="text-xl font-bold mb-2">Deep-Dive AI Audit</h3>
              <div className="text-3xl font-extrabold mb-4" style={{ color: c.accent }}>$2,500</div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                A technical roadmap for your business. We map your workflows and show exactly how AI coworkers will save you time.
              </p>
              <ul className="space-y-2 mb-8 flex-1">
                {c.deepAuditFeatures.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: c.accent }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00"
                className="w-full text-center text-white py-3 rounded-lg font-bold hover:opacity-90 transition-opacity"
                style={{ backgroundColor: c.accent }}
              >
                Buy Now — $2,500
              </a>
            </div>
          </div>
        </section>

        {/* Specific Services */}
        {c.services && c.services.length > 0 && (
          <section className="px-6 py-16 bg-white">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold mb-4 text-center">Available AI Coworker Blueprints for {c.name}</h2>
              <p className="text-center text-gray-500 dark:text-gray-400 mb-12 max-w-2xl mx-auto">
                Pre-built automation agents purpose-built for {c.name} workflows.
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {c.services.map((svc, i) => (
                  <div key={i} className="p-6 bg-white border rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold text-white" style={{ backgroundColor: c.accent }}>
                        {i + 1}
                      </div>
                      <h3 className="font-bold text-gray-900">{svc.name}</h3>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed">{svc.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="px-6 py-20 bg-slate-900 text-white text-center">
          <h2 className="text-3xl font-bold mb-6">Stop managing manual work. Start scaling.</h2>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            Your team shouldn't spend hours on work that software should already be doing. Let's identify where AI can save you the most time.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/" className="px-8 py-3 border border-slate-700 rounded-lg font-bold hover:bg-slate-800 transition-colors">
              Explore All Industries
            </Link>
            <Link
              to="/#contact"
              className="bg-indigo-600 px-8 py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors"
            >
              Book Your Free Assessment
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.
      </footer>
    </div>
  );
}
