import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { readFile } from 'node:fs/promises';
import { getUser, submitLead } from '~/db/queries';

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

export const Route = createFileRoute('/build')({
  loader: () => getPageData(),
  component: BuildBuilder,
});

const basePackages = [
  {
    id: 'starter',
    name: 'Starter',
    price: 7500,
    features: ['2 AI agents', '3 workflows', 'CRM integration', '30 days support'],
    stripeLink: 'https://buy.stripe.com/9B6eVe0wCcFe48ucot3Ru01',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 15000,
    features: ['5 AI agents', 'Cross-dept workflows', 'CRM+ERP', 'Dashboards', '60 days support'],
    stripeLink: 'https://buy.stripe.com/8x25kE5QW7kUdJ44W13Ru02',
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 30000,
    features: ['Unlimited workflows', 'Custom agents', 'Advanced integrations', '90 days support'],
    stripeLink: 'https://buy.stripe.com/7sY4gAenscFefRccot3Ru03',
  },
];

const addOns = [
  { id: 'extra-agent', name: 'Additional AI Agent', price: 1500, stripeLink: 'https://buy.stripe.com/8x26oIensbBa0Wi4W13Ru07' },
  { id: 'crm', name: 'CRM Integration', price: 2000, stripeLink: 'https://buy.stripe.com/8x2dRaa7cax66gC0FL3Ru08' },
  { id: 'erp', name: 'ERP Integration', price: 3500, stripeLink: 'https://buy.stripe.com/aFa9AUa7c7kUawSdsx3Ru09' },
  { id: 'voice', name: 'Voice AI Receptionist', price: 3000, stripeLink: 'https://buy.stripe.com/dRmeVedjo5cM34qewB3Ru0a' },
  { id: 'sales', name: 'AI Sales Assistant', price: 4000, stripeLink: 'https://buy.stripe.com/28EcN61AGax6bAW3RX3Ru0b' },
  { id: 'support', name: 'AI Customer Support Agent', price: 4000, stripeLink: 'https://buy.stripe.com/fZu3cw3IO20AeN8ewB3Ru0c' },
  { id: 'dashboard', name: 'Custom Dashboard', price: 2500, stripeLink: 'https://buy.stripe.com/5kQ7sM3IO20AgVgewB3Ru0d' },
  { id: 'doc-ai', name: 'Document AI System', price: 3500, stripeLink: 'https://buy.stripe.com/7sY5kEa7cdJi7kG9ch3Ru0e' },
  { id: 'knowledge', name: 'Internal Knowledge Assistant', price: 3000, stripeLink: 'https://buy.stripe.com/00w28s3IO8oYbAW9ch3Ru0f' },
  { id: 'training', name: 'Employee Training', price: 1500, stripeLink: 'https://buy.stripe.com/3cI00k0wC0Ww8oKbkp3Ru0g' },
  { id: 'dept-auto', name: 'Additional Department Automation', price: 5000, stripeLink: 'https://buy.stripe.com/cNi00ka7ceNmdJ49ch3Ru0h' },
];

function BuildBuilder() {
  const { businessName } = Route.useLoaderData();
  const [selectedBase, setSelectedBase] = useState(basePackages[0]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleCheckout = async () => {
    // Capture lead info first
    try {
      await submitLead({
        data: {
          name: formData.name,
          email: formData.email,
          company: formData.company,
          selectedBase: selectedBase.name,
          basePrice: selectedBase.price,
        }
      });
    } catch (_err) {
      // Lead capture is optional — proceed to checkout either way
    }
    // Open Stripe checkout in a new tab
    window.open(selectedBase.stripeLink, '_blank', 'noopener,noreferrer');
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex flex-col min-h-screen selection:bg-emerald-100 selection:text-emerald-900">
        <header className="px-6 py-6 bg-white border-b border-stone-100">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <Link to="/" className="text-2xl font-black text-emerald-600 tracking-tight">
              {businessName}
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6 bg-stone-50">
          <div className="max-w-xl w-full bg-white p-12 rounded-[3rem] shadow-xl text-center border border-stone-100">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-8">
              ✅
            </div>
            <h1 className="text-4xl font-black text-stone-900 mb-6">Checkout Started!</h1>
            <p className="text-xl text-stone-600 leading-relaxed mb-10">
              Thanks {formData.name || 'there'}! Your <strong>{selectedBase.name}</strong> package checkout has opened in a new tab. Complete your purchase to get started immediately.
            </p>
            <p className="text-stone-500 mb-10">
              You can add individual add-ons below anytime after purchase from your portal billing page.
            </p>
            <Link to="/" className="inline-block bg-emerald-600 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
              Back to Homepage
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-100 selection:text-emerald-900">
      <header className="px-6 py-6 bg-white sticky top-0 z-50 border-b border-stone-100 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-600 tracking-tight">
            {businessName}
          </Link>
          <nav className="flex gap-8 items-center">
            <Link to="/" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Home</Link>
            <Link to="/support" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Support</Link>
            <Link to="/contact" className="text-sm font-bold text-stone-600 hover:text-emerald-600 transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 bg-stone-50 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16 text-center">
            <h1 className="text-5xl lg:text-6xl font-black text-stone-900 mb-6 tracking-tight">Implementation Builder</h1>
            <p className="text-xl text-stone-500 max-w-2xl mx-auto">
              Configure your custom AI automation package. We'll review your build and send a payment link to get started.
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleCheckout(); }} className="space-y-16">
            {/* Step 1: Company Info */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black">1</div>
                <h2 className="text-2xl font-black text-stone-900">Company Information</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-2">Your Name</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-2">Work Email</label>
                  <input
                    required
                    type="email"
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-2">Company Name</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* Step 2: Base Package */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black">2</div>
                <h2 className="text-2xl font-black text-stone-900">Select Base Package</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {basePackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedBase(pkg)}
                    className={`cursor-pointer p-8 rounded-[2rem] border-2 transition-all ${
                      selectedBase.id === pkg.id
                        ? 'border-emerald-600 bg-emerald-50/30 shadow-xl shadow-emerald-100/50'
                        : 'border-stone-100 bg-white hover:border-stone-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-2xl font-black text-stone-900">{pkg.name}</h3>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedBase.id === pkg.id ? 'border-emerald-600 bg-emerald-600' : 'border-stone-200'
                      }`}>
                        {selectedBase.id === pkg.id && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div className="text-3xl font-black text-emerald-600 mb-6">
                      ${pkg.price.toLocaleString()}
                    </div>
                    <ul className="space-y-3">
                      {pkg.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-stone-600 text-sm font-medium">
                          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Step 3: Add-ons */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black">3</div>
                <h2 className="text-2xl font-black text-stone-900">Customize with Add-ons</h2>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {addOns.map((addon) => (
                  <div
                    key={addon.id}
                    className="p-6 rounded-2xl border-2 border-stone-100 bg-white hover:border-stone-200 transition-all flex flex-col justify-between items-start gap-4"
                  >
                    <div>
                      <div className="font-bold text-stone-900">{addon.name}</div>
                      <div className="text-emerald-600 font-black mt-1">+${addon.price.toLocaleString()}</div>
                    </div>
                    <a
                      href={addon.stripeLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block bg-stone-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-stone-800 transition-all"
                    >
                      Buy Now →
                    </a>
                  </div>
                ))}
              </div>
            </section>

            {/* Sticky Total Bar */}
            <div className="sticky bottom-8 z-40 bg-stone-900 text-white p-6 lg:p-8 rounded-[2.5rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 border border-white/10 backdrop-blur-lg">
              <div>
                <div className="text-stone-400 font-bold uppercase tracking-widest text-xs mb-1">Your Package</div>
                <div className="text-4xl font-black">
                  ${selectedBase.price.toLocaleString()}
                  <span className="text-lg text-stone-400 font-normal ml-3">One-time payment</span>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <span className="text-stone-400 text-sm">{selectedBase.name}</span>
                <a
                  href={selectedBase.stripeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full md:w-auto bg-emerald-600 text-white px-12 py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all hover:scale-[1.02] active:scale-[0.98] inline-block text-center"
                >
                  Buy ${selectedBase.price.toLocaleString()} →
                </a>
              </div>
            </div>
          </form>
        </div>
      </main>

      <footer className="px-6 py-12 border-t border-stone-100 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-stone-400 text-sm">
          <div className="font-black text-emerald-600 text-xl">{businessName}</div>
          <div>&copy; {new Date().getFullYear()} {businessName}. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
