import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";

export interface RicherROICalculatorProps {
  embed?: boolean;
}

const INDUSTRY_PRESETS: Record<string, { employees: number; hourlyCost: number; tasksPerDay: number; timePerTask: number; errorRate: number }> = {
  Manufacturing: { employees: 120, hourlyCost: 32, tasksPerDay: 8, timePerTask: 15, errorRate: 4 },
  Logistics: { employees: 80, hourlyCost: 28, tasksPerDay: 12, timePerTask: 10, errorRate: 6 },
  Healthcare: { employees: 200, hourlyCost: 45, tasksPerDay: 6, timePerTask: 25, errorRate: 3 },
  Retail: { employees: 60, hourlyCost: 22, tasksPerDay: 10, timePerTask: 12, errorRate: 7 },
  "Financial Services": { employees: 150, hourlyCost: 55, tasksPerDay: 5, timePerTask: 30, errorRate: 2 },
  Construction: { employees: 40, hourlyCost: 38, tasksPerDay: 4, timePerTask: 20, errorRate: 8 },
  Technology: { employees: 100, hourlyCost: 65, tasksPerDay: 7, timePerTask: 18, errorRate: 3 },
  Hospitality: { employees: 50, hourlyCost: 20, tasksPerDay: 15, timePerTask: 8, errorRate: 10 },
};

const BUILD_PACKAGES = [
  { name: "Small Team", price: 7500, employees: "5-50", paymentLink: "https://buy.stripe.com/00w28tcp97g37Llc642Fa17" },
  { name: "Growth", price: 15000, employees: "50-150", paymentLink: "https://buy.stripe.com/5kQ14pah11VJfdN6LK2Fa18" },
  { name: "Scale", price: 30000, employees: "150+", paymentLink: "https://buy.stripe.com/3cIfZj74PbwjfdNda82Fa19" },
];

function getRecommendedPackage(emps: number) {
  if (emps <= 50) return BUILD_PACKAGES[0];
  if (emps <= 150) return BUILD_PACKAGES[1];
  return BUILD_PACKAGES[2];
}

export function RicherROICalculator({ embed = false }: RicherROICalculatorProps) {
  const [showResults, setShowResults] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState("");

  const [employees, setEmployees] = useState(50);
  const [hourlyCost, setHourlyCost] = useState(35);
  const [tasksPerDay, setTasksPerDay] = useState(5);
  const [timePerTask, setTimePerTask] = useState(20);
  const [errorRate, setErrorRate] = useState(5);
  const [annualSalary, setAnnualSalary] = useState(70000);

  const [annualHoursSaved, setAnnualHoursSaved] = useState(0);
  const [totalAnnualSavings, setTotalAnnualSavings] = useState(0);
  const [paybackMonths, setPaybackMonths] = useState(0);
  const [threeYearNetImpact, setThreeYearNetImpact] = useState(0);

  const recommendedPackage = getRecommendedPackage(employees);
  const implementationCost = recommendedPackage.price;

  useEffect(() => {
    const workingDays = 250;
    const dailyHours = (employees * tasksPerDay * timePerTask) / 60;
    const annualHours = dailyHours * workingDays;
    const hoursSaved = annualHours * 0.85;
    const laborSavings = hoursSaved * hourlyCost;
    const totalTasksPerYear = employees * tasksPerDay * workingDays;
    const errorsPerYear = totalTasksPerYear * (errorRate / 100);
    const hoursSpentOnErrors = errorsPerYear * (timePerTask / 60) * 3;
    const errorSavings = hoursSpentOnErrors * hourlyCost;
    const annualSavings = laborSavings + errorSavings;
    const payback = annualSavings > 0 ? (implementationCost / annualSavings) * 12 : 0;
    const netImpact = (annualSavings * 3) - implementationCost;
    setAnnualHoursSaved(hoursSaved);
    setTotalAnnualSavings(annualSavings);
    setPaybackMonths(payback);
    setThreeYearNetImpact(netImpact);
  }, [employees, hourlyCost, tasksPerDay, timePerTask, errorRate, implementationCost]);

  const timelineMonths = [1, 3, 6, 12, 24];

  const applyPreset = (industry: string) => {
    const p = INDUSTRY_PRESETS[industry];
    if (!p) return;
    setSelectedIndustry(industry);
    setEmployees(p.employees);
    setHourlyCost(p.hourlyCost);
    setTasksPerDay(p.tasksPerDay);
    setTimePerTask(p.timePerTask);
    setErrorRate(p.errorRate);
  };

  const handleCaptureEmail = async () => {
    if (!email.trim() || emailSent) return;
    try {
      await fetch("/api/tools/capture-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          toolName: "roi-calculator",
          result: { employees, hourlyCost, tasksPerDay, timePerTask, errorRate, annualHoursSaved, totalAnnualSavings, paybackMonths, threeYearNetImpact, recommendedPackage: recommendedPackage.name },
        }),
      });
    } catch {}
    setEmailSent(true);
    setShowResults(true);
  };

  const downloadPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF("p", "mm", "a4");
    const w = pdf.internal.pageSize.getWidth();
    let y = 20;

    pdf.setFontSize(20);
    pdf.setTextColor(16, 185, 129);
    pdf.text("Simpler Life 100", w / 2, y, { align: "center" });
    y += 10;
    pdf.setFontSize(14);
    pdf.setTextColor(100);
    pdf.text("AI Operations ROI Report", w / 2, y, { align: "center" });
    y += 12;
    pdf.setFontSize(10);
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, w / 2, y, { align: "center" });
    y += 14;
    pdf.setDrawColor(200);
    pdf.line(20, y, w - 20, y);
    y += 10;
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    pdf.text(`Industry: ${selectedIndustry || "Custom"}`, 20, y);
    pdf.text(`Employees: ${employees}`, 120, y);
    y += 8;
    pdf.text(`Hourly Cost: $${hourlyCost}`, 20, y);
    pdf.text(`Tasks/Day: ${tasksPerDay}`, 120, y);
    y += 8;
    pdf.text(`Time/Task: ${timePerTask} min`, 20, y);
    pdf.text(`Error Rate: ${errorRate}%`, 120, y);
    y += 12;
    pdf.setFontSize(14);
    pdf.setTextColor(16, 185, 129);
    pdf.text("Results", 20, y);
    y += 8;
    pdf.setFontSize(11);
    pdf.setTextColor(0);
    pdf.text(`Annual Hours Saved: ${Math.round(annualHoursSaved).toLocaleString()}`, 20, y);
    y += 7;
    pdf.text(`Annual Savings: $${Math.round(totalAnnualSavings).toLocaleString()}`, 20, y);
    y += 7;
    pdf.text(`Payback Period: ${paybackMonths.toFixed(1)} months`, 20, y);
    y += 7;
    pdf.text(`3-Year Net Impact: $${Math.round(threeYearNetImpact).toLocaleString()}`, 20, y);
    y += 7;
    pdf.text(`Recommended Package: ${recommendedPackage.name} ($${recommendedPackage.price.toLocaleString()})`, 20, y);
    pdf.save("simpler-life-100-roi-report.pdf");
  };

  return (
    <div className={`w-full ${embed ? "" : "max-w-6xl mx-auto"} text-stone-100 font-sans`}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT COLUMN: Inputs & Sliders (7 Cols) */}
        <div className="lg:col-span-7 bg-stone-900/60 rounded-3xl p-6 lg:p-8 border border-stone-800/80 backdrop-blur-md space-y-6">
          <div className="border-b border-stone-800 pb-4">
            <h3 className="text-xl font-black text-white flex items-center gap-2"><span>🎛️</span> Operations Parameters</h3>
            <p className="text-xs text-stone-400 mt-1">Select your industry or adjust sliders for a custom estimate.</p>
          </div>

          {/* Industry Presets */}
          <div className="flex flex-wrap gap-2">
            {Object.keys(INDUSTRY_PRESETS).map((ind) => (
              <button key={ind} onClick={() => applyPreset(ind)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  selectedIndustry === ind ? "bg-emerald-600 text-white" : "bg-stone-800 text-stone-400 hover:text-white hover:bg-stone-700"
                }`}>
                {ind}
              </button>
            ))}
          </div>

          <div className="space-y-6">
            {/* Employees */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Total Employees Impacted</span>
                <span className="text-emerald-400 font-black text-base">{employees}</span>
              </div>
              <input type="range" min="5" max="300" step="5" value={employees} onChange={(e) => setEmployees(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>

            {/* Hourly Cost */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Average Hourly Cost</span>
                <span className="text-emerald-400 font-black text-base">${hourlyCost}</span>
              </div>
              <input type="range" min="15" max="100" step="1" value={hourlyCost} onChange={(e) => setHourlyCost(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>

            {/* Tasks Per Day */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Repetitive Tasks Per Day</span>
                <span className="text-emerald-400 font-black text-base">{tasksPerDay}</span>
              </div>
              <input type="range" min="1" max="30" step="1" value={tasksPerDay} onChange={(e) => setTasksPerDay(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>

            {/* Time Per Task */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Minutes Per Task</span>
                <span className="text-emerald-400 font-black text-base">{timePerTask} min</span>
              </div>
              <input type="range" min="1" max="60" step="1" value={timePerTask} onChange={(e) => setTimePerTask(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>

            {/* Error Rate */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Manual Error Rate</span>
                <span className="text-emerald-400 font-black text-base">{errorRate}%</span>
              </div>
              <input type="range" min="1" max="20" step="1" value={errorRate} onChange={(e) => setErrorRate(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>

            {/* Recommended Package Display */}
            <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 text-center">
              <div className="text-xs font-mono text-stone-400 mb-1">RECOMMENDED PACKAGE</div>
              <div className="text-lg font-black text-emerald-400">{recommendedPackage.name}</div>
              <div className="text-sm text-stone-400">${recommendedPackage.price.toLocaleString()} — {recommendedPackage.employees} employees</div>
            </div>

            {/* See My ROI Button */}
            <button onClick={() => { if (!showResults) setShowResults(true); }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3.5 rounded-2xl text-sm transition-all shadow-lg">
              🔍 See My ROI Projection
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Results (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Key Stats */}
          <div className="bg-stone-900/60 rounded-3xl p-6 lg:p-8 border border-stone-800/80 space-y-5">
            <h3 className="text-lg font-black text-white">Your AI Operations Savings</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-950/60 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-emerald-400">{Math.round(annualHoursSaved).toLocaleString()}</div>
                <div className="text-[10px] font-mono text-stone-400 mt-1">HOURS SAVED / YEAR</div>
              </div>
              <div className="bg-stone-950/60 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-emerald-400">${Math.round(totalAnnualSavings).toLocaleString()}</div>
                <div className="text-[10px] font-mono text-stone-400 mt-1">ANNUAL SAVINGS</div>
              </div>
              <div className="bg-stone-950/60 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-emerald-400">{paybackMonths.toFixed(1)} mo</div>
                <div className="text-[10px] font-mono text-stone-400 mt-1">PAYBACK PERIOD</div>
              </div>
              <div className="bg-stone-950/60 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-emerald-400">${Math.round(threeYearNetImpact).toLocaleString()}</div>
                <div className="text-[10px] font-mono text-stone-400 mt-1">3-YEAR NET IMPACT</div>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-2">
              <div className="text-xs font-mono text-stone-400 mb-2">CUMULATIVE NET RETURN</div>
              {timelineMonths.map((m) => {
                const savingsAtMonth = (totalAnnualSavings / 12) * m;
                const netValue = savingsAtMonth - implementationCost;
                const profitable = netValue > 0;
                return (
                  <div key={m} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-stone-950/40 border border-stone-800/50">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${profitable ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                      <span className="font-bold text-stone-300">Month {m}</span>
                    </div>
                    <div className={`font-black ${profitable ? "text-emerald-400" : "text-stone-400"}`}>
                      {profitable ? "+" : ""}${Math.round(netValue).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Email Gate */}
            {!showResults ? (
              <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-xl space-y-3 text-center">
                <p className="text-xs text-stone-400">Enter your email to unlock full results and build packages:</p>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl p-2.5 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-emerald-700 text-center" />
                <button onClick={handleCaptureEmail} disabled={!email.trim()}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-400 text-black font-bold text-sm py-2.5 rounded-xl transition-all">
                  Unlock Full Results →
                </button>
              </div>
            ) : (
              <>
                {/* 3-Year Net Return */}
                <div className="pt-4 border-t border-stone-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-stone-400 uppercase block">3-Year Net Return</span>
                    <span className="text-xl font-black text-white">${Math.round(threeYearNetImpact).toLocaleString()}</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                    {(threeYearNetImpact / implementationCost).toFixed(1)}x ROI
                  </span>
                </div>

                {/* Build Packages CTA */}
                <div className="p-5 bg-gradient-to-br from-emerald-900/40 to-stone-900 rounded-3xl border border-emerald-500/10 space-y-4">
                  <h4 className="text-base font-black text-white text-center">Deploy Your AI Team</h4>
                  <div className="space-y-2">
                    {BUILD_PACKAGES.map((pkg) => {
                      const isRecommended = pkg.name === recommendedPackage.name;
                      return (
                        <a key={pkg.name} href={pkg.paymentLink} target="_blank" rel="noopener"
                          className={`block p-3 rounded-xl text-center transition-all ${
                            isRecommended ? "bg-emerald-600/20 border-2 border-emerald-500" : "bg-stone-950/60 border border-stone-800 hover:border-stone-700"
                          }`}>
                          <div className="flex justify-between items-center">
                            <span className={`text-sm font-bold ${isRecommended ? "text-emerald-400" : "text-stone-300"}`}>
                              {pkg.name} {isRecommended && "★"}
                            </span>
                            <span className="text-sm font-black text-white">${pkg.price.toLocaleString()}</span>
                          </div>
                          <div className="text-[10px] text-stone-500 mt-0.5">{pkg.employees} employees</div>
                        </a>
                      );
                    })}
                  </div>
                  <Link to="/build" className="block w-full text-center bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-2xl text-sm transition-all">
                    🛠️ Build Custom Team →
                  </Link>
                  <button onClick={downloadPDF}
                    className="block w-full text-center bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold py-2.5 rounded-xl text-xs transition-all">
                    📄 Download PDF Report
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
