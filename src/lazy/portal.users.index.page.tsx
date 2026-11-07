import { useState, useEffect } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";
import { PageHeader } from "~/components/ui";

/**
 * SLICE 167 — /portal/users, made honest (audit D-13 + D-14).
 *
 * D-13: this page never checked `res.ok`, so a 403 rendered "No team members
 * yet — Team members appear here after their first signup" while two members
 * existed. An error must look like an error; the empty state is reserved for a
 * genuine empty result.
 *
 * D-14: the page offered "➕ Invite Member" and a per-row "Edit" that POSTed to
 * /api/data/users — a read-only, owner-gated route with no action dispatch. Both
 * returned 200 and wrote nothing, while the subtitle promised "Configure role
 * privileges, manage tenancy users, and audit active sessions". Role management
 * does not exist and is NOT built here (owner gate: nothing new until the audit
 * is complete). The controls are gone and the subtitle now describes exactly
 * what the page does: it lists the accounts in this workspace.
 *
 * The same rule applies to the table itself: /api/data/users returns
 * {id, email, role, createdAt} and NOTHING else, so the "Department" and "MFA"
 * columns were empty or a fabricated "None" on every row. They are replaced by
 * "Added" (createdAt), which the API really sends.
 */
interface WorkspaceUser {
  name?: string;
  email?: string;
  role?: string;
  createdAt?: string;
}

function UserManagement() {
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data/users", { credentials: "include" })
      .then(async (r) => {
        // The status is the truth: a 403 is not "nobody has signed up yet".
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            body.error
              ? `Could not load team members: ${body.error}`
              : `Could not load team members (HTTP ${r.status}).`,
          );
        }
        const d = (await r.json()) as { data?: WorkspaceUser[] };
        if (!Array.isArray(d.data)) throw new Error("Could not load team members: the server returned no user list.");
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }
  return (
    <div className="space-y-8 font-sans">
      <PageHeader title={<>👥 Team Members</>} subtitle={<>Every account in this workspace, with its role and when it was created. This page reads the list — it does not add members or change roles.</>} />
      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm font-bold text-rose-300" role="alert">
          {error}
        </div>
      )}
      <div className="bg-stone-900 rounded-3xl border border-stone-800 overflow-hidden">
        {users.length === 0 ? (
          <div className="p-8">
            {error ? (
              <p className="text-sm text-stone-400">
                The list could not be loaded, so there is nothing to show. This is an error, not an empty workspace.
              </p>
            ) : (
              <PortalEmptyState title="No team members yet" body="Team members appear here after their first signup." />
            )}
          </div>
        ) : (
          <table className="w-full text-left text-xs font-semibold">
            <thead>
              <tr className="bg-stone-800 text-stone-400 border-b border-stone-800 uppercase tracking-wider">
                <th className="p-4 font-bold">User</th>
                <th className="p-4 font-bold">Role</th>
                <th className="p-4 font-bold">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800 font-semibold text-stone-300">
              {users.map((u, idx) => (
                <tr key={u.email ?? idx} className="hover:bg-stone-800/40">
                  <td className="p-4 font-black text-stone-100">
                    {u.name ? `${u.name} ` : ""}
                    <span className="block text-[10px] text-stone-400 font-bold">{u.email}</span>
                  </td>
                  <td className="p-4">{u.role}</td>
                  <td className="p-4">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
export default UserManagement;
