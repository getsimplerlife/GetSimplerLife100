import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import type { IndustryHub } from "~/content/industries";
import { automationLibrary, type AutomationCard } from "~/content/automation-library";

interface IndustryRecommendationEngineProps {
  industry: IndustryHub;
}

/**
 * SLICE 187 — what this engine used to do and no longer does.
 *
 * It read a per-pain-point hours figure baked into `content/industries.ts`,
 * scaled it by a company-size ladder, scaled that again by an "AI efficiency
 * rate", and priced the result at a flat hourly rate — then rendered the total
 * as "Annual Savings" with no disclaimer. Every one of those four numbers was
 * invented: the visitor's clicks only chose WHICH invented baseline was added
 * up. All four are gone from both this file and the content file.
 *
 * Now the matching is still real (their pain points and their stack pick the
 * workflows), but the money is arithmetic on three things they state, shown
 * next to the output and changeable there. The share is the only assumption and
 * it is labelled as theirs.
 */
export function IndustryRecommendationEngine({ industry }: IndustryRecommendationEngineProps) {
  const [companySize, setCompanySize] = useState<"small" | "medium" | "large">("medium");
  const [selectedTools, setSelectedTools] = useState<string[]>(["outlook", "quickbooks"]);
  const [selectedPains, setSelectedPains] = useState<number[]>(
    industry.painPoints.map((_, i) => i) // Select all by default
  );

  // The visitor's own numbers. Nothing here is a figure of ours.
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [hourlyCost, setHourlyCost] = useState(45);
  const [automationShare, setAutomationShare] = useState(0.5);

  const [matchingWorkflows, setMatchingWorkflows] = useState<AutomationCard[]>([]);

  // Company size does exactly one honest job: it picks the tier we would
  // actually sell a team that size (locked prices, no setup fee).
  const tierForSize =
    companySize === "small"
      ? { name: "Starter", monthly: 199 }
      : companySize === "medium"
        ? { name: "Growth", monthly: 599 }
        : { name: "Enterprise", monthly: 1499 };

  const weeksPerYear = 52;
  const annualHours = weeklyHours * weeksPerYear;
  const annualLaborValue = annualHours * hourlyCost;
  const annualSavings = annualLaborValue * automationShare;
  const hoursSavedPerMonth = (annualHours * automationShare) / 12;

  const arithmetic = [
    `${weeklyHours} hours a week × ${weeksPerYear} weeks = ${annualHours.toLocaleString()} hours a year`,
    `${annualHours.toLocaleString()} hours × $${hourlyCost}/hour = $${Math.round(annualLaborValue).toLocaleString()} a year of labour`,
    `× ${Math.round(automationShare * 100)}% (the share you set) = $${Math.round(annualSavings).toLocaleString()} a year`,
  ];

  useEffect(() => {
    // Recommendations come from the visitor's own selections: the industry's
    // workflows, ranked by how many of their chosen tools each one touches.
    const matches = automationLibrary.filter((card) => card.industry.includes(industry.id));
    const scored = matches
      .map((card) => ({
        card,
        overlap: card.integrations.filter((i) => selectedTools.includes(i)).length,
      }))
      .sort((a, b) => b.overlap - a.overlap);
    setMatchingWorkflows(scored.slice(0, 4).map((s) => s.card));
  }, [selectedTools, selectedPains, industry]);

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
          Select your business profile, pain points, and software integrations. Our recommendation model will match your profile, pain points, and software to the right automations for your stack.
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
            <p className="text-[10px] font-mono text-stone-500">
              Tier for a team this size:{" "}
              <span className="text-emerald-400 font-bold">
                {tierForSize.name} — ${tierForSize.monthly}/mo, no setup fee
              </span>
            </p>
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
                Your numbers, not ours
              </span>
              <h3 className="text-2xl font-black text-white">The work you selected, priced</h3>
              <p className="text-stone-400 text-xs leading-relaxed">
                Your selections pick the workflows below. The money is arithmetic on the three inputs
                underneath — we have not measured your team's hours, rate or results.
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

            <div className="w-full md:w-64 shrink-0 space-y-4">
              {/* Cash figure — arithmetic on the inputs beside it */}
              <div className="bg-stone-950 border border-stone-850 p-4 rounded-2xl text-center shadow-inner">
                <div className="text-[10px] font-mono font-black text-stone-500 uppercase tracking-wider mb-1">
                  At the share you set
                </div>
                <div className="text-2xl lg:text-3xl font-black text-emerald-400">
                  ${Math.round(annualSavings).toLocaleString()}
                </div>
                <div className="text-[9px] font-mono text-stone-400 mt-1">
                  of annual labour, per the inputs below
                </div>
              </div>

              {/* Hours figure — same arithmetic */}
              <div className="bg-stone-950 border border-stone-850 p-4 rounded-2xl text-center shadow-inner">
                <div className="text-[10px] font-mono font-black text-stone-500 uppercase tracking-wider mb-1">
                  At the share you set
                </div>
                <div className="text-2xl lg:text-3xl font-black text-indigo-400">
                  {Math.round(hoursSavedPerMonth).toLocaleString()} hrs
                </div>
                <div className="text-[9px] font-mono text-stone-400 mt-1">
                  reclaimed / month
                </div>
              </div>
            </div>
          </div>

          {/* The three inputs behind both figures above */}
          <div className="bg-stone-950/60 border border-stone-800 rounded-2xl p-6 space-y-4">
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-stone-400">
                Your numbers — change any of them
              </h4>
              <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                We have not measured your team's hours, your labour rate, or how much of this work
                automation takes. All three are yours; the arithmetic below uses only them.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block mb-1">
                  Hours a week your team spends on these tasks
                </span>
                <input type="number" min={0} step={1} value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-100 outline-none focus:border-stone-600" />
              </label>
              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block mb-1">
                  Fully loaded cost per hour
                </span>
                <input type="number" min={0} step={1} value={hourlyCost}
                  onChange={(e) => setHourlyCost(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-100 outline-none focus:border-stone-600" />
              </label>
            </div>
            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-bold text-stone-300">
                  Share of that work automation takes
                  <span className="text-stone-500 font-normal"> — your assumption</span>
                </span>
                <span className="font-black text-emerald-400">{Math.round(automationShare * 100)}%</span>
              </div>
              <input type="range" min={0} max={100} step={5} value={Math.round(automationShare * 100)}
                onChange={(e) => setAutomationShare(Number(e.target.value) / 100)}
                className="w-full h-2 bg-stone-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
              <p className="text-[10px] text-stone-500 mt-1">
                Nobody can know this before a pilot. It is the only guess in the model, and it is yours to set.
              </p>
            </div>
            <div className="bg-stone-900/60 border border-stone-800 rounded-xl p-4 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-2">The arithmetic</div>
              {arithmetic.map((line) => (
                <div key={line} className="text-[11px] font-mono text-stone-300 leading-relaxed">{line}</div>
              ))}
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
                      <span>What it does:</span>
                      <span className="text-white font-bold">{card.timeSaved}</span>
                    </div>

                    <Link
                      to="/assessment"
                      className="w-full bg-stone-950 border border-stone-800 hover:bg-stone-900 hover:border-stone-700 text-stone-200 text-center py-2 rounded-xl text-xs font-bold block transition-all font-mono"
                    >
                      Free assessment →
                    </Link>
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
