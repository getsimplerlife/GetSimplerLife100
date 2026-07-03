import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/agents")({
  component: AgentsDashboard,
});

interface Agent {
  id: string;
  name: string;
  workflows: string[];
  savings: number;
  status: string;
  auditId: string;
  lastRun: { status: string; message: string; timestamp: number } | null;
  runCount: number;
}

interface AgentRun {
  id: string;
  agentName: string;
  workflowKey: string;
  inputData: string;
  resultData: string;
  status: string;
  message: string;
  feedback: string | null;
  feedbackResponse: string | null;
  createdAt: number;
}

function AgentsDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"agents" | "history" | "live" | "integrations">("agents");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackTarget, setFeedbackTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [liveFeed, setLiveFeed] = useState<any[]>([]);
  const [integrationsData, setIntegrationsData] = useState<any>({ categories: [], total_agents: 0, total_integrations: 0 });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Check auth and load data
  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) { navigate({ to: "/login" as any }); return; }
        const me = await meRes.json();
        setUser(me);

        const [agentsRes, historyRes, filesRes, integrationsRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/agents/history"),
          fetch("/api/agents/files"),
          fetch("/api/agents/integrations"),
        ]);
        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (historyRes.ok) setRuns(await historyRes.json());
        if (filesRes.ok) setFiles(await filesRes.json());
        if (integrationsRes.ok) setIntegrationsData(await integrationsRes.json());
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  // Load live feed from recent run history
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agents/history");
        if (res.ok) {
          const history = await res.json();
          const recent = history.slice(0, 20).map((run: any) => ({
            agent: run.agentName,
            step: run.workflowKey.replace(/_/g, " → "),
            result: run.status,
            message: run.message,
            time: new Date(run.createdAt).toLocaleString(),
            hasFile: false,
          }));
          setLiveFeed(recent);
        }
      } catch {}
    })();
  }, [runs]); // Refresh when runs change

  // Run an agent
  const runAgent = async (agent: Agent, workflowKey: string) => {
    const runId = `${agent.name}-${workflowKey}`;
    setRunning(runId);
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: agent.name,
          workflowKey,
          auditId: agent.auditId,
          inputData: { test: true, timestamp: new Date().toISOString() },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ ${agent.name}: ${data.message || "Completed"}`, "success");
        // Refresh history
        const historyRes = await fetch("/api/agents/history");
        if (historyRes.ok) setRuns(await historyRes.json());
        // Refresh agents for latest run status
        const agentsRes = await fetch("/api/agents");
        if (agentsRes.ok) setAgents(await agentsRes.json());
      } else {
        showToast(`❌ ${data.error || "Failed to run agent"}`, "error");
      }
    } catch (e: any) {
      showToast(`❌ ${e.message || "Network error"}`, "error");
    }
    setRunning(null);
  };

  // Submit feedback
  const submitFeedback = async (runId: string) => {
    if (!feedbackText.trim()) return;
    try {
      const res = await fetch("/api/agents/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, feedback: feedbackText }),
      });
      if (res.ok) {
        showToast("✅ Feedback submitted — we'll review and adjust the agent", "success");
        setFeedbackText("");
        setFeedbackTarget(null);
        // Refresh
        const historyRes = await fetch("/api/agents/history");
        if (historyRes.ok) setRuns(await historyRes.json());
      } else {
        showToast("❌ Failed to submit feedback", "error");
      }
    } catch {
      showToast("❌ Network error", "error");
    }
  };

  const refreshFiles = async () => {
    try {
      const res = await fetch("/api/agents/files");
      if (res.ok) setFiles(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileUpload = async (agentName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("agentName", agentName);

    try {
      showToast(`📤 Uploading ${file.name}...`, "success");
      const res = await fetch("/api/agents/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        showToast("✅ File uploaded successfully!", "success");
        await refreshFiles();
      } else {
        const err = await res.json();
        showToast(`❌ Upload failed: ${err.error || "Unknown error"}`, "error");
      }
    } catch {
      showToast("❌ Upload failed due to network error", "error");
    }
    // Reset file input
    e.target.value = "";
  };

  const handleFileDelete = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      const res = await fetch("/api/agents/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      if (res.ok) {
        showToast("✅ File deleted", "success");
        await refreshFiles();
      } else {
        showToast("❌ Failed to delete file", "error");
      }
    } catch {
      showToast("❌ Failed to delete file due to network error", "error");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    navigate({ to: "/" as any });
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleString();

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      success: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
      human_review: "bg-yellow-100 text-yellow-700",
      pending: "bg-gray-100 text-gray-700",
      active: "bg-indigo-100 text-indigo-700",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${colors[status] || "bg-gray-100 text-gray-700"}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🔄</div>
          <p className="text-gray-600">Loading your AI agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg text-sm font-bold ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-indigo-600">
            Simpler Life 100
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/portal" className="text-sm font-medium text-gray-600 hover:text-indigo-600">
              ← Back to Audits
            </Link>
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button onClick={handleLogout} className="text-sm font-medium text-gray-600 hover:text-indigo-600">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🤖 Your AI Agents</h1>
          <p className="text-gray-600 mt-1">Run your deployed agents, view results, and give feedback to improve them.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b">
          <button
            onClick={() => setActiveTab("agents")}
            className={`pb-3 font-bold text-sm transition-colors ${
              activeTab === "agents" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            🚀 Agents ({agents.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`pb-3 font-bold text-sm transition-colors ${
              activeTab === "history" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📜 Run History ({runs.length})
          </button>
          <button
            onClick={() => setActiveTab("live")}
            className={`pb-3 font-bold text-sm transition-colors ${
              activeTab === "live" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📋 Activity Log {liveFeed.length > 0 ? `(${liveFeed.length})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("integrations")}
            className={`pb-3 font-bold text-sm transition-colors ${
              activeTab === "integrations" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            🔌 Integrations ({integrationsData.total_integrations})
          </button>
        </div>

        {activeTab === "agents" && (
          <>
            {agents.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border text-center">
                <div className="text-5xl mb-4">🤖</div>
                <h3 className="text-lg font-bold mb-2">No agents deployed yet</h3>
                <p className="text-gray-600 mb-6">
                  Complete a Deep-Dive Audit to have AI agents deployed for your business.
                </p>
                <Link
                  to={"/#services" as any}
                  className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold"
                >
                  Browse Services
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {agents.map((agent) => (
                  <div key={agent.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                    {/* Agent Header */}
                    <div className="p-6 border-b bg-gradient-to-r from-indigo-50 to-blue-50">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{agent.name}</h3>
                        {statusBadge(agent.status)}
                      </div>
                      <div className="flex gap-4 text-sm text-gray-600">
                        <span>💾 {agent.runCount} runs</span>
                        <span>💰 ${agent.savings.toLocaleString()}/yr estimated savings</span>
                      </div>
                    </div>

                    {/* Workflows */}
                    <div className="p-6">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Workflows</h4>
                      <div className="space-y-2 mb-6">
                        {agent.workflows.map((wf) => {
                          const wfKey = `${agent.name.toLowerCase().replace(/\s+/g, "_")}_${wf.toLowerCase().replace(/\s+/g, "_")}`;
                          const isRunning = running === `${agent.name}-${wfKey}`;
                          return (
                            <div key={wf} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                              <span className="text-sm font-medium text-gray-700">
                                {wf.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                              <button
                                onClick={() => runAgent(agent, wfKey)}
                                disabled={isRunning}
                                className={`text-sm px-4 py-1.5 rounded-lg font-bold transition-all ${
                                  isRunning
                                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                    : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95"
                                }`}
                              >
                                {isRunning ? "⏳ Running..." : "▶ Run"}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Last Run */}
                      {agent.lastRun && (
                        <div className={`p-3 rounded-xl text-sm mb-6 ${
                          agent.lastRun.status === "success" ? "bg-green-50 border border-green-200" :
                          agent.lastRun.status === "failed" ? "bg-red-50 border border-red-200" :
                          "bg-yellow-50 border border-yellow-200"
                        }`}>
                          <div className="font-bold mb-1">Last Run: {agent.lastRun.status}</div>
                          <div className="text-gray-600">{agent.lastRun.message}</div>
                          <div className="text-gray-400 text-xs mt-1">{formatDate(agent.lastRun.timestamp)}</div>
                        </div>
                      )}

                      {/* Business Files Upload/List */}
                      <div className="border-t pt-4 mt-6">
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <span>📂</span> Business Files ({files.filter(f => f.agentName === agent.name).length})
                        </h4>
                        
                        {/* File upload input */}
                        <div className="mb-4">
                          <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-gray-700 hover:text-gray-900 rounded-xl cursor-pointer text-sm font-bold transition-all w-fit">
                            <span>📤 Upload File</span>
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => handleFileUpload(agent.name, e)}
                            />
                          </label>
                          <p className="text-[10px] text-gray-400 mt-1">Upload CSV, Excel, PDF, or text files for agent execution.</p>
                        </div>

                        {/* List of files for this agent */}
                        {files.filter(f => f.agentName === agent.name).length === 0 ? (
                          <p className="text-xs text-gray-500 italic bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200">No files uploaded yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {files.filter(f => f.agentName === agent.name).map((file) => (
                              <div key={file.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs border border-slate-100 shadow-xs hover:border-slate-200 transition-all">
                                <div className="truncate flex-1 pr-2">
                                  <span className="font-semibold text-gray-800 block truncate" title={file.fileName}>{file.fileName}</span>
                                  <span className="text-gray-400 text-[10px]">{(file.fileSize / 1024).toFixed(1)} KB • {new Date(file.createdAt).toLocaleDateString()}</span>
                                </div>
                                <button
                                  onClick={() => handleFileDelete(file.id)}
                                  className="text-red-500 hover:text-red-700 font-bold px-2 py-1 hover:bg-red-50 rounded-lg transition-all"
                                  title="Delete File"
                                >
                                  🗑️
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "history" && (
          <>
            {runs.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border text-center">
                <div className="text-5xl mb-4">📜</div>
                <h3 className="text-lg font-bold mb-2">No run history yet</h3>
                <p className="text-gray-600">
                  Run one of your AI agents above to see results here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {runs.map((run) => {
                  let resultData: any = {};
                  try { resultData = JSON.parse(run.resultData || "{}"); } catch {}
                  const tasks = resultData?.data?.tasks_completed;

                  return (
                    <div key={run.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                      {/* Run Header */}
                      <div className="p-5 border-b flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-gray-900">{run.agentName}</span>
                            {statusBadge(run.status)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {run.workflowKey.replace(/_/g, " → ")} • {formatDate(run.createdAt)}
                          </div>
                        </div>
                      </div>

                      {/* Result */}
                      <div className="p-5">
                        <div className="text-sm font-bold text-gray-700 mb-2">Result:</div>
                        <div className={`p-3 rounded-xl text-sm mb-4 ${
                          run.status === "success" ? "bg-green-50 text-green-800" :
                          run.status === "failed" ? "bg-red-50 text-red-800" :
                          "bg-yellow-50 text-yellow-800"
                        }`}>
                          {run.message || "No message"}
                        </div>

                        {/* Tasks */}
                        {tasks && tasks.length > 0 && (
                          <div className="mb-4">
                            <div className="text-sm font-bold text-gray-700 mb-2">Tasks Completed:</div>
                            <div className="space-y-1">
                              {tasks.map((t: string, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                                  <span className="text-green-500">✓</span> {t}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Feedback Section */}
                        <div className="border-t pt-4 mt-4">
                          {run.feedback ? (
                            <div className="bg-blue-50 p-3 rounded-xl mb-3">
                              <div className="text-sm font-bold text-blue-700 mb-1">Your Feedback:</div>
                              <div className="text-sm text-blue-800">{run.feedback}</div>
                              <div className="text-xs text-blue-500 mt-1">Awaiting response from our team</div>
                            </div>
                          ) : (
                            <>
                              {feedbackTarget === run.id ? (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={feedbackText}
                                    onChange={(e) => setFeedbackText(e.target.value)}
                                    placeholder="Describe what to adjust..."
                                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                                    onKeyDown={(e) => e.key === "Enter" && submitFeedback(run.id)}
                                  />
                                  <button
                                    onClick={() => submitFeedback(run.id)}
                                    disabled={!feedbackText.trim()}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:bg-gray-300"
                                  >
                                    Send
                                  </button>
                                  <button
                                    onClick={() => { setFeedbackTarget(null); setFeedbackText(""); }}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setFeedbackTarget(run.id)}
                                  className="text-sm text-indigo-600 font-bold hover:text-indigo-800"
                                >
                                  💬 Give feedback on this run
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === "live" && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="p-6 border-b bg-gradient-to-r from-indigo-50 to-blue-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  📋 Agent Activity Log
                </h3>
                {runs.length > 0 && (
                  <span className="text-xs text-gray-500">{runs.length} total runs</span>
                )}
              </div>
              <p className="text-sm text-gray-600">Shows actual workflow runs and their results. Activity appears here when you run an agent or the scheduler triggers a workflow.</p>
            </div>

            <div className="p-6">
              {liveFeed.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">⏳</div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No activity yet</h3>
                  <p className="text-gray-500 text-sm max-w-md mx-auto">
                    Activity will appear here when you run one of your AI agents or when the 24/7 scheduler processes a workflow. Run an agent from the Agents tab to see results.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {liveFeed.map((event, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-all">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg ${
                        event.result === "success" ? "bg-green-100" :
                        event.result === "failed" ? "bg-red-100" :
                        event.result === "human_review" ? "bg-yellow-100" :
                        "bg-blue-100"
                      }`}>
                        {event.result === "success" ? "✅" :
                         event.result === "failed" ? "❌" :
                         event.result === "human_review" ? "👤" : "⚙️"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-gray-900 text-sm">{event.agent}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            event.result === "success" ? "bg-green-100 text-green-700" :
                            event.result === "failed" ? "bg-red-100 text-red-700" :
                            event.result === "human_review" ? "bg-yellow-100 text-yellow-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {event.result}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 font-medium">{event.step}</div>
                        {event.message && (
                          <div className="text-xs text-gray-500 mt-1 bg-white rounded-lg p-2 border border-slate-100">{event.message}</div>
                        )}
                        <div className="text-xs text-gray-400 mt-1">{event.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "integrations" && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border shadow-sm">
                <div className="text-2xl mb-1">🤖</div>
                <div className="text-2xl font-bold text-gray-900">{integrationsData.total_agents}</div>
                <div className="text-sm text-gray-500">Agent Workflows</div>
              </div>
              <div className="bg-white p-5 rounded-2xl border shadow-sm">
                <div className="text-2xl mb-1">🔌</div>
                <div className="text-2xl font-bold text-gray-900">{integrationsData.total_integrations}</div>
                <div className="text-sm text-gray-500">Total Connections</div>
              </div>
              <div className="bg-white p-5 rounded-2xl border shadow-sm">
                <div className="text-2xl mb-1">📂</div>
                <div className="text-2xl font-bold text-gray-900">{files.length}</div>
                <div className="text-sm text-gray-500">Files Uploaded</div>
              </div>
              <div className="bg-white p-5 rounded-2xl border shadow-sm">
                <div className="text-2xl mb-1">📊</div>
                <div className="text-2xl font-bold text-gray-900">{integrationsData.categories?.length || 0}</div>
                <div className="text-sm text-gray-500">Integration Types</div>
              </div>
            </div>

            {/* Integration categories grid */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="p-6 border-b bg-gradient-to-r from-indigo-50 to-blue-50">
                <h3 className="text-xl font-bold text-gray-900">🔌 Integration Monitoring</h3>
                <p className="text-gray-600 text-sm mt-1">All systems your AI agents connect to across every deployed workflow.</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {integrationsData.categories?.map((cat: any) => (
                    <div key={cat.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-all">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-gray-900 text-sm">{cat.name}</h4>
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{cat.integration_count} connections</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-2">{cat.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {cat.agents?.slice(0, 4).map((a: string) => (
                              <span key={a} className="text-[10px] bg-white border px-1.5 py-0.5 rounded text-gray-600 truncate max-w-[140px]">
                                {a}
                              </span>
                            ))}
                            {cat.agents?.length > 4 && (
                              <span className="text-[10px] text-gray-400">+{cat.agents.length - 4} more</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Per-agent integration detail */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="p-6 border-b bg-slate-50/50">
                <h3 className="text-lg font-bold text-gray-900">Per-Agent Connection Details</h3>
                <p className="text-gray-500 text-sm mt-1">Expand each agent to see the specific systems it integrates with.</p>
              </div>
              <div className="p-6 space-y-4">
                {agents.map((agent) => (
                  <AgentIntegrationCard key={agent.id} agent={agent} files={files} />
                ))}
                {agents.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No agents deployed yet. Complete an audit to get started.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function AgentIntegrationCard({ agent, files }: { agent: Agent; files: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const [agentIntegrations, setAgentIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadIntegrations = async () => {
    if (agentIntegrations.length > 0 || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/integrations/${encodeURIComponent(agent.name)}`);
      if (res.ok) setAgentIntegrations(await res.json());
    } catch {}
    setLoading(false);
  };

  const agentFiles = files.filter(f => f.agentName === agent.name);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden hover:border-indigo-200 transition-all">
      <button
        onClick={() => { setExpanded(!expanded); if (!expanded) loadIntegrations(); }}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🤖</span>
          <div>
            <div className="font-bold text-gray-900 text-sm">{agent.name}</div>
            <div className="text-xs text-gray-500">{agent.workflows.length} workflows • ${agent.savings?.toLocaleString()}/yr</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
            {agentFiles.length} files
          </span>
          <span className="text-gray-400 transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            ▼
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-slate-50/50 p-4">
          {loading ? (
            <div className="text-center py-4 text-sm text-gray-500 animate-pulse">Loading integrations...</div>
          ) : agentIntegrations.length === 0 ? (
            <div className="text-center py-4 text-sm text-gray-500">No integration data available for this agent.</div>
          ) : (
            <div className="space-y-2">
              {agentIntegrations.map((integ: any, i: number) => {
                const isConnected = agentFiles.length > 0 || integ.type === "database" || integ.type === "crm";
                return (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 text-sm">
                    <span className="text-lg">{integ.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{integ.name}</div>
                      <div className="text-xs text-gray-500">{integ.description}</div>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                      isConnected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-400"}`}></span>
                      {isConnected ? "Connected" : "Pending Setup"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
