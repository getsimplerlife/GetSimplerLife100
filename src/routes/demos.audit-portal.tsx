import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/demos/audit-portal")({
  component: AuditPortalDemo,
});

const steps = [
  {
    title: "1. Purchase Notification",
    description: "When a client purchases an audit, our system automatically triggers the onboarding flow.",
    details: "Customer receives a welcome email and access to their private portal.",
    icon: "🛒",
  },
  {
    title: "2. Automatic Provisioning",
    description: "A secure workspace is instantly created for the client.",
    details: "The database creates a 'Pending' audit record linked to the customer's email.",
    icon: "⚙️",
  },
  {
    title: "3. Analyst Assignment",
    description: "Our vertical-specific AI analysts are assigned to the project.",
    details: "A team member reviews the client's industry data and begins the mapping process.",
    icon: "🔍",
  },
  {
    title: "4. Result Delivery",
    description: "The audit findings are uploaded directly to the portal.",
    details: "The status changes to 'Completed', and the customer is notified via email.",
    icon: "✅",
  },
];

function AuditPortalDemo() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-6 py-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-indigo-400 tracking-tight">
            Simpler Life 100
          </Link>
          <div className="flex gap-4">
            <Link to="/portal" className="text-sm font-bold bg-white text-slate-950 px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors">
              Try Live Portal
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row">
        {/* Left: Interactive Stepper */}
        <div className="w-full lg:w-1/3 p-8 lg:p-12 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/20">
          <div className="mb-12">
            <span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Internal Workflow Demo</span>
            <h1 className="text-3xl lg:text-4xl font-black mt-2 leading-tight">The Audit Journey</h1>
            <p className="text-slate-500 mt-4">See exactly how we handle every audit from purchase to implementation blueprint.</p>
          </div>

          <div className="space-y-4">
            {steps.map((step, i) => (
              <button
                key={step.title}
                onClick={() => setActiveStep(i)}
                className={`w-full text-left p-6 rounded-2xl border transition-all ${
                  activeStep === i
                    ? "bg-slate-800 border-indigo-500 shadow-lg shadow-indigo-500/10"
                    : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{step.icon}</span>
                  <div>
                    <h3 className={`font-bold ${activeStep === i ? "text-white" : "text-slate-400"}`}>
                      {step.title}
                    </h3>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Visual Preview */}
        <div className="flex-1 p-8 lg:p-20 flex items-center justify-center relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.05),transparent)]">
          <div className="max-w-xl w-full">
            <div className="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700" key={activeStep}>
              <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl border border-indigo-500/20 flex items-center justify-center text-4xl mb-8">
                {steps[activeStep].icon}
              </div>
              <h2 className="text-4xl lg:text-5xl font-black mb-6 leading-tight">
                {steps[activeStep].description}
              </h2>
              <p className="text-xl text-slate-400 leading-relaxed">
                {steps[activeStep].details}
              </p>
            </div>

            <div className="p-1 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-transparent border border-slate-800 shadow-2xl">
              <div className="bg-slate-900 rounded-[calc(1.5rem-1px)] overflow-hidden border border-slate-800">
                <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  </div>
                  <div className="flex-1 text-center text-[10px] font-medium text-slate-500">simplerlife100.com/portal</div>
                </div>
                <div className="p-8 space-y-6 opacity-40 grayscale blur-[1px]">
                  <div className="h-4 w-1/3 bg-slate-800 rounded-full" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-32 bg-slate-800 rounded-2xl" />
                    <div className="h-32 bg-slate-800 rounded-2xl" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-800 rounded-full w-full" />
                    <div className="h-3 bg-slate-800 rounded-full w-5/6" />
                    <div className="h-3 bg-slate-800 rounded-full w-4/6" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="p-8 border-t border-slate-800 bg-slate-900 text-center">
        <p className="text-slate-500 text-sm">© {new Date().getFullYear()} Simpler Life 100. All rights reserved.</p>
      </footer>
    </div>
  );
}
