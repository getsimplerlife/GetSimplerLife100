
import { useState } from "react";
import { Link } from "@tanstack/react-router";
;
import { Footer } from "~/components/Footer";
// LOCKED PLATFORM TIERS (owner 09-27) — one platform, every capability in
// every tier; no per-employee selling. The wizard collects the workflows you
// want first; the CTA goes to /pricing (subscription checkout follows the
// owner's Stripe switch).
const packages = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 199,
    setup: 500,
    features: ['100% of native capabilities', 'Records, forms, docs/e-sign, webhooks', 'Booking, boards, AI extraction', 'Surveys/NPS, transforms/EDI', 'Dashboards/BI, automations', 'Email support'],
    description: 'Firms ~10\u201330 people. The full platform for first automated workflows.',
  },
  {
    id: 'growth',
    name: 'Growth',
    monthly: 599,
    setup: 1500,
    features: ['100% of native capabilities (as Starter)', 'Higher scale limits', 'Multi-step approvals + autonomy allow-lists', 'Priority support'],
    description: 'Firms ~30\u2013100 people. Scale limits and governance for a growing ops team.',
  },
  {
    id: 'scale',
    name: 'Enterprise',
    monthly: 1499,
    setup: 0,
    features: ['100% of native capabilities (as Growth)', 'Highest scale limits', 'Advanced governance + allow-lists', 'Dedicated support', 'Custom on-demand vendor-API builds'],
    description: 'Larger or regulated operations. Custom builds on demand.',
  },
];
// All 18 agent types
const allAgents = [
  { id: 'records', name: 'Records & tables', icon: '🗂️', desc: 'Structured data store with per-tenant isolation and audit' },
  { id: 'forms', name: 'Forms', icon: '📝', desc: 'Build forms that write into records through the approval queue' },
  { id: 'docs', name: 'Docs, PDF & e-sign', icon: '📄', desc: 'Create, fill, sign and file documents natively' },
  { id: 'webhooks', name: 'Webhooks', icon: '🔌', desc: 'Typed events out and in — the backbone of every workflow' },
  { id: 'booking', name: 'Booking', icon: '🗓️', desc: 'Publish availability, take requests, confirm — timezone-exact' },
  { id: 'boards', name: 'Boards', icon: '📋', desc: 'Kanban-style work tracking with typed events' },
  { id: 'ai-extraction', name: 'AI extraction', icon: '🤖', desc: 'Pull structured fields from documents — output is always a draft' },
  { id: 'surveys', name: 'Surveys & NPS', icon: '📊', desc: 'Publish surveys, collect responses, aggregate feedback' },
  { id: 'transforms', name: 'Transforms & EDI', icon: '🔄', desc: 'JSON/CSV/XML/EDIFACT/X12 in-app with XXE-safe parsers' },
  { id: 'dashboards', name: 'Dashboards & BI', icon: '📈', desc: 'Reports, charts, scheduled delivery, threshold alerts' },
  { id: 'automations', name: 'Automations', icon: '⚙️', desc: 'Trigger → conditions → actions. Fail-closed, ledger-audited' },
  { id: 'approvals', name: 'Approval queue', icon: '🛡️', desc: 'Human approval by default; autonomy only via allow-lists' },
];
type Step = 'package' | 'agents' | 'info' | 'review' | 'success';

function BuildBuilder() {
  const businessName = 'Simpler Life 100';
  const [step, setStep] = useState<Step>('package');
  const [selectedPackage, setSelectedPackage] = useState(packages[0]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    company: '',
    name: '',
    email: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const toggleCapability = (id: string) => {
    setSelectedAgents((prev) => {
      if (prev.includes(id)) return prev.filter((a) => a !== id);
      return [...prev, id];
    });
  };
  const handlePackageSelect = (pkg: typeof packages[0]) => {
    setSelectedPackage(pkg);
  };
  };

  const validateAndNext = () => {
    if (step === 'package') {
      setStep('agents');
    } else if (step === 'agents') {
      if (selectedAgents.length === 0) {
        alert('Please choose at least one capability.'); // single platform — still good to confirm focus
        return;
      }
      setStep('info');
    } else if (step === 'info') {
      if (!formData.company || !formData.name || !formData.email || !formData.phone) {
        alert('Please fill in all fields.');
        return;
      }
      if (!formData.email.includes('@')) {
        alert('Please enter a valid email address.');
        return;
      }
      setStep('review');
    }
  };

  const handleSubmit = () => {
    setSubmitting(true);
    // Store build config in localStorage for post-payment retrieval
    const buildConfig = {
      package: selectedPackage.id,
      agents: selectedAgents,
      company: formData.company,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem('sl100_build_config', JSON.stringify(buildConfig));
    } catch {}

    // Redirect to Stripe checkout
    window.location.href = '/pricing';
  };

  if (step === 'success') {
    return (
      <div className="flex flex-col min-h-screen bg-stone-950">
        <header className="px-6 py-4 bg-stone-950/95 backdrop-blur-md sticky top-0 z-50 border-b border-stone-900">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <Link to="/" className="text-2xl font-black text-emerald-400 tracking-tight">{businessName}</Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-stone-900 p-12 rounded-[3rem] shadow-2xl text-center border border-stone-800">
            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center text-4xl mx-auto mb-8">
              ✅
            </div>
            <h1 className="text-4xl font-black text-white mb-6">Payment Initiated!</h1>
            <p className="text-xl text-stone-400 leading-relaxed mb-4">
              Thanks {formData.name}! You're being redirected to Stripe to complete your payment.
            </p>
            <p className="text-stone-500 mb-10">
              Once payment is confirmed, your AI operations team will be automatically provisioned and you'll receive an onboarding email.
            </p>
            <Link to="/" className="inline-block bg-emerald-600 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg">
              Back to Homepage
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-stone-950">
      <header className="px-6 py-4 bg-stone-950/95 backdrop-blur-md sticky top-0 z-50 border-b border-stone-900">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-400 tracking-tight">
            {businessName}
          </Link>
          <nav className="flex gap-6 items-center">
            <Link to="/" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Home</Link>
            <Link to="/faq" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">FAQ</Link>
            <Link to="/support" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Support</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 py-16 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-12 text-center">
            <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase mb-4">
              Build Your Platform
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white mb-4 tracking-tight">Deploy Your AI Operations Team</h1>
            <p className="text-lg text-stone-400 max-w-2xl mx-auto">
              Select your package, pick the capabilities that matter first, and get deployed in days — not months. One platform, every capability in every tier.
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-12">
            <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
              {(['package', 'agents', 'info', 'review'] as Step[]).map((s, i) => {
                const stepLabels = ['Package', 'Capabilities', 'Your Info', 'Review'];
                const isActive = step === s;
                const isDone = (['package', 'agents', 'info', 'review'].indexOf(step) > i);
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`flex items-center gap-2 ${isActive ? 'text-emerald-400' : isDone ? 'text-emerald-600' : 'text-stone-600'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${isActive ? 'bg-emerald-600 text-white' : isDone ? 'bg-emerald-500/20 text-emerald-400' : 'bg-stone-800 text-stone-500'}`}>
                        {isDone ? '✓' : i + 1}
                      </div>
                      <span className="hidden sm:inline text-xs font-mono font-bold">{stepLabels[i]}</span>
                    </div>
                    {i < 3 && <div className={`w-8 h-0.5 ${isDone ? 'bg-emerald-600' : 'bg-stone-800'}`} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="bg-stone-900 border border-stone-800 rounded-[2rem] p-8 lg:p-12 shadow-xl">
            {/* STEP 1: Package Selection */}
            {step === 'package' && (
              <div>
                <h2 className="text-2xl font-black text-white mb-2">Choose Your Package</h2>
                <p className="text-stone-400 mb-8">Select the tier that fits your team's automation needs.</p>
                <div className="grid md:grid-cols-3 gap-6">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      onClick={() => handlePackageSelect(pkg)}
                      className={`cursor-pointer p-8 rounded-[1.5rem] border-2 transition-all ${
                        selectedPackage.id === pkg.id
                          ? 'border-emerald-500 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
                          : 'border-stone-800 hover:border-stone-600'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-black text-white">{pkg.name}</h3>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          selectedPackage.id === pkg.id ? 'border-emerald-500 bg-emerald-500' : 'border-stone-600'
                        }`}>
                          {selectedPackage.id === pkg.id && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div className="text-3xl font-black text-emerald-400 mb-2">
                        {`$${pkg.monthly}/mo${pkg.setup > 0 ? ` · $${pkg.setup.toLocaleString()} setup` : ' · setup incl.'}`}
                      </div>
                      <p className="text-stone-500 text-sm mb-4">{pkg.description}</p>
                      <ul className="space-y-2">
                        {pkg.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-stone-400 text-sm font-medium">
                            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: Agent Selection */}
            {step === 'agents' && (
              <div>
                <h2 className="text-2xl font-black text-white mb-2">Choose Your Priority Capabilities</h2>
                <p className="text-stone-400 mb-2">
                  Every tier includes 100% of native capabilities. Pick which ones matter first for your <span className="text-emerald-400 font-bold">{selectedPackage.name}</span> plan.
                  for your <span className="text-emerald-400 font-bold">{selectedPackage.name}</span> package.
                </p>
                <div className="flex items-center gap-3 mb-8">
                  <div className="flex-1 h-2 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${(selectedAgents.length / allAgents.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono font-bold text-stone-400">
                    {selectedAgents.length}/{allAgents.length}
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allAgents.map((agent) => {
                    const isSelected = selectedAgents.includes(agent.id);
                    const isDisabled = !isSelected && false;
                    return (
                      <div
                        key={agent.id}
                        onClick={() => !isDisabled && toggleCapability(agent.id)}
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : isDisabled
                            ? 'border-stone-800/50 bg-stone-900/50 opacity-40 cursor-not-allowed'
                            : 'border-stone-800 hover:border-stone-600 bg-stone-950'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-2xl flex-shrink-0">{agent.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-white text-sm">{agent.name}</div>
                            <div className="text-stone-500 text-xs mt-0.5">{agent.desc}</div>
                          </div>
                          {isSelected && (
                            <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 3: Company Info */}
            {step === 'info' && (
              <div>
                <h2 className="text-2xl font-black text-white mb-2">Your Information</h2>
                <p className="text-stone-400 mb-8">Tell us where to deploy your automations.</p>
                <div className="grid md:grid-cols-2 gap-6 max-w-2xl">
                  <div>
                    <label className="block text-sm font-bold text-stone-300 mb-2">Company Name *</label>
                    <input
                      required
                      type="text"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder:text-stone-600"
                      placeholder="Acme Corp"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-300 mb-2">Your Name *</label>
                    <input
                      required
                      type="text"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder:text-stone-600"
                      placeholder="Jane Smith"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-300 mb-2">Work Email *</label>
                    <input
                      required
                      type="email"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder:text-stone-600"
                      placeholder="jane@acmecorp.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-300 mb-2">Phone Number *</label>
                    <input
                      required
                      type="tel"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder:text-stone-600"
                      placeholder="+1 (555) 123-4567"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Review */}
            {step === 'review' && (
              <div>
                <h2 className="text-2xl font-black text-white mb-2">Review Your Build</h2>
                <p className="text-stone-400 mb-8">Confirm your AI operations team configuration.</p>

                <div className="space-y-6 max-w-2xl">
                  {/* Package Summary */}
                  <div className="bg-stone-950 rounded-2xl p-6 border border-stone-800">
                    <div className="text-xs font-mono font-bold text-stone-500 uppercase mb-3">Package</div>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-xl font-black text-white">{selectedPackage.name}</div>
                        <div className="text-stone-400 text-sm">{selectedPackage.features[0]} · {selectedPackage.features[1]}</div>
                      </div>
                      <div className="text-2xl font-black text-emerald-400">{`$${selectedPackage.monthly}/mo`}</div>
                    </div>
                  </div>

                  {/* Agents Summary */}
                  <div className="bg-stone-950 rounded-2xl p-6 border border-stone-800">
                    <div className="text-xs font-mono font-bold text-stone-500 uppercase mb-3">
                      Capabilities ({selectedAgents.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedAgents.map((id) => {
                        const agent = allAgents.find((a) => a.id === id);
                        return agent ? (
                          <span key={id} className="inline-flex items-center gap-1.5 bg-stone-800 text-stone-300 px-3 py-1.5 rounded-lg text-sm font-bold">
                            {agent.icon} {agent.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>

                  {/* Company Info Summary */}
                  <div className="bg-stone-950 rounded-2xl p-6 border border-stone-800">
                    <div className="text-xs font-mono font-bold text-stone-500 uppercase mb-3">Deployment Info</div>
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div><span className="text-stone-500">Company:</span> <span className="text-white font-bold">{formData.company}</span></div>
                      <div><span className="text-stone-500">Contact:</span> <span className="text-white font-bold">{formData.name}</span></div>
                      <div><span className="text-stone-500">Email:</span> <span className="text-white font-bold">{formData.email}</span></div>
                      <div><span className="text-stone-500">Phone:</span> <span className="text-white font-bold">{formData.phone}</span></div>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-emerald-400 font-black text-lg">Total Investment</div>
                        <div className="text-stone-400 text-sm">One-time payment · 30-day money-back guarantee</div>
                      </div>
                      <div className="text-3xl font-black text-white">{`$${selectedPackage.monthly}/mo`}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-10 pt-8 border-t border-stone-800">
              <button
                onClick={() => {
                  const steps: Step[] = ['package', 'agents', 'info', 'review'];
                  const idx = steps.indexOf(step);
                  if (idx > 0) setStep(steps[idx - 1]);
                }}
                className={`text-sm font-bold text-stone-400 hover:text-white transition-colors ${step === 'package' ? 'invisible' : ''}`}
              >
                ← Back
              </button>

              {step !== 'review' ? (
                <button
                  onClick={validateAndNext}
                  className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md"
                >
                  Continue →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-black text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                >
                  {submitting ? 'Redirecting to Stripe...' : 'Proceed to Payment →'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-12 border-t border-stone-800 bg-stone-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div>
            <div className="text-2xl font-black text-emerald-400 mb-2">{businessName}</div>
            <p className="text-stone-500 text-sm">Deploy AI. Reclaim your time.</p>
          </div>
          <div className="flex gap-6 text-sm font-bold text-stone-600">
            <Link to="/" className="hover:text-emerald-400">Home</Link>
            <Link to="/faq" className="hover:text-emerald-400">FAQ</Link>
            <Link to="/support" className="hover:text-emerald-400">Support</Link>
          </div>
        </div>
      </footer>
    <Footer />
    </div>
  );
}

export default BuildBuilder;
