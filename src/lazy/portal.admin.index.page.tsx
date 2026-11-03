import { useState, useEffect } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";

/**
 * SLICE 180 — THE ROW SHAPES THIS PAGE READS.
 *
 * The audit store's real row is `{ id, timestamp, user, action, resource,
 * detail, ip }` (the shape `prod-server.ts` writes), and `/api/audit-logs`
 * hands those rows through UNTOUCHED: its FIELD_ALIASES table only renames
 * fields while SORTING, never in the body it returns. This page read
 * `log.userId` and `log.createdAt`, neither of which any row has ever carried,
 * so `actorOf` was always empty → "Recent Activity — No activity recorded" for
 * every client, and the last-action date never rendered.
 *
 * ONE accessor pair, used everywhere below. Do not scatter `||` fallbacks
 * through the JSX: a field-name change must be a one-line change here.
 */
const actorOf = (log: any): string => log?.user ?? log?.email;
const whenOf = (log: any): string => log?.timestamp ?? log?.created_at;
/**
 * Purchase rows are built by `buildPlanPurchase` in `src/lib/stripe-webhook.ts`
 * as `{ id, type, tier, productName, amount, stripeSessionId, status,
 * purchasedAt }` — `purchasedAt`, never `createdAt` — and they carry no
 * `userId`; the tenant is the map key in `tenant_purchases.json`, which the
 * owner-gated `/api/admin/purchases` route now surfaces as `tenantEmail`.
 */
const purchaseWhenOf = (p: any): string => p?.purchasedAt ?? p?.createdAt ?? "";

/** A date that cannot be parsed renders as "—", never "Invalid Date". */
const fmtDate = (value: string): string => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};
const msOf = (value: string): number => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
};

function AdminIndex() {
  const [data, setData] = useState<{ users: any[]; purchases: any[]; auditLogs: any[]; subscriptions: any[] } | null>(null);
  // SLICE 190 — the CLIENTS read was the silent one: `usersRes.ok ? … : {data:[]}`
  // made a failed `/api/admin/users` render "Total Clients 0" and "No clients
  // yet" — the owner told their business has no customers. Purchases and
  // activity already had notices (slice 180); the client list and the
  // subscription state did not.
  const [notices, setNotices] = useState<{ purchases?: string; audit?: string; users?: string; subscriptions?: string }>({});
  const [loading, setLoading] = useState(true);
  // True only when the whole read settled; combined with `notices.users` it is
  // the one thing that separates "no clients" from "the client list is unread".
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [usersRes, purchasesRes, logsRes, subsRes] = await Promise.all([
          fetch("/api/admin/users", { credentials: "include" }),
          // SLICE 180 — `/api/purchases` answers only the CALLER'S OWN rows
          // (`purchases[user.email]`), keyed by a map rather than by a field on
          // the row, so this page bucketed the owner's own purchases under every
          // client. `/api/admin/purchases` is the owner-gated all-tenant read
          // (same 401/403 gate as `/api/admin/users`), one row per purchase with
          // its owning `tenantEmail`.
          fetch("/api/admin/purchases", { credentials: "include" }),
          // SLICE 180 — with no query string the server's default window is the
          // FIRST 20 rows in store order (`prod-server.ts` `intParam("limit",
          // 20)`) and unsorted, so "recent activity" was the 20 OLDEST entries.
          // Ask for the whole slice, newest first, explicitly.
          fetch("/api/audit-logs?sortBy=timestamp&sortDir=desc&limit=10000", { credentials: "include" }),
          // Slice 139: real per-tenant subscription state (cancelled / past_due
          // / dunning) so the operator can see who has stopped paying instead of
          // reading a permanent "Active".
          fetch("/api/admin/subscriptions", { credentials: "include" }),
        ]);
        const usersJson = usersRes.ok ? await usersRes.json() : { data: [] };
        const purchasesJson = purchasesRes.ok ? await purchasesRes.json() : { data: [] };
        const logsJson = logsRes.ok ? await logsRes.json() : { data: [] };
        const subsJson = subsRes.ok ? await subsRes.json() : { data: [] };
        setNotices({
          users: usersRes.ok
            ? undefined
            : `Couldn't load clients (HTTP ${usersRes.status}) — the client list is unavailable, not empty.`,
          purchases: purchasesRes.ok
            ? undefined
            : `Couldn't load purchases (HTTP ${purchasesRes.status}) — the purchase panel is unavailable, not empty.`,
          audit: logsRes.ok
            ? undefined
            : `Couldn't load activity (HTTP ${logsRes.status}) — the activity panel is unavailable, not empty.`,
          subscriptions: subsRes.ok
            ? undefined
            : `Couldn't load subscription state (HTTP ${subsRes.status}) — nothing is claimed about cancelled subscriptions or failing cards.`,
        });
        setData({
          users: usersJson.data || [],
          purchases: purchasesJson.data || [],
          auditLogs: logsJson.data || [],
          subscriptions: subsJson.data || [],
        });
        setLoaded(true);
      } catch (e) {
        console.error("Failed to load admin data:", e);
        setLoaded(false);
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

  const { users, purchases, auditLogs } = data;
  // SLICE 190 — the client list is only "empty" when the read that fills it
  // answered. `clientsLoaded` is that conjunction, and every count and empty
  // state about clients is gated on it.
  const clientsLoaded = loaded && !notices.users;
  const subscriptions: any[] = data.subscriptions || [];
  const attention = subscriptions.filter((s) => s && (s.access === "revoked" || s.access === "at_risk"));

  // tenantEmail -> purchases. The owner-gated route attaches the owning
  // tenant's email to each row; a row without one is never attributed to a
  // client (it still counts in the total, because it is a real purchase).
  const purchasesByTenant: Record<string, any[]> = {};
  for (const p of purchases) {
    const email = typeof p?.tenantEmail === "string" ? p.tenantEmail : "";
    if (!email) continue;
    if (!purchasesByTenant[email]) purchasesByTenant[email] = [];
    purchasesByTenant[email].push(p);
  }

  // actor email -> activity
  const activityByActor: Record<string, any[]> = {};
  for (const log of auditLogs) {
    const actor = actorOf(log);
    if (!actor) continue;
    if (!activityByActor[actor]) activityByActor[actor] = [];
    activityByActor[actor].push(log);
  }

  // Sort activity by most recent, from the row's own timestamp.
  for (const actor of Object.keys(activityByActor)) {
    activityByActor[actor].sort((a, b) => msOf(whenOf(b)) - msOf(whenOf(a)));
  }

  // Aggregate stats
  const totalUsers = users.length;
  const totalPurchases = purchases.length;
  const totalLogins = auditLogs.filter(l => l.action === "login").length;
  const totalRegistrations = auditLogs.filter(l => l.action === "register").length;

  const filteredUsers = users.filter(u =>
    String(u.email ?? "").toLowerCase().includes(search.toLowerCase())
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
          <div className="text-3xl font-black text-white">{clientsLoaded ? totalUsers : "—"}</div>
          <div className="text-xs text-stone-400 font-bold mt-1 uppercase tracking-wider">Total Clients</div>
        </div>
        <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800">
          <div className="text-3xl font-black text-emerald-400">{notices.purchases ? "—" : totalPurchases}</div>
          <div className="text-xs text-stone-400 font-bold mt-1 uppercase tracking-wider">Total Purchases</div>
        </div>
        <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800">
          <div className="text-3xl font-black text-blue-400">{notices.audit ? "—" : totalLogins}</div>
          <div className="text-xs text-stone-400 font-bold mt-1 uppercase tracking-wider">Sessions</div>
        </div>
        <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800">
          <div className="text-3xl font-black text-amber-400">{notices.audit ? "—" : totalRegistrations}</div>
          <div className="text-xs text-stone-400 font-bold mt-1 uppercase tracking-wider">Registrations</div>
        </div>
      </div>

      {notices.users && (
        <div role="alert" className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-4 text-xs font-bold text-rose-300">
          {notices.users}
        </div>
      )}
      {notices.purchases && (
        <div className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-4 text-xs font-bold text-rose-300">
          {notices.purchases}
        </div>
      )}
      {notices.audit && (
        <div className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-4 text-xs font-bold text-rose-300">
          {notices.audit}
        </div>
      )}

      {/* Subscription state (slice 139) — real Stripe lifecycle state, not a
          permanent "Active". Only tenants that need attention are listed. */}
      <div className="bg-stone-900 rounded-2xl border border-stone-800 overflow-hidden">
        <div className="p-5 border-b border-stone-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-stone-400 uppercase tracking-wider">Subscription State</h2>
          <span className="text-[10px] font-black text-stone-500 uppercase tracking-wider">
            {notices.subscriptions ? "—" : `${subscriptions.length} on file`}
          </span>
        </div>
        {notices.subscriptions ? (
          <div className="p-5 text-rose-300 text-xs font-bold">{notices.subscriptions}</div>
        ) : attention.length === 0 ? (
          <div className="p-5 text-stone-500 text-xs">
            No cancelled subscriptions and no failing cards on file.
          </div>
        ) : (
          <div className="divide-y divide-stone-800/60">
            {attention.map((s: any) => (
              <div key={s.tenantEmail} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm truncate">{s.tenantEmail}</div>
                  <div className="text-[11px] text-stone-500 font-semibold">
                    {s.planName || "Platform subscription"}
                    {s.canceledAt ? ` · cancelled ${fmtDate(s.canceledAt)}` : ""}
                    {s.dunning?.active
                      ? ` · payment failed${s.dunning.since ? ` ${fmtDate(s.dunning.since)}` : ""}${
                          s.dunning.attemptCount > 1 ? ` (attempt ${s.dunning.attemptCount})` : ""
                        }`
                      : ""}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    s.access === "revoked"
                      ? "bg-rose-950/40 text-rose-400 border border-rose-900/60"
                      : "bg-amber-950/40 text-amber-400 border border-amber-900/60"
                  }`}
                >
                  {s.access === "revoked" ? "access ended" : "at risk"}
                </span>
              </div>
            ))}
          </div>
        )}
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
              !clientsLoaded ? (
                <PortalEmptyState
                  compact
                  title="The client list could not be read"
                  body="This is not a list of zero clients — it is an unread one. Reload to try again."
                />
              ) : users.length === 0 ? (
                <PortalEmptyState
                  compact
                  title="No clients yet"
                  body="Clients appear here after their first signup."
                />
              ) : (
                <PortalEmptyState
                  compact
                  title="No clients match your search"
                  body="Try a different search term."
                  action={{ label: "Clear search", onClick: () => setSearch("") }}
                />
              )
            )}
            {filteredUsers.map((u) => {
              const userPurchases = purchasesByTenant[u.email] || [];
              const userActivity = activityByActor[u.email] || [];
              const lastAction = userActivity.length > 0 ? userActivity[0] : null;
              const isOwner = u.role === 'admin' || u.role === 'owner';
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
                        {String(u.email ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate flex items-center gap-2">
                          {u.email}
                          {isOwner && (
                            <span className="text-[10px] font-black text-amber-400 uppercase bg-amber-950/40 border border-amber-900/60 px-1.5 py-0.5 rounded-full">Owner</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-500 font-semibold">
                          Registered {fmtDate(u.createdAt)}
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
                          {fmtDate(whenOf(lastAction))}
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
                  <button onClick={() => setSelectedUser(null)} aria-label="Close user details" className="text-stone-500 hover:text-white text-sm font-bold">✕</button>
                </div>
                <div className="text-xs text-stone-500 font-semibold">
                  ID: {String(selectedUserData.id ?? "").slice(0, 8)}...<br />
                  Registered: {fmtDate(selectedUserData.createdAt)}
                </div>
              </div>

              {/* Purchases */}
              <div>
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider mb-2">Purchases</h4>
                {notices.purchases ? (
                  <div className="text-xs font-semibold p-3 bg-stone-950/40 rounded-xl text-rose-300">{notices.purchases}</div>
                ) : (purchasesByTenant[selectedUserData.email] || []).length === 0 ? (
                  <div className="text-xs text-stone-600 font-semibold p-3 bg-stone-950/40 rounded-xl">No purchases yet</div>
                ) : (
                  <div className="space-y-2">
                    {purchasesByTenant[selectedUserData.email].map((a: any) => (
                      <div key={a.id} className="bg-stone-950/40 p-3 rounded-xl border border-stone-800/60">
                        <div className="font-bold text-sm text-white">{a.productName || a.tier || a.type}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                            a.status === 'completed' || a.status === 'implemented' || a.status === 'active'
                              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'
                              : a.status === 'pending'
                              ? 'bg-amber-950/40 text-amber-400 border border-amber-900/40'
                              : 'bg-stone-800 text-stone-400'
                          }`}>{a.status}</span>
                          <span className="text-[10px] text-stone-500">{fmtDate(purchaseWhenOf(a))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div>
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider mb-2">Recent Activity</h4>
                {notices.audit ? (
                  <div className="text-xs font-semibold p-3 bg-stone-950/40 rounded-xl text-rose-300">{notices.audit}</div>
                ) : (activityByActor[selectedUserData.email] || []).length === 0 ? (
                  <div className="text-xs text-stone-600 font-semibold p-3 bg-stone-950/40 rounded-xl">
                    No activity for this client in your audit log.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {(activityByActor[selectedUserData.email] || []).slice(0, 20).map((log: any, idx: number) => (
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
                          {fmtDate(whenOf(log))} {whenOf(log) ? new Date(whenOf(log)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
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

export default AdminIndex;
