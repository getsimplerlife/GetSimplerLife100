import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/tasks/")({
  component: TasksQueue,
});

function TasksQueue() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      const res = await fetch("/api/data/tasks", { credentials: "include" });
      const d = await res.json();
      setTasks(d.data || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleAction = async (id: string, action: string) => {
    try {
      setFeedback("Triggering task action " + action + " on " + id + "...");
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "task_" + action.toLowerCase().replace(" ", "_"),
          resource: id,
          details: { id, action },
        }),
      });
      await res.json();
      setFeedback("Success: " + action + " completed for Task " + id);
      setTimeout(() => setFeedback(""), 4000);
    } catch (err) {
      console.error(err);
      setFeedback("Error processing task action");
      setTimeout(() => setFeedback(""), 4000);
    }
  };

  const tabs = [
    { key: "all", name: "All Tasks" },
    { key: "running", name: "Running" },
    { key: "completed", name: "Completed" },
    { key: "failed", name: "Failed" },
    { key: "human review", name: "Human Review" },
  ];

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch = t.aiEmployee.toLowerCase().includes(searchTerm.toLowerCase()) || t.customer.toLowerCase().includes(searchTerm.toLowerCase()) || t.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || t.status.toLowerCase() === activeTab.toLowerCase();
    return matchesSearch && matchesTab;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-stone-200 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">📋 Tasks Queue</h1>
          <p className="text-stone-500 mt-1">Review live processes, inspect queue backlogs, download execution transcripts, and override holds.</p>
        </div>
        <button
          onClick={async () => {
            try {
              setFeedback("Initializing queue purging sequence...");
              await fetch("/api/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "purge_failed_tasks", resource: "tasks_queue" }),
              });
              setFeedback("Success: Failed tasks backlog queue cleared");
              setTimeout(() => setFeedback(""), 4000);
            } catch (err) {
              console.error(err);
            }
          }}
          className="bg-white text-stone-700 hover:text-stone-900 border border-stone-300 hover:border-stone-400 font-bold text-sm px-6 py-3 rounded-2xl shadow-sm self-start sm:self-auto"
        >
          🧹 Purge Backlog Queue
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200 overflow-x-auto select-none gap-2 pb-px scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={'px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all ' + 
              (activeTab === tab.key ? "border-emerald-600 text-emerald-600" : "border-transparent text-stone-500 hover:text-stone-900")}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <input
          type="text"
          placeholder="Search task index by ID, employee, or customer company..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-semibold placeholder-stone-400"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-semibold">
            <thead>
              <tr className="bg-stone-50 text-stone-500 font-bold border-b border-stone-150 uppercase tracking-wider">
                <th className="p-4">Task ID</th>
                <th className="p-4">Timestamp</th>
                <th className="p-4">AI Employee / Customer</th>
                <th className="p-4">Workflow Process</th>
                <th className="p-4">Status & Duration</th>
                <th className="p-4">Output Result</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredTasks.map((t) => (
                <tr key={t.id} className="hover:bg-stone-50/40">
                  <td className="p-4 font-mono font-bold text-stone-400">{t.id}</td>
                  <td className="p-4 text-stone-500">{t.timestamp}</td>
                  <td className="p-4">
                    <div className="font-bold text-stone-900">{t.aiEmployee}</div>
                    <div className="text-[10px] text-stone-400 font-semibold mt-0.5">Client: {t.customer}</div>
                  </td>
                  <td className="p-4 text-stone-600 font-semibold">{t.workflow}</td>
                  <td className="p-4">
                    <span className={'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1.5 ' + 
                      (t.status === "Running" ? "bg-blue-50 text-blue-700 border border-blue-100 animate-pulse" :
                      t.status === "Waiting" ? "bg-stone-50 text-stone-600 border border-stone-200" :
                      t.status === "Completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                      t.status === "Failed" ? "bg-rose-50 text-rose-700 border border-rose-100" :
                      "bg-amber-50 text-amber-700 border border-amber-100")}>
                      {t.status}
                    </span>
                    <div className="text-[10px] text-stone-400">Duration: {t.duration}</div>
                  </td>
                  <td className="p-4 max-w-sm truncate text-stone-500 font-semibold">{t.result}</td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => handleAction(t.id, "View Logs")}
                        className="bg-stone-50 hover:bg-stone-100 text-stone-700 text-[10px] font-bold px-2.5 py-1.5 rounded border border-stone-200"
                      >
                        Logs
                      </button>
                      {t.status === "Human Review" && (
                        <button
                          onClick={() => handleAction(t.id, "Review")}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-1.5 rounded border border-emerald-100"
                        >
                          Review
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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