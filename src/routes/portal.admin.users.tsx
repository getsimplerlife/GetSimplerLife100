import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Badge, Button, Input, Modal } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/users")({
  component: AdminUsers,
});

interface User {
  id: string;
  email: string;
  role: "admin" | "member" | "customer_admin" | "customer_viewer";
  status: "active" | "suspended" | "pending";
  company: string;
  joinedAt: string;
}

const initialUsers: User[] = [
  { id: "U-101", email: "lead-ops@energycorp.com", role: "customer_admin", status: "active", company: "Energy Corp", joinedAt: "2026-06-28" },
  { id: "U-102", email: "finance-mgr@fastlogistics.com", role: "customer_admin", status: "active", company: "Fast Logistics", joinedAt: "2026-06-30" },
  { id: "U-103", email: "billing@automotive-parts.com", role: "customer_viewer", status: "pending", company: "AutoParts LLC", joinedAt: "2026-07-02" },
  { id: "U-104", email: "admin@simplerlife100.com", role: "admin", status: "active", company: "Simpler Life 100", joinedAt: "2026-06-25" },
];

function AdminUsers() {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<any>("member");
  const [editStatus, setEditStatus] = useState<any>("active");

  const handleToggleStatus = (id: string) => {
    setUsers(users.map(u => {
      if (u.id === id) {
        const nextStatus: any = u.status === "active" ? "suspended" : "active";
        return { ...u, status: nextStatus };
      }
      return u;
    }));
  };

  const handleSaveUser = () => {
    if (!editUser) return;
    setUsers(users.map(u => {
      if (u.id === editUser.id) {
        return { ...u, role: editRole, status: editStatus };
      }
      return u;
    }));
    setEditUser(null);
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) || 
    u.company.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-200">
      {/* Header banner */}
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-black text-white">Identity Access Management (IAM)</h1>
        <p className="text-slate-400 text-sm mt-1">Configure workspace users, toggle account statuses, and manage role-based permission sets.</p>
      </div>

      {/* Control bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900/50 p-6 rounded-3xl border border-slate-800/80">
        <div className="w-full md:max-w-md">
          <Input 
            placeholder="🔍 Search users by email or company..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-950 border-slate-800 focus:border-indigo-500 text-white"
          />
        </div>
        <Button size="sm">Invite System User</Button>
      </div>

      {/* User table */}
      <Card className="overflow-hidden bg-slate-900 border-slate-800 shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-xs font-black uppercase text-slate-500 tracking-wider">
              <th className="p-4 pl-6">ID</th>
              <th className="p-4">User Email</th>
              <th className="p-4">Company</th>
              <th className="p-4">Role Set</th>
              <th className="p-4">Status</th>
              <th className="p-4">Joined On</th>
              <th className="p-4 pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredUsers.map((u) => (
              <tr key={u.id} className="hover:bg-slate-850/50 transition-colors text-sm">
                <td className="p-4 pl-6 font-mono font-bold text-slate-500">{u.id}</td>
                <td className="p-4 font-bold text-slate-200">{u.email}</td>
                <td className="p-4 text-slate-400 font-semibold">{u.company}</td>
                <td className="p-4">
                  <Badge variant={u.role.includes("admin") ? "indigo" : "slate"}>
                    {u.role.replace("_", " ")}
                  </Badge>
                </td>
                <td className="p-4">
                  <Badge variant={u.status === "active" ? "success" : u.status === "suspended" ? "danger" : "warning"}>
                    {u.status}
                  </Badge>
                </td>
                <td className="p-4 text-slate-400 font-semibold">{u.joinedAt}</td>
                <td className="p-4 pr-6 text-right space-x-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setEditUser(u);
                      setEditRole(u.role);
                      setEditStatus(u.status);
                    }}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Edit
                  </Button>
                  <Button 
                    size="sm" 
                    variant={u.status === "active" ? "danger" : "success"}
                    onClick={() => handleToggleStatus(u.id)}
                  >
                    {u.status === "active" ? "Suspend" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Permissions Matrices Panel */}
      <div className="space-y-6 pt-6 border-t border-slate-800">
        <h2 className="text-xl font-black text-white">Role-Based Access Control (RBAC) Rules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6 bg-slate-900 border-slate-800">
            <h3 className="font-black text-indigo-400 mb-2">Super Admin</h3>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed">Full system access: edit global system prompts, provision API credentials, override agent flows, access billing ledgers, and manage team roster entries.</p>
          </Card>
          <Card className="p-6 bg-slate-900 border-slate-800">
            <h3 className="font-black text-emerald-400 mb-2">Customer Admin</h3>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed">Can request audits, execute all deployed coworkers, upload CSV/PDF files, view system logs, configure custom webhooks, and submit support desk tickets.</p>
          </Card>
          <Card className="p-6 bg-slate-900 border-slate-800">
            <h3 className="font-black text-amber-400 mb-2">Customer Viewer</h3>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed">Read-only entry access: browse requested efficiency reports, view coworker run history logs, download generated PDF reports, and read knowledge base guides.</p>
          </Card>
          <Card className="p-6 bg-slate-900 border-slate-800">
            <h3 className="font-black text-slate-400 mb-2">Developer Member</h3>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed">Can modify visual workflow nodes, edit test parameters, examine trace logs, and submit deployment configurations to lead review stages.</p>
          </Card>
        </div>
      </div>

      {/* Edit User Modal */}
      {editUser && (
        <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title={`Modify System Credentials - ${editUser.id}`}>
          <div className="space-y-5">
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Email Account</p>
              <p className="font-bold text-slate-200">{editUser.email}</p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1.5">Assigned Security Role</label>
              <select 
                className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={editRole}
                onChange={(e: any) => setEditRole(e.target.value)}
              >
                <option value="admin">Super Admin</option>
                <option value="customer_admin">Customer Admin</option>
                <option value="customer_viewer">Customer Viewer</option>
                <option value="member">Developer Member</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1.5">Account Status</label>
              <select 
                className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={editStatus}
                onChange={(e: any) => setEditStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <div className="flex gap-4 pt-4">
              <Button onClick={handleSaveUser} className="flex-1">Save Access Control</Button>
              <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
