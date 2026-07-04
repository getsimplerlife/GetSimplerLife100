import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/admin/")({
  component: AdminIndex,
});

function AdminIndex() {
  const [data, setData] = useState<{ users: any[]; audits: any[]; auditLogs: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/users", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error("Failed to load admin data:", e);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-stone-400 font-bold">Loading Client Data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-stone-400 font-bold">Failed to load client data</p>
      </div>
    );
  }

  const { users, audits, auditLogs } = data;

  // Build a map of user_id -> purchases
  const purchasesByUser: Record<string, any[]> = {};
  for (const a of audits) {
    if (!purchasesByUser[a.userId]) purchasesByUser[a.userId] = [];
    purchasesByUser[a.userId].push(a);
  }

  // Build a map of user_id -> activity
  const activityByUser: Record<string, any[]> = {};
  for (const log of auditLogs) {
    const uid = log.userId || log.email;
    if (!uid) continue;
    if (!activityByUser[uid]) activityByUser[uid] = [];
    activityByUser[uid].push(log);
  }

  // Sort activity by most recent
  for (const uid of Object.keys(activityByUser)) {
    activityByUser[uid].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  // Aggregate stats
  const totalUsers = users.length;
  const totalPurchases = audits.length;
  const totalLogins = auditLogs.filter(l => l.action === "login").length;
  const totalRegistrations = auditLogs.filter(l => l.action === "register").length;

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUserData = selectedUser 
    ? users.find(u => u.id === selectedUser) 
    : null;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-800 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Client Management</h1>
          <p className="text-stone-400 mt-1">Every client, purchase, and site activity — in one place</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-black text-emerald-400 uppercase tracking-widest bg-emerald-950/40 border border-emerald-900/60 px-3 py-1 rounded-full">
            Owner Mode
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800">
          <div className="text-3xl font-black text-white">{totalUsers}</div>
          <div className="text-xs text-stone-400 font-bold mt-1 uppercase tracking-wider">Total Clients</div>
        </div>
        <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800">
          <div className="text-3xl font-black text-emerald-400">{totalPurchases}</div>
          <div className="text-xs text-stone-400 font-bold mt-1 uppercase tracking-wider">Total Purchases</div>
        </div>
        <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800">
          <div className="text-3xl font-black text-blue-400">{totalLogins}</div>
          <div className="text-xs text-stone-400 font-bold mt-1 uppercase tracking-wider">Sessions</div>
        </div>
        <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800">
          <div className="text-3xl font-black text-amber-400">{totalRegistrations}</div>
          <div className="text-xs text-stone-400 font-bold mt-1 uppercase tracking-wider">Registrations</div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-stone-900 rounded-2xl border border-stone-800 p-4">
        <input
          type="text"
          placeholder="Search clients by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-stone-300 placeholder-stone-600"
        />
      </div>

      {/* Main content: Clients + selected user details */}
      <div className="grid xl:grid-cols-5 gap-6">
        {/* Clients list (3 cols) */}
        <div className="xl:col-span-3 bg-stone-900 rounded-3xl border border-stone-800 overflow-hidden">
          <div className="p-5 border-b border-stone-800">
            <h2 className="text-sm font-bold text-stone-400 uppercase tracking-wider">All Clients</h2>
          </div>
          <div className="divide-y divide-stone-800/60">
            {filteredUsers.length === 0 && (
              <div className="p-8 text-center text-stone-500 font-bold">No clients found</div>
            )}
            {filteredUsers.map((u) => {
              const userPurchases = purchasesByUser[u.id] || [];
              const userActivity = activityByUser[u.id] || [];
              const lastAction = userActivity.length > 0 ? userActivity[0] : null;
              const isOwner = u.email === 'mathewortiz97@gmail.com';
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(selectedUser === u.id ? null : u.id)}
                  className={`w-full text-left p-5 hover:bg-stone-800/60 transition-colors ${
                    selectedUser === u.id ? 'bg-stone-800 border-l-2 border-emerald-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-emerald-900/40 border border-emerald-800/60 flex items-center justify-center text-emerald-400 font-black shrink-0">
                        {u.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate flex items-center gap-2">
                          {u.email}
                          {isOwner && (
                            <span className="text-[9px] font-black text-amber-400 uppercase bg-amber-950/40 border border-amber-900/60 px-1.5 py-0.5 rounded-full">Owner</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-500 font-semibold">
                          Registered {new Date(u.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {userPurchases.length > 0 && (
                        <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-2 py-0.5 rounded-full">
                          {userPurchases.length} purchase{userPurchases.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {lastAction && (
                        <span className="text-[10px] text-stone-500 font-bold">
                          {new Date(lastAction.createdAt).toLocaleDateString()}
                        </span>
                      )}
                      <span className="text-stone-600">{'>'}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected user detail (2 cols) */}
        <div className="xl:col-span-2">
          {selectedUserData ? (
            <div className="bg-stone-900 rounded-3xl border border-stone-800 p-5 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-white">{selectedUserData.email}</h3>
                  <button onClick={() => setSelectedUser(null)} className="text-stone-500 hover:text-white text-sm font-bold">✕</button>
                </div>
                <div className="text-xs text-stone-500 font-semibold">
                  ID: {selectedUserData.id.slice(0, 8)}...<br />
                  Registered: {new Date(selectedUserData.createdAt).toLocaleString()}
                </div>
              </div>

              {/* Purchases */}
              <div>
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider mb-2">Purchases</h4>
                {(purchasesByUser[selectedUserData.id] || []).length === 0 ? (
                  <div className="text-xs text-stone-600 font-semibold p-3 bg-stone-950/40 rounded-xl">No purchases yet</div>
                ) : (
                  <div className="space-y-2">
                    {purchasesByUser[selectedUserData.id].map((a: any) => (
                      <div key={a.id} className="bg-stone-950/40 p-3 rounded-xl border border-stone-800/60">
                        <div className="font-bold text-sm text-white">{a.type}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                            a.status === 'completed' || a.status === 'implemented' || a.status === 'active'
                              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'
                              : a.status === 'pending'
                              ? 'bg-amber-950/40 text-amber-400 border border-amber-900/40'
                              : 'bg-stone-800 text-stone-400'
                          }`}>{a.status}</span>
                          <span className="text-[10px] text-stone-500">{new Date(a.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div>
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider mb-2">Recent Activity</h4>
                {(activityByUser[selectedUserData.id] || []).length === 0 ? (
                  <div className="text-xs text-stone-600 font-semibold p-3 bg-stone-950/40 rounded-xl">No activity recorded</div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {(activityByUser[selectedUserData.id] || []).slice(0, 20).map((log: any, idx: number) => (
                      <div key={log.id || idx} className="flex items-center justify-between bg-stone-950/30 p-2.5 rounded-lg border border-stone-800/40">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            log.status === 'success' ? 'bg-emerald-500' :
                            log.status === 'failure' ? 'bg-red-500' :
                            'bg-amber-500'
                          }`} />
                          <div>
                            <span className="text-xs font-bold text-stone-300">{log.action}</span>
                            {log.resource && <span className="text-[10px] text-stone-600 ml-1.5">({log.resource})</span>}
                          </div>
                        </div>
                        <span className="text-[10px] text-stone-600 shrink-0">
                          {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-stone-900 rounded-3xl border border-stone-800 p-8 text-center">
              <div className="text-4xl mb-3">👆</div>
              <p className="text-stone-500 font-bold text-sm">Click a client to see their purchases and activity</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}