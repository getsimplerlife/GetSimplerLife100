import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/demos/energy")({
  component: EnergyDemo,
});

function EnergyDemo() {
  const [step, setStep] = useState<"input" | "processing" | "result">("input");
  const [observations, setObservations] = useState(
    "Observed minor discoloration on trailing edge of blade 2. Possible surface scoring."
  );
  const [assetId, setAssetId] = useState("WTG-882-NORTH");

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
          <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight">
            Simpler Life 100
          </Link>
          <nav className="flex gap-4">
            <Link to="/" className="text-sm font-medium hover:text-indigo-600 transition-colors">
              Back to Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 py-12 bg-slate-50 dark:bg-slate-900/50 border-b border-gray-100 dark:border-gray-800">
          <div className="max-w-5xl mx-auto">
            <div className="inline-block px-3 py-1 mb-4 text-sm font-semibold text-indigo-600 bg-indigo-100 rounded-full dark:bg-indigo-900/30 dark:text-indigo-400">
              Interactive Demo: Energy Vertical
            </div>
            <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6">
              AI Asset Inspection <span className="text-indigo-600">& Scheduling Agent</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl">
              Eliminate manual review bottlenecks and automate maintenance scheduling for energy infrastructure with 2.2x ROI.
            </p>
          </div>
        </section>

        <section className="px-6 py-16 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-12">
            
            {/* Left: The Interactive Demo Shell */}
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white dark:bg-slate-900 border rounded-2xl shadow-xl overflow-hidden border-indigo-100 dark:border-indigo-900/50">
                <div className="bg-slate-900 px-6 py-3 flex items-center justify-between">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-widest">Inspection_Agent_v2.1</div>
                </div>

                <div className="p-8 min-h-[500px] flex flex-col">
                  {step === "input" && (
                    <div className="space-y-6 flex-1 animate-in fade-in duration-500">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">1</div>
                        <h2 className="text-xl font-bold">Input Inspection Data</h2>
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-gray-500 uppercase">Asset Identifier</label>
                          <select 
                            value={assetId}
                            onChange={(e) => setAssetId(e.target.value)}
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option>WTG-882-NORTH</option>
                            <option>WTG-883-NORTH</option>
                            <option>WTG-104-SOUTH</option>
                            <option>SOLAR-ARRAY-E4</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-gray-500 uppercase">Input Source</label>
                          <div className="p-3 bg-slate-100 dark:bg-slate-800 border-2 border-dashed rounded-lg text-center text-xs text-gray-500">
                            Drone_Payload_882.zip (1.4GB)
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-500 uppercase">Technician Notes (Field App)</label>
                        <textarea 
                          className="w-full p-4 h-32 bg-slate-50 dark:bg-slate-800 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                          value={observations}
                          onChange={(e) => setObservations(e.target.value)}
                        />
                      </div>

                      <button 
                        onClick={runAnalysis}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2"
                      >
                        Start AI Analysis
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {step === "processing" && (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
                      <div className="relative w-24 h-24">
                        <div className="absolute inset-0 border-4 border-indigo-200 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                      </div>
                      <div className="text-center space-y-2">
                        <h3 className="text-lg font-bold">Agent Processing...</h3>
                        <div className="space-y-1 font-mono text-xs text-gray-400">
                          <div>[SCANNING] 1,402 high-res inspection images</div>
                          <div>[CORRELATING] SCADA sensor logs with visual data</div>
                          <div>[COMPLIANCE] Cross-referencing FERC-V4.1 standards</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === "result" && (
                    <div className="space-y-6 flex-1 animate-in zoom-in-95 duration-500">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-sm">✓</div>
                          <h2 className="text-xl font-bold">Analysis Complete</h2>
                        </div>
                        <button onClick={reset} className="text-sm font-bold text-indigo-600 hover:underline">New Inspection</button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl">
                          <div className="text-xs font-bold text-red-600 uppercase mb-1">Issue Flagged</div>
                          <div className="font-bold text-sm mb-1">Structural Crack (Blade 2)</div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            3.2mm defect identified. Confirmed by visual anomaly and 0.12Hz vibration spike.
                          </p>
                        </div>
                        <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-xl">
                          <div className="text-xs font-bold text-green-600 uppercase mb-1">Action Taken</div>
                          <div className="font-bold text-sm mb-1">Maintenance Scheduled</div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Work order #WM-772 created. Team "North-Grid-Quick" dispatched for 2026-07-05.
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-6 border">
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">Agent Process Log</h4>
                        <div className="space-y-3 font-mono text-[10px] text-gray-500">
                          <div className="flex gap-2">
                            <span className="text-indigo-400">[14:02:11]</span>
                            <span>Parsing technician note: "discoloration... blade 2"</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-indigo-400">[14:02:12]</span>
                            <span>Targeting CV analysis on Blade 2 sectors 4-9...</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-indigo-400">[14:02:14]</span>
                            <span>MATCH FOUND: sector 6, image IMG_042.jpg. Confidence 98.2%.</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-indigo-400">[14:02:15]</span>
                            <span>Updating maintenance ERP via API. Syncing with team availability.</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-green-400">[14:02:16]</span>
                            <span>Compliance check: PASS. FERQ-22 report generated.</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-center pt-4">
                        <a 
                          href="https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00" 
                          className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg"
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
                      <h4 className="font-bold text-sm">Manual Review Lag</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Eliminates 16+ hours of technician time per asset inspection by automating image/data correlation.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center justify-center font-bold">-</div>
                    <div>
                      <h4 className="font-bold text-sm">Reporting Friction</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Automates the generation of regulatory compliance reports, freeing engineers for actual maintenance.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center justify-center font-bold">-</div>
                    <div>
                      <h4 className="font-bold text-sm">Scheduling Delays</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Instant triage ensures critical defects are scheduled for repair in minutes, not days.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-indigo-600 rounded-2xl text-white shadow-xl">
                <div className="text-sm font-medium text-indigo-100 mb-2">Energy Vertical Performance</div>
                <div className="text-5xl font-black mb-2">2.2x</div>
                <div className="text-lg font-bold mb-4">Projected ROI</div>
                <p className="text-indigo-100 text-xs mb-6 leading-relaxed">
                  Based on modeled deployments for utility-scale solar and wind farms. Typical payback period is less than 5 months.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-300"></div>
                    100% data coverage
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-300"></div>
                    Zero manual triage
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Vertical Selector CTA */}
        <section className="px-6 py-20 bg-slate-900 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">Built for Every Vertical</h2>
            <p className="text-xl text-slate-400 mb-10">
              Energy is our highest ROI vertical, but we have pre-mapped agents for 22 other industries.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/" className="px-8 py-3 border border-slate-700 rounded-lg font-bold hover:bg-slate-800 transition-colors">
                View All ROI Benchmarks
              </Link>
              <a 
                href="https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00" 
                className="bg-indigo-600 px-8 py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors"
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
