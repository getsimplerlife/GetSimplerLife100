import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/demos/audit-portal')({
  component: AuditPortalDemo,
});

const steps = [
  {
    id: 1,
    title: "Step 1: Buy an Audit",
    description: "The journey begins with a secure Stripe checkout. Clients purchase a 'Deep-Dive AI Opportunity Audit' which includes a full operational scan and a custom implementation blueprint.",
    action: "View Checkout UI",
    badge: "Payment"
  },
  {
    id: 2,
    title: "Step 2: Register",
    description: "After payment, clients are redirected to create their secure workspace. This ensures all shared documents and findings are protected by enterprise-grade encryption.",
    action: "View Signup Flow",
    badge: "Access"
  },
  {
    id: 3,
    title: "Step 3: The Dashboard",
    description: "Once logged in, clients can track the progress of their audit in real-time. They see when an analyst is assigned, when the technical scan starts, and when results are ready.",
    action: "View Dashboard",
    badge: "Monitoring"
  },
  {
    id: 4,
    title: "Step 4: View Results",
    description: "The final blueprint is delivered directly in the portal. It highlights exactly where waste is occurring and provides a prioritized roadmap for AI agent deployment.",
    action: "View Sample Results",
    badge: "Outcome"
  },
];

function AuditPortalDemo() {
  const [activeStep, setActiveStep] = useState(1);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-white dark:bg-slate-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-black text-indigo-600 tracking-tight">
            Simpler Life 100
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">Interactive Demo</span>
            <Link to="/" className="text-sm font-bold text-indigo-600 hover:text-indigo-700">Exit</Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 lg:p-12">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          
          {/* Left: Content */}
          <div className="space-y-12">
            <div>
              <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Experience the Audit Journey
              </h1>
              <p className="mt-4 text-lg text-slate-500 font-medium">
                See exactly how we transform operational waste into automated efficiency, from the first click to the final blueprint.
              </p>
            </div>

            <div className="space-y-4">
              {steps.map((step) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`w-full text-left p-6 rounded-3xl border-2 transition-all group relative overflow-hidden ${
                    activeStep === step.id
                      ? "border-indigo-600 bg-white shadow-xl shadow-indigo-100 dark:shadow-none"
                      : "border-transparent hover:border-slate-200 text-slate-400"
                  }`}
                >
                  <div className="relative z-10 flex gap-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-xl ${
                      activeStep === step.id ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"
                    }`}>
                      {step.id}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`font-black text-lg ${activeStep === step.id ? "text-slate-900 dark:text-indigo-200" : "text-slate-500"}`}>
                          {step.title}
                        </h3>
                        {activeStep === step.id && (
                          <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                            {step.badge}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm leading-relaxed ${activeStep === step.id ? "text-slate-600 dark:text-slate-400 font-medium" : "text-slate-400"}`}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-8 bg-indigo-900 rounded-[2rem] text-white">
              <h4 className="text-xl font-bold mb-2">Ready to start?</h4>
              <p className="text-indigo-200 text-sm mb-6">Our average client realizes their first automated workflow in under 21 days.</p>
              <a href="https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00" className="inline-block bg-white text-indigo-900 px-8 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-colors">
                Book Audit Now
              </a>
            </div>
          </div>

          {/* Right: Mock UI */}
          <div className="lg:sticky lg:top-32">
            <div className="relative">
              {/* Decorative background elements */}
              <div className="absolute -inset-4 bg-indigo-100 dark:bg-indigo-900/20 rounded-[3rem] blur-3xl opacity-50"></div>
              
              {/* The "Screen" */}
              <div className="relative bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border-8 border-slate-900 dark:border-slate-800 aspect-[4/3] overflow-hidden flex flex-col">
                <div className="h-8 bg-slate-900 dark:bg-slate-800 flex items-center px-4 gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  <div className="ml-4 h-4 w-48 bg-slate-800 dark:bg-slate-700 rounded-full"></div>
                </div>

                <div className="flex-1 overflow-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500" key={activeStep}>
                  
                  {activeStep === 1 && (
                    <div className="max-w-sm mx-auto space-y-6">
                      <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                          <span className="text-white text-3xl font-black">S</span>
                        </div>
                        <h2 className="text-xl font-bold">Checkout</h2>
                        <p className="text-slate-400 text-sm">Simpler Life 100 Audit</p>
                      </div>
                      <div className="flex justify-between items-center py-4 border-b border-slate-100 dark:border-slate-800">
                        <span className="font-medium">Deep-Dive Audit</span>
                        <span className="font-bold">$2,500.00</span>
                      </div>
                      <div className="space-y-4">
                        <div className="h-12 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center">
                          <span className="text-slate-400 text-sm">Card number</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="h-12 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center">
                            <span className="text-slate-400 text-sm">MM / YY</span>
                          </div>
                          <div className="h-12 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center">
                            <span className="text-slate-400 text-sm">CVC</span>
                          </div>
                        </div>
                      </div>
                      <button className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg">Pay $2,500.00</button>
                    </div>
                  )}

                  {activeStep === 2 && (
                    <div className="max-w-sm mx-auto space-y-6">
                      <div className="text-center mb-8">
                        <h2 className="text-2xl font-black">Create Workspace</h2>
                        <p className="text-slate-400 text-sm mt-2">Secure your operational data.</p>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                          <div className="h-12 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center">
                            <span className="text-slate-900 dark:text-white font-medium">ceo@yourcompany.com</span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase">Password</label>
                          <div className="h-12 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center">
                            <span className="text-slate-900 dark:text-white font-medium">••••••••••••</span>
                          </div>
                        </div>
                      </div>
                      <button className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold">Initialize Portal</button>
                      <p className="text-center text-[10px] text-slate-400">By continuing, you agree to the Master Service Agreement.</p>
                    </div>
                  )}

                  {activeStep === 3 && (
                    <div className="space-y-8">
                      <div className="flex justify-between items-center">
                        <h2 className="text-xl font-black">Audit Dashboard</h2>
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">LIVE</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <div className="text-xs text-slate-400 font-bold uppercase mb-1">Status</div>
                          <div className="text-indigo-600 font-black">Scanning</div>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <div className="text-xs text-slate-400 font-bold uppercase mb-1">Waste Points</div>
                          <div className="text-slate-900 dark:text-white font-black">Calculating</div>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <div className="text-xs text-slate-400 font-bold uppercase mb-1">Analyst</div>
                          <div className="text-slate-900 dark:text-white font-black">AI Lead</div>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-sm font-bold">Workflow Ingestion</span>
                          <span className="text-xs text-indigo-600 font-bold">75% Complete</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-600 w-3/4"></div>
                        </div>
                        <div className="mt-6 space-y-3">
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            API Connections Verified
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Manual Intake Forms Indexed
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 italic">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                            Identifying Redundancies...
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeStep === 4 && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <div>
                          <h2 className="text-2xl font-black">Audit Blueprint</h2>
                          <p className="text-slate-400 text-xs">SL-100-29384-BLUEPRINT</p>
                        </div>
                        <button className="text-[10px] font-black uppercase text-indigo-600 border border-indigo-200 px-3 py-1 rounded-lg">Download PDF</button>
                      </div>

                      <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">Total Projected Savings</span>
                          <span className="text-2xl font-black text-indigo-900 dark:text-indigo-100">$142,400/yr</span>
                        </div>
                        <div className="h-px bg-indigo-100 dark:bg-indigo-800 mb-4"></div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-[10px] font-bold text-indigo-400 uppercase">Waste Points</div>
                            <div className="text-lg font-black">12 Critical</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-indigo-400 uppercase">ROI Multiplier</div>
                            <div className="text-lg font-black">2.1x Applied</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Recommended Agents</h4>
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">📄</span>
                            <span className="text-sm font-bold">Document Intake AI</span>
                          </div>
                          <span className="text-[10px] font-black text-emerald-600">High Impact</span>
                        </div>
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">💰</span>
                            <span className="text-sm font-bold">Reconciliation Agent</span>
                          </div>
                          <span className="text-[10px] font-black text-indigo-600">Growth Implementation</span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Floaties */}
              <div className="absolute -bottom-6 -right-6 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 animate-bounce duration-[3000ms]">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Analyst assigned</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 text-center">
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
          &copy; {new Date().getFullYear()} Simpler Life 100 — Strategic AI Automation
        </p>
      </footer>
    </div>
  );
}
