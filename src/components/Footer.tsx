import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="bg-stone-950 border-t border-stone-900 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          <div>
            <Link to="/" className="text-xl font-black text-emerald-500 tracking-tight">
              Simpler Life 100
            </Link>
            <p className="text-stone-500 text-sm mt-2 max-w-xs">
              AI Operations Teams that integrate into your existing tools. Real results, no complexity.
            </p>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm mb-3">Platform</h4>
            <div className="space-y-2">
              <Link to="/how-it-works" className="block text-stone-400 hover:text-white text-sm transition-colors">How It Works</Link>
              <Link to="/features" className="block text-stone-400 hover:text-white text-sm transition-colors">Features</Link>
              <Link to="/build" className="block text-stone-400 hover:text-white text-sm transition-colors">Build Your Team</Link>
              <Link to="/tools" className="block text-stone-400 hover:text-white text-sm transition-colors">Free Tools</Link>
              <Link to="/pricing" className="block text-stone-400 hover:text-white text-sm transition-colors">Pricing</Link>
            </div>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm mb-3">Company</h4>
            <div className="space-y-2">
              <Link to="/about" className="block text-stone-400 hover:text-white text-sm transition-colors">About</Link>
              <Link to="/case-studies" className="block text-stone-400 hover:text-white text-sm transition-colors">Case Studies</Link>
              <Link to="/contact" className="block text-stone-400 hover:text-white text-sm transition-colors">Contact</Link>
              <Link to="/demo" className="block text-stone-400 hover:text-white text-sm transition-colors">Request Demo</Link>
            </div>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm mb-3">Support</h4>
            <div className="space-y-2">
              <Link to="/faq" className="block text-stone-400 hover:text-white text-sm transition-colors">FAQ</Link>
              <Link to="/support" className="block text-stone-400 hover:text-white text-sm transition-colors">Help Center</Link>
              <Link to="/login" className="block text-stone-400 hover:text-white text-sm transition-colors">Login</Link>
              <Link to="/register" className="block text-stone-400 hover:text-white text-sm transition-colors">Register</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-stone-900 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-stone-600 text-xs">&copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="text-stone-600 hover:text-stone-400 text-xs transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="text-stone-600 hover:text-stone-400 text-xs transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
