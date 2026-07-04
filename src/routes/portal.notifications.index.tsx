import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/notifications/")({
  component: NotificationChannels,
});

function NotificationChannels() {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/notifications", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setChannels(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleToggle = async (channelName: string) => {
    try {
      setFeedback(`Updating ${channelName} config...`);
      const target = channels.find(c => c.channel === channelName);
      if (target) {
        target.enabled = !target.enabled;
        const { _id, ...cleanObj } = target;
        await fetch("/api/data/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(cleanObj),
        });
      }
      setChannels([...channels]);
      setFeedback("Success: Notifications updated");
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
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">🔔 Notification Channels</h1>
        <p className="text-stone-500 mt-1">Configure live communication protocols and system exception escalation channels.</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm space-y-6 max-w-xl">
        <h3 className="text-lg font-black text-stone-900">Configured Alerts</h3>
        <div className="divide-y divide-stone-100">
          {channels.map((ch, idx) => (
            <div key={idx} className="flex justify-between items-center py-4">
              <div>
                <h4 className="font-bold text-stone-900 text-sm">{ch.channel}</h4>
                <p className="text-xs text-stone-500">{ch.type}</p>
              </div>
              <button
                onClick={() => handleToggle(ch.channel)}
                className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                  ch.enabled ? "bg-emerald-600 border-emerald-600 text-white" : "bg-stone-50 border-stone-200 text-stone-700"
                }`}
              >
                {ch.enabled ? "Active" : "Disabled"}
              </button>
            </div>
          ))}
        </div>
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