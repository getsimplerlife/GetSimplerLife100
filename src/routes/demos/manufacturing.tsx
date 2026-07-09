import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/demos/manufacturing")({
  component: ManufacturingDemo,
});

function ManufacturingDemo() {
  const [step, setStep] = useState<"input" | "processing" | "result">("input");
  const [batchSize, setBatchSize] = useState("5000");
  const [orderId, setOrderId] = useState("BATCH-772-LITHIUM");

  const runAnalysis = () => {
    setStep("processing");
    setTimeout(() => {
      setStep("result");
    }, 2500);
  };

  const reset = () => {
    setStep("input");
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 py-4 border-b">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-emerald-600 tracking-tight">
            Simpler Life 100
          </Link>
          <nav className="flex gap-4">
            <Link to="/" className="text-sm font-medium hover:text-emerald-600 transition-colors">
              Back to Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 py-12 bg-stone-50 dark:bg-stone-900/50 border-b border-gray-100 dark:border-gray-800">
          <div className="max-w-5xl mx-auto">
            <div className="inline-block px-3 py-1 mb-4 text-sm font-semibold text-emerald-600 bg-emerald-100 rounded-full dark:bg-emerald-900/30 dark:text-emerald-400">
              Interactive Demo: Manufacturing Vertical
            </div>
            <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6">
              Production & <span className="text-emerald-600">Inventory Agent</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl">
              Automate production scheduling, inventory reconciliation, and QA compliance with 2.1x ROI.
            </p>
          </div>
        </section>

        <section className="px-6 py-16 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-12">
            
            {/* Left: The Interactive Demo Shell */}
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white dark:bg-stone-900 border rounded-2xl shadow-xl overflow-hidden border-emerald-100 dark:border-emerald-900/50">
                <div className="bg-stone-900 px-6 py-3 flex items-center justify-between">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                  <div className="text-xs font-mono text-stone-400 uppercase tracking-widest">Manufacturing_Agent_v1.4</div>
                </div>

                <div className="p-8 min-h-[500px] flex flex-col">
                  {step === "input" && (
                    <div className="space-y-6 flex-1 animate-in fade-in duration-500">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">1</div>
                        <h2 className="text-xl font-bold">Configure Production Run</h2>
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-gray-500 uppercase">Production Order ID</label>
                          <input 
                            type="text"
                            value={orderId}
                            onChange={(e) => setOrderId(e.target.value)}
                            className="w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-gray-500 uppercase">Batch Size (Units)</label>
                          <input 
                            type="number"
                            value={batchSize}
                            onChange={(e) => setBatchSize(e.target.value)}
                            className="w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-500 uppercase">Priority Level</label>
                        <select className="w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none">
                          <option>Standard (Next available slot)</option>
                          <option>High (Expedited delivery)</option>
                          <option>Critical (Displace non-essential runs)</option>
                        </select>
                      </div>

                      <button 
                        onClick={runAnalysis}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/25 flex items-center justify-center gap-2"
                      >
                        Optimize Production Path
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {step === "processing" && (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
                      <div className="relative w-24 h-24">
                        <div className="absolute inset-0 border-4 border-emerald-200 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-emerald-600 rounded-full border-t-transparent animate-spin"></div>
                      </div>
                      <div className="text-center space-y-2">
                        <h3 className="text-lg font-bold">Optimizing...</h3>
                        <div className="space-y-1 font-mono text-xs text-gray-400">
                          <div>[SCHEDULING] Calculating optimal line speed vs energy cost</div>
                          <div>[INVENTORY] Cross-referencing raw material lead times</div>
                          <div>[QA] Loading batch-specific tolerance parameters</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === "result" && (
                    <div className="space-y-6 flex-1 animate-in zoom-in-95 duration-500">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-sm">✓</div>
                          <h2 className="text-xl font-bold">Optimization Complete</h2>
                        </div>
                        <button onClick={reset} className="text-sm font-bold text-emerald-600 hover:underline">New Run</button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30 rounded-xl">
                          <div className="text-xs font-bold text-yellow-600 uppercase mb-1">Inventory Alert</div>
                          <div className="font-bold text-sm mb-1">Low Raw Material (Zinc)</div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Stock level below safety margin for {orderId}. PO auto-drafted for 10,000kg.
                          </p>
                        </div>
                        <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-xl">
                          <div className="text-xs font-bold text-green-600 uppercase mb-1">Optimal Slot</div>
                          <div className="font-bold text-sm mb-1">Line 4 (08:00 Tomorrow)</div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Batch scheduled. Energy-efficient window utilized. Expected yield: 99.4%.
                          </p>
                        </div>
                      </div>

                      <div className="bg-stone-50 dark:bg-stone-800 rounded-xl p-6 border">
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">Agent Execution Log</h4>
                        <div className="space-y-3 font-mono text-[10px] text-gray-500">
                          <div className="flex gap-2">
                            <span className="text-emerald-400">[09:12:44]</span>
                            <span>Parsing ERP order: "{orderId}" size: {batchSize}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-emerald-400">[09:12:45]</span>
                            <span>Analyzing line availability... Line 2 down for maintenance.</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-emerald-400">[09:12:47]</span>
                            <span>Checking raw material inventory... Zinc levels low.</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-emerald-400">[09:12:48]</span>
                            <span>Auto-creating PO-2026-X4 with Supplier A (lead time: 14h).</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-green-400">[09:12:50]</span>
                            <span>Schedule locked. Production instructions synced to HMI on Line 4.</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-center pt-4">
                        <a 
                          href="https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00" 
                          className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-lg"
                        >
                          Book Your Efficiency Audit — $5,000
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Side: ROI and Benefits */}
            <div className="space-y-12">
              <div>
                <h3 className="text-xl font-bold mb-6">Friction Points Eliminated</h3>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center justify-center font-bold">-</div>
                    <div>
                      <h4 className="font-bold text-sm">Manual Scheduling Lag</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Eliminates back-and-forth between planners and floor managers by automating slot allocation.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center justify-center font-bold">-</div>
                    <div>
                      <h4 className="font-bold text-sm">Inventory Blind Spots</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Automates reconciliation between production plans and raw material stock levels to prevent stockouts.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center justify-center font-bold">-</div>
                    <div>
                      <h4 className="font-bold text-sm">Compliance Paperwork</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Instantly generates batch records and traceability reports required for ISO/FDA compliance.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-emerald-600 rounded-2xl text-white shadow-xl">
                <div className="text-sm font-medium text-emerald-100 mb-2">Manufacturing Vertical Performance</div>
                <div className="text-5xl font-black mb-2">2.1x</div>
                <div className="text-lg font-bold mb-4">Projected ROI</div>
                <p className="text-emerald-100 text-xs mb-6 leading-relaxed">
                  Based on deployments in high-precision assembly and chemical processing facilities.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-300"></div>
                    15% increase in line utilization
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-300"></div>
                    Zero unforced stockouts
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Vertical Selector CTA */}
        <section className="px-6 py-20 bg-stone-900 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">Built for Every Vertical</h2>
            <p className="text-xl text-stone-400 mb-10">
              Manufacturing is one of our highest impact sectors. See how we automate others.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/" className="px-8 py-3 border border-stone-700 rounded-lg font-bold hover:bg-stone-800 transition-colors">
                View All ROI Benchmarks
              </Link>
              <a 
                href="https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00" 
                className="bg-emerald-600 px-8 py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
              >
                Schedule Your Audit
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.
      </footer>
    </div>
  );
}
