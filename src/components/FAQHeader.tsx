import { Link } from "@tanstack/react-router";

export function FAQHeader({ businessName = "Simpler Life 100" }: { businessName?: string }) {
  return (
    <header className="px-6 py-4 bg-stone-950/80 backdrop-blur-md sticky top-0 z-50 border-b border-stone-900">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="text-2xl font-black text-emerald-500 tracking-tight">
          {businessName}
        </Link>
        <nav className="hidden md:flex gap-8 items-center">
          <Link to="/about" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">About</Link>
          <Link to="/contact" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">Contact</Link>
          <Link to="/how-it-works" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">How It Works</Link>
          <Link to="/support" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">Support</Link>
        </nav>
      </div>
    </header>
  );
}
