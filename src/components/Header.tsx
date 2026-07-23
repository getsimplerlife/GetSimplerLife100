import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";

interface HeaderProps {
  businessName: string;
  user?: any;
}

export function Header({ businessName, user }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string, exact = true) => {
    const active = exact ? isActive(path) : location.pathname.startsWith(path);
    return `text-sm font-bold transition-colors ${
      active ? "text-emerald-500" : "text-stone-400 hover:text-white"
    }`;
  };

  const mobileNavLinkClass = (path: string, exact = true) => {
    const active = exact ? isActive(path) : location.pathname.startsWith(path);
    return `block px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
      active
        ? "text-emerald-400 bg-emerald-500/10"
        : "text-stone-400 hover:text-white hover:bg-stone-900"
    }`;
  };

  const toolLinks = [
    { to: "/tools", label: "🛠️ Tools Hub" },
    { to: "/tools/can-we-automate-this", label: "🔍 Can We Automate This?" },
    { to: "/tools/ai-advisor", label: "🤖 AI Operations Advisor" },
    { to: "/tools/assessment", label: "📋 AI Automation Assessment" },
    { to: "/roi-calculator", label: "📊 ROI Calculator" },
  ];

  return (
    <header className="px-6 py-4 bg-stone-950/80 backdrop-blur-md sticky top-0 z-50 border-b border-stone-900">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Logo */}
        <Link to="/" className="text-2xl font-black text-emerald-500 tracking-tight">
          {businessName}
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex gap-8 items-center">
          <a href="#examples" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">
            Solutions
          </a>
          <Link to="/how-it-works" className={navLinkClass("/how-it-works")}>
            How It Works
          </Link>

          {/* Tools Dropdown (Desktop) */}
          <div className="relative group">
            <button className={`text-sm font-bold transition-colors flex items-center gap-1 cursor-pointer ${
              location.pathname.startsWith("/tools") || location.pathname === "/roi-calculator"
                ? "text-emerald-500"
                : "text-stone-400 hover:text-white"
            }`}>
              Tools
              <svg className="w-3 h-3 mt-0.5 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
              <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-xl shadow-black/30 p-2 min-w-[210px] space-y-0.5">
                {toolLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`block px-3.5 py-2 text-sm font-bold rounded-lg transition-colors ${
                      isActive(link.to)
                        ? "text-emerald-400 bg-emerald-500/10"
                        : "text-stone-300 hover:text-white hover:bg-stone-800"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <Link to="/about" className={navLinkClass("/about")}>About</Link>
          <Link to="/faq" className={navLinkClass("/faq")}>FAQ</Link>
          <Link to="/tools" className={navLinkClass("/tools")}>Tools</Link>
          <a href="#pricing" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">Pricing</a>
          <a href="#contact" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">Contact</a>

          {user ? (
            <Link
              to="/portal"
              className="bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2.5 rounded-xl font-bold transition-all shadow-md text-sm"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm font-bold text-emerald-400 hover:text-emerald-300">Login</Link>
              <Link
                to="/contact"
                className="bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2.5 rounded-xl font-bold transition-all shadow-md text-xs min-h-[44px] flex items-center justify-center"
              >
                Stop Copy-Pasting. Start Free Plan ➜
              </Link>
            </>
          )}
        </nav>

        {/* Mobile Hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 text-stone-400 hover:text-white transition-colors"
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Slide-in Panel */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />

          {/* Panel */}
          <div className="absolute top-0 right-0 h-full w-80 max-w-[85vw] bg-stone-950 shadow-2xl border-l border-stone-900 overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-900">
              <span className="text-lg font-black text-emerald-500">{businessName}</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 text-stone-400 hover:text-white transition-colors"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-3 py-4 space-y-1">
              <a
                href="#examples"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 text-sm font-bold text-stone-400 hover:text-white hover:bg-stone-900 rounded-lg transition-colors"
              >
                Solutions
              </a>
              <Link
                to="/how-it-works"
                onClick={() => setMenuOpen(false)}
                className={mobileNavLinkClass("/how-it-works")}
              >
                How It Works
              </Link>

              {/* Mobile Tools (click to toggle) */}
              <div>
                <button
                  onClick={() => setMobileToolsOpen(!mobileToolsOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                    mobileToolsOpen || location.pathname.startsWith("/tools") || location.pathname === "/roi-calculator"
                      ? "text-emerald-400 bg-emerald-500/10"
                      : "text-stone-400 hover:text-white hover:bg-stone-900"
                  }`}
                >
                  <span>Tools</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${mobileToolsOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {mobileToolsOpen && (
                  <div className="ml-4 mt-1 mb-2 space-y-0.5 border-l-2 border-emerald-500/30 pl-3">
                    {toolLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setMenuOpen(false)}
                        className={`block px-3 py-2 text-sm font-bold rounded-lg transition-colors ${
                          isActive(link.to)
                            ? "text-emerald-400 bg-emerald-500/10"
                            : "text-stone-400 hover:text-white hover:bg-stone-900"
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link
                to="/about"
                onClick={() => setMenuOpen(false)}
                className={mobileNavLinkClass("/about")}
              >
                About
              </Link>
              <Link
                to="/faq"
                onClick={() => setMenuOpen(false)}
                className={mobileNavLinkClass("/faq")}
              >
                FAQ
              </Link>
              <a
                href="#pricing"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 text-sm font-bold text-stone-400 hover:text-white hover:bg-stone-900 rounded-lg transition-colors"
              >
                Pricing
              </a>
              <a
                href="#contact"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 text-sm font-bold text-stone-400 hover:text-white hover:bg-stone-900 rounded-lg transition-colors"
              >
                Contact
              </a>
            </div>

            <div className="border-t border-stone-900 px-3 py-4 space-y-2">
              {user ? (
                <Link
                  to="/portal"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full text-center bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-3 rounded-xl font-bold transition-all shadow-md"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="block w-full text-center bg-stone-800 text-stone-200 px-5 py-3 rounded-xl font-bold hover:bg-stone-700 transition-all"
                  >
                    Login
                  </Link>
                  <Link
                    to="/contact"
                    onClick={() => setMenuOpen(false)}
                    className="block w-full text-center bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-3 rounded-xl font-bold transition-all shadow-md"
                  >
                    Stop Copy-Pasting. Start Free Plan ➜
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}