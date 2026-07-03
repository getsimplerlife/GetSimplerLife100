import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Badge, Button, Input } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/api")({
  component: AdminApi,
});

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  role: "admin" | "write" | "read";
  status: "active" | "revoked";
  createdAt: string;
}

const initialKeys: ApiKey[] = [
  { id: "K-501", name: "Salesforce CRM Linker", prefix: "sl_live_7x89", role: "write", status: "active", createdAt: "2026-06-29" },
  { id: "K-502", name: "QuickBooks Ledger Sync", prefix: "sl_live_1u23", role: "write", status: "active", createdAt: "2026-07-01" },
  { id: "K-503", name: "Slack Dev Alert Hook", prefix: "sl_test_4m56", role: "admin", status: "revoked", createdAt: "2026-06-26" },
];

function AdminApi() {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRole, setNewKeyRole] = useState<any>("write");

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    const newK: ApiKey = {
      id: `K-${Math.floor(500 + Math.random() * 100)}`,
      name: newKeyName,
      prefix: `sl_live_${Math.random().toString(36).substring(2, 6)}`,
      role: newKeyRole,
      status: "active",
      createdAt: new Date().toISOString().split("T")[0]
    };
    setKeys([newK, ...keys]);
    setNewKeyName("");
  };

  const handleRevokeKey = (id: string) => {
    setKeys(keys.map(k => k.id === id ? { ...k, status: "revoked" } : k));
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-200">
      {/* Header section */}
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-black text-white">API Credentials Registry</h1>
        <p className="text-slate-400 text-sm mt-1">Provision private access tokens, define rate limit quotas, and monitor incoming webhook call metrics.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Requests (24h)</div>
          <div className="text-3xl font-black text-white">12,450</div>
          <p className="text-xs text-indigo-400 font-bold mt-2">Avg. Response: 24 ms</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Error Ratio</div>
          <div className="text-3xl font-black text-emerald-400">0.02%</div>
          <p className="text-xs text-emerald-500 font-bold mt-2">No active service outages</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Quota Limit Bandwidth</div>
          <div className="text-3xl font-black text-indigo-400">41.5%</div>
          <p className="text-xs text-indigo-500 font-bold mt-2">100k requests remaining</p>
        </div>
      </div>

      {/* Keys creation and management split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-black text-white">Active System Access Tokens</h2>
          <Card className="overflow-hidden bg-slate-900 border-slate-800 shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="p-4 pl-6">Token Name</th>
                  <th className="p-4">Key Token</th>
                  <th className="p-4">Access Level</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-850/50 transition-colors text-sm">
                    <td className="p-4 pl-6">
                      <div className="font-bold text-slate-200">{k.name}</div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">ID: {k.id} • Created {k.createdAt}</span>
                    </td>
                    <td className="p-4 font-mono text-slate-400 text-xs">{k.prefix}******************</td>
                    <td className="p-4">
                      <Badge variant={k.role === "admin" ? "danger" : "indigo"}>{k.role}</Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant={k.status === "active" ? "success" : "slate"}>{k.status}</Badge>
                    </td>
                    <td className="p-4 pr-6 text-right">
                      {k.status === "active" && (
                        <Button size="sm" variant="danger" onClick={() => handleRevokeKey(k.id)}>
                          Revoke Key
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Key creation tool */}
        <div>
          <Card className="p-6 bg-slate-900 border-slate-800 space-y-5">
            <h3 className="text-lg font-black text-white">Generate Private Access Token</h3>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed">System keys allow outer services to trigger automated agent executions or query database status.</p>
            
            <Input 
              label="Key Descriptor Name" 
              placeholder="e.g. Production ERP hook" 
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white"
            />

            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1.5">Access Role Set</label>
              <select 
                value={newKeyRole}
                onChange={(e: any) => setNewKeyRole(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="read">Read Only (query stats/runs)</option>
                <option value="write">Write/Modify (trigger workflows)</option>
                <option value="admin">Full Admin Controls</option>
              </select>
            </div>

            <Button className="w-full" onClick={handleCreateKey}>Generate Token Credentials</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
