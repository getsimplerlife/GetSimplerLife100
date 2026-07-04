import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/knowledge-base/")({
  component: KnowledgeBase,
});

interface KnowledgeItem {
  id: string;
  title: string;
  category: "SOP" | "Policy" | "Training" | "FAQ" | "Document" | "Video" | "Prompt Library";
  content: string;
  lastUpdated: string;
  status: "Active" | "Draft" | "Archived";
  author: string;
}

function KnowledgeBase() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [articles, setArticles] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Load and seed default Knowledge base items if empty
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/data/knowledge-base", { credentials: "include" });
        const d = await res.json();
        
        if (d.data && d.data.length > 0) {
          setArticles(d.data);
        } else {
          // Seed high fidelity premium resources
          const seedItems: KnowledgeItem[] = [
            {
              id: "kb-1",
              title: "Standard Operating Procedure: Financial Reconciliation",
              category: "SOP",
              content: "This document outlines the standard operation for auto-reconciling Stripe collections. All AI operators must query transaction endpoints on a 5-minute cooldown. If mismatches occur, route directly to Caleb Collections for human authorization overlays. Do not push ledger entries to QuickBooks unless confidence coefficients are >= 98%.",
              lastUpdated: "June 28, 2026",
              status: "Active",
              author: "Sarah Jenkins (Ops Manager)"
            },
            {
              id: "kb-2",
              title: "Corporate Security Compliance Policy v3.2",
              category: "Policy",
              content: "Data security requirements for vertical LLM execution. All customer documents containing Personally Identifiable Information (PII), such as Tax IDs or SSNs, must undergo local client-side hashing or horizontal OCR redact preprocessing. Cognitive trace logs stored in Turso DB must never record unencrypted password permutations.",
              lastUpdated: "July 01, 2026",
              status: "Active",
              author: "Compliance Officer"
            },
            {
              id: "kb-3",
              title: "AI Employee Onboarding & RAG Training Guide",
              category: "Training",
              content: "This training blueprint details how to inject proprietary domain matrices into an AI coworker's cognitive RAG state. Upload PDF guidelines, spreadsheets, and pricing frameworks directly to the /portal/documents directory. Once indexed, instruct the orchestrator to sync vector embeddings via the System Settings interface.",
              lastUpdated: "May 15, 2026",
              status: "Active",
              author: "Senior AI Engineer"
            },
            {
              id: "kb-4",
              title: "FAQ: Handling Rate Limit Exceptions on HubSpot API",
              category: "FAQ",
              content: "Q: What happens when Charlie CRM encounters HubSpot rate limiting?\nA: The system automatically invokes an exponential backoff cooling algorithm. Up to 3 attempts will be triggered over a 15-minute window. If HubSpot remains unresponsive, the deal card shifts to Needs Attention on the portal approvals page.",
              lastUpdated: "June 12, 2026",
              status: "Active",
              author: "Charlie CRM (Sales Operator)"
            },
            {
              id: "kb-5",
              title: "System Document: API Key Scoping Rules",
              category: "Document",
              content: "Reference matrix for assigning API scopes to automated workflow keys. Write permission keys must reside strictly on secure background endpoints (serve.ts). Portal frontend components are scoped to read-only actions to safeguard Stripe and QuickBooks webhooks from cross-origin interference.",
              lastUpdated: "July 03, 2026",
              status: "Active",
              author: "Systems Integ Eng"
            },
            {
              id: "kb-6",
              title: "Cognitive Prompt Blueprint: Dispatch Logistics Optimization",
              category: "Prompt Library",
              content: "System prompt matrix for Quentin Quote:\n'You are an autonomous logistics dispatch agent. Evaluate shipment routes by comparing terminal congestion scores, fuel surcharges, and historical ETA standard deviations. Draft optimal dispatch routes matching these constraints...'",
              lastUpdated: "July 02, 2026",
              status: "Active",
              author: "Quentin Quote (Logistics Agent)"
            }
          ];

          await fetch("/api/data/knowledge-base", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ data: seedItems }),
          });

          setArticles(seedItems);
        }
        setLoading(false);
      } catch (err) {
        console.error("Knowledge base load error:", err);
        setLoading(false);
      }
    })();
  }, []);

  const filteredArticles = articles.filter((art) => {
    const matchesSearch =
      art.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      art.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      art.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = activeCategory === "all" || art.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const selectedItem = articles.find((a) => a.id === selectedItemId);

  const categories: ("SOP" | "Policy" | "Training" | "FAQ" | "Document" | "Prompt Library")[] = [
    "SOP",
    "Policy",
    "Training",
    "FAQ",
    "Document",
    "Prompt Library"
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-850 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Indexing Knowledge Base...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none">
      
      {/* ─── Header ─── */}
      <div className="border-b border-stone-900 pb-5">
        <h1 className="text-3xl font-black text-white tracking-tight">🧠 AI Knowledge Base</h1>
        <p className="text-stone-400 text-xs mt-1">
          Everything the AI coworkers know, aggregate SOPs, prompt blueprints, policy logs, and training matrices in one workspace.
        </p>
      </div>

      {/* ─── Search & Category Pill Controls ─── */}
      <div className="space-y-4">
        {/* Search Input */}
        <div className="bg-stone-950 p-3.5 border border-stone-900 rounded-xl flex items-center">
          <span className="text-stone-600 text-sm mr-3 font-mono">🔍</span>
          <input
            type="text"
            placeholder="Search documents, prompts, policies, or SOPs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-0 text-xs outline-none font-medium placeholder-stone-600 text-stone-200"
          />
        </div>

        {/* Category Pills Bar */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
              activeCategory === "all"
                ? "bg-white text-black font-black"
                : "bg-stone-900 text-stone-400 hover:text-stone-200"
            }`}
          >
            All Resources
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeCategory === cat
                  ? "bg-white text-black font-black"
                  : "bg-stone-900/60 text-stone-400 hover:text-stone-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ─── High Density Resource Cards Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredArticles.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-stone-950 border border-stone-900 rounded-xl space-y-2">
            <span className="text-3xl block opacity-40">🧠</span>
            <p className="text-xs font-mono text-stone-500 uppercase tracking-widest">No matching knowledge articles found</p>
          </div>
        ) : (
          filteredArticles.map((art) => (
            <div
              key={art.id}
              onClick={() => setSelectedItemId(art.id)}
              className="bg-stone-950 border border-stone-900/80 hover:border-stone-800 rounded-xl p-5 flex flex-col justify-between cursor-pointer transition-all hover:shadow-lg"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-mono font-black uppercase text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-2.5 py-0.5 rounded-md">
                    {art.category}
                  </span>
                  <span className="text-[9px] font-mono text-stone-500">
                    Updated: {art.lastUpdated}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-white leading-snug line-clamp-2">{art.title}</h3>
                  <p className="text-stone-400 text-[10px] leading-relaxed line-clamp-3 font-medium">
                    {art.content}
                  </p>
                </div>
              </div>

              <div className="border-t border-stone-900 pt-3.5 mt-4 flex justify-between items-center text-[9px] font-mono">
                <span className="text-stone-500">Author: <span className="text-stone-400">{art.author}</span></span>
                <span className="text-emerald-500 uppercase font-black tracking-wider flex items-center gap-1.5">
                  <span className="h-1 w-1 bg-emerald-500 rounded-full" />
                  {art.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ─── Notion-Style Document Viewer (Drawer Overlay) ─── */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
          <div className="bg-stone-950 border border-stone-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-scaleUp">
            
            {/* Viewer Header */}
            <div className="border-b border-stone-900 p-5 flex justify-between items-center bg-stone-950/80">
              <div className="flex items-center gap-3">
                <span className="text-xl">📚</span>
                <div>
                  <span className="text-[9px] font-mono tracking-widest text-emerald-400 uppercase font-bold bg-emerald-950/40 border border-emerald-900/60 px-2 rounded-md">
                    {selectedItem.category}
                  </span>
                  <div className="text-[9px] font-mono text-stone-500 mt-0.5">Author: {selectedItem.author}</div>
                </div>
              </div>
              <button
                onClick={() => setSelectedItemId(null)}
                className="text-stone-500 hover:text-white text-sm"
              >
                ✕ Close
              </button>
            </div>

            {/* Document Content View */}
            <div className="p-8 space-y-6 max-h-[450px] overflow-y-auto">
              
              {/* Document Title */}
              <h2 className="text-lg font-black text-white leading-snug tracking-tight">
                {selectedItem.title}
              </h2>

              {/* Document Meta Row */}
              <div className="flex gap-4 border-y border-stone-900 py-3 text-[10px] font-mono text-stone-500 select-none">
                <div>Document ID: <span className="text-stone-300 font-bold">{selectedItem.id}</span></div>
                <div>Status: <span className="text-emerald-400 font-bold">{selectedItem.status}</span></div>
                <div>Last Modified: <span className="text-stone-300 font-bold">{selectedItem.lastUpdated}</span></div>
              </div>

              {/* Document Rich Content Body */}
              <div className="text-stone-300 text-xs leading-relaxed whitespace-pre-line font-medium pr-1">
                {selectedItem.content}
              </div>

            </div>

            {/* Viewer Footer */}
            <div className="border-t border-stone-900 p-4 bg-stone-950/50 flex justify-end">
              <button
                onClick={() => setSelectedItemId(null)}
                className="bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-white text-xs font-mono font-bold px-5 py-2.5 rounded-lg border border-stone-800"
              >
                Close Document
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
