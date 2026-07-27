import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">User Management</h1>
        <p className="text-stone-400 mt-1">Manage all customer accounts, roles, and access.</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: "3", color: "text-white" },
          { label: "Active", value: "3", color: "text-emerald-400" },
          { label: "Admins", value: "1", color: "text-amber-400" },
          { label: "Clients", value: "2", color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-stone-950 border-b border-stone-800 text-[10px] font-mono text-stone-500 uppercase tracking-wider font-bold">
          <div className="col-span-4">Email</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <div className="divide-y divide-stone-800">
          {[
            { email: "mathewortiz97@gmail.com", role: "Admin", status: "Active", joined: "2026-07-21" },
            { email: "demo@test.com", role: "User", status: "Active", joined: "2026-07-22" },
            { email: "newclient@test.com", role: "Client", status: "Active", joined: "2026-07-24" },
          ].map(user => (
            <div key={user.email} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-stone-800/30 transition-colors">
              <div className="col-span-4 text-white text-xs font-bold truncate">{user.email}</div>
              <div className="col-span-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  user.role === "Admin" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                  "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                }`}>{user.role}</span>
              </div>
              <div className="col-span-2">
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {user.status}
                </span>
              </div>
              <div className="col-span-2 text-xs text-stone-400 font-mono">{user.joined}</div>
              <div className="col-span-2 text-right">
                <button className="text-[10px] font-bold text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 px-3 py-1.5 rounded-lg transition-all mr-1">Edit</button>
                <button className="text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-all">Suspend</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite User */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
        <h3 className="text-white font-bold mb-4">Invite New User</h3>
        <div className="flex gap-3">
          <input type="email" placeholder="Email address..." className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500" />
          <select className="bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500">
            <option>Client</option>
            <option>User</option>
            <option>Admin</option>
          </select>
          <button className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all">Send Invite</button>
        </div>
      </div>
    </div>
  );
}
