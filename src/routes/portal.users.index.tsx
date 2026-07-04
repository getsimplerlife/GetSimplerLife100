import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/users/")({
  component: UserManagement,
});

function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/users", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setUsers(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (email: string, action: string) => {
    try {
      setFeedback(`Processing user action: ${action}...`);
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "user_" + action.toLowerCase(), resource: email }),
      });
      setFeedback("Success: Action completed");
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
      <div className="border-b border-stone-200 pb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">👥 Team Members</h1>
          <p className="text-stone-500 mt-1">Configure role privileges, manage tenancy users, and audit active sessions.</p>
        </div>
        <button onClick={() => handleAction("new@company.com", "invite")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg">➕ Invite Member</button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
        <table className="w-full text-left text-xs font-semibold">
          <thead>
            <tr className="bg-stone-50 text-stone-500 border-b border-stone-150 uppercase tracking-wider">
              <th className="p-4 font-bold">User</th>
              <th className="p-4 font-bold">Department</th>
              <th className="p-4 font-bold">Role</th>
              <th className="p-4 font-bold">MFA</th>
              <th className="p-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
            {users.map((u, idx) => (
              <tr key={idx} className="hover:bg-stone-50/40">
                <td className="p-4 font-black text-stone-900">{u.name} <span className="block text-[10px] text-stone-400 font-bold">{u.email}</span></td>
                <td className="p-4">{u.department}</td>
                <td className="p-4">{u.role}</td>
                <td className="p-4">{u.mfa ? "Active" : "None"}</td>
                <td className="p-4 text-right">
                  <button onClick={() => handleAction(u.email, "edit")} className="text-emerald-600">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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