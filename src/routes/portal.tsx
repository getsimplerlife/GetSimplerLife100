import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { PortalContext } from "./portal.context";
import type { SystemNotification, PortalContextType } from "./portal.context";
export { PortalContext, usePortalContext } from "./portal.context";
export type { SystemNotification, PortalContextType } from "./portal.context";

export const Route = createFileRoute("/portal")({
  component: PortalLayout,
});

function PortalLayout() {
  const TypedOutlet = Outlet as any;
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [pwaPrompt, setPwaPrompt] = useState<any>(null);

  const bellRef = useRef<HTMLDivElement>(null);

  // Load notifications
  const loadNotifications = async () => {
    try {
      const res = await fetch("/api/data/system_notifications", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          // Sort newest first
          const sorted = [...json.data].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setNotifications(sorted);
        } else {
          setNotifications([]);
        }
      }
    } catch (err) {
      console.error("Failed to load system notifications:", err);
    }
  };

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
        await loadNotifications();
      } catch (err) {
        console.error("Auth check failed:", err);
        navigate({ to: "/login" as any });
      } finally {
        setLoading(false);
      }
    })();

    // Listen to PWA custom install prompt event
    const onPwaAvailable = () => {
      if (typeof window !== "undefined") {
        setPwaPrompt((window as any).deferredPrompt);
      }
    };
    window.addEventListener("pwa-install-available", onPwaAvailable);

    // Initial check in case it fired earlier
    if (typeof window !== "undefined" && (window as any).deferredPrompt) {
      setPwaPrompt((window as any).deferredPrompt);
    }

    // Setup polling every 30 seconds
    const interval = setInterval(loadNotifications, 30000);

    // Handle clicks outside notification dropdown
    const handleOutsideClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      window.removeEventListener("pwa-install-available", onPwaAvailable);
      document.removeEventListener("mousedown", handleOutsideClick);
      clearInterval(interval);
    };
  }, [navigate]);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    navigate({ to: "/" });
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      const updated = notifications.map(n => {
        if (n.id === id || n._id === id) {
          return { ...n, read: true };
        }
        return n;
      });
      setNotifications(updated);

      const target = notifications.find(n => n.id === id || n._id === id);
      if (target) {
        const { _id, ...cleanObj } = target;
        await fetch(`/api/data/system_notifications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ...cleanObj, _id, read: true }),
        });
      }
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const updated = notifications.map(n => ({ ...n, read: true }));
      setNotifications(updated);
      
      for (const item of notifications) {
        if (!item.read) {
          const { _id, ...cleanObj } = item;
          await fetch(`/api/data/system_notifications`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ...cleanObj, _id, read: true }),
          });
        }
      }
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const addNotification = async (notif: Omit<SystemNotification, "id" | "createdAt" | "read">) => {
    try {
      const newNotif: SystemNotification = {
        ...notif,
        id: "n-" + Math.random().toString(36).substr(2, 9),
        read: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications([newNotif, ...notifications]);
      await fetch("/api/data/system_notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newNotif),
      });
    } catch (err) {
      console.error("Failed to add system notification:", err);
    }
  };

  const handleInstallPwa = () => {
    if (pwaPrompt) {
      pwaPrompt.prompt();
      pwaPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === "accepted") {
          console.log("PWA install accepted");
        } else {
          console.log("PWA install dismissed");
        }
        setPwaPrompt(null);
        (window as any).deferredPrompt = null;
      });
    }
  };

  const navLinks = [
    { name: "Dashboard", subtitle: "Activity Hub", path: "/portal", icon: "🏠" },
    { name: "AI Employees", subtitle: "Workspace Hub", path: "/portal/employees", icon: "🤖" },
    { name: "Inbox", subtitle: "Unified Activity Feed", path: "/portal/inbox", icon: "📥" },
    { name: "Documents", subtitle: "Central File Manager", path: "/portal/documents", icon: "📁" },
    { name: "AI Chat", path: "/portal/chat", icon: "💬" },
    { name: "Connect AI", subtitle: "Workflow Mapping", path: "/portal/workflows", icon: "⚡" },
    { name: "Integrations", subtitle: "Full Catalog", path: "/portal/integrations", icon: "🔌" },
    { name: "CRM & ERP", subtitle: "Universal Connector", path: "/portal/customers", icon: "👥" },
    { name: "Marketplace", subtitle: "Purchase Flow", path: "/portal/marketplace", icon: "🛒" },
    { name: "Settings", subtitle: "Business Profile", path: "/portal/settings", icon: "⚙️" },
  ];

  const mobileLinks = [
    { name: "Dashboard", path: "/portal", icon: "🏠" },
    { name: "Employees", path: "/portal/employees", icon: "🤖" },
    { name: "AI Chat", path: "/portal/chat", icon: "💬" },
    { name: "Inbox", path: "/portal/inbox", icon: "📥" },
    { name: "Alerts", path: "/portal/notifications", icon: "🔔", badge: unreadCount },
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
    <PortalContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, addNotification }}>
      <div className="min-h-screen bg-black text-stone-100 font-sans antialiased selection:bg-stone-800 selection:text-white pb-16 lg:pb-0">
      
      {/* Mobile Top Header */}
      <header className="lg:hidden w-full bg-stone-950 border-b border-stone-900 h-14 fixed top-0 left-0 z-50 flex items-center justify-between px-6">
        <Link to="/" className="text-md font-black tracking-widest text-white uppercase">
          Simpler Life 100
        </Link>
        <div className="flex items-center gap-4">
          {/* Mobile Bell Button */}
          <Link to="/portal/notifications" className="relative p-1 text-stone-400 hover:text-white transition-colors">
            <span>🔔</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white ring-2 ring-stone-950">
                {unreadCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-stone-400 hover:text-white focus:outline-none"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
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
          <span className="text-[9px] text-stone-500 font-mono tracking-wider">v3.5</span>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto mt-14 lg:mt-0 select-none scrollbar-none">
          <p className="text-[9px] font-bold text-stone-600 uppercase tracking-widest px-3 mb-2">Platform</p>
          {navLinks.map((link) => {
            const isActive = currentPath === link.path || (link.path === "/portal" && currentPath === "/portal/");
            const isIntegrations = link.name === "Integrations";
            return (
              <Link
                key={link.path}
                to={link.path as any}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs transition-all group ${
                  isActive
                    ? "bg-stone-900 text-white border-l-2 border-blue-500"
                    : isIntegrations
                    ? "text-stone-300 hover:bg-stone-900/50 hover:text-white border-l-2 border-transparent hover:border-blue-500/50"
                    : "text-stone-400 hover:bg-stone-900/50 hover:text-stone-200 border-l-2 border-transparent"
                }`}
              >
                <span className="text-sm shrink-0">{link.icon}</span>
                <div className="min-w-0">
                  <div className="truncate">{link.name}</div>
                  {link.subtitle && (
                    <div className={`text-[9px] font-medium truncate ${isActive ? "text-stone-500" : "text-stone-600 group-hover:text-stone-500"}`}>
                      {link.subtitle}
                    </div>
                  )}
                </div>
                {isIntegrations && !isActive && (
                  <span className="ml-auto bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] px-1.5 py-0.5 rounded-md font-bold tracking-wider shrink-0">180+</span>
                )}
              </Link>
            );
          })}

          <div className="pt-4 mt-4 border-t border-stone-900 space-y-1">
            <p className="text-[9px] font-bold text-stone-600 uppercase tracking-widest px-3 mb-2">Controls</p>
            {user.email === "mathewortiz97@gmail.com" && (
              <Link
                to="/portal/admin"
                className="flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs text-stone-400 hover:bg-stone-900/50 hover:text-stone-200 border-l-2 border-transparent"
              >
                <span className="text-sm shrink-0">👑</span>
                <span>Admin Panel</span>
              </Link>
            )}
            <Link
              to="/"
              className="flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs text-stone-400 hover:bg-stone-900/50 hover:text-stone-200 border-l-2 border-transparent"
            >
              <span className="text-sm shrink-0">🏠</span>
              <span>Landing Page</span>
            </Link>
          </div>
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-stone-900 bg-stone-950 shrink-0 mb-16 lg:mb-0">
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
        
        {/* Desktop Header bar */}
        <header className="hidden lg:flex w-full h-14 bg-stone-950 border-b border-stone-900 items-center justify-between px-10 sticky top-0 z-30 select-none">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono tracking-widest text-stone-400 uppercase font-bold">WORKSPACE RUNNING UNDER SECURITY LAYER</span>
          </div>

          <div className="flex items-center gap-6">
            {/* PWA Install Button */}
            {pwaPrompt && (
              <button
                onClick={handleInstallPwa}
                className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-[10px] tracking-widest uppercase rounded-lg shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <span>📥</span>
                <span>Install Web App</span>
              </button>
            )}

            {/* Notification Bell Dropdown Button */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="relative p-1.5 rounded-lg bg-stone-900 border border-stone-850 hover:bg-stone-800 hover:border-stone-700 hover:text-white text-stone-300 transition-all focus:outline-none"
              >
                <span className="text-xs">🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white ring-2 ring-stone-950">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Menu */}
              {bellOpen && (
                <div className="absolute right-0 mt-3 w-80 rounded-2xl bg-stone-950 border border-stone-850 shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-4 border-b border-stone-900 flex justify-between items-center bg-stone-900/40">
                    <span className="text-xs font-black text-white">System Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-mono font-bold"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-stone-900 max-h-64 overflow-y-auto font-mono text-[11px] text-stone-400 scrollbar-none">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-stone-600">No active system alerts.</div>
                    ) : (
                      notifications.map((item) => {
                        const iconMap = {
                          approval: "⏳",
                          complete: "✅",
                          error: "⚠️",
                          info: "💡",
                        };
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              markAsRead(item.id);
                              setBellOpen(false);
                              navigate({ to: item.link as any });
                            }}
                            className={`p-3.5 hover:bg-stone-900/40 transition-all cursor-pointer flex gap-3 ${
                              !item.read ? "bg-blue-500/5 border-l-2 border-blue-500" : ""
                            }`}
                          >
                            <span className="text-sm shrink-0">{iconMap[item.type]}</span>
                            <div className="space-y-0.5 min-w-0">
                              <p className={`text-xs font-bold leading-tight truncate ${!item.read ? "text-white" : "text-stone-300"}`}>
                                {item.title}
                              </p>
                              <p className="text-[10px] text-stone-500 leading-normal line-clamp-2">
                                {item.message}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="p-3 border-t border-stone-900 bg-stone-900/20 text-center">
                    <Link
                      to="/portal/notifications"
                      onClick={() => setBellOpen(false)}
                      className="text-[10px] text-stone-400 hover:text-white font-bold tracking-wider uppercase"
                    >
                      See All Alerts & Channels →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 p-6 lg:p-10 overflow-y-auto max-w-6xl w-full mx-auto animate-fadeIn select-text">
          <TypedOutlet context={{ notifications, unreadCount, markAsRead, markAllAsRead, addNotification } as PortalContextType} />
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-stone-950/95 backdrop-blur-md border-t border-stone-900 z-50 flex items-center justify-around px-2 pb-safe select-none">
        {mobileLinks.map((link) => {
          const isActive = currentPath === link.path || (link.path === "/portal" && currentPath === "/portal/");
          return (
            <Link
              key={link.path}
              to={link.path as any}
              className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-all ${
                isActive ? "text-blue-500 font-black" : "text-stone-500 font-medium hover:text-stone-300"
              }`}
            >
              <div className="relative text-lg">
                {link.icon}
                {link.badge !== undefined && link.badge > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white ring-2 ring-stone-950">
                    {link.badge}
                  </span>
                )}
              </div>
              <span className="text-[9px] mt-0.5 tracking-tight font-bold">{link.name}</span>
            </Link>
          );
        })}
      </div>

    </div>
    </PortalContext.Provider>
  );
}
