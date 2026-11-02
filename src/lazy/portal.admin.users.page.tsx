import { useState, useEffect } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";

/**
 * P1-2 honesty: this page previously rendered HARDCODED demo rows and dead
 * Edit/Suspend buttons. It renders the REAL registered accounts from
 * /api/data/users (users.json) only.
 *
 * SLICE 175 — two lies removed (both verified at 67a67d8):
 *
 * 1. NO ERROR STATE. The fetch never checked `res.ok` and swallowed every
 *    failure with `.catch(() => {})`, so a 403 (this route is owner-only) or a
 *    500 rendered "No registered accounts yet." — the owner was told the
 *    platform has zero users when it had simply failed to load. The empty state
 *    is now reserved for a genuine empty result, exactly as /portal/users does
 *    (audit D-13).
 * 2. THE STATUS COLUMN WAS A LITERAL. `/api/data/users` returns
 *    { id, email, role, createdAt } and nothing else — no status field exists in
 *    users.json — so every row printed "● Registered" from a hardcoded span.
 *    The column is gone rather than filled with a value the API does not send.
 */
interface WorkspaceUser {
  id?: string;
  email?: string;
  role?: string;
  createdAt?: string;
}

function AdminUsersPage() {
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data/users", { credentials: "include" })
      .then(async (r) => {
        // The status is the truth: a 403 is not "nobody has registered".
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            body.error ? `Could not load accounts: ${body.error}` : `Could not load accounts (HTTP ${r.status}).`,
          );
        }
        const d = (await r.json()) as { data?: WorkspaceUser[] };
        if (!Array.isArray(d.data)) throw new Error("Could not load accounts: the server returned no account list.");
        return d.data;
      })
      .then((list) => {
        if (cancelled) return;
        setUsers(list);
        setError("");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setUsers([]);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const admins = users.filter((u) => u.role === "admin" || u.role === "owner").length;
  const clients = users.length - admins;
  const fmtJoined = (u: WorkspaceUser) => {
    const t = u.createdAt ? new Date(u.createdAt).getTime() : NaN;
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "—";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">User Management</h1>
        <p className="text-stone-400 mt-1">Registered accounts, roles, and access.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm font-bold text-rose-300" role="alert">
          {error}
        </div>
      )}

      {/* Stats Row — real counts from users.json, and "—" only until loaded */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Total Users", value: loading || error ? "—" : String(users.length), color: "text-white" },
          { label: "Admins", value: loading || error ? "—" : String(admins), color: "text-amber-400" },
          { label: "Clients", value: loading || error ? "—" : String(clients), color: "text-blue-400" },
        ].map((s) => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Users Table — real users from users.json */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-stone-950 border-b border-stone-800 text-[10px] font-mono text-stone-500 uppercase tracking-wider font-bold">
          <div className="col-span-6">Email</div>
          <div className="col-span-3">Role</div>
          <div className="col-span-3">Joined</div>
        </div>
        <div className="divide-y divide-stone-800">
          {loading ? (
            <div className="px-6 py-6 text-xs text-stone-500">Loading accounts…</div>
          ) : users.length === 0 ? (
            <div className="px-6 py-6">
              {error ? (
                <p className="text-sm text-stone-400">
                  The account list could not be loaded, so there is nothing to show. This is an error, not an empty
                  workspace.
                </p>
              ) : (
                <PortalEmptyState compact title="No registered accounts yet" body="Accounts appear here after their first signup." />
              )}
            </div>
          ) : (
            users.map((user, idx) => (
              <div
                key={user.id || user.email || idx}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-stone-800/30 transition-colors"
              >
                <div className="col-span-6 text-white text-xs font-bold truncate">{user.email}</div>
                <div className="col-span-3">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      user.role === "admin" || user.role === "owner"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    }`}
                  >
                    {user.role || "user"}
                  </span>
                </div>
                <div className="col-span-3 text-xs text-stone-400 font-mono">{fmtJoined(user)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invite — not wired yet: honest disabled note (P1-2) */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
        <h3 className="text-white font-bold mb-2">Invite New User</h3>
        <p className="text-xs text-stone-500">Invites aren't available yet — accounts are created during onboarding.</p>
      </div>
    </div>
  );
}
export default AdminUsersPage;
