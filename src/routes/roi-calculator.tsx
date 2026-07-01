import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/roi-calculator")({
  component: ROICalculator,
});

const industries = [
  { name: "Energy", multiplier: 2.2, icon: "⚡" },
  { name: "Manufacturing", multiplier: 2.1, icon: "🏭" },
  { name: "Automotive", multiplier: 2.1, icon: "🚗" },
  { name: "Financial Services", multiplier: 2.0, icon: "💰" },
  { name: "Logistics", multiplier: 2.0, icon: "🚚" },
  { name: "Healthcare", multiplier: 1.9, icon: "🏥" },
  { name: "Legal", multiplier: 1.8, icon: "⚖️" },
  { name: "Accounting", multiplier: 1.8, icon: "📊" },
  { name: "SaaS & Technology", multiplier: 1.7, icon: "💻" },
  { name: "Retail & Ecommerce", multiplier: 1.6, icon: "🛒" },
];

function ROICalculator() {
  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState(industries[0]);
  const [employees, setStep2Data] = useState(50);
  const [avgSalary, setAvgSalary] = useState(75000);
  const [manualHoursPct, setManualHours] = useState(30);

  const calculateSavings = () => {
    const totalPayroll = employees * avgSalary;
    const manualWasteValue = totalPayroll * (manualHoursPct / 100);
    const estimatedSavings = manualWasteValue * (industry.multiplier - 1);
    return estimatedSavings;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <header className="px-6 py-4 border-b bg-white dark:bg-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight">
            Simpler Life 100
          </Link>
          <Link to="/" className="text-sm font-medium text-gray-600 hover:text-indigo-600">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="p-8 lg:p-12">
            {step === 1 && (
              <div className="space-y-8">
                <div className="text-center">
                  <h1 className="text-3xl font-extrabold mb-2">Select Your Industry</h1>
                  <p className="text-slate-500">We use vertical-specific multipliers to estimate your potential ROI.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {industries.map((ind) => (
                    <button
                      key={ind.name}
                      onClick={() => setIndustry(ind)}
                      className={`p-4 rounded-2xl border-2 transition-all text-center group ${
                        industry.name === ind.name
                          ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20"
                          : "border-slate-100 dark:border-slate-700 hover:border-indigo-300"
                      }`}
                    >
                      <span className="text-3xl mb-2 block">{ind.icon}</span>
                      <span className="text-xs font-bold block">{ind.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
                >
                  Continue to Step 2
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-8">
                <div className="text-center">
                  <h1 className="text-3xl font-extrabold mb-2">Company Details</h1>
                  <p className="text-slate-500">Tell us about your team size and overhead.</p>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold mb-2 uppercase tracking-wide text-slate-400">Number of Employees</label>
                    <input
                      type="range"
                      min="5"
                      max="500"
                      step="5"
                      value={employees}
                      onChange={(e) => setStep2Data(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="text-2xl font-bold mt-2">{employees} Employees</div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2 uppercase tracking-wide text-slate-400">Avg. Annual Salary ($)</label>
                    <input
                      type="number"
                      value={avgSalary}
                      onChange={(e) => setAvgSalary(parseInt(e.target.value))}
                      className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2 uppercase tracking-wide text-slate-400">% of Time Spent on Manual Tasks</label>
                    <input
                      type="range"
                      min="10"
                      max="80"
                      step="5"
                      value={manualHoursPct}
                      onChange={(e) => setManualHours(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="text-2xl font-bold mt-2">{manualHoursPct}%</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 border border-slate-200 dark:border-slate-700 py-4 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-[2] bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
                  >
                    Calculate Results
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-8 text-center animate-in fade-in zoom-in duration-300">
                <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-sm font-bold uppercase tracking-wide mb-4">
                  💰 Projected Annual Savings
                </div>
                <h1 className="text-6xl lg:text-7xl font-black text-slate-900 dark:text-white">
                  ${Math.round(calculateSavings()).toLocaleString()}
                </h1>
                <p className="text-xl text-slate-500 max-w-md mx-auto">
                  By automating your high-friction {industry.name} workflows, you can reclaim up to {manualHoursPct}% of your team's productive capacity.
                </p>
                <div className="grid grid-cols-2 gap-4 text-left mt-8">
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">ROI Multiplier</div>
                    <div className="text-2xl font-bold text-indigo-600">{industry.multiplier}x</div>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">Industry</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{industry.name}</div>
                  </div>
                </div>
                <div className="pt-8 space-y-4">
                  <a
                    href="/#contact"
                    className="block w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
                  >
                    Get Your Detailed Audit Report
                  </a>
                  <button
                    onClick={() => setStep(1)}
                    className="text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
