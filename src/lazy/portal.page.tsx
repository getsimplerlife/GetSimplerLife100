import { Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useState, useLayoutEffect, useRef } from "react";
import { PortalContext } from "~/routes/portal.context";
import type { PortalContextType } from "~/routes/portal.context";
export { PortalContext, usePortalContext } from "~/routes/portal.context";
export type { PortalContextType } from "~/routes/portal.context";
import { isOwnerUser } from "../lib/user-roles";
import { usePortalNotifications } from "../lib/portal-notifications";
import { PortalIcon, type PortalIconName } from "../components/PortalIcons";



function PortalLayout() {
  const TypedOutlet = Outlet as any;
  const navigate = useNavigate();
  const location = useLocation();

  // Stable ref for navigate — avoids useLayoutEffect re-running when
  // TanStack Router creates a new navigate reference each render.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Read injected user synchronously on the client. SSR has no window
  // so this always returns null during SSR (spinner renders correctly).
  const getInjectedUser = (): { email: string; role?: string } | null => {
    if (typeof window !== "undefined" && (window as any).__PORTAL_USER__) {
      return (window as any).__PORTAL_USER__;
    }
    return null;
  };

  const [user, setUser] = useState<{ email: string; role?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pwaPrompt, setPwaPrompt] = useState<any>(null);

  // P2-3: the notification surface is derived LIVE from real workspace
  // endpoints (approval queue, import runs, quote-to-cash records) — the
  // legacy agent-era notifications store is not served anywhere, so every
  // legacy write was dead-end theater and is gone.
  const { feed, unreadCount, notificationsError, updatedAt, refreshNotifications } = usePortalNotifications();

  useLayoutEffect(() => {
    (async () => {
      try {
        // Read injected user synchronously — prod-server placed it in a
        // <script> tag before </head>. This fires once on mount, before paint.
        const injected = getInjectedUser();
        if (injected) {
          setUser(injected);
          setLoading(false);
        } else {
          const rMe = await fetch("/api/me", { credentials: "include" });
          if (!rMe.ok) {
            navigateRef.current({ to: "/login" as any });
            return;
          }
          const userData = await rMe.json();
          // /api/me returns { user: { email, role } } — normalize so the client
          // user object always carries the role claim (P1-5).
          setUser(userData?.user ?? userData);
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        navigateRef.current({ to: "/login" as any });
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

    // Note: notification polling lives inside usePortalNotifications()
    // (30s interval, single source for shell badge + Notifications page).

    return () => {
      window.removeEventListener("pwa-install-available", onPwaAvailable);
    };
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    navigate({ to: "/" });
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

type NavLink = {
    name: string;
    subtitle?: string;
    path: string;
    icon: PortalIconName;
    section?: string;
    adminOnly?: boolean;
    badge?: number;
  };
  const navLinks: NavLink[] = [
    { name: "Dashboard", subtitle: "Activity · Overview", path: "/portal", icon: "dashboard", section: "Overview" },
    { name: "Proposals", subtitle: "Quote-to-cash · E-sign", path: "/portal/proposals", icon: "proposals", section: "Workspace" },
    { name: "Invoices", subtitle: "Bill · Track · Notify", path: "/portal/invoices", icon: "invoices", section: "Workspace" },
    { name: "Checklists", subtitle: "Onboarding · Drives", path: "/portal/checklists", icon: "checklists", section: "Workspace" },
    { name: "Deal Rooms", subtitle: "Shared client spaces", path: "/portal/deal-rooms", icon: "deal-rooms", section: "Workspace" },
    { name: "Boards", subtitle: "Kanban views", path: "/portal/boards", icon: "boards", section: "Workspace" },
    { name: "Tasks", subtitle: "Queue · Assignments", path: "/portal/tasks", icon: "tasks", section: "Workspace" },
    { name: "Surveys", subtitle: "NPS · CSAT · Scorecards", path: "/portal/surveys", icon: "surveys", section: "Workspace" },
    { name: "Inbox", subtitle: "Messages in one place", path: "/portal/inbox", icon: "inbox", section: "Workspace" },
    { name: "Workflows", subtitle: "Builder · Management", path: "/portal/workflows", icon: "workflows", section: "Operations" },
    { name: "Bring your data in", subtitle: "One-time import · Migration", path: "/portal/import", icon: "import", section: "Operations" },
    { name: "Documents", subtitle: "Upload · Process · Export", path: "/portal/documents", icon: "documents", section: "Operations" },
    { name: "Document Vault", subtitle: "Native capture · Filing · Rules", path: "/portal/vault", icon: "vault", section: "Operations" },
    { name: "File Library", subtitle: "View · Edit · Print · Download", path: "/portal/files", icon: "files", section: "Operations" },
    { name: "Approvals", subtitle: "Review · Authorize", path: "/portal/approvals", icon: "approvals", section: "Operations" },
    { name: "Assistant", subtitle: "Ask · Draft answers · Audit", path: "/portal/assistant", icon: "assistant", section: "Communications" },
    { name: "Communications", subtitle: "Messages · Log", path: "/portal/communications", icon: "communications", section: "Communications" },
    { name: "Integrations", subtitle: "Full 180+ Catalog", path: "/portal/integrations", icon: "integrations", section: "Data & Connect" },
    { name: "Secure Transport", subtitle: "SFTP · PGP keys · Transfer rules", path: "/portal/secure-transport", icon: "secure", section: "Data & Connect" },
    { name: "Dedupe & MDM", subtitle: "Match rules · Merge · Data quality", path: "/portal/dedupe", icon: "dedupe", section: "Data & Connect" },
    { name: "Access Reviews", subtitle: "Certification campaigns · Attestations", path: "/portal/accessreview", icon: "access", section: "Data & Connect" },
    { name: "Knowledge Base", subtitle: "Articles · Help center", path: "/portal/knowledgebase", icon: "knowledge", section: "Data & Connect" },
    { name: "Settings", subtitle: "Account · Billing · API Keys", path: "/portal/settings", icon: "settings", section: "Settings" },
    { name: "Admin", subtitle: "Users · Health · Audit", path: "/portal/admin", icon: "admin", section: "Settings", adminOnly: true },
  ];
  const mobileLinks: NavLink[] = [
    { name: "Dashboard", path: "/portal", icon: "dashboard" },
    { name: "Proposals", path: "/portal/proposals", icon: "proposals" },
    { name: "Bring data in", path: "/portal/import", icon: "import" },
    { name: "Approvals", path: "/portal/approvals", icon: "approvals" },
    { name: "Assistant", path: "/portal/assistant", icon: "assistant" },
    { name: "Integrations", path: "/portal/integrations", icon: "integrations" },
    { name: "Settings", path: "/portal/settings", icon: "settings" },
  ];

  const currentPath = location.pathname;

  // Never show a full-page spinner. During SSR or brief client loading,
  // render the portal shell immediately — sidebar, header, and all. Only
  // the user email shows a placeholder until useLayoutEffect fills it in.
  // This eliminates the "stuck on Initializing platform..." problem entirely.
  const displayEmail = user?.email || (loading ? "..." : "");

  if (!user && !loading) return null;

  return (
    <PortalContext.Provider value={{ userEmail: user?.email || "", feed, unreadCount, notificationsError, updatedAt, refreshNotifications }}>
      <div className="min-h-screen bg-black text-stone-100 font-sans antialiased selection:bg-stone-800 selection:text-white pb-16 lg:pb-0">
      
      {/* Mobile Top Header */}
      <header className="lg:hidden w-full bg-stone-950 border-b border-stone-900 h-14 fixed top-0 left-0 z-50 flex items-center justify-between px-6">
        <Link to="/" className="text-md font-black tracking-widest text-white uppercase">
          Simpler Life 100
        </Link>
        <div className="flex items-center gap-4">
          {/* Mobile Bell Button */}
          <Link to="/portal/notifications" className="relative p-1 text-stone-400 hover:text-white transition-colors" aria-label="Notifications">
            <PortalIcon name="bell" className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-stone-950">
                {unreadCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-stone-400 hover:text-white focus:outline-none flex items-center gap-1.5"
            aria-label="Toggle navigation menu"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider">{sidebarOpen ? "Close" : "Menu"}</span>
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
          {/* P1-5: stale "v3.5" dev badge removed — version is not derived from a real const. */}
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto mt-14 lg:mt-0 select-none scrollbar-none">
          {(() => {
            const sections = [...new Set(navLinks.map(l => l.section))];
            return sections.map(section => (
              <div key={section} className="mb-4">
                <p className="text-[10px] font-bold text-stone-600 uppercase tracking-widest px-3 mb-1.5">{section}</p>
                {navLinks.filter(l => l.section === section && (!(l as any).adminOnly || isOwnerUser(user))).map((link) => {
                  const isActive = currentPath === link.path || (link.path === "/portal" && currentPath === "/portal/");
                  const isIntegrations = link.name === "Integrations";
                  return (
                    <Link
                      key={link.path}
                      to={link.path as any}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs transition-all group ${
                        isActive
                          ? "bg-stone-900 text-white border-l-2 border-emerald-500"
                          : isIntegrations
                          ? "text-stone-300 hover:bg-stone-900/50 hover:text-white border-l-2 border-transparent hover:border-emerald-500/50"
                          : "text-stone-400 hover:bg-stone-900/50 hover:text-stone-200 border-l-2 border-transparent"
                      }`}
                    >
                      <PortalIcon name={link.icon} className="w-4 h-4 shrink-0 text-emerald-400" />
                      <div className="min-w-0">
                        <div className="truncate">{link.name}</div>
                        {link.subtitle && (
                          <div className={`text-[10px] font-medium truncate ${isActive ? "text-stone-500" : "text-stone-600 group-hover:text-stone-500"}`}>
                            {link.subtitle}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ));
          })()}

          <div className="pt-4 mt-4 border-t border-stone-900 space-y-1">
            <p className="text-[10px] font-bold text-stone-600 uppercase tracking-widest px-3 mb-2">Controls</p>
            <Link
              to="/"
              className="flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs text-stone-400 hover:bg-stone-900/50 hover:text-stone-200 border-l-2 border-transparent"
            >
              <PortalIcon name="dashboard" className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Landing Page</span>
            </Link>
          </div>
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-stone-900 bg-stone-950 shrink-0 mb-16 lg:mb-0">
          <div className="px-3 py-1.5 mb-2 rounded-lg bg-stone-900/30">
            <p className="text-[10px] text-stone-600 font-bold uppercase tracking-wider">Identity</p>
            <p className="text-xs font-bold text-stone-400 truncate">{displayEmail}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs text-stone-500 hover:bg-stone-900 hover:text-stone-200 transition-all text-left"
          >
            <PortalIcon name="logout" className="w-4 h-4 shrink-0 text-emerald-400" />
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
            <span className="text-[10px] font-mono tracking-widest text-stone-400 uppercase font-bold">WORKSPACE ACTIVE</span>
          </div>

          <div className="flex items-center gap-6">
            {/* PWA Install Button */}
            {pwaPrompt && (
              <button
                onClick={handleInstallPwa}
                className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-[10px] tracking-widest uppercase rounded-lg shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <PortalIcon name="install" className="w-4 h-4" />
                <span>Install Web App</span>
              </button>
            )}

            {/* Notification bell — ONE surface (desktop + mobile): link to the
                Notifications page. The old dropdown + mark-all wrote to a store
                that prod-server never serves — removed. */}
            <Link
              to="/portal/notifications"
              className="relative p-1.5 rounded-lg bg-stone-900 border border-stone-800 hover:bg-stone-800 hover:border-stone-700 hover:text-white text-stone-300 transition-all"
              aria-label="Notifications"
            >
              <PortalIcon name="bell" className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-stone-950">
                  {unreadCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 p-6 lg:p-10 overflow-y-auto max-w-6xl w-full mx-auto animate-fadeIn select-text">
          <TypedOutlet context={{ userEmail: user?.email || "", feed, unreadCount, notificationsError, updatedAt, refreshNotifications } as PortalContextType} />
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
                isActive ? "text-emerald-400 font-black" : "text-stone-500 font-medium hover:text-stone-300"
              }`}
            >
              <div className="relative">
                <PortalIcon name={link.icon} className="w-6 h-6" />
                {link.badge !== undefined && link.badge > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-stone-950">
                    {link.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight font-bold">{link.name}</span>
            </Link>
          );
        })}
      </div>

    </div>
    </PortalContext.Provider>
  );
}

export default PortalLayout;
