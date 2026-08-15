import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { industries } from "~/content/industries";

interface HeaderProps {
  businessName: string;
  user?: any;
}

export function Header({ businessName, user }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileFaqOpen, setMobileFaqOpen] = useState(false);
  const [mobileIndustriesOpen, setMobileIndustriesOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string, exact = true) => {
    const active = exact ? isActive(path) : location.pathname.startsWith(path);
    return `text-sm font-bold transition-colors ${
      active ? "text-emerald-500" : "text-stone-400 hover:text-white"
    }`;
  };

  const toolLinks = [
    { to: "/tools", label: "🛠️ Tools Hub" },
    { to: "/tools/can-we-automate-this", label: "🔍 Can We Automate This?" },
    { to: "/tools/ai-advisor", label: "🤖 AI Operations Advisor" },
    { to: "/tools/assessment", label: "📋 AI Automation Assessment" },
    { to: "/roi-calculator", label: "📊 ROI Calculator" },
  ];

  const faqLinks = [
    { to: "/faq", label: "❓ FAQ" },
    { to: "/about", label: "ℹ️ About" },
    { to: "/contact", label: "📬 Contact" },
    { to: "/how-it-works", label: "🔧 How It Works" },
    { to: "/support", label: "🛟 Support" },
  ];

  return (
    <header className="px-4 sm:px-6 py-3 bg-stone-950/80 backdrop-blur-md sticky top-0 z-50 border-b border-stone-900">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl sm:text-2xl font-black text-emerald-500 tracking-tight shrink-0">
          {businessName}
        </Link>

        <nav className="hidden lg:flex gap-5 xl:gap-8 items-center">
          <div className="relative group">
            <button type="button" aria-haspopup="true" className={`text-sm font-bold transition-colors flex items-center gap-1 cursor-pointer ${
              location.pathname.startsWith("/industries") ? "text-emerald-500" : "text-stone-400 hover:text-white"
            }`}>
              Industries
              <svg className="w-3 h-3 mt-0.5 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-200">
              <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-xl shadow-black/30 p-2 min-w-[220px] max-h-[60vh] overflow-y-auto space-y-0.5">
                <Link to="/industries" className="block px-3.5 py-2 text-sm font-bold rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors">
                  📂 All Industries
                </Link>
                <div className="border-t border-stone-800 my-1" />
                {industries.map((ind: any) => (
                  <Link key={ind.slug || ind.id} to={`/industries/${ind.slug || ind.id}` as any}
                    className="block px-3.5 py-2 text-sm font-bold rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors">
                    {ind.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="relative group">
            <button type="button" aria-haspopup="true" className={`text-sm font-bold transition-colors flex items-center gap-1 cursor-pointer ${
              ["/tools", "/tools/", "/roi-calculator"].some(p => location.pathname.startsWith(p))
                ? "text-emerald-500" : "text-stone-400 hover:text-white"
            }`}>
              Tools
              <svg className="w-3 h-3 mt-0.5 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-200">
              <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-xl shadow-black/30 p-2 min-w-[210px] space-y-0.5">
                {toolLinks.map((link) => (
                  <Link key={link.to} to={link.to}
                    className={`block px-3.5 py-2 text-sm font-bold rounded-lg transition-colors ${
                      isActive(link.to) ? "text-emerald-400 bg-emerald-500/10" : "text-stone-300 hover:text-white hover:bg-stone-800"
                    }`}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <Link to="/build" className={navLinkClass("/build")}>Builder</Link>
          <Link to="/features" className={navLinkClass("/features")}>Features</Link>

          <div className="relative group">
            <button type="button" aria-haspopup="true" className={`text-sm font-bold transition-colors flex items-center gap-1 cursor-pointer ${
              ["/faq", "/about", "/contact", "/how-it-works", "/support"].some(p => location.pathname === p)
                ? "text-emerald-500" : "text-stone-400 hover:text-white"
            }`}>
              FAQ
              <svg className="w-3 h-3 mt-0.5 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-200">
              <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-xl shadow-black/30 p-2 min-w-[180px] space-y-0.5">
                {faqLinks.map((link) => (
                  <Link key={link.to} to={link.to}
                    className={`block px-3.5 py-2 text-sm font-bold rounded-lg transition-colors ${
                      isActive(link.to) ? "text-emerald-400 bg-emerald-500/10" : "text-stone-300 hover:text-white hover:bg-stone-800"
                    }`}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <Link to="/demo" className="text-sm font-bold text-stone-300 hover:text-white transition-colors">Schedule Demo</Link>
          <Link to="/register" className="text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors">Register</Link>

          {user ? (
            <Link to="/portal" className="bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2 rounded-xl font-bold transition-all shadow-md text-sm">Dashboard</Link>
          ) : (
            <Link to="/login" className="text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl transition-all">Get Started</Link>
          )}
        </nav>

        <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} className="lg:hidden p-2 text-stone-400 hover:text-white transition-colors" aria-label="Toggle menu">
          {menuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <div className="lg:hidden border-t border-stone-800 mt-3 pt-3 pb-2 space-y-1">
          <div>
            <button onClick={() => setMobileIndustriesOpen(!mobileIndustriesOpen)}
              className={`w-full flex items-center justify-between px-3 py-3 text-sm font-bold rounded-lg transition-colors ${
                mobileIndustriesOpen || location.pathname.startsWith("/industries") ? "text-emerald-400 bg-emerald-500/10" : "text-stone-400 hover:text-white hover:bg-stone-900"
              }`}>
              <span>Industries</span>
              <svg className={`w-4 h-4 transition-transform ${mobileIndustriesOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {mobileIndustriesOpen && (
              <div className="ml-3 mt-1 mb-2 space-y-0.5 border-l-2 border-emerald-500/30 pl-3">
                <Link to="/industries" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors">📂 All Industries</Link>
                {industries.map((ind: any) => (
                  <Link key={ind.slug || ind.id} to={`/industries/${ind.slug || ind.id}` as any} onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors">{ind.name}</Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <button onClick={() => setMobileToolsOpen(!mobileToolsOpen)}
              className={`w-full flex items-center justify-between px-3 py-3 text-sm font-bold rounded-lg transition-colors ${
                mobileToolsOpen || ["/tools", "/roi-calculator"].some(p => location.pathname.startsWith(p)) ? "text-emerald-400 bg-emerald-500/10" : "text-stone-400 hover:text-white hover:bg-stone-900"
              }`}>
              <span>Tools</span>
              <svg className={`w-4 h-4 transition-transform ${mobileToolsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {mobileToolsOpen && (
              <div className="ml-3 mt-1 mb-2 space-y-0.5 border-l-2 border-emerald-500/30 pl-3">
                {toolLinks.map((link) => (
                  <Link key={link.to} to={link.to} onClick={() => setMenuOpen(false)}
                    className={`block px-3 py-2 text-sm font-bold rounded-lg transition-colors ${isActive(link.to) ? "text-emerald-400 bg-emerald-500/10" : "text-stone-400 hover:text-white hover:bg-stone-900"}`}>{link.label}</Link>
                ))}
              </div>
            )}
          </div>

          <Link to="/build" onClick={() => setMenuOpen(false)} className="block px-3 py-3 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors">Builder</Link>
          <Link to="/features" onClick={() => setMenuOpen(false)} className="block px-3 py-3 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors">Features</Link>

          <div>
            <button onClick={() => setMobileFaqOpen(!mobileFaqOpen)}
              className={`w-full flex items-center justify-between px-3 py-3 text-sm font-bold rounded-lg transition-colors ${
                mobileFaqOpen || ["/faq", "/about", "/contact", "/how-it-works", "/support"].some(p => location.pathname === p) ? "text-emerald-400 bg-emerald-500/10" : "text-stone-400 hover:text-white hover:bg-stone-900"
              }`}>
              <span>FAQ</span>
              <svg className={`w-4 h-4 transition-transform ${mobileFaqOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {mobileFaqOpen && (
              <div className="ml-3 mt-1 mb-2 space-y-0.5 border-l-2 border-emerald-500/30 pl-3">
                {faqLinks.map((link) => (
                  <Link key={link.to} to={link.to} onClick={() => setMenuOpen(false)}
                    className={`block px-3 py-2 text-sm font-bold rounded-lg transition-colors ${isActive(link.to) ? "text-emerald-400 bg-emerald-500/10" : "text-stone-400 hover:text-white hover:bg-stone-900"}`}>{link.label}</Link>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 space-y-2 px-1">
            <Link to="/demo" onClick={() => setMenuOpen(false)} className="block w-full text-center text-sm font-bold text-stone-300 hover:text-white py-2.5 rounded-xl transition-colors">Schedule Demo</Link>
            <Link to="/register" onClick={() => setMenuOpen(false)} className="block w-full text-center text-sm font-bold text-emerald-400 hover:text-emerald-300 py-2.5 rounded-xl transition-colors">Register</Link>
            {user ? (
              <Link to="/portal" onClick={() => setMenuOpen(false)} className="block w-full text-center bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-3 rounded-xl font-bold transition-all shadow-md">Dashboard</Link>
            ) : (
              <Link to="/login" onClick={() => setMenuOpen(false)} className="block w-full text-center bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl font-bold transition-all">Get Started</Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
