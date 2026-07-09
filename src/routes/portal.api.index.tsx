import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/api/")({
  component: DeveloperPortal,
});

function DeveloperPortal() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/api", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setKeys(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (name: string, action: string) => {
    try {
      setFeedback(`Processing developer gateway action: ${action}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "api_" + action.toLowerCase(), resource: name }),
      });
      await res.json();
      setFeedback(`Success: ${action} action complete`);
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
      <div className="border-b border-stone-200 pb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">🔑 Developer Gateway</h1>
          <p className="text-stone-500 mt-1">Manage API authorization tokens, register webhooks, and download SDK libraries.</p>
        </div>
        <button onClick={() => handleAction("Token", "generate_key")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg">🔑 Generate API Key</button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
        <table className="w-full text-left text-xs font-semibold">
          <thead>
            <tr className="bg-stone-50 text-stone-500 border-b border-stone-150 uppercase tracking-wider">
              <th className="p-4 font-bold">Credential Name</th>
              <th className="p-4 font-bold">Type</th>
              <th className="p-4 font-bold">Credential Value</th>
              <th className="p-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
            {keys.map((k, idx) => (
              <tr key={idx} className="hover:bg-stone-50/40">
                <td className="p-4 font-black text-stone-900">{k.name}</td>
                <td className="p-4">{k.type}</td>
                <td className="p-4 font-mono text-[10px]">{k.value}</td>
                <td className="p-4 text-right">
                  <button onClick={() => handleAction(k.name, "revoke")} className="text-rose-600 font-bold">Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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