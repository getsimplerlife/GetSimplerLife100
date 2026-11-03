import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";

export interface RicherROICalculatorProps {
  embed?: boolean;
}

/**
 * LOCKED PLATFORM TIERS (owner 09-27): one platform, every capability in every
 * tier. Tiers differ by scale limits, governance and support. There is no setup
 * fee: the buyer's only cost is the monthly platform subscription, so the model
 * below costs the subscription (annualised) instead of a one-off implementation
 * charge.
 */
const PLATFORM_TIERS = [
  { name: "Starter", monthly: 199, employees: "10-30", paymentLink: "/pricing" },
  { name: "Growth", monthly: 599, employees: "30-100", paymentLink: "/pricing" },
  { name: "Enterprise", monthly: 1499, employees: "100+", paymentLink: "/pricing" },
];

function getRecommendedTier(emps: number) {
  if (emps <= 30) return PLATFORM_TIERS[0];
  if (emps <= 100) return PLATFORM_TIERS[1];
  return PLATFORM_TIERS[2];
}

/**
 * SLICE 187 — what this calculator used to do and no longer does.
 *
 * It carried eight industry presets that filled the sliders with invented
 * per-industry numbers (headcount, hourly cost, minutes per task, an error
 * rate), multiplied the result by an unexplained reclamation rate of 0.85,
 * added an "error cost" saving worth three times the task rate, and presented
 * the sum as the visitor's ROI.
 *
 * Every one of those constants is gone. The model is now arithmetic on what the
 * visitor sets on the sliders, plus ONE labelled assumption they own — the share
 * of the work automation takes — which is a slider, not a hidden multiplier.
 * The arithmetic is printed so it can be checked.
 */
export function RicherROICalculator({ embed = false }: RicherROICalculatorProps) {
  const [showResults, setShowResults] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const [employees, setEmployees] = useState(50);
  const [hourlyCost, setHourlyCost] = useState(35);
  const [tasksPerDay, setTasksPerDay] = useState(5);
  const [timePerTask, setTimePerTask] = useState(20);
  // The one assumption nobody can measure before a pilot — the visitor's to set.
  const [reclamationShare, setReclamationShare] = useState(50);
  // A stated, editable planning default, not a measured fact.
  const [workingDays, setWorkingDays] = useState(250);

  const [annualHoursSaved, setAnnualHoursSaved] = useState(0);
  const [totalAnnualSavings, setTotalAnnualSavings] = useState(0);
  const [paybackMonths, setPaybackMonths] = useState(0);
  const [threeYearNetImpact, setThreeYearNetImpact] = useState(0);
  const [currentAnnualLaborCost, setCurrentAnnualLaborCost] = useState(0);
  const [dailyHours, setDailyHours] = useState(0);
  const [annualHours, setAnnualHours] = useState(0);

  const recommendedTier = getRecommendedTier(employees);
  // No setup fee: the buyer's only cost is the monthly subscription.
  const monthlyCost = recommendedTier.monthly;
  const annualPlatformCost = monthlyCost * 12;

  useEffect(() => {
    const perDay = (employees * tasksPerDay * timePerTask) / 60;
    const perYear = perDay * workingDays;
    const share = reclamationShare / 100;
    const hoursSaved = perYear * share;
    const savings = hoursSaved * hourlyCost;
    const laborCost = perYear * hourlyCost;
    // Payback against one year of platform subscription (there is no setup fee).
    const payback = savings > 0 ? (annualPlatformCost / savings) * 12 : 0;
    const netImpact = savings * 3 - annualPlatformCost * 3;

    setDailyHours(perDay);
    setAnnualHours(perYear);
    setCurrentAnnualLaborCost(laborCost);
    setAnnualHoursSaved(hoursSaved);
    setTotalAnnualSavings(savings);
    setPaybackMonths(payback);
    setThreeYearNetImpact(netImpact);
  }, [employees, hourlyCost, tasksPerDay, timePerTask, reclamationShare, workingDays, annualPlatformCost]);

  const timelineMonths = [1, 3, 6, 12, 24];

  const arithmetic = [
    `${employees} people × ${tasksPerDay} tasks/day × ${timePerTask} min ÷ 60 = ${dailyHours.toFixed(1)} hours of manual work a day`,
    `${dailyHours.toFixed(1)} hours/day × ${workingDays} working days = ${Math.round(annualHours).toLocaleString()} hours a year`,
    `${Math.round(annualHours).toLocaleString()} hours × $${hourlyCost}/hour = $${Math.round(currentAnnualLaborCost).toLocaleString()} a year of labour`,
    `× ${reclamationShare}% (the share you set) = $${Math.round(totalAnnualSavings).toLocaleString()} a year`,
  ];

  const handleCaptureEmail = async () => {
    if (!email.trim() || emailSent) return;
    try {
      await fetch("/api/tools/capture-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          toolName: "roi-calculator",
          result: {
            employees,
            hourlyCost,
            tasksPerDay,
            timePerTask,
            reclamationShare,
            workingDays,
            annualHoursSaved,
            totalAnnualSavings,
            paybackMonths,
            threeYearNetImpact,
            recommendedTier: recommendedTier.name,
          },
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
    pdf.text("Operations ROI Model", w / 2, y, { align: "center" });
    y += 12;
    pdf.setFontSize(10);
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, w / 2, y, { align: "center" });
    y += 14;
    pdf.setDrawColor(200);
    pdf.line(20, y, w - 20, y);
    y += 10;
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    pdf.text(`People: ${employees}`, 20, y);
    pdf.text(`Tasks/Day: ${tasksPerDay}`, 120, y);
    y += 8;
    pdf.text(`Cost/Hour: $${hourlyCost}`, 20, y);
    pdf.text(`Minutes/Task: ${timePerTask}`, 120, y);
    y += 8;
    pdf.text(`Working Days/Year: ${workingDays}`, 20, y);
    pdf.text(`Share Automation Takes: ${reclamationShare}%`, 120, y);
    y += 12;
    pdf.setFontSize(14);
    pdf.setTextColor(16, 185, 129);
    pdf.text("The arithmetic", 20, y);
    y += 8;
    pdf.setFontSize(10);
    pdf.setTextColor(0);
    for (const line of arithmetic) {
      pdf.text(line, 20, y);
      y += 6;
    }
    y += 4;
    pdf.text("The share you set is your assumption, not a result we measured.", 20, y);
    y += 10;
    pdf.text(`Annual Hours Reclaimed: ${Math.round(annualHoursSaved).toLocaleString()}`, 20, y);
    y += 7;
    pdf.text(`Annual Savings: $${Math.round(totalAnnualSavings).toLocaleString()}`, 20, y);
    y += 7;
    pdf.text(`Payback Period: ${paybackMonths.toFixed(1)} months`, 20, y);
    y += 7;
    pdf.text(`3-Year Net Impact: $${Math.round(threeYearNetImpact).toLocaleString()}`, 20, y);
    y += 7;
    pdf.text(`Recommended Tier: ${recommendedTier.name} ($${recommendedTier.monthly}/mo, no setup fee)`, 20, y);
    pdf.save("simpler-life-100-roi-model.pdf");
  };

  return (
    <div className={`w-full ${embed ? "" : "max-w-6xl mx-auto"} text-stone-100 font-sans`}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT COLUMN: Inputs & Sliders (7 Cols) */}
        <div className="lg:col-span-7 bg-stone-900/60 rounded-3xl p-6 lg:p-8 border border-stone-800/80 backdrop-blur-md space-y-6">
          <div className="border-b border-stone-800 pb-4">
            <h3 className="text-xl font-black text-white flex items-center gap-2"><span>🎛️</span> Your Operations Parameters</h3>
            <p className="text-xs text-stone-400 mt-1">
              Every number below is yours. We have not measured your team's work, so we do not pre-fill it with a figure of ours.
            </p>
          </div>

          <div className="space-y-6">
            {/* Employees */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">People doing this work</span>
                <span className="text-emerald-400 font-black text-base">{employees}</span>
              </div>
              <input type="range" min="5" max="300" step="5" value={employees} onChange={(e) => setEmployees(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>

            {/* Hourly Cost */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Fully loaded cost per hour</span>
                <span className="text-emerald-400 font-black text-base">${hourlyCost}</span>
              </div>
              <input type="range" min="15" max="150" step="1" value={hourlyCost} onChange={(e) => setHourlyCost(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>

            {/* Tasks Per Day */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Repetitive tasks per person per day</span>
                <span className="text-emerald-400 font-black text-base">{tasksPerDay}</span>
              </div>
              <input type="range" min="1" max="30" step="1" value={tasksPerDay} onChange={(e) => setTasksPerDay(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>

            {/* Time Per Task */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">Minutes per task</span>
                <span className="text-emerald-400 font-black text-base">{timePerTask} min</span>
              </div>
              <input type="range" min="1" max="60" step="1" value={timePerTask} onChange={(e) => setTimePerTask(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>

            {/* Working days — a stated planning default, editable */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">
                  Working days a year
                  <span className="text-stone-500 font-normal"> — planning default, change it</span>
                </span>
                <input type="number" min={1} max={366} value={workingDays}
                  onChange={(e) => setWorkingDays(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-sm text-emerald-400 font-black text-right outline-none focus:border-stone-600" />
              </div>
            </div>

            {/* The one assumption */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-stone-300">
                  Share of that work automation takes
                  <span className="text-stone-500 font-normal"> — your assumption</span>
                </span>
                <span className="text-emerald-400 font-black text-base">{reclamationShare}%</span>
              </div>
              <input type="range" min="0" max="100" step="5" value={reclamationShare} onChange={(e) => setReclamationShare(parseInt(e.target.value))}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
              <p className="text-[10px] text-stone-500">
                Nobody can know this before a pilot. It is the only guess in the model, and it is yours to set.
              </p>
            </div>

            {/* Recommended Tier Display */}
            <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 text-center">
              <div className="text-xs font-mono text-stone-400 mb-1">TIER FOR A TEAM THIS SIZE</div>
              <div className="text-lg font-black text-emerald-400">{recommendedTier.name}</div>
              <div className="text-sm text-stone-400">${recommendedTier.monthly}/mo, no setup fee — {recommendedTier.employees} employees</div>
            </div>

            {/* See My ROI Button */}
            <button onClick={() => { if (!showResults) setShowResults(true); }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3.5 rounded-2xl text-sm transition-all shadow-lg">
              🔍 See My Projection
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Results (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Key Stats */}
          <div className="bg-stone-900/60 rounded-3xl p-6 lg:p-8 border border-stone-800/80 space-y-5">
            <h3 className="text-lg font-black text-white">What this work costs you</h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-xl bg-stone-950/60 border border-stone-800/50 px-4 py-3">
                <span className="text-xs font-mono text-stone-400">CURRENT ANNUAL LABOR COST</span>
                <span className="text-sm font-black text-white">${Math.round(currentAnnualLaborCost).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-stone-950/60 border border-emerald-500/20 px-4 py-3">
                <span className="text-xs font-mono text-emerald-400">AT THE SHARE YOU SET</span>
                <span className="text-sm font-black text-emerald-400">${Math.round(totalAnnualSavings).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-stone-950/60 border border-stone-800/50 px-4 py-3">
                <span className="text-xs font-mono text-stone-400">ANNUAL SUBSCRIPTION</span>
                <span className="text-sm font-black text-white">${annualPlatformCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-stone-950/60 border border-stone-800/50 px-4 py-3">
                <span className="text-xs font-mono text-stone-400">PAYBACK AT THAT SHARE</span>
                <span className="text-sm font-black text-white">{paybackMonths.toFixed(1)} months</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-emerald-950/40 border border-emerald-500/30 px-4 py-3">
                <span className="text-xs font-mono text-emerald-300">3-YEAR NET AT THAT SHARE</span>
                <span className="text-sm font-black text-emerald-300">${Math.round(threeYearNetImpact).toLocaleString()}</span>
              </div>
            </div>

            {/* The arithmetic, printed */}
            <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-2">The arithmetic</div>
              {arithmetic.map((line) => (
                <div key={line} className="text-[11px] font-mono text-stone-300 leading-relaxed">{line}</div>
              ))}
            </div>

            <p className="text-[10px] text-stone-500 italic">
              These are your inputs, not our measurements. Your real numbers depend on your process,
              and only a pilot measures the share automation actually takes.
            </p>

            {/* Timeline */}
            <div className="space-y-2">
              <div className="text-xs font-mono text-stone-400 mb-2">CUMULATIVE NET AT THAT SHARE</div>
              {timelineMonths.map((m) => {
                const savingsAtMonth = (totalAnnualSavings / 12) * m;
                const netValue = savingsAtMonth - monthlyCost * m;
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
                <p className="text-xs text-stone-400">Enter your email to unlock the tier breakdown:</p>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl p-2.5 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-emerald-700 text-center" />
                <button onClick={handleCaptureEmail} disabled={!email.trim()}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-400 text-black font-bold text-sm py-2.5 rounded-xl transition-all">
                  Unlock Tier Breakdown →
                </button>
              </div>
            ) : (
              <>
                {/* 3-Year Net Return */}
                <div className="pt-4 border-t border-stone-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-stone-400 uppercase block">3-Year Net at That Share</span>
                    <span className="text-xl font-black text-white">${Math.round(threeYearNetImpact).toLocaleString()}</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                    {(threeYearNetImpact / (annualPlatformCost * 3)).toFixed(1)}x return on subscription
                  </span>
                </div>

                {/* Platform Tiers CTA */}
                <div className="p-5 bg-gradient-to-br from-emerald-900/40 to-stone-900 rounded-3xl border border-emerald-500/10 space-y-4">
                  <h4 className="text-base font-black text-white text-center">One platform, every capability</h4>
                  <div className="space-y-2">
                    {PLATFORM_TIERS.map((tier) => {
                      const isRecommended = tier.name === recommendedTier.name;
                      return (
                        <Link key={tier.name} to="/pricing"
                          className={`block p-3 rounded-xl text-center transition-all ${
                            isRecommended ? "bg-emerald-600/20 border-2 border-emerald-500" : "bg-stone-950/60 border border-stone-800 hover:border-stone-700"
                          }`}>
                          <div className="flex justify-between items-center">
                            <span className={`text-sm font-bold ${isRecommended ? "text-emerald-400" : "text-stone-300"}`}>
                              {tier.name} {isRecommended && "★"}
                            </span>
                            <span className="text-sm font-black text-white">${tier.monthly}/mo</span>
                          </div>
                          <div className="text-[10px] text-stone-500 mt-0.5">
                            {tier.employees} employees · ${tier.monthly}/mo
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  <Link to="/pricing" className="block w-full text-center bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-2xl text-sm transition-all">
                    See the full pricing →
                  </Link>
                  <button onClick={downloadPDF}
                    className="block w-full text-center bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold py-2.5 rounded-xl text-xs transition-all">
                    📄 Download PDF
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
