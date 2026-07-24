import { Link } from "@tanstack/react-router";

export function MinimalHeader({ businessName = "Simpler Life 100" }: { businessName?: string }) {
  return (
    <header className="px-6 py-4 bg-stone-950/80 backdrop-blur-md sticky top-0 z-50 border-b border-stone-900">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="text-2xl font-black text-emerald-500 tracking-tight">
          {businessName}
        </Link>
      </div>
    </header>
  );
}
