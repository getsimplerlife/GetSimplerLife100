import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";

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

export function NavHeader({ businessName = "Simpler Life 100" }: { businessName?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileFaqOpen, setMobileFaqOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="px-6 py-4 bg-stone-950/80 backdrop-blur-md sticky top-0 z-50 border-b border-stone-900">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="text-2xl font-black text-emerald-500 tracking-tight">
          {businessName}
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex gap-8 items-center">
          <Link to="/industries" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">Industries</Link>

          {/* Tools Dropdown (Desktop) */}
          <div className="relative group">
            <button className="text-sm font-bold text-stone-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer">
              Tools
              <svg className="w-3 h-3 mt-0.5 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-xl shadow-black/30 p-2 min-w-[210px] space-y-0.5">
                {toolLinks.map((link) => (
                  <Link key={link.to} to={link.to} className="block px-3.5 py-2 text-sm font-bold rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors">{link.label}</Link>
                ))}
              </div>
            </div>
          </div>

          <Link to="/build" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">Builder</Link>

          {/* FAQ Dropdown (Desktop) */}
          <div className="relative group">
            <button className="text-sm font-bold text-stone-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer">
              FAQ
              <svg className="w-3 h-3 mt-0.5 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-xl shadow-black/30 p-2 min-w-[180px] space-y-0.5">
                {faqLinks.map((link) => (
                  <Link key={link.to} to={link.to} className="block px-3.5 py-2 text-sm font-bold rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors">{link.label}</Link>
                ))}
              </div>
            </div>
          </div>

          <Link to="/login" className="text-sm font-bold text-emerald-400 hover:text-emerald-300">Login</Link>
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
              <Link
                to="/industries"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors"
              >
                Industries
              </Link>

              {/* Mobile Tools (click to toggle) */}
              <div>
                <button
                  onClick={() => setMobileToolsOpen(!mobileToolsOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors"
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
                        className="block px-3 py-2 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link
                to="/build"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors"
              >
                Builder
              </Link>

              {/* Mobile FAQ (click to toggle) */}
              <div>
                <button
                  onClick={() => setMobileFaqOpen(!mobileFaqOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors"
                >
                  <span>FAQ</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${mobileFaqOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {mobileFaqOpen && (
                  <div className="ml-4 mt-1 mb-2 space-y-0.5 border-l-2 border-emerald-500/30 pl-3">
                    {faqLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-2 text-sm font-bold rounded-lg text-stone-400 hover:text-white hover:bg-stone-900 transition-colors"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-stone-900 px-3 py-4 space-y-2">
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="block w-full text-center bg-stone-800 text-stone-200 px-5 py-3 rounded-xl font-bold hover:bg-stone-700 transition-all"
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
