import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) {
          navigate({ to: "/login" as any });
          return;
        }
        const me = await meRes.json();
        setUser(me);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    navigate({ to: "/" });
  };

  const currentPath = location.pathname;

  const adminNavLinks = [
    { name: "📊 Monitoring Dashboard", path: "/portal/admin" },
    { name: "👥 User Management", path: "/portal/admin/users" },
    { name: "⚙️ AI & Prompt Settings", path: "/portal/admin/ai-config" },
    { name: "⚡ Visual Workflows", path: "/portal/admin/workflows" },
    { name: "🛠️ Workflow Builder", path: "/portal/admin/workflow-builder" },
    { name: "🔑 API Management", path: "/portal/admin/api" },
    { name: "🔌 Connected Integrations", path: "/portal/admin/integrations" },
    { name: "💰 Billing & Revenue", path: "/portal/admin/billing" },
    { name: "📜 System Logs", path: "/portal/admin/logs" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">👑</div>
          <p className="text-slate-400 font-bold">Verifying Admin Access Control...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      {/* Admin Collapsible Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed top-0 left-0 z-40">
        <div className="p-6 border-b border-slate-800">
          <Link to="/" className="text-xl font-black text-indigo-400 tracking-tight block">
            ⚙️ SL100 Admin
          </Link>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 block">
            System Control Panel
          </span>
        </div>

        {/* Sidebar Admin Nav Links */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider px-4 mb-3">
            Core Operations
          </div>
          {adminNavLinks.map((link) => {
            const isActive = currentPath === link.path;
            return (
              <Link
                key={link.path}
                to={link.path as any}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/35"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {link.name}
              </Link>
            );
          })}

          <div className="pt-6 my-4 border-t border-slate-800">
            <Link
              to="/portal"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <span>←</span> Exit to Client Portal
            </Link>
          </div>
        </nav>

        {/* Admin Roster profile */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="px-4 py-2 mb-2">
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Active Admin</p>
            <p className="text-xs font-bold text-slate-300 truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm text-rose-400 hover:bg-rose-950/20 hover:text-rose-300 transition-all text-left"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Admin Child Outlet Viewport */}
      <main className="flex-1 min-h-screen ml-64 p-8 lg:p-12 overflow-y-auto bg-slate-950">
        <Outlet />
      </main>
    </div>
  );
}
