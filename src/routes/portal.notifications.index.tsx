import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { usePortalContext } from "~/routes/portal";
import type { SystemNotification } from "~/routes/portal";

export const Route = createFileRoute("/portal/notifications/")({
  component: UnifiedNotificationCenter,
});

function UnifiedNotificationCenter() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = usePortalContext();

  const [activeTab, setActiveTab] = useState<"alerts" | "channels">("alerts");
  const [channels, setChannels] = useState<any[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  // Load notification channels (original feature)
  useEffect(() => {
    fetch("/api/data/notifications", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setChannels(d.data || []);
        setChannelsLoading(false);
      })
      .catch(() => setChannelsLoading(false));
  }, []);

  const handleToggleChannel = async (channelName: string) => {
    try {
      setFeedback(`Updating ${channelName} channel...`);
      const target = channels.find(c => c.channel === channelName);
      if (target) {
        const updatedStatus = !target.enabled;
        target.enabled = updatedStatus;
        const { _id, ...cleanObj } = target;
        await fetch("/api/data/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ...cleanObj, _id, enabled: updatedStatus }),
        });
      }
      setChannels([...channels]);
      setFeedback(`Success: ${channelName} channel updated`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
      setFeedback("Failed to update channel");
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const handleNotificationClick = async (id: string, link: string) => {
    await markAsRead(id);
    navigate({ to: link as any });
  };

  const filteredNotifications = notifications.filter((n: SystemNotification) => {
    if (filterType === "all") return true;
    return n.type === filterType;
  });

  const iconMap = {
    approval: "⏳",
    complete: "✅",
    error: "⚠️",
    info: "💡",
  };

  const colorMap = {
    approval: "border-blue-500/30 bg-blue-500/5 text-blue-400",
    complete: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
    error: "border-rose-500/30 bg-rose-500/5 text-rose-400",
    info: "border-purple-500/30 bg-purple-500/5 text-purple-400",
  };

  return (
    <div className="space-y-8 font-sans text-stone-100 max-w-4xl mx-auto pb-10">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-900 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase font-bold">SYSTEM BROADCAST STATUS</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">🔔 Notification Hub</h1>
          <p className="text-stone-400 text-xs mt-1">Manage live operational exceptions, workflow complete reports, and routing rule channels.</p>
        </div>

        {unreadCount > 0 && activeTab === "alerts" && (
          <button
            onClick={markAllAsRead}
            className="self-start sm:self-center px-4 py-2 bg-stone-900 hover:bg-stone-850 border border-stone-800 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.98]"
          >
            Mark All as Read
          </button>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex gap-1 bg-stone-950 p-1 rounded-xl border border-stone-900 w-fit">
        <button
          onClick={() => setActiveTab("alerts")}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "alerts"
              ? "bg-stone-900 text-white shadow"
              : "text-stone-500 hover:text-stone-300"
          }`}
        >
          <span>📥</span>
          <span>Inbox Alerts</span>
          {unreadCount > 0 && (
            <span className="bg-rose-500 text-white text-[9px] font-black h-4 px-1.5 rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("channels")}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "channels"
              ? "bg-stone-900 text-white shadow"
              : "text-stone-500 hover:text-stone-300"
          }`}
        >
          <span>🔌</span>
          <span>Communication Channels</span>
        </button>
      </div>

      {/* Tab 1: Alerts Inbox */}
      {activeTab === "alerts" && (
        <div className="space-y-6">
          
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-stone-950 border border-stone-900 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500 font-mono font-bold">FILTER SEVERITY:</span>
              <div className="flex gap-1 flex-wrap">
                {["all", "approval", "complete", "error", "info"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-mono tracking-wide uppercase font-bold border transition-all ${
                      filterType === type
                        ? "bg-stone-900 border-stone-800 text-white"
                        : "bg-transparent border-transparent text-stone-500 hover:text-stone-300"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[10px] font-mono text-stone-500">
              Showing {filteredNotifications.length} of {notifications.length} logs
            </div>
          </div>

          {/* List */}
          <div className="space-y-3">
            {filteredNotifications.length === 0 ? (
              <div className="bg-stone-950 border border-stone-900 border-dashed rounded-xl p-12 text-center">
                <span className="text-2xl block mb-2">📥</span>
                <p className="text-xs font-bold text-stone-400">No matching system alerts found</p>
                <p className="text-[10px] text-stone-600 mt-1">All active automated processes are operating within standard parameters.</p>
              </div>
            ) : (
              filteredNotifications.map((item: SystemNotification) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item.id, item.link)}
                  className={`bg-stone-950 border rounded-xl p-5 hover:border-stone-800 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    !item.read ? "border-blue-500/30 bg-blue-500/[0.01]" : "border-stone-900"
                  }`}
                >
                  <div className="flex gap-4 items-start min-w-0">
                    <div className={`h-9 w-9 shrink-0 rounded-lg border flex items-center justify-center text-sm ${colorMap[item.type as keyof typeof colorMap]}`}>
                      {iconMap[item.type as keyof typeof iconMap]}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className={`text-xs font-bold leading-none ${!item.read ? "text-white" : "text-stone-300"}`}>
                          {item.title}
                        </h3>
                        {!item.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <p className="text-[11px] text-stone-400 leading-normal font-medium">
                        {item.message}
                      </p>
                      <span className="text-[9px] text-stone-600 font-mono block">
                        Timestamp: {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <span className="self-end sm:self-center text-[10px] font-mono font-bold text-blue-400 hover:text-blue-300 shrink-0">
                    Resolve Exception →
                  </span>
                </div>
              ))
            )}
          </div>

        </div>
      )}

      {/* Tab 2: Channels Settings */}
      {activeTab === "channels" && (
        <div className="space-y-6">
          {channelsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-6 space-y-6">
              <div>
                <h3 className="text-sm font-black text-white">Configured Alerts & Event Forwarding</h3>
                <p className="text-[11px] text-stone-500 mt-1">Route autonomous worker exceptions directly to team webhooks, Slack pipelines, or secure SMS endpoints.</p>
              </div>

              <div className="divide-y divide-stone-900 border-t border-stone-900">
                {channels.length === 0 ? (
                  <div className="py-8 text-center text-stone-600 text-xs font-mono">No communication channels registered.</div>
                ) : (
                  channels.map((ch, idx) => (
                    <div key={idx} className="flex justify-between items-center py-4">
                      <div>
                        <h4 className="font-bold text-white text-xs">{ch.channel}</h4>
                        <p className="text-[10px] text-stone-500 mt-0.5">{ch.type}</p>
                      </div>
                      <button
                        onClick={() => handleToggleChannel(ch.channel)}
                        className={`px-4 py-2 text-[10px] font-mono tracking-wider font-bold uppercase rounded-lg border transition-all ${
                          ch.enabled
                            ? "bg-blue-600/10 border-blue-500/30 text-blue-400 hover:bg-blue-600/20"
                            : "bg-stone-900 border-stone-850 text-stone-500 hover:text-stone-400"
                        }`}
                      >
                        {ch.enabled ? "Active" : "Disabled"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feedback Toast */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-950 border border-blue-500/50 text-white px-5 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-blue-400">✓</span>
          <span className="text-[11px] font-mono font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}
