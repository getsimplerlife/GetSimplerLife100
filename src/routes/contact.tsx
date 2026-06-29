import { useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { getUser } from '~/db/queries';

export const Route = createFileRoute('/contact')({
  loader: async () => {
    const user = await getUser();
    return { user };
  },
  component: Contact,
});

function ClockIcon() { return <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function CheckIcon() { return <svg className="h-5 w-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function SparkleIcon() { return <svg className="h-5 w-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>; }
function MailIcon() { return <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>; }
function SendIcon() { return <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>; }

const AUDIT_OPTIONS = [
  { id: 1, icon: '👥', name: 'Human Resources' },
  { id: 2, icon: '💻', name: 'Technical Support' },
  { id: 3, icon: '🤝', name: 'Customer Service' },
  { id: 4, icon: '🔍', name: 'Online Research' },
  { id: 5, icon: '📊', name: 'Program Management' },
  { id: 6, icon: '📁', name: 'Executive Assistance' },
  { id: 7, icon: '🗺️', name: 'Strategic Planning' },
  { id: 8, icon: '🗄️', name: 'File Management' },
  { id: 9, icon: '🌐', name: 'Outsourcing' },
  { id: 10, icon: '📝', name: 'Data Entry' },
  { id: 11, icon: '🎤', name: 'Typing & Transcription' },
  { id: 12, icon: '📈', name: 'Data Reporting' },
  { id: 13, icon: '💸', name: 'Invoice Processing' },
  { id: 14, icon: '🤖', name: 'Virtual Assistance' },
  { id: 15, icon: '📅', name: 'Appointment Scheduling' },
  { id: 16, icon: '🏦', name: 'Payroll Services' },
  { id: 17, icon: '🧱', name: 'Project Management' },
  { id: 18, icon: '⚙️', name: 'AI & Automation Infra' },
  { id: 19, icon: '💰', name: 'Sales Operations' },
  { id: 20, icon: '📣', name: 'Marketing Systems' },
  { id: 21, icon: '💳', name: 'Finance Operations' },
  { id: 22, icon: '🛡️', name: 'Cybersecurity & Access' },
  { id: 23, icon: '🤖', name: 'AI Governance' },
];

function Contact() {
  const { user } = Route.useLoaderData();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    needs: [] as string[],
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const toggleNeed = (need: string) => {
    setFormData(prev => ({
      ...prev,
      needs: prev.needs.includes(need)
        ? prev.needs.filter(n => n !== need)
        : [...prev.needs, need],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Save the lead to a shared file for now
      const leadData = JSON.stringify({
        timestamp: new Date().toISOString(),
        ...formData,
      }, null, 2);

      // In production, this would POST to an API or send an email
      // For now, save locally and simulate success
      const fs = await import('node:fs/promises');
      await fs.appendFile('/home/team/shared/leads.json', leadData + ',\n');

      setStatus('success');
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <header className="px-6 py-4 border-b bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight">
            Simpler Life 100
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-sm font-medium hover:text-indigo-600 transition-colors">
              Home
            </Link>
            {user ? (
              <Link to="/portal" className="text-sm font-bold text-indigo-600 border border-indigo-600 px-4 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">Dashboard</Link>
            ) : (
              <Link to="/login" className="text-sm font-medium hover:text-indigo-600 transition-colors">Login</Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-4">
              24/7 Asynchronous Automation Diagnostic
            </h1>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">
              Our expert system is active 24/7/365. Request your custom diagnostic below and receive your tailored Automation Roadmap &amp; ROI Analysis in under 24 hours—no phone calls or scheduling required.
            </p>
          </div>

          <div className="grid md:grid-cols-12 gap-8 items-start">
            {/* Quick Info Sidebar */}
            <div className="md:col-span-4 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 text-lg">Diagnostic Availability</h3>
                <div className="space-y-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-3">
                    <ClockIcon />
                    <span className="font-semibold text-indigo-600">Instant 24/7/365</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CheckIcon />
                    <span>No Scheduling Required</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <SparkleIcon />
                    <span>24-Hour Delivery Promise</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 rounded-2xl text-white shadow-lg">
                <h3 className="font-bold mb-2 text-lg">Skip the Queue</h3>
                <p className="text-sm text-indigo-100 mb-4">
                  Secure your priority 24-hour QuickScan&trade; for just $997 (100% credited back to any build).
                </p>
                <a
                  href="https://buy.stripe.com/14AeVdaEE2qv5xQbta08g0b"
                  className="block text-center py-2.5 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition shadow-sm"
                >
                  Secure Priority Audit
                </a>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 text-lg">Contact Us Directly</h3>
                <div className="space-y-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-3">
                    <MailIcon />
                    <span>contact@simplerlife100.com</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="md:col-span-8 bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
              {status === 'success' ? (
                <div className="text-center py-8">
                  <CheckIcon />
                  <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
                    <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Request Queued Successfully!</h3>
                  <p className="text-gray-600 mb-6">
                    Thanks for reaching out! Our AI Expert System has received your operational data. Your customized Automation Roadmap is being compiled and will be delivered to your inbox in under 24 hours.
                  </p>
                  <button
                    onClick={() => setStatus('idle')}
                    className="px-6 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition"
                  >
                    Submit Another Request
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Work Email</label>
                      <input
                        type="email"
                        required
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        required
                        placeholder="+1 (555) 000-0000"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                        value={formData.company}
                        onChange={e => setFormData({ ...formData, company: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Which audits do you need? (Select all that apply)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto p-1">
                      {AUDIT_OPTIONS.map(audit => (
                        <button
                          key={audit.id}
                          type="button"
                          onClick={() => toggleNeed(audit.name)}
                          className={`flex items-center gap-2 p-2.5 border rounded-lg text-sm text-left transition ${
                            formData.needs.includes(audit.name)
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-medium'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <span className="text-base">{audit.icon}</span>
                          <span className="truncate">{audit.name}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {formData.needs.length} selected{formData.needs.length > 0 ? ` — ${formData.needs.join(', ')}` : ''}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tell us about your biggest administrative time-waster</label>
                    <textarea
                      rows={4}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition resize-none"
                      placeholder="E.g., copying leads into our CRM daily, booking client calls manually..."
                      value={formData.message}
                      onChange={e => setFormData({ ...formData, message: e.target.value })}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:bg-indigo-300 shadow-md"
                  >
                    {loading ? 'Processing...' : (
                      <>
                        <SendIcon />
                        Submit Automation Request
                      </>
                    )}
                  </button>
                  {status === 'error' && (
                    <p className="text-red-500 text-sm text-center">Submission error. Please try again or contact support.</p>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-12 border-t text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.
      </footer>
    </div>
  );
}