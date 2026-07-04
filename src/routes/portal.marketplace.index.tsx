import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/marketplace/")({
  component: MarketplaceHub,
});

function MarketplaceHub() {
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/marketplace", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setTools(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (name: string, action: string) => {
    try {
      setFeedback(`Processing marketplace action: ${action}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "marketplace_" + action.toLowerCase(), resource: name }),
      });
      await res.json();
      setFeedback(`Success: ${action} processed for ${name}`);
      // Toggle installation locally
      const target = tools.find(t => t.name === name);
      if (target) {
        target.installed = !target.installed;
        const { _id, ...cleanObj } = target;
        await fetch("/api/data/marketplace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(cleanObj),
        });
      }
      setTools([...tools]);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
    }
  };

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
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">🛍️ Integration Marketplace</h1>
        <p className="text-stone-500 mt-1">Discover, configure, and install advanced integration plugins and pre-trained AI employees.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tools.map((t, idx) => (
          <div key={idx} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-stone-900">{t.name}</span>
                <span className="text-[10px] text-stone-400 font-black">{t.category}</span>
              </div>
              <p className="text-xs text-stone-500">{t.description}</p>
              <div className="text-xs font-bold text-stone-800">License: {t.price}</div>
            </div>
            <button
              onClick={() => handleAction(t.name, t.installed ? "uninstall" : "install")}
              className={`w-full font-bold py-2.5 rounded-xl text-xs transition-all ${
                t.installed ? "bg-stone-50 border border-stone-200 text-stone-700 hover:bg-stone-100" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/10"
              }`}
            >
              {t.installed ? "Uninstall Module" : "Install Service Module"}
            </button>
          </div>
        ))}
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}