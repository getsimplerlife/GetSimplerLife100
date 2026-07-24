import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import type { IndustryHub } from "~/content/industries";
import { automationLibrary, type AutomationCard } from "~/content/automation-library";

interface IndustryRecommendationEngineProps {
  industry: IndustryHub;
}

export function IndustryRecommendationEngine({ industry }: IndustryRecommendationEngineProps) {
  const [companySize, setCompanySize] = useState<"small" | "medium" | "large">("medium");
  const [selectedTools, setSelectedTools] = useState<string[]>(["outlook", "quickbooks"]);
  const [selectedPains, setSelectedPains] = useState<number[]>(
    industry.painPoints.map((_, i) => i) // Select all by default
  );

  const [annualSavings, setAnnualSavings] = useState(0);
  const [hoursSavedPerMonth, setHoursSavedPerMonth] = useState(0);
  const [matchingWorkflows, setMatchingWorkflows] = useState<AutomationCard[]>([]);

  // Calculate savings dynamically
  useEffect(() => {
    // 1. Calculate base hours wasted per week from selected pain points
    let weeklyHoursWasted = 0;
    selectedPains.forEach((pIdx) => {
      const pain = industry.painPoints[pIdx];
      if (pain && pain.hoursPerWeek) {
        weeklyHoursWasted += pain.hoursPerWeek;
      }
    });

    // 2. Adjust weekly hours based on company size multiplier
    // Small: 0.6x, Medium: 1.0x, Large: 2.2x
    const sizeMultiplier = companySize === "small" ? 0.6 : companySize === "medium" ? 1.0 : 2.2;
    const adjustedWeeklyHours = weeklyHoursWasted * sizeMultiplier;

    // 3. AI efficiency rate is 85%
    const efficiencyRate = 0.85;
    const monthlyHoursSaved = adjustedWeeklyHours * 4.33 * efficiencyRate;

    // 4. Translate to annual dollar savings (average fully loaded ops rate: $45/hr)
    const hourlyRate = 45;
    const annualCashSaved = monthlyHoursSaved * hourlyRate * 12;

    setHoursSavedPerMonth(Math.round(monthlyHoursSaved));
    setAnnualSavings(Math.round(annualCashSaved));

    // 5. Filter automation library cards to show recommendations
    // Find up to 4 matching automation workflows in this industry
    const matches = automationLibrary.filter((card) =>
      card.industry.includes(industry.id)
    );

    // Filter cards to match selected pain points or selected tools if possible
    // Otherwise return top 4 industry workflows
    setMatchingWorkflows(matches.slice(0, 4));
  }, [companySize, selectedPains, selectedTools, industry]);

  const toggleTool = (tool: string) => {
    if (selectedTools.includes(tool)) {
      setSelectedTools(selectedTools.filter((t) => t !== tool));
    } else {
      setSelectedTools([...selectedTools, tool]);
    }
  };

  const togglePain = (idx: number) => {
    if (selectedPains.includes(idx)) {
      setSelectedPains(selectedPains.filter((i) => i !== idx));
    } else {
      setSelectedPains([...selectedPains, idx]);
    }
  };

  // Tool categories for display
  const toolsList = [
    { id: "sap", name: "SAP S/4HANA", icon: "💎" },
    { id: "oracle-netsuite", name: "NetSuite", icon: "🌐" },
    { id: "quickbooks", name: "QuickBooks", icon: "🟢" },
    { id: "salesforce", name: "Salesforce", icon: "☁️" },
    { id: "hubspot", name: "HubSpot", icon: "🧡" },
    { id: "outlook", name: "Email / Outlook", icon: "📧" },
    { id: "slack", name: "Slack / Teams", icon: "💬" },
    { id: "sharepoint", name: "SharePoint", icon: "📁" },
  ];

  return (
    <div className="bg-stone-900/30 border border-stone-800 rounded-[2.5rem] p-8 lg:p-12 shadow-2xl space-y-12 relative overflow-hidden backdrop-blur-md">
      {/* Glow backgrounds */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full filter blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full filter blur-3xl pointer-events-none" />

      {/* Title */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold rounded-full text-xs uppercase tracking-widest">
          Interactive Operational Audit
        </span>
        <h2 className="text-3xl lg:text-5xl font-black text-white tracking-tight">
          AI Recommendation Engine
        </h2>
        <p className="text-stone-400 text-sm lg:text-base leading-relaxed">
          Select your business profile, paint points, and software integrations. Our recommendation model will calculate your real-time hours saved and configure the perfect AI Operations Team for your stack.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-10 items-start">
        {/* Left Input Configuration Column (5 cols) */}
        <div className="lg:col-span-5 space-y-8 bg-stone-950/50 border border-stone-850 p-6 lg:p-8 rounded-3xl">
          {/* Step 1: Company Size */}
          <div className="space-y-3">
            <label className="text-xs font-mono font-bold uppercase tracking-widest text-stone-500">
              01. Select Company Size
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "small", label: "1-50", desc: "Small Business" },
                { id: "medium", label: "51-250", desc: "Mid-Market" },
                { id: "large", label: "251+", desc: "Enterprise" },
              ].map((size) => (
                <button
                  key={size.id}
                  onClick={() => setCompanySize(size.id as any)}
                  className={`py-3 px-2 rounded-xl text-center border transition-all flex flex-col items-center justify-center ${
                    companySize === size.id
                      ? "bg-emerald-500/10 border-emerald-500 text-white shadow-lg shadow-emerald-950/20"
                      : "bg-stone-900/40 border-stone-800 text-stone-400 hover:border-stone-700"
                  }`}
                >
                  <span className="text-sm font-bold block">{size.label}</span>
                  <span className="text-[9px] font-mono mt-0.5 text-stone-500">{size.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Pain Point Toggles */}
          <div className="space-y-3">
            <label className="text-xs font-mono font-bold uppercase tracking-widest text-stone-500 block">
              02. Identify Active Pain Points
            </label>
            <div className="space-y-2.5">
              {industry.painPoints.map((pain, idx) => {
                const isChecked = selectedPains.includes(idx);
                return (
                  <div
                    key={idx}
                    onClick={() => togglePain(idx)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                      isChecked
                        ? "bg-emerald-500/5 border-emerald-500/40 text-stone-200"
                        : "bg-stone-900/20 border-stone-850 hover:border-stone-700 text-stone-400"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 rounded mt-0.5 border flex items-center justify-center text-[10px] font-black transition-colors ${
                        isChecked
                          ? "bg-emerald-500 border-emerald-400 text-stone-950"
                          : "border-stone-700 bg-stone-950"
                      }`}
                    >
                      {isChecked && "✓"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs font-bold block truncate">{pain.title}</span>
                        {pain.hoursPerWeek && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 shrink-0">
                            ~{pain.hoursPerWeek}h
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 3: Software Tools */}
          <div className="space-y-3">
            <label className="text-xs font-mono font-bold uppercase tracking-widest text-stone-500 block">
              03. Select Active Software Stack
            </label>
            <div className="grid grid-cols-2 gap-2">
              {toolsList.map((tool) => {
                const isSelected = selectedTools.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    className={`py-2 px-3 rounded-xl border text-left transition-all flex items-center gap-2 select-none ${
                      isSelected
                        ? "bg-indigo-500/10 border-indigo-500 text-white"
                        : "bg-stone-900/40 border-stone-800 text-stone-400 hover:border-stone-700"
                    }`}
                  >
                    <span className="text-sm">{tool.icon}</span>
                    <span className="text-[11px] font-bold truncate">{tool.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Output Calculations Column (7 cols) */}
        <div className="lg:col-span-7 space-y-8">
          {/* Dashboard ROI Card */}
          <div className="bg-gradient-to-br from-stone-900/90 to-stone-950 border border-stone-800 rounded-3xl p-6 lg:p-8 flex flex-col md:flex-row items-center gap-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 h-32 w-32 bg-emerald-500/10 rounded-full filter blur-2xl pointer-events-none" />

            <div className="flex-1 text-center md:text-left space-y-2">
              <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-widest">
                Est. Financial Impact
              </span>
              <h3 className="text-2xl font-black text-white">Your Custom AI ROI</h3>
              <p className="text-stone-400 text-xs leading-relaxed">
                By automating these selected operational workflows, your team can eliminate manual bottlenecks, improve processing accuracy, and reduce data input errors to zero.
              </p>
              <div className="pt-4 flex flex-wrap gap-4 justify-center md:justify-start">
                <Link
                  to="/assessment"
                  className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 px-5 py-2.5 rounded-xl text-xs font-bold transition-all transform hover:-translate-y-0.5 shadow-md shadow-emerald-950/20"
                >
                  Book Full Assessment →
                </Link>
                <a
                  href="#audit"
                  className="bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                >
                  Buy Operations Audit
                </a>
              </div>
            </div>

            <div className="w-full md:w-52 shrink-0 space-y-4">
              {/* Cash Savings Indicator */}
              <div className="bg-stone-950 border border-stone-850 p-4 rounded-2xl text-center shadow-inner">
                <div className="text-[10px] font-mono font-black text-stone-500 uppercase tracking-wider mb-1">
                  Annual Savings
                </div>
                <div className="text-2xl lg:text-3xl font-black text-emerald-400 animate-pulse">
                  ${annualSavings.toLocaleString()}
                </div>
                <div className="text-[9px] font-mono text-stone-400 mt-1">
                  Cash savings / year
                </div>
              </div>

              {/* Hours Saved Indicator */}
              <div className="bg-stone-950 border border-stone-850 p-4 rounded-2xl text-center shadow-inner">
                <div className="text-[10px] font-mono font-black text-stone-500 uppercase tracking-wider mb-1">
                  Reclaimed Time
                </div>
                <div className="text-2xl lg:text-3xl font-black text-indigo-400">
                  {hoursSavedPerMonth} hrs
                </div>
                <div className="text-[9px] font-mono text-stone-400 mt-1">
                  Reclaimed / month
                </div>
              </div>
            </div>
          </div>

          {/* Recommended Workflows Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-mono font-bold uppercase tracking-widest text-stone-500">
              ⚡ Recommended AI Operational Workflows
            </h3>

            <div className="grid sm:grid-cols-2 gap-4">
              {matchingWorkflows.map((card) => (
                <div
                  key={card.id}
                  className="p-5 bg-stone-900/50 border border-stone-850 rounded-2xl hover:border-emerald-500/20 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <span className="text-[10px] font-mono font-bold bg-stone-950 border border-stone-850 text-stone-400 px-2.5 py-0.5 rounded-full uppercase">
                        {card.difficulty} Setup
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        🛡️ Active
                      </span>
                    </div>

                    <h4 className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors">
                      {card.name}
                    </h4>
                    <p className="text-[11px] text-stone-400 leading-relaxed mt-2 line-clamp-3">
                      {card.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-stone-850/60 space-y-3">
                    <div className="flex justify-between text-[10px] font-mono text-stone-500">
                      <span>Est. ROI Impact:</span>
                      <span className="text-white font-bold">{card.timeSaved.split(" ")[0]} hrs saved</span>
                    </div>

                    <a
                      href="https://buy.stripe.com/14A8wRgFp0RFd5Feec2Fa1a"
                      target="_blank"
                      rel="noreferrer"
                      className="w-full bg-stone-950 border border-stone-800 hover:bg-stone-900 hover:border-stone-700 text-stone-200 text-center py-2 rounded-xl text-xs font-bold block transition-all font-mono"
                    >
                      Buy Blueprint Assessment →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
