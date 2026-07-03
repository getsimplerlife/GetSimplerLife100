import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';

async function getPageData() {
  let businessName = 'Simpler Life 100';
  try {
    const cfg = JSON.parse(await readFile('site.json', 'utf8')) as {
      businessName?: string;
    };
    businessName = cfg.businessName?.trim() ?? 'Simpler Life 100';
  } catch (_err) {
    // Ignore error
  }

  let user = null;
  try {
    const res = await fetch("/api/me");
    if (res.ok) user = await res.json();
  } catch {}
  return { businessName, user };
}

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
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 15000,
    features: ['5 AI agents', 'Cross-dept workflows', 'CRM+ERP', 'Dashboards', '60 days support'],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 30000,
    features: ['Unlimited workflows', 'Custom agents', 'Advanced integrations', '90 days support'],
  },
];

const addOns = [
  { id: 'extra-agent', name: 'Additional AI Agent', price: 1500 },
  { id: 'crm', name: 'CRM Integration', price: 2000 },
  { id: 'erp', name: 'ERP Integration', price: 3500 },
  { id: 'voice', name: 'Voice AI Receptionist', price: 3000 },
  { id: 'sales', name: 'AI Sales Assistant', price: 4000 },
  { id: 'support', name: 'AI Customer Support Agent', price: 4000 },
  { id: 'dashboard', name: 'Custom Dashboard', price: 2500 },
  { id: 'doc-ai', name: 'Document AI System', price: 3500 },
  { id: 'knowledge', name: 'Internal Knowledge Assistant', price: 3000 },
  { id: 'training', name: 'Employee Training', price: 1500 },
  { id: 'dept-auto', name: 'Additional Department Automation', price: 5000 },
];

function BuildBuilder() {
  const { businessName, user } = Route.useLoaderData();
  const [selectedBase, setSelectedBase] = useState(basePackages[0]);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleAddOn = (id: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const totalAddOnsPrice = selectedAddOns.reduce((acc, id) => {
    const addOn = addOns.find((a) => a.id === id);
    return acc + (addOn?.price || 0);
  }, 0);

  const total = selectedBase.price + totalAddOnsPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    const config = {
      ...formData,
      selectedBase: selectedBase.name,
      basePrice: selectedBase.price,
      selectedAddOns: selectedAddOns.map(id => addOns.find(a => a.id === id)?.name),
      addOnsTotal: totalAddOnsPrice,
      total,
    };

    try {
      await fetch('/api/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit build:', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col min-h-screen selection:bg-indigo-100 selection:text-indigo-900">
        <header className="px-6 py-6 bg-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <Link to="/" className="text-2xl font-black text-indigo-600 tracking-tight">
              {businessName}
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6 bg-slate-50">
          <div className="max-w-xl w-full bg-white p-12 rounded-[3rem] shadow-xl text-center border border-slate-100">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-8">
              ✅
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-6">Build Received!</h1>
            <p className="text-xl text-slate-600 leading-relaxed mb-10">
              Thanks {formData.name}! We've received your build configuration. Our team will review it and send you a custom payment link within 24 hours.
            </p>
            <Link to="/" className="inline-block bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
              Back to Homepage
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen selection:bg-indigo-100 selection:text-indigo-900">
      <header className="px-6 py-6 bg-white sticky top-0 z-50 border-b border-slate-100 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-indigo-600 tracking-tight">
            {businessName}
          </Link>
          <nav className="flex gap-8 items-center">
            <Link to="/" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Home</Link>
            <Link to="/support" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Support</Link>
            <Link to="/contact" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 bg-slate-50 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16 text-center">
            <h1 className="text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">Implementation Builder</h1>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto">
              Configure your custom AI automation package. We'll review your build and send a payment link to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-16">
            {/* Step 1: Company Info */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black">1</div>
                <h2 className="text-2xl font-black text-slate-900">Company Information</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Your Name</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Work Email</label>
                  <input
                    required
                    type="email"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Company Name</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* Step 2: Base Package */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black">2</div>
                <h2 className="text-2xl font-black text-slate-900">Select Base Package</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {basePackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedBase(pkg)}
                    className={`cursor-pointer p-8 rounded-[2rem] border-2 transition-all ${
                      selectedBase.id === pkg.id
                        ? 'border-indigo-600 bg-indigo-50/30 shadow-xl shadow-indigo-100/50'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-2xl font-black text-slate-900">{pkg.name}</h3>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedBase.id === pkg.id ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200'
                      }`}>
                        {selectedBase.id === pkg.id && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div className="text-3xl font-black text-indigo-600 mb-6">
                      ${pkg.price.toLocaleString()}
                    </div>
                    <ul className="space-y-3">
                      {pkg.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-slate-600 text-sm font-medium">
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
                <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black">3</div>
                <h2 className="text-2xl font-black text-slate-900">Customize with Add-ons</h2>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {addOns.map((addon) => (
                  <div
                    key={addon.id}
                    onClick={() => toggleAddOn(addon.id)}
                    className={`cursor-pointer p-6 rounded-2xl border-2 transition-all flex justify-between items-center ${
                      selectedAddOns.includes(addon.id)
                        ? 'border-indigo-600 bg-indigo-50/30 shadow-md'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">{addon.name}</div>
                      <div className="text-indigo-600 font-black">+${addon.price.toLocaleString()}</div>
                    </div>
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                      selectedAddOns.includes(addon.id) ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200'
                    }`}>
                      {selectedAddOns.includes(addon.id) && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Sticky Total Bar */}
            <div className="sticky bottom-8 z-40 bg-slate-900 text-white p-6 lg:p-8 rounded-[2.5rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 border border-white/10 backdrop-blur-lg">
              <div>
                <div className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Your Total Build Price</div>
                <div className="text-4xl font-black">
                  ${total.toLocaleString()}
                  <span className="text-lg text-slate-400 font-normal ml-3">One-time payment</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full md:w-auto bg-indigo-600 text-white px-12 py-5 rounded-2xl font-black text-xl hover:bg-indigo-700 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit My Build →'}
              </button>
            </div>
          </form>
        </div>
      </main>

      <footer className="px-6 py-12 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-slate-400 text-sm">
          <div className="font-black text-indigo-600 text-xl">{businessName}</div>
          <div>&copy; {new Date().getFullYear()} {businessName}. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
