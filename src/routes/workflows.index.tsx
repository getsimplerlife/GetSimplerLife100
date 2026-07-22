import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { automationLibrary, type AutomationCard } from "../content/automation-library";

export const Route = createFileRoute("/workflows/")({
  component: AutomationLibraryPage,
});

const INDUSTRIES = [
  { value: "all", label: "All Industries", icon: "🌐" },
  { value: "manufacturing", label: "Manufacturing", icon: "🏭" },
  { value: "logistics", label: "Logistics", icon: "🚛" },
  { value: "retail", label: "Retail & E-commerce", icon: "🛍️" },
  { value: "energy", label: "Energy & Utilities", icon: "⚡" },
  { value: "healthcare", label: "Healthcare", icon: "🏥" },
  { value: "financial-services", label: "Financial Services", icon: "💰" },
  { value: "insurance", label: "Insurance", icon: "🛡️" },
  { value: "legal", label: "Legal", icon: "⚖️" },
  { value: "accounting", label: "Accounting", icon: "📊" },
  { value: "technology", label: "Technology", icon: "💻" },
  { value: "construction", label: "Construction", icon: "🏗️" },
];

const DIFFICULTIES = [
  { value: "all", label: "All Complexities" },
  { value: "easy", label: "Easy Setup (Starter)" },
  { value: "medium", label: "Medium Complexity (Growth)" },
  { value: "hard", label: "High Complexity (Scale)" },
];

function AutomationLibraryPage() {
  const [searchTerm, setSearchBar] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState("all");
  const [selectedCard, setSelectedCard] = useState<AutomationCard | null>(null);

  // Filter and Search logic
  const filteredWorkflows = useMemo(() => {
    return automationLibrary.filter((card) => {
      // Industry filter
      const matchesIndustry =
        selectedIndustry === "all" || card.industry.includes(selectedIndustry);

      // Difficulty filter
      const matchesDifficulty =
        selectedDifficulty === "all" || card.difficulty === selectedDifficulty;

      // Search term
      const cleanSearch = searchTerm.toLowerCase().trim();
      const matchesSearch =
        cleanSearch === "" ||
        card.name.toLowerCase().includes(cleanSearch) ||
        card.description.toLowerCase().includes(cleanSearch) ||
        card.integrations.some((i) => i.toLowerCase().includes(cleanSearch)) ||
        card.industry.some((ind) => ind.toLowerCase().includes(cleanSearch));

      return matchesIndustry && matchesDifficulty && matchesSearch;
    });
  }, [selectedIndustry, selectedDifficulty, searchTerm]);

  // Pricing mapped to standard checkout links
  const getStripeLink = (difficulty: string) => {
    if (difficulty === "easy") return "https://buy.stripe.com/aFa3cxah18k7aXx0nm2Fa01"; // Starter
    if (difficulty === "medium") return "https://buy.stripe.com/5kQdRbah1asf1mX7PO2Fa02"; // Growth
    return "https://buy.stripe.com/4gM9AV74P1VJ9Tt9XW2Fa03"; // Scale
  };

  const getTierPrice = (difficulty: string) => {
    if (difficulty === "easy") return "$7,500";
    if (difficulty === "medium") return "$15,000";
    return "$30,000";
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200">
      <div>
        {/* Navigation Header */}
        <header className="border-b border-stone-900 bg-stone-950/80 backdrop-blur sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-all">
              S1
            </span>
            <span className="font-black text-base tracking-tight text-white group-hover:text-indigo-400 transition-colors">
              SIMPLER LIFE <span className="text-indigo-500 font-mono">100</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link 
              to="/portal" 
              className="text-xs font-mono font-bold text-stone-400 hover:text-white border border-stone-850 hover:border-stone-700 bg-stone-900/30 rounded-lg px-3.5 py-1.5 transition-all"
            >
              PORTAL DASHBOARD →
            </Link>
          </div>
        </header>

        {/* Hero Header */}
        <section className="relative px-6 pt-16 pb-12 text-center overflow-hidden border-b border-stone-900/50">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />
          <div className="max-w-4xl mx-auto space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono font-bold tracking-wider">
              📦 DEPLOYABLE PLAYGROUND BLUEPRINTS
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              AI Operations <span className="text-indigo-400">Library</span>
            </h1>
            <p className="text-stone-400 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
              Explore 70+ industry-specific autonomous workflows ready to deploy. Connect directly to your existing software stack and start automating manual workloads.
            </p>
          </div>
        </section>

        {/* Filter Controls Panel */}
        <section className="bg-stone-900/10 border-b border-stone-900 px-6 py-6 sticky top-[69px] z-30 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-lg">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchBar(e.target.value)}
                placeholder="Search workflows, software or systems..."
                className="w-full bg-stone-950 border border-stone-850 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-xs text-stone-200 outline-none transition-all placeholder:text-stone-400 font-medium"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchBar("")}
                  className="absolute right-3.5 top-3 text-[10px] text-stone-400 hover:text-stone-300 font-mono font-bold"
                >
                  CLEAR
                </button>
              )}
            </div>

            {/* Selector Filters */}
            <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center">
              <div className="w-full sm:w-auto">
                <select
                  value={selectedIndustry}
                  onChange={(e) => setSelectedIndustry(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-850 focus:border-indigo-600 rounded-xl px-3 py-2.5 text-xs text-stone-300 outline-none font-bold"
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind.value} value={ind.value}>
                      {ind.icon} {ind.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-auto">
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-850 focus:border-indigo-600 rounded-xl px-3 py-2.5 text-xs text-stone-300 outline-none font-bold"
                >
                  {DIFFICULTIES.map((diff) => (
                    <option key={diff.value} value={diff.value}>
                      🧩 {diff.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Grid & Main Catalog View */}
        <section className="px-6 py-12 max-w-7xl mx-auto">
          {filteredWorkflows.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredWorkflows.map((w) => {
                const price = getTierPrice(w.difficulty);
                return (
                  <div
                    key={w.id}
                    onClick={() => setSelectedCard(w)}
                    className="bg-stone-900/30 border border-stone-850/80 hover:border-indigo-500/40 rounded-2xl p-5 hover:translate-y-[-2px] hover:shadow-xl hover:shadow-indigo-950/15 cursor-pointer transition-all duration-200 flex flex-col justify-between group h-full"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/5 border border-indigo-500/10 px-2 py-0.5 rounded">
                          {w.industry[0]?.replace(/-/g, " ")}
                        </span>
                        <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          w.difficulty === "easy" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10" :
                          w.difficulty === "medium" ? "bg-amber-500/10 text-amber-400 border border-amber-500/10" :
                          "bg-rose-500/10 text-rose-400 border border-rose-500/10"
                        }`}>
                          {w.difficulty === "easy" ? "Starter" : w.difficulty === "medium" ? "Growth" : "Scale"}
                        </span>
                      </div>

                      {/* Header */}
                      <h3 className="font-extrabold text-base text-stone-200 group-hover:text-white transition-colors leading-tight mb-2">
                        {w.name}
                      </h3>
                      <p className="text-xs text-stone-400 line-clamp-3 leading-relaxed mb-4">
                        {w.description}
                      </p>
                    </div>

                    {/* Meta Section */}
                    <div className="pt-4 border-t border-stone-850/60 mt-auto">
                      <div className="flex items-center justify-between text-[11px] font-mono text-stone-400 mb-2">
                        <span>⏱ SAVED:</span>
                        <span className="text-emerald-400 font-bold">{w.timeSaved}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-stone-400 mb-3">
                        <span>💰 INVESTMENT:</span>
                        <span className="text-white font-bold">{price}</span>
                      </div>

                      {/* Integrations Icons List */}
                      <div className="flex flex-wrap gap-1 mb-4">
                        {w.integrations.slice(0, 4).map((sys) => (
                          <span key={sys} className="px-1.5 py-0.5 bg-stone-950 border border-stone-850 text-[9px] font-mono text-stone-400 rounded uppercase">
                            {sys}
                          </span>
                        ))}
                        {w.integrations.length > 4 && (
                          <span className="text-[10px] font-mono text-stone-400 pl-1">
                            +{w.integrations.length - 4} more
                          </span>
                        )}
                      </div>

                      <button className="w-full py-2 bg-stone-900 hover:bg-indigo-950/20 border border-stone-800 group-hover:border-indigo-500/30 rounded-xl text-xs font-mono font-bold text-stone-300 group-hover:text-indigo-400 transition-all text-center">
                        VIEW BLUEPRINT DETAILS →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Empty State */
            <div className="text-center py-20 bg-stone-900/10 border border-stone-900 rounded-3xl p-8 max-w-xl mx-auto space-y-4">
              <div className="text-3xl">🔍</div>
              <h3 className="text-lg font-black text-white">No workflows matched your filters</h3>
              <p className="text-xs text-stone-400 max-w-sm mx-auto leading-relaxed">
                Try clearing your search term, modifying your complexity filter, or selecting a broader vertical domain to preview more blueprints.
              </p>
              <button
                onClick={() => {
                  setSearchBar("");
                  setSelectedIndustry("all");
                  setSelectedDifficulty("all");
                }}
                className="text-xs font-mono font-bold text-indigo-400 hover:underline"
              >
                [ RESET ALL FILTERS ]
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Slide-over Detail Modal Panel */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            {/* Overlay background */}
            <div 
              onClick={() => setSelectedCard(null)}
              className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm transition-opacity duration-300" 
            />

            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="pointer-events-auto w-screen max-w-2xl transform bg-stone-900 border-l border-stone-800/80 text-stone-100 shadow-2xl transition-all duration-300 ease-in-out">
                {/* Scrollable Container */}
                <div className="flex h-full flex-col justify-between overflow-y-auto">
                  {/* Header */}
                  <div className="px-6 py-6 border-b border-stone-800 bg-stone-950 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 px-2 py-1 rounded">
                        DEPLOYABLE WORKFLOW
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedCard(null)}
                      className="text-stone-400 hover:text-white font-mono text-xs border border-stone-800 hover:border-stone-700 bg-stone-900 rounded-lg px-3 py-1.5 transition-all"
                    >
                      [ CLOSE ]
                    </button>
                  </div>

                  {/* Body Content */}
                  <div className="px-6 py-8 space-y-8 flex-1">
                    {/* Title */}
                    <div className="space-y-3">
                      <h2 className="text-2xl lg:text-3xl font-black text-white leading-tight">
                        {selectedCard.name}
                      </h2>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {selectedCard.industry.map((ind) => (
                          <span key={ind} className="text-[10px] font-mono font-bold text-stone-400 bg-stone-950 border border-stone-850 px-2.5 py-0.5 rounded-full uppercase">
                            #{ind.replace(/-/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Standard Metrics */}
                    <div className="grid grid-cols-2 gap-4 bg-stone-950/40 border border-stone-850/60 p-5 rounded-2xl">
                      <div>
                        <div className="text-[10px] font-mono text-stone-400 uppercase mb-1">⏱ Weekly Reclaimed Hours</div>
                        <div className="text-sm font-bold text-emerald-400">{selectedCard.timeSaved}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-stone-400 uppercase mb-1">Complexity Class</div>
                        <div className="text-sm font-bold text-white capitalize">{selectedCard.difficulty} Setup</div>
                      </div>
                    </div>

                    {/* Full Description */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-mono font-bold text-stone-400 uppercase tracking-wider">Operational Summary</h3>
                      <p className="text-sm text-stone-300 leading-relaxed font-medium">
                        {selectedCard.description}
                      </p>
                    </div>

                    {/* ROI estimate */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-mono font-bold text-stone-400 uppercase tracking-wider">Strategic Return (ROI)</h3>
                      <p className="text-sm text-indigo-400 leading-relaxed font-bold">
                        {selectedCard.roi}
                      </p>
                    </div>

                    {/* Integrations connectors used */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-mono font-bold text-stone-400 uppercase tracking-wider">Required Systems Connectors</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedCard.integrations.map((sys) => (
                          <span key={sys} className="px-3 py-1.5 bg-stone-950 border border-stone-850 rounded-xl text-xs font-mono font-bold text-stone-300 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                            {sys.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Demo walkthrough */}
                    <div className="p-5 bg-indigo-950/10 border border-indigo-950/40 rounded-2xl space-y-2.5">
                      <h4 className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span>🖥️</span> Interactive Demo Walkthrough
                      </h4>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        {selectedCard.demoDescription}
                      </p>
                      <Link 
                        to="/demos/workflows" 
                        className="inline-block text-xs font-mono font-bold text-indigo-400 hover:text-indigo-300 underline"
                      >
                        [ Open Interactive Playground Demo ]
                      </Link>
                    </div>
                  </div>

                  {/* Footer Action Card */}
                  <div className="px-6 py-6 border-t border-stone-800 bg-stone-950 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-0 z-10">
                    <div className="space-y-1 text-center sm:text-left">
                      <div className="text-[10px] font-mono text-stone-400 uppercase">Blueprints Deployment Investment</div>
                      <div className="text-2xl font-mono font-black text-white">{getTierPrice(selectedCard.difficulty)}</div>
                    </div>
                    <a
                      href={getStripeLink(selectedCard.difficulty)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto text-center px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-mono text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                    >
                      Buy Now Blueprint →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer bar */}
      <footer className="border-t border-stone-900 bg-stone-950/60 py-6 text-center text-xs font-mono text-stone-600">
        © 2026 Simpler Life 100 — Autonomous Operations Engineering.
      </footer>
    </div>
  );
}
