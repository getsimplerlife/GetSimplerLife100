import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { readFile } from 'node:fs/promises';
import { getUser } from '~/db/queries';

const getPageData = createServerFn({ method: 'GET' }).handler(async () => {
  let businessName = 'Simpler Life 100';
  try {
    const cfg = JSON.parse(await readFile('site.json', 'utf8')) as {
      businessName?: string;
    };
    businessName = cfg.businessName?.trim() ?? 'Simpler Life 100';
  } catch (_err) {
    // Ignore error
  }

  const user = await getUser();
  return { businessName, user };
});

export const Route = createFileRoute('/support')({
  loader: () => getPageData(),
  component: SupportPage,
});

const supportTiers = [
  {
    name: 'Essential Ops',
    price: '$750',
    period: '/mo',
    description: 'Perfect for small teams with 1-2 key AI agents that need to stay reliable.',
    features: [
      'Monitoring & bug fixes',
      'Prompt updates',
      'Monthly optimization',
      'Email support',
      '12-hour response time',
    ],
    cta: 'Buy Essential Ops',
    link: 'https://buy.stripe.com/test_essential', // Placeholder
    popular: false,
  },
  {
    name: 'Professional Ops',
    price: '$2,000',
    period: '/mo',
    description: 'Our most popular choice for growing businesses scaling their AI automation.',
    features: [
      'Everything in Essential',
      'New automations each month',
      'AI model improvements',
      'Monthly strategy call',
      'Priority email & Slack support',
      '4-hour response time',
    ],
    cta: 'Buy Professional Ops',
    link: 'https://buy.stripe.com/test_professional', // Placeholder
    popular: true,
  },
  {
    name: 'Enterprise Ops',
    price: '$5,000',
    period: '/mo+',
    description: 'Custom-built managed operations for large scale multi-department AI systems.',
    features: [
      'Everything in Professional',
      'Unlimited optimization',
      'Dedicated AI engineer',
      'Priority support',
      'Quarterly roadmap review',
      'Custom SLA',
    ],
    cta: 'Contact for Quote',
    link: '/contact',
    popular: false,
  },
];

function SupportPage() {
  const { businessName, user } = Route.useLoaderData();

  return (
    <div className="flex flex-col min-h-screen selection:bg-indigo-100 selection:text-indigo-900">
      <header className="px-6 py-6 bg-white sticky top-0 z-50 border-b border-slate-100 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-indigo-600 tracking-tight">
            {businessName}
          </Link>
          <nav className="flex gap-8 items-center">
            <Link to="/" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Home</Link>
            <Link to="/build" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Builder</Link>
            <Link to="/contact" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 bg-slate-50 py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h1 className="text-5xl lg:text-7xl font-black text-slate-900 mb-6 tracking-tight">Managed AI Operations</h1>
            <p className="text-xl text-slate-500 max-w-3xl mx-auto leading-relaxed">
              Model rot and prompt drift are real. We keep your AI employees running at peak performance while continuously building new automations for your team.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-start">
            {supportTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative bg-white p-10 lg:p-12 rounded-[3rem] shadow-xl border-2 transition-all ${
                  tier.popular ? 'border-indigo-600 scale-105 z-10' : 'border-slate-50 hover:border-slate-200'
                }`}
              >
                {tier.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white px-6 py-1.5 rounded-full text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-200">
                    Most Popular
                  </div>
                )}
                <div className="mb-8">
                  <h3 className="text-2xl font-black text-slate-900 mb-2">{tier.name}</h3>
                  <p className="text-slate-500 font-medium leading-relaxed">{tier.description}</p>
                </div>
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-5xl font-black text-slate-900">{tier.price}</span>
                  <span className="text-xl text-slate-400 font-bold">{tier.period}</span>
                </div>
                <ul className="space-y-4 mb-10">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-slate-600">
                      <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
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
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 hover:scale-[1.02]'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>

          <div className="mt-24 max-w-4xl mx-auto bg-white p-12 rounded-[3rem] shadow-xl border border-slate-100 text-center">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tight italic">
              "We treat your AI like a real employee. We don't just build it and walk away — we manage, train, and improve it every month."
            </h2>
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white text-lg font-black">SL</div>
              <div className="text-left">
                <div className="font-black text-slate-900">Simpler Life 100 Operations Team</div>
                <div className="text-sm text-slate-400 font-bold uppercase tracking-widest">Scale with confidence</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-12 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-slate-400 text-sm">
          <div className="font-black text-indigo-600 text-xl">{businessName}</div>
          <div className="flex gap-8 font-bold">
            <Link to="/" className="hover:text-indigo-600">Home</Link>
            <Link to="/build" className="hover:text-indigo-600">Builder</Link>
            <Link to="/contact" className="hover:text-indigo-600">Contact</Link>
          </div>
          <div>&copy; {new Date().getFullYear()} {businessName}. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
