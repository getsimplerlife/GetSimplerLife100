import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ResourceItem as ResourceItemType } from "~/content/resources";

export default function ResourceLibrary({ resources }: { resources: ResourceItemType[] }) {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("all");

  // Dynamically extract all available industries from resources to populate filter dropdown
  const allIndustries = Array.from(
    new Set(resources.flatMap((r) => r.industry))
  ).sort();

  // Filter resource items based on dropdown selections
  const filteredResources = resources.filter((item) => {
    const matchesType = selectedType === "all" || item.type === selectedType;
    const matchesIndustry = selectedIndustry === "all" || item.industry.includes(selectedIndustry);
    return matchesType && matchesIndustry;
  });

  const typeTabs = [
    { id: "all", name: "All Resources" },
    { id: "template", name: "Templates" },
    { id: "guide", name: "Guides" },
    { id: "calculator", name: "Calculators" },
    { id: "whitepaper", name: "Whitepapers" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-stone-950 text-stone-100 font-sans">
      {/* Navigation Header */}
      <header className="px-6 py-4 border-b border-stone-850 bg-stone-950">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <span className="text-emerald-500">⚡</span> Simpler Life 100
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xs font-mono text-stone-400 hover:text-white transition-colors">
              [ Back to Home ]
            </Link>
            <Link to="/portal" className="bg-emerald-600 hover:bg-emerald-500 text-stone-950 px-4 py-1.5 rounded-lg text-xs font-bold font-mono transition-colors">
              Portal Dashboard →
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 py-16 px-6 lg:py-24">
        <div className="max-w-6xl mx-auto space-y-12">
          {/* Header */}
          <div className="space-y-4 max-w-2xl">
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
              OPERATIONAL UTILITIES
            </span>
            <h1 className="text-4xl lg:text-6xl font-black tracking-tight text-white leading-tight">
              Resource Library
            </h1>
            <p className="text-stone-400 text-sm lg:text-base leading-relaxed">
              Explore our templates, blueprints, calculators, and detailed operational playbooks to jumpstart your company's automation journey.
            </p>
          </div>

          {/* Filter Bar */}
          <div className="p-4 bg-stone-900/60 border border-stone-850 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Type tabs */}
            <div className="flex flex-wrap gap-1">
              {typeTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedType(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    selectedType === tab.id
                      ? "bg-emerald-600 text-stone-950 shadow-lg shadow-emerald-500/10"
                      : "text-stone-400 hover:text-white hover:bg-stone-850"
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>

            {/* Industry Filter Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono text-stone-500 uppercase">Filter Industry:</span>
              <select
                value={selectedIndustry}
                onChange={(e) => setSelectedIndustry(e.target.value)}
                className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold font-mono text-stone-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">ALL VERTICALS</option>
                {allIndustries.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind.toUpperCase().replace(/-/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Resource Grid */}
          {filteredResources.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredResources.map((item) => (
                <div
                  key={item.id}
                  className="p-6 bg-stone-900/30 border border-stone-900 rounded-2xl flex flex-col justify-between hover:bg-stone-900/50 hover:border-stone-800 transition-all group relative overflow-hidden"
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 uppercase tracking-widest">
                        {item.type}
                      </span>
                      <span className="text-xs">{item.icon || "📄"}</span>
                    </div>

                    <h3 className="text-base font-bold text-white leading-snug group-hover:text-emerald-400 transition-colors">
                      {item.title}
                    </h3>
                    
                    <p className="text-xs text-stone-400 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-8 space-y-4">
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-stone-900">
                      <span className="text-[9px] font-mono text-stone-500 bg-stone-950 px-2 py-0.5 rounded border border-stone-900 uppercase">
                        {item.format}
                      </span>
                      {item.industry.map((ind, i) => (
                        <span key={i} className="text-[9px] font-mono text-emerald-500/80 bg-emerald-500/5 px-2 py-0.5 rounded uppercase">
                          #{ind.replace(/-/g, "")}
                        </span>
                      ))}
                    </div>

                    {/* Access CTA */}
                    {item.link.startsWith("http") ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full inline-block bg-stone-950 hover:bg-stone-850 text-stone-200 hover:text-white border border-stone-800 text-center py-2.5 rounded-xl text-xs font-bold transition-all"
                      >
                        Download Resource ↗
                      </a>
                    ) : (
                      <Link
                        to={item.link as any}
                        className="w-full inline-block bg-stone-950 hover:bg-stone-850 text-stone-200 hover:text-white border border-stone-800 text-center py-2.5 rounded-xl text-xs font-bold transition-all"
                      >
                        Access Utility →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-stone-900/20 border border-stone-900 rounded-3xl space-y-2">
              <span className="text-2xl">📭</span>
              <h3 className="text-sm font-mono font-bold text-stone-300">No resources match your filters</h3>
              <p className="text-xs text-stone-500">Try resetting filters to show all operational resources.</p>
              <div className="pt-2">
                <button
                  onClick={() => {
                    setSelectedType("all");
                    setSelectedIndustry("all");
                  }}
                  className="text-xs font-mono text-emerald-400 underline decoration-2 underline-offset-4 font-bold"
                >
                  Reset filters
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-stone-900 bg-stone-950 text-stone-600 text-center">
        <div className="max-w-7xl mx-auto space-y-4">
          <p className="text-xs font-mono">Simpler Life 100 &copy; 2026. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
