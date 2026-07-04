import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/roi-calculator")({
  component: ROICalculator,
});

const industries = [
  { name: "Energy", multiplier: 2.2, icon: "⚡", core: true },
  { name: "Manufacturing", multiplier: 2.1, icon: "🏭", core: true },
  { name: "Automotive", multiplier: 2.1, icon: "🚗", core: true },
  { name: "Financial Services", multiplier: 2.0, icon: "💰", core: true },
  { name: "Logistics", multiplier: 2.0, icon: "🚚", core: true },
  { name: "Healthcare", multiplier: 1.9, icon: "🏥" },
  { name: "Agriculture", multiplier: 1.9, icon: "🌾" },
  { name: "Insurance", multiplier: 1.8, icon: "🛡️" },
  { name: "Legal", multiplier: 1.8, icon: "⚖️" },
  { name: "Accounting", multiplier: 1.8, icon: "📊" },
  { name: "SaaS", multiplier: 1.7, icon: "☁️" },
  { name: "Technology", multiplier: 1.7, icon: "💻" },
  { name: "Finance", multiplier: 1.7, icon: "💳" },
  { name: "Telecommunications", multiplier: 1.7, icon: "📡" },
  { name: "Agency", multiplier: 1.6, icon: "🎯" },
  { name: "Retail", multiplier: 1.6, icon: "🏬" },
  { name: "Ecommerce", multiplier: 1.6, icon: "🛒" },
  { name: "Marketing", multiplier: 1.5, icon: "📣" },
  { name: "Construction", multiplier: 1.5, icon: "🏗️" },
  { name: "Real Estate", multiplier: 1.5, icon: "🏠" },
  { name: "Government", multiplier: 1.4, icon: "🏛️" },
  { name: "Hospitality", multiplier: 1.4, icon: "🏨" },
  { name: "Restaurants", multiplier: 1.4, icon: "🍽️" },
  { name: "Human Resources", multiplier: 1.3, icon: "👥" },
  { name: "Education", multiplier: 1.3, icon: "📚" },
  { name: "Nonprofits", multiplier: 1.3, icon: "🤝" },
];

const painPointsList = [
  { id: "data-entry", label: "Manual data entry across systems", impact: "High efficiency drain" },
  { id: "bottlenecks", label: "Missed deadlines / bottlenecks", impact: "Project delay risk" },
  { id: "compliance", label: "Compliance reporting burden", impact: "Regulatory liability" },
  { id: "follow-up", label: "Customer follow-up gaps", impact: "Revenue leakage" },
  { id: "inventory", label: "Inventory / supply chain issues", impact: "Capital tie-up" },
  { id: "reconciliation", label: "Invoice / payment reconciliation", impact: "Cash flow friction" },
];

function ROICalculator() {
  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState(industries[0]);
  const [employees, setEmployees] = useState(50);
  const [revenue, setRevenue] = useState("<$10M");
  const [selectedPainPoints, setPainPoints] = useState<string[]>([]);
  const [showAllIndustries, setShowAll] = useState(false);

  const calculateSavings = () => {
    // Formula: (employees × avg operational waste hours/week × hourly rate × 52 weeks) × industry multiplier
    // Assuming 10 hours/week waste and $45/hr average rate
    const wasteHoursPerWeek = 10;
    const hourlyRate = 45;
    const annualWastePerEmployee = wasteHoursPerWeek * hourlyRate * 52;
    const totalWaste = employees * annualWastePerEmployee;
    
    // Add weight for pain points
    const painPointMultiplier = 1 + (selectedPainPoints.length * 0.05);
    
    return totalWaste * (industry.multiplier - 1) * painPointMultiplier;
  };

  const savings = calculateSavings();
  const employeeEquivalent = Math.round(savings / 65000); // $65k/year avg salary

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col">
      <header className="px-6 py-6 border-b bg-white dark:bg-stone-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-600 tracking-tight">
            Simpler Life 100
          </Link>
          <Link to="/" className="text-sm font-bold text-stone-500 hover:text-emerald-600">
            Exit Calculator
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="max-w-4xl w-full bg-white dark:bg-stone-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-stone-100 dark:border-stone-800">
          <div className="p-8 lg:p-16">
            {step === 1 && (
              <div className="space-y-10">
                <div className="text-center">
                  <span className="text-emerald-600 font-bold uppercase tracking-widest text-xs">Step 1 of 4</span>
                  <h1 className="text-4xl font-black mt-2 tracking-tight">Select Your Industry</h1>
                  <p className="text-stone-500 mt-4">We apply vertical-specific multipliers to quantify your waste.</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-h-[400px] overflow-y-auto p-2">
                  {industries.filter(i => showAllIndustries || i.core).map((ind) => (
                    <button
                      key={ind.name}
                      onClick={() => setIndustry(ind)}
                      className={`p-6 rounded-3xl border-2 transition-all text-center group ${
                        industry.name === ind.name
                          ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20"
                          : "border-stone-50 dark:border-stone-800 hover:border-emerald-200"
                      }`}
                    >
                      <span className="text-4xl mb-3 block transform group-hover:scale-110 transition-transform">{ind.icon}</span>
                      <span className="text-xs font-black uppercase tracking-tight block leading-tight">{ind.name}</span>
                    </button>
                  ))}
                  {!showAllIndustries && (
                    <button
                      onClick={() => setShowAll(true)}
                      className="p-6 rounded-3xl border-2 border-dashed border-stone-200 dark:border-stone-700 text-stone-400 font-bold text-xs uppercase hover:border-emerald-300 hover:text-emerald-400 transition-all"
                    >
                      Other Industries
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 dark:shadow-none"
                >
                  Continue
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-10">
                <div className="text-center">
                  <span className="text-emerald-600 font-bold uppercase tracking-widest text-xs">Step 2 of 4</span>
                  <h1 className="text-4xl font-black mt-2 tracking-tight">Company Size</h1>
                  <p className="text-stone-500 mt-4">Tell us about your scale and revenue.</p>
                </div>
                <div className="space-y-10">
                  <div>
                    <div className="flex justify-between items-end mb-4">
                      <label className="text-sm font-black uppercase tracking-widest text-stone-400">Total Employees</label>
                      <span className="text-3xl font-black text-emerald-600">{employees}</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="1000"
                      step="10"
                      value={employees}
                      onChange={(e) => setEmployees(parseInt(e.target.value))}
                      className="w-full h-3 bg-stone-100 dark:bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-black uppercase tracking-widest text-stone-400 mb-4">Annual Revenue</label>
                    <select
                      value={revenue}
                      onChange={(e) => setRevenue(e.target.value)}
                      className="w-full p-5 rounded-2xl border-2 border-stone-50 dark:border-stone-800 bg-stone-50 dark:bg-stone-800 font-black text-lg focus:border-emerald-600 outline-none transition-all"
                    >
                      <option value="<$10M">&lt;$10M</option>
                      <option value="$10M-$50M">$10M - $50M</option>
                      <option value="$50M-$250M">$50M - $250M</option>
                      <option value="$250M-$1B">$250M - $1B</option>
                      <option value="$1B+">$1B+</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setStep(1)} className="flex-1 bg-stone-50 dark:bg-stone-800 py-5 rounded-2xl font-bold text-stone-500">Back</button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-[2] bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 dark:shadow-none"
                  >
                    Next Step
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-10">
                <div className="text-center">
                  <span className="text-emerald-600 font-bold uppercase tracking-widest text-xs">Step 3 of 4</span>
                  <h1 className="text-4xl font-black mt-2 tracking-tight">Identify Pain Points</h1>
                  <p className="text-stone-500 mt-4">Select the operational friction points you want to eliminate.</p>
                </div>
                <div className="grid gap-3">
                  {painPointsList.map((pp) => (
                    <button
                      key={pp.id}
                      onClick={() => setPainPoints(prev => prev.includes(pp.label) ? prev.filter(x => x !== pp.label) : [...prev, pp.label])}
                      className={`w-full text-left p-5 rounded-2xl border-2 transition-all flex items-center gap-4 ${
                        selectedPainPoints.includes(pp.label)
                          ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20"
                          : "border-stone-50 dark:border-stone-800 hover:border-emerald-100"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-md border-2 shrink-0 flex items-center justify-center ${selectedPainPoints.includes(pp.label) ? "bg-emerald-600 border-emerald-600" : "border-stone-200"}`}>
                        {selectedPainPoints.includes(pp.label) && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="flex-1">
                        <span className={`font-bold block ${selectedPainPoints.includes(pp.label) ? "text-emerald-900 dark:text-emerald-200" : "text-stone-900 dark:text-stone-200"}`}>{pp.label}</span>
                        <span className="text-xs text-stone-400 uppercase font-black tracking-widest">{pp.impact}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setStep(2)} className="flex-1 bg-stone-50 dark:bg-stone-800 py-5 rounded-2xl font-bold text-stone-500">Back</button>
                  <button
                    onClick={() => setStep(4)}
                    className="flex-[2] bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 dark:shadow-none"
                  >
                    Calculate Savings
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-12 text-center animate-in fade-in zoom-in duration-500">
                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black uppercase tracking-widest mb-6">
                    💰 Annual Waste Identification
                  </div>
                  <h1 className="text-6xl lg:text-8xl font-black text-stone-900 dark:text-white tracking-tighter">
                    ${Math.round(savings).toLocaleString()}
                  </h1>
                  <p className="text-xl text-stone-500 mt-6 max-w-lg mx-auto font-medium leading-relaxed">
                    Based on your {industry.name} operations, Simpler Life 100 can save you approximately <span className="text-emerald-600 font-bold">${Math.round(savings).toLocaleString()}/year</span>.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-stone-50 dark:bg-stone-800/50 p-8 rounded-[2rem] border border-stone-100 dark:border-stone-800 text-center">
                    <div className="text-4xl font-black text-emerald-600 mb-2">{employeeEquivalent}</div>
                    <div className="text-xs font-black uppercase tracking-widest text-stone-400">Employee Capacity Equivalent</div>
                    <p className="text-stone-500 mt-4 text-xs font-medium">That's the equivalent of hiring {employeeEquivalent} full-time operations professionals to manage manual tasks.</p>
                  </div>
                  <div className="bg-stone-50 dark:bg-stone-800/50 p-8 rounded-[2rem] border border-stone-100 dark:border-stone-800 text-left">
                    <div className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-4">Savings Breakdown</div>
                    <ul className="space-y-3">
                      {selectedPainPoints.length > 0 ? (
                        selectedPainPoints.slice(0, 3).map((pp, i) => (
                          <li key={i} className="flex gap-3 text-xs font-bold text-stone-600 dark:text-stone-300">
                            <span className="text-emerald-500">✔</span> {pp.replace("Manual ", "").replace("issues", "optimization")}
                          </li>
                        ))
                      ) : (
                        <li className="text-xs text-stone-400 italic">No specific pain points selected, calculating based on industry baseline.</li>
                      )}
                      <li className="flex gap-3 text-xs font-bold text-stone-600 dark:text-stone-300">
                        <span className="text-emerald-500">✔</span> Vertical-specific {industry.multiplier}x multiplier
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-4">
                  <a
                    href="/#contact"
                    className="block w-full bg-emerald-600 text-white py-6 rounded-2xl font-black text-2xl hover:bg-emerald-700 transition-all shadow-2xl shadow-emerald-200 dark:shadow-none"
                  >
                    Book My Free Efficiency Audit
                  </a>
                  <button
                    onClick={() => setStep(1)}
                    className="text-sm font-bold text-stone-400 hover:text-emerald-600 transition-colors uppercase tracking-widest"
                  >
                    Recalculate
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
