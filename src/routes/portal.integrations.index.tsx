import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/integrations/")({
  component: ConnectedServices,
});

function ConnectedServices() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/integrations", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setIntegrations(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (name: string, action: string) => {
    try {
      setFeedback(`Processing integration: ${action}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "integration_" + action.toLowerCase(), resource: name }),
      });
      await res.json();
      setFeedback(`Success: ${action} processed`);
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
    <div className="space-y-8">
      <div className="border-b border-stone-200 pb-6">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">🔌 Connected Integrations</h1>
        <p className="text-stone-500 mt-1">Manage connected platforms and external third-party API configurations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((i, idx) => (
          <div key={idx} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-stone-900">{i.name}</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  i.status === "Connected" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                }`}>{i.status}</span>
              </div>
              <div className="text-[10px] text-stone-400 font-bold">Health check: {i.health}</div>
            </div>
            <button
              onClick={() => handleAction(i.name, i.status === "Connected" ? "disconnect" : "connect")}
              className="w-full bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold py-2 rounded-xl text-xs border border-stone-200"
            >
              {i.status === "Connected" ? "Disconnect" : "Connect"}
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