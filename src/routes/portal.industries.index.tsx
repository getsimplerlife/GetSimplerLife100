import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/industries/")({
  component: IndustriesHub,
});

function IndustriesHub() {
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/industries", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setBlueprints(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (name: string, action: string) => {
    try {
      setFeedback(`Processing blueprint action: ${action}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "industry_" + action.toLowerCase(), resource: name }),
      });
      await res.json();
      setFeedback(`Success: Blueprint ${action} processed for ${name}`);
      // Toggle status locally
      const target = blueprints.find(b => b.name === name);
      if (target) {
        target.status = target.status === "Activated" ? "Deactivated" : "Activated";
        const { _id, ...cleanObj } = target;
        await fetch("/api/data/industries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(cleanObj),
        });
      }
      setBlueprints([...blueprints]);
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
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">🏢 Vertical Blueprints</h1>
        <p className="text-stone-500 mt-1">Configure and manage industry-specific AI employee blueprints built for your business sector.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {blueprints.map((b, idx) => (
          <div key={idx} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-stone-900">{b.name}</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  b.status === "Activated" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                }`}>{b.status}</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed font-semibold">{b.description}</p>
              <div className="text-[10px] text-stone-400 font-bold">Capabilities: {b.features}</div>
            </div>
            <button
              onClick={() => handleAction(b.name, b.status === "Activated" ? "deactivate" : "activate")}
              className={`w-full font-bold py-2 rounded-xl text-xs border transition-all ${
                b.status === "Activated" ? "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100" : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 shadow-lg"
              }`}
            >
              {b.status === "Activated" ? "Deactivate Blueprint" : "Activate Blueprint"}
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