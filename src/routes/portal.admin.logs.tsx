import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Button, Input } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/logs")({
  component: AdminLogs,
});

interface SystemLog {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "debug";
  message: string;
  component: string;
}

const initialLogs: SystemLog[] = [
  { id: "L-901", timestamp: "2026-07-03 16:22:15", level: "info", message: "Scheduler: Checked active workflow cues; All idle, cooldown 5 mins.", component: "Scheduler" },
  { id: "L-902", timestamp: "2026-07-03 16:20:02", level: "info", message: "Auth API: Verified JWT token access for user user@example.com", component: "AuthServer" },
  { id: "L-903", timestamp: "2026-07-03 15:35:44", level: "warning", message: "Database: Turso SQL sync latency exceeded threshold: 1.1s", component: "DrizzleORM" },
  { id: "L-904", timestamp: "2026-07-03 15:31:12", level: "error", message: "PDF Parser: Table column validation error: mismatch size on grid", component: "DocumentAI" },
  { id: "L-905", timestamp: "2026-07-03 14:02:10", level: "debug", message: "HTTP Client: Outgoing GET payload size 256 bytes returned 200 OK", component: "APIClient" },
];

function AdminLogs() {
  const [logs, setLogs] = useState<SystemLog[]>(initialLogs);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");

  const filteredLogs = logs.filter(l => {
    const matchesSearch = l.message.toLowerCase().includes(search.toLowerCase()) || 
                          l.component.toLowerCase().includes(search.toLowerCase());
    const matchesLevel = levelFilter === "all" || l.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-200">
      {/* Header section */}
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-black text-white">System Console Logs</h1>
        <p className="text-slate-400 text-sm mt-1">Examine and debug granular agent processing trace blocks, filter logging levels, and troubleshoot exceptions.</p>
      </div>

      {/* Filter and search controllers */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900/50 p-6 rounded-3xl border border-slate-800/80">
        <div className="w-full md:max-w-md">
          <Input 
            placeholder="🔍 Search log messages or system components..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-950 border-slate-800 focus:border-indigo-500 text-white"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Filter Level</label>
          <select 
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Logs</option>
            <option value="info">INFO</option>
            <option value="warning">WARNING</option>
            <option value="error">ERROR</option>
            <option value="debug">DEBUG</option>
          </select>
        </div>
      </div>

      {/* Logs container list */}
      <Card className="p-6 bg-slate-900 border-slate-800 space-y-4 shadow-xl">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider">Console Traces</h3>
          <Button size="sm" variant="outline" className="border-slate-800 text-slate-400 hover:bg-slate-850" onClick={() => setLogs(initialLogs)}>
            Clear Terminal View
          </Button>
        </div>

        <div className="font-mono text-xs space-y-3 max-h-[500px] overflow-y-auto p-4 bg-slate-950 border border-slate-800 rounded-2xl">
          {filteredLogs.map((log) => {
            const colors = {
              info: "text-indigo-400",
              warning: "text-amber-400",
              error: "text-rose-500",
              debug: "text-slate-500",
            }[log.level];

            return (
              <div key={log.id} className="flex flex-col md:flex-row items-start md:items-center gap-2 border-b border-slate-900 pb-2">
                <span className="text-slate-500 shrink-0 font-semibold">{log.timestamp}</span>
                <span className={`font-black uppercase tracking-wider shrink-0 w-16 ${colors}`}>[{log.level}]</span>
                <span className="text-indigo-400 shrink-0 font-bold">[{log.component}]</span>
                <span className="text-slate-300 font-semibold break-all">{log.message}</span>
              </div>
            );
          })}
          {filteredLogs.length === 0 && (
            <p className="text-slate-500 italic text-center py-8">No matching trace logs found.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
