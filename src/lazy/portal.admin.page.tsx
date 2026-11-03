import { Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useState, useEffect } from "react";



function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  // SLICE 190 — a session read that threw used to land in `catch { console.error }`,
  // `setLoading(false)` ran anyway, `user` stayed null and `if (!user) return null`
  // rendered a COMPLETELY BLANK SCREEN on every /portal/admin/* route. The owner
  // got a white page with no way to tell "you are not an admin" from "the read
  // failed". `failure` is what makes that difference visible.
  const [failure, setFailure] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/me", { credentials: "include" });
        if (!meRes.ok) {
          navigate({ to: "/login" as any });
          return;
        }
        const me = await meRes.json();
        const userData = me.user || me;
        // Only the business owner (role claim admin/owner) can access the
        // admin panel — P1-5 role-based gating, no hardcoded email.
        if (userData.role !== "admin" && userData.role !== "owner") {
          // D-10 (sweep A): the bounce must SAY SO. A silent redirect leaves a
          // non-owner unable to tell a refusal from a mis-click.
          navigate({ to: "/portal", search: { notice: "admin-required" } } as any);
          return;
        }
        setUser(userData);
        setFailure("");
      } catch (e) {
        setFailure(e instanceof Error ? e.message : "The session could not be read.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    navigate({ to: "/" });
  };

  const currentPath = location.pathname;

  const adminNavLinks = [
    { name: "📊 Monitoring Dashboard", path: "/portal/admin" },
    { name: "🩺 Infrastructure Health", path: "/portal/admin/health" },
    { name: "🛠️ Workflow Builder", path: "/portal/admin/workflow-builder" },
    { name: "🔍 Audit Logs", path: "/portal/admin/audit" },
    // SLICE 159 — first-party page counter (owner-only, like every admin view).
    { name: "📈 Page Views", path: "/portal/admin/page-views" },
    // SLICE 162 — "did our data survive the last publish?", answered from the
    // filesystem by the running server (owner-only, like every admin view).
    { name: "💾 Data Health", path: "/portal/admin/data-health" },
    { name: "🔑 OAuth Credentials", path: "/portal/admin/credentials" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">👑</div>
          <p className="text-stone-400 font-bold">Verifying Admin Access Control...</p>
        </div>
      </div>
    );
  }

  // SLICE 190 — never `return null` here. A blank screen is the worst possible
  // failure state: it looks like a permission refusal, a routing bug and a
  // crashed app all at once, and it leaves the owner nothing to act on.
  if (!user) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-lg font-black text-white">Admin access could not be verified</h1>
          <p className="text-stone-400 text-sm mt-2 leading-relaxed">
            {failure || "The session read did not answer."} This is not a permission refusal — it is an unread one, so
            no admin page was opened and nothing was changed.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-bold py-2 px-4 rounded-xl text-xs"
          >
            Reload →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white flex">
      {/* Admin Collapsible Sidebar */}
      <aside className="w-64 bg-stone-900 border-r border-stone-800 flex flex-col h-screen fixed top-0 left-0 z-40">
        <div className="p-6 border-b border-stone-800">
          <Link to="/" className="text-xl font-black text-emerald-400 tracking-tight block">
            ⚙️ SL100 Admin
          </Link>
          <span className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1 block">
            System Control Panel
          </span>
        </div>

        {/* Sidebar Admin Nav Links */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-black uppercase text-stone-500 tracking-wider px-4 mb-3">
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
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/35"
                    : "text-stone-400 hover:bg-stone-800 hover:text-white"
                }`}
              >
                {link.name}
              </Link>
            );
          })}

          <div className="pt-6 my-4 border-t border-stone-800">
            <Link
              to="/portal"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-stone-400 hover:bg-stone-800 hover:text-white"
            >
              <span>←</span> Exit to Client Portal
            </Link>
          </div>
        </nav>

        {/* Admin Roster profile */}
        <div className="p-4 border-t border-stone-800 bg-stone-900/50">
          <div className="px-4 py-2 mb-2">
            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">Active Admin</p>
            <p className="text-xs font-bold text-stone-300 truncate">{user.email}</p>
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
      <main className="flex-1 min-h-screen ml-64 p-8 lg:p-12 overflow-y-auto bg-stone-950">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
