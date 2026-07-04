import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/knowledge-base/")({
  component: KnowledgeBase,
});

function KnowledgeBase() {
  const [searchTerm, setSearchTerm] = useState("");
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data/knowledge-base", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setArticles(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredArticles = articles.filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase()) || a.content.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      <div className="border-b border-stone-200 pb-6">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">📚 Knowledge Base</h1>
        <p className="text-stone-500 mt-1">Search helpful resources, platform user manuals, and billing guides.</p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <input
          type="text"
          placeholder="Search knowledge base articles..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredArticles.map((art, idx) => (
          <div key={idx} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-3">
            <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 block w-max">{art.category}</span>
            <h3 className="text-sm font-black text-stone-900">{art.title}</h3>
            <p className="text-stone-500 text-xs leading-relaxed">{art.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}