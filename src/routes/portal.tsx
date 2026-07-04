import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal")({
  component: PortalLayout,
});

function PortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (!res.ok) {
          navigate({ to: "/login" as any });
          return;
        }
        const data = await res.json();
        setUser(data);
      } catch (err) {
        console.error("Auth check failed:", err);
        navigate({ to: "/login" as any });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    navigate({ to: "/" });
  };

  const navLinks = [
    { name: "Dashboard", path: "/portal", icon: "🏠" },
    { name: "AI Employees", path: "/portal/employees", icon: "🤖" },
    { name: "Workflows", path: "/portal/workflows", icon: "⚡" },
    { name: "Inbox", path: "/portal/inbox", icon: "📥" },
    { name: "AI Chat", path: "/portal/chat", icon: "💬" },
    { name: "Customers", path: "/portal/customers", icon: "👥" },
    { name: "Documents", path: "/portal/documents", icon: "📁" },
    { name: "Analytics", path: "/portal/analytics", icon: "📊" },
    { name: "Knowledge", path: "/portal/knowledge-base", icon: "🧠" },
    { name: "Integrations", path: "/portal/integrations", icon: "🔌" },
    { name: "Marketplace", path: "/portal/marketplace", icon: "🛒" },
    { name: "Settings", path: "/portal/settings", icon: "⚙️" },
  ];

  const currentPath = location.pathname;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-stone-800 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-stone-400 text-xs font-mono tracking-widest uppercase">Initializing platform...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-black text-stone-100 font-sans antialiased selection:bg-stone-800 selection:text-white">
      {/* Mobile Top Bar */}
      <header className="lg:hidden w-full bg-stone-950 border-b border-stone-900 h-14 fixed top-0 left-0 z-50 flex items-center justify-between px-6">
        <Link to="/" className="text-md font-black tracking-widest text-white uppercase">
          Simpler Life 100
        </Link>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-stone-400 hover:text-white focus:outline-none"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside
        className={`w-60 bg-stone-950 border-r border-stone-900 flex flex-col h-screen fixed top-0 left-0 z-40 transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 border-b border-stone-900 shrink-0 hidden lg:flex items-center px-6 justify-between">
          <Link to="/" className="text-xs font-black tracking-widest text-white uppercase hover:opacity-85 transition-opacity">
            Simpler Life 100
          </Link>
          <span className="text-[9px] text-stone-500 font-mono tracking-wider">v3.4</span>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto mt-14 lg:mt-0 select-none scrollbar-none">
          <p className="text-[9px] font-bold text-stone-600 uppercase tracking-widest px-3 mb-2">Workspace Platform</p>
          {navLinks.map((link) => {
            const isActive = currentPath === link.path || (link.path === "/portal" && currentPath === "/portal/");
            return (
              <Link
                key={link.path}
                to={link.path as any}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs transition-all ${
                  isActive
                    ? "bg-stone-900 text-white border-l-2 border-blue-500"
                    : "text-stone-400 hover:bg-stone-900/50 hover:text-stone-200"
                }`}
              >
                <span className="text-sm shrink-0">{link.icon}</span>
                <span>{link.name}</span>
              </Link>
            );
          })}

          <div className="pt-4 mt-4 border-t border-stone-900 space-y-1">
            <p className="text-[9px] font-bold text-stone-600 uppercase tracking-widest px-3 mb-2">Controls</p>
            <Link
              to="/portal/admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs text-stone-400 hover:bg-stone-900/50 hover:text-stone-200"
            >
              <span className="text-sm shrink-0">👑</span>
              <span>Admin Panel</span>
            </Link>
            <Link
              to="/"
              className="flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs text-stone-400 hover:bg-stone-900/50 hover:text-stone-200"
            >
              <span className="text-sm shrink-0">🏠</span>
              <span>Landing Page</span>
            </Link>
          </div>
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-stone-900 bg-stone-950 shrink-0">
          <div className="px-3 py-1.5 mb-2 rounded-lg bg-stone-900/30">
            <p className="text-[8px] text-stone-600 font-bold uppercase tracking-wider">Identity</p>
            <p className="text-xs font-bold text-stone-400 truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs text-stone-500 hover:bg-stone-900 hover:text-stone-200 transition-all text-left"
          >
            <span>🚪</span>
            <span>Sign Out Session</span>
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 min-h-screen lg:ml-60 flex flex-col pt-14 lg:pt-0 bg-black">
        <div className="flex-1 p-6 lg:p-10 overflow-y-auto max-w-6xl w-full mx-auto animate-fadeIn">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
