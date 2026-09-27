import { createFileRoute, Link } from '@tanstack/react-router';
;
import { Footer } from '~/components/Footer';
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/support')({
  head: () => pageHead("/support"),
  component: SupportPage,
});

const supportTiers = [
  {
    name: 'Starter',
    monthly: '$199',
    period: '/mo',
    setup: '+ $500 onboarding',
    description: 'Built-in support for firms up to ~30 people getting started on the platform.',
    features: [
      'All native capabilities included',
      'Standard support (email)',
      'Onboarding to your first workflows',
      'Self-serve help + documentation',
      'Automation Sprint available when you need it',
    ],
    cta: 'See Pricing',
    link: '/pricing',
    popular: false,
  },
  {
    name: 'Growth',
    monthly: '$599',
    period: '/mo',
    setup: '+ $1,500 onboarding',
    description: 'For firms scaling from ~30 to 100 people with more automations in flight.',
    features: [
      'All native capabilities included',
      'Priority support',
      'Governance: multi-step approvals + autonomy allow-lists',
      'Higher scale limits',
      'Onboarding to your first workflows',
    ],
    cta: 'See Pricing',
    link: '/pricing',
    popular: true,
  },
  {
    name: 'Enterprise',
    monthly: '$1,499',
    period: '/mo',
    setup: 'onboarding included',
    description: 'For larger or regulated operations that need dedicated support and custom builds.',
    features: [
      'All native capabilities included',
      'Dedicated support',
      'Custom on-demand vendor-API builds (SAP, SuiteScript)',
      'Highest scale limits',
      'Advanced governance + autonomy allow-lists',
    ],
    cta: 'Contact for Quote',
    link: '/contact',
    popular: false,
  },
];

function SupportPage() {
  const businessName = 'Simpler Life 100';

  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-100 selection:text-emerald-900">
      <header className="px-6 py-6 bg-stone-950 sticky top-0 z-50 border-b border-stone-800 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-400 tracking-tight">
            {businessName}
          </Link>
          <nav className="flex gap-8 items-center">
            <Link to="/" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Home</Link>
            <Link to="/build" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Builder</Link>
            <Link to="/contact" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 bg-stone-900 py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h1 className="text-5xl lg:text-7xl font-black text-white mb-6 tracking-tight">Managed AI Operations</h1>
            <p className="text-xl text-stone-400 max-w-3xl mx-auto leading-relaxed">
              Model rot and prompt drift are real. We keep your automations running at peak performance while continuously building new workflows for your team.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-start">
            {supportTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative bg-stone-950 p-10 lg:p-12 rounded-[3rem] shadow-xl border-2 transition-all ${
                  tier.popular ? 'border-emerald-600 scale-105 z-10' : 'border-stone-50 hover:border-stone-200'
                }`}
              >
                {tier.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-600 text-white px-6 py-1.5 rounded-full text-sm font-black uppercase tracking-widest shadow-lg shadow-emerald-200">
                    Most Popular
                  </div>
                )}
                <div className="mb-8">
                  <h3 className="text-2xl font-black text-white mb-2">{tier.name}</h3>
                  <p className="text-stone-400 font-medium leading-relaxed">{tier.description}</p>
                </div>
                <div className="mb-8">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black text-stone-900">{tier.monthly}</span>
                    <span className="text-xl text-stone-400 font-bold">{tier.period}</span>
                  </div>
                  <p className="text-emerald-600 font-black mt-1">{tier.setup}</p>
                </div>
                <ul className="space-y-4 mb-10">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-stone-600">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={tier.link}
                  className={`block w-full text-center py-5 rounded-2xl font-black text-xl transition-all shadow-lg ${
                    tier.popular
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100 hover:scale-[1.02]'
                      : 'bg-stone-900 text-white hover:bg-stone-800'
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>

          <div className="mt-24 max-w-4xl mx-auto bg-stone-950 p-12 rounded-[3rem] shadow-xl border border-stone-800 text-center">
            <h2 className="text-3xl font-black text-white mb-6 tracking-tight italic">
              "We treat your AI like a real employee. We don't just build it and walk away — we manage, train, and improve it every month."
            </h2>
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white text-lg font-black">SL</div>
              <div className="text-left">
                <div className="font-black text-stone-900">Simpler Life 100 Operations Team</div>
                <div className="text-sm text-stone-400 font-bold uppercase tracking-widest">Scale with confidence</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-12 border-t border-stone-800 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-stone-400 text-sm">
          <div className="font-black text-emerald-400 text-xl">{businessName}</div>
          <div className="flex gap-8 font-bold">
            <Link to="/" className="hover:text-emerald-600">Home</Link>
            <Link to="/build" className="hover:text-emerald-600">Builder</Link>
            <Link to="/contact" className="hover:text-emerald-600">Contact</Link>
          </div>
          <div>&copy; {new Date().getFullYear()} {businessName}. All rights reserved.</div>
        </div>
      </footer>
    <Footer />
    </div>
  );
}
