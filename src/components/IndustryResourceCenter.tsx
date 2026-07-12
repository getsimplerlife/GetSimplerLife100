import { useState, useMemo } from "react";
import { industryResources, type IndustryResource } from "~/content/industry-resource-center";

interface IndustryResourceCenterProps {
  industryId: string;
}

export function IndustryResourceCenter({ industryId }: IndustryResourceCenterProps) {
  // Find matching industry resource data
  const data = useMemo(() => {
    return industryResources.find((r) => r.id === industryId || r.industry.includes(industryId)) || null;
  }, [industryId]);

  if (!data) {
    return (
      <div className="text-center py-12 text-stone-500 text-xs font-mono">
        Resource center data not found for industry: {industryId}
      </div>
    );
  }

  // 1. Top Automations state & logic
  const [automationSearch, setAutomationSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "time">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filteredAutomations = useMemo(() => {
    let list = [...data.topAutomations];
    if (automationSearch) {
      const q = automationSearch.toLowerCase().trim();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      if (sortField === "name") {
        return sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else {
        // Parse "18 hrs/week" into numbers
        const numA = parseInt(a.timeSaved) || 0;
        const numB = parseInt(b.timeSaved) || 0;
        return sortOrder === "asc" ? numA - numB : numB - numA;
      }
    });

    return list;
  }, [data, automationSearch, sortField, sortOrder]);

  const toggleSort = (field: "name" | "time") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc"); // Default to desc for time, asc for name
    }
  };

  // 2. ROI Calculator Sliders state
  const [hourlyRate, setHourlyRate] = useState(data.roiCalculatorConfig.avgHourlyRate);
  const [hoursPerWeek, setTypicalHours] = useState(data.roiCalculatorConfig.typicalHoursPerWeek);

  // Calculations
  const annualHoursSaved = useMemo(() => {
    // typical saved hours estimated from top automation average (~12 hrs) * multiplier
    const rawWeeklySavings = hoursPerWeek * data.roiCalculatorConfig.savingsMultiplier;
    return Math.round(rawWeeklySavings * 52);
  }, [hoursPerWeek, data]);

  const annualDollarSavings = useMemo(() => {
    return Math.round(annualHoursSaved * hourlyRate);
  }, [annualHoursSaved, hourlyRate]);

  const paybackDays = useMemo(() => {
    const months = data.roiCalculatorConfig.breakEvenMonths;
    return Math.round(months * 30.4);
  }, [data]);

  // 3. FAQ index state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // 4. Checklist state
  const [checkedItems, setCheckedCheckedItems] = useState<Record<number, boolean>>({});

  const toggleChecklist = (index: number) => {
    setCheckedCheckedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <div className="w-full py-20 px-6 bg-stone-950 border-t border-stone-900 space-y-24">
      <div className="max-w-6xl mx-auto space-y-4 text-center">
        <span className="text-xs font-mono font-bold tracking-widest text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-3 py-1 rounded-full uppercase">
          📚 Resource Center & Audit Toolkit
        </span>
        <h2 className="text-3xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
          Operational Intelligence Hub
        </h2>
        <p className="text-stone-400 text-sm lg:text-base max-w-2xl mx-auto leading-relaxed">
          Deep-dive blueprint audits, ROI configurations, and implementation frameworks customized for your industry.
        </p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Top 25 Automations & Directory */}
        <div className="lg:col-span-2 space-y-8 bg-stone-900/30 border border-stone-850 p-6 rounded-3xl">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span>📊</span> Top {data.topAutomations.length} Deployable Blueprints
              </h3>
              <input
                type="text"
                value={automationSearch}
                onChange={(e) => setAutomationSearch(e.target.value)}
                placeholder="Search workflows..."
                className="bg-stone-950 border border-stone-850 focus:border-emerald-600 rounded-xl px-3 py-1.5 text-xs text-stone-200 outline-none placeholder:text-stone-700 w-full sm:w-48"
              />
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              Click column headers to sort by workflow name or weekly hours recovered. Fully auditable on S1 platform.
            </p>
          </div>

          {/* Table */}
          <div className="border border-stone-850/80 rounded-2xl overflow-hidden bg-stone-950/40">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-900/50 border-b border-stone-850 text-stone-400 font-mono text-[10px] tracking-wider uppercase">
                  <th 
                    onClick={() => toggleSort("name")}
                    className="p-4 cursor-pointer hover:text-white transition-colors"
                  >
                    Workflow Name {sortField === "name" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th 
                    onClick={() => toggleSort("time")}
                    className="p-4 cursor-pointer hover:text-white transition-colors text-right"
                  >
                    Est. Saved Time {sortField === "time" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="p-4 text-center">Complexity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900">
                {filteredAutomations.map((aut, idx) => (
                  <tr key={idx} className="hover:bg-stone-900/20 transition-colors">
                    <td className="p-4 font-bold text-stone-200">{aut.name}</td>
                    <td className="p-4 text-right font-mono font-bold text-emerald-400">{aut.timeSaved}</td>
                    <td className="p-4 text-center">
                      <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                        aut.difficulty === "easy" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10" :
                        aut.difficulty === "medium" ? "bg-amber-500/10 text-amber-400 border border-amber-500/10" :
                        "bg-rose-500/10 text-rose-400 border border-rose-500/10"
                      }`}>
                        {aut.difficulty}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredAutomations.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-stone-600 text-xs font-mono">
                      No matching workflows found. Try resetting search query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: ROI Calculator, Integrations, Checklist */}
        <div className="space-y-8">
          {/* ROI CONFIG & CALCULATOR CARD */}
          <div className="bg-stone-900/30 border border-stone-850 p-6 rounded-3xl space-y-6">
            <div className="space-y-1">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>🪙</span> Custom ROI Projections
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Adjust sliders to model financial payback thresholds based on your typical overhead rate.
              </p>
            </div>

            <div className="space-y-4">
              {/* Slider 1: Hourly Rate */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-stone-400">Overhead Rate (per hr)</span>
                  <span className="font-mono font-bold text-emerald-400">${hourlyRate}/hr</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="150"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-stone-950 rounded-lg outline-none cursor-pointer"
                />
              </div>

              {/* Slider 2: Typical Weekly Hours worked manually */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-stone-400">Manual Effort Workload</span>
                  <span className="font-mono font-bold text-emerald-400">{hoursPerWeek} hrs/week</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  value={hoursPerWeek}
                  onChange={(e) => setTypicalHours(Number(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-stone-950 rounded-lg outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Calculations Output Grid */}
            <div className="grid grid-cols-2 gap-3 bg-stone-950/40 p-4 border border-stone-850/60 rounded-2xl text-center">
              <div>
                <div className="text-[9px] font-mono text-stone-500 uppercase">Annual Recovered Hours</div>
                <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                  {annualHoursSaved} hrs
                </div>
              </div>
              <div>
                <div className="text-[9px] font-mono text-stone-500 uppercase">Net Annual Savings</div>
                <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                  ${annualDollarSavings.toLocaleString()}
                </div>
              </div>
              <div className="col-span-2 pt-2.5 mt-2.5 border-t border-stone-850/60 flex items-center justify-between text-left text-[10px] text-stone-400 font-mono">
                <span>Est. Break-Even:</span>
                <span className="text-white font-bold">{paybackDays} days (S1 Deployment)</span>
              </div>
            </div>
          </div>

          {/* IMPLEMENTATION CHECKLIST */}
          <div className="bg-stone-900/30 border border-stone-850 p-6 rounded-3xl space-y-4">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span>📋</span> S1 Implementation Checklist
            </h3>
            <p className="text-xs text-stone-500 leading-normal">
              Track setup criteria required before dispatching autonomous coworkers.
            </p>

            <ul className="space-y-2.5 pt-2">
              {data.checklistTopics.map((topic, i) => {
                const isChecked = !!checkedItems[i];
                return (
                  <li 
                    key={i} 
                    onClick={() => toggleChecklist(i)}
                    className="flex items-start gap-3 p-2.5 bg-stone-950/40 hover:bg-stone-950/80 border border-stone-850/60 rounded-xl text-xs cursor-pointer select-none transition-colors"
                  >
                    <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 text-[10px] font-bold ${
                      isChecked ? "bg-emerald-600 border-emerald-500 text-stone-950" : "border-stone-800"
                    }`}>
                      {isChecked && "✓"}
                    </span>
                    <span className={`leading-tight ${isChecked ? "text-stone-500 line-through" : "text-stone-300"}`}>
                      {topic}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* COMMON INTEGRATIONS TAGS */}
          <div className="bg-stone-900/30 border border-stone-850 p-6 rounded-3xl space-y-3">
            <h3 className="text-xs font-mono font-bold text-stone-400 uppercase tracking-widest">[ Certified Connectors ]</h3>
            <div className="flex flex-wrap gap-1.5">
              {data.commonIntegrations.map((intg) => (
                <span key={intg} className="px-2.5 py-1 bg-stone-950 border border-stone-850 text-xs font-mono font-bold text-stone-300 rounded-xl">
                  {intg}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Case Studies Snippets Section */}
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="border-b border-stone-900 pb-3">
          <h3 className="text-lg font-black text-white flex items-center gap-2">
            <span>🏆</span> Peer Success Stories & Impact Metrics
          </h3>
          <p className="text-xs text-stone-500">How other firms deployed custom automation roadmaps.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {data.caseStudySnippets.map((snippet, sIdx) => (
            <div key={sIdx} className="bg-stone-900/20 border border-stone-850 p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between">
              <span className="absolute top-2 right-2 text-3xl opacity-10 pointer-events-none font-mono">0{sIdx + 1}</span>
              <p className="text-xs text-stone-300 leading-relaxed font-medium">
                "{snippet}"
              </p>
              <div className="pt-4 border-t border-stone-850/60 mt-4 text-[10px] font-mono text-stone-500">
                VERIFIED OUTCOME SN-{(sIdx + 1)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQs Section */}
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <h3 className="text-xl font-black text-white">Frequently Asked Questions</h3>
          <p className="text-xs text-stone-500">Everything you need to know about setting up S1.</p>
        </div>

        <div className="space-y-3">
          {data.faqs.map((faq, fIdx) => {
            const isOpen = openFaqIndex === fIdx;
            return (
              <div 
                key={fIdx} 
                className="bg-stone-900/20 border border-stone-850 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : fIdx)}
                  className="w-full text-left p-5 flex items-center justify-between text-xs font-bold text-white hover:text-emerald-400 transition-colors"
                >
                  <span>{faq.question}</span>
                  <span className="font-mono text-emerald-500 pl-4">{isOpen ? "[-]" : "[+]"}</span>
                </button>
                {isOpen && (
                  <div className="p-5 bg-stone-950/40 border-t border-stone-850/60 text-xs text-stone-400 leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
