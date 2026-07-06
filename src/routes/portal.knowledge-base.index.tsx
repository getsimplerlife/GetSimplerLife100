import { createFileRoute, Link } from "@tanstack/react-router";
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
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const d = await res.json();
        
        if (d.data && d.data.length > 0) {
          const firstRow = d.data[0];
          if (firstRow && Array.isArray(firstRow.data)) {
            setArticles(firstRow.data);
          } else {
            setArticles(d.data);
          }
        } else {
          setArticles([]);
        }
        setLoading(false);
      } catch (err) {
        console.error("Knowledge base load error:", err);
        setArticles([]);
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

      {articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 py-16 bg-stone-950 border border-stone-900 rounded-2xl max-w-xl mx-auto my-8">
          <div className="text-4xl mb-4">🧠</div>
          <h3 className="text-lg font-bold text-white mb-2">No knowledge base articles yet</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm leading-relaxed">
            Proprietary SOPs, prompt blueprints, policy logs, and training guidelines will appear here once you upload reference materials.
          </p>
          <Link
            to="/portal/documents"
            className="inline-flex items-center justify-center bg-white hover:bg-stone-100 text-black font-extrabold px-6 py-3 rounded-xl transition-all font-mono text-xs shadow-lg shadow-white/5 active:scale-95"
          >
            Upload Training Documents
          </Link>
        </div>
      ) : (
        <>
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
    </>
  )}

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
