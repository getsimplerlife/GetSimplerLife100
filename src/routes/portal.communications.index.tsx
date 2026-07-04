import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/communications/")({
  component: CommsInbox,
});

function CommsInbox() {
  const [comms, setComms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/communications", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setComms(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (from: string, action: string) => {
    try {
      setFeedback(`Processing communication action: ${action}...`);
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "communication_" + action.toLowerCase(), resource: from }),
      });
      setFeedback("Success: Action logged");
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
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">💬 Communication Center</h1>
        <p className="text-stone-500 mt-1">Review live communication feeds routed through the omni-channel support engine.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {comms.map((c, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">{c.channel}</span>
                <span className="text-stone-400 font-bold">{c.time}</span>
              </div>
              <h3 className="font-black text-stone-900 text-sm leading-tight">{c.subject}</h3>
              <p className="text-stone-500 text-xs">{c.preview}</p>
              <div className="text-[10px] font-bold text-stone-400">From: {c.from}</div>
            </div>
            <div className="border-t border-stone-100 pt-3 flex justify-between items-center">
              <span className="text-xs font-semibold text-stone-400">Sentiment: <span className="text-stone-700 font-bold">{c.sentiment}</span></span>
              <button onClick={() => handleAction(c.from, "reply")} className="bg-stone-900 hover:bg-stone-850 text-white font-bold text-[10px] px-3 py-1.5 rounded-xl">Reply</button>
            </div>
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