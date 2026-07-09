import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/marketplace/")({
  component: MarketplaceHub,
});

interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  category: "Healthcare" | "Finance" | "Sales" | "Operations" | "HR" | "Logistics";
  price: string;
  installed: boolean;
  rating: number;
  runsMonth: string;
  icon: string;
}

function MarketplaceHub() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = ["all", "Healthcare", "Finance", "Sales", "Operations", "HR", "Logistics"];

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/data/marketplace", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const d = await res.json();
        
        if (d.data && d.data.length > 0) {
          const firstRow = d.data[0];
          if (firstRow && Array.isArray(firstRow.data)) {
            setItems(firstRow.data);
          } else {
            setItems(d.data);
          }
        } else {
          setItems([]);
        }
        setLoading(false);
      } catch (err) {
        console.error("Marketplace fetch error:", err);
        setItems([]);
        setLoading(false);
      }
    })();
  }, []);

  const handleAction = async (itemId: string, currentInstalled: boolean) => {
    const actionText = currentInstalled ? "Uninstall" : "Install";
    try {
      setFeedback(`${actionText}ing AI Employee from workspace...`);
      
      const updated = items.map((itm) => {
        if (itm.id === itemId) {
          return { ...itm, installed: !currentInstalled };
        }
        return itm;
      });

      setItems(updated);

      // Save changes back to database
      await fetch("/api/data/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: updated }),
      });

      // Audit Log Action
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "marketplace_" + actionText.toLowerCase(),
          resource: itemId,
          details: { id: itemId, state: !currentInstalled },
        }),
      });

      setFeedback(`Success: AI Employee successfully ${actionText}ed!`);
      setTimeout(() => setFeedback(""), 2500);
    } catch (err) {
      console.error(err);
      setFeedback(`Failed to ${actionText} module.`);
    }
  };

  const filteredItems = items.filter((itm) => {
    const matchesSearch =
      itm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      itm.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = activeCategory === "all" || itm.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-850 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Syncing Marketplace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none">
      
      {/* ─── Header ─── */}
      <div className="border-b border-stone-900 pb-5">
        <h1 className="text-3xl font-black text-white tracking-tight">🛍️ AI Employees Marketplace</h1>
        <p className="text-stone-400 text-xs mt-1">
          Deploy pre-trained, vertical-specific digital coworkers. Click install to immediately activate their cognitive engines on your dashboard.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 py-16 bg-stone-950 border border-stone-900 rounded-2xl max-w-xl mx-auto my-8">
          <div className="text-4xl mb-4">🛍️</div>
          <h3 className="text-lg font-bold text-white mb-2">Marketplace currently offline</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm leading-relaxed">
            All custom pre-trained AI employee bundles will appear here once ready. In the meantime, you can explore scaling options on the billing page.
          </p>
          <Link
            to="/portal/billing"
            className="inline-flex items-center justify-center bg-white hover:bg-stone-100 text-black font-extrabold px-6 py-3 rounded-xl transition-all font-mono text-xs shadow-lg shadow-white/5 active:scale-95"
          >
            Review Upgrade Plans
          </Link>
        </div>
      ) : (
        <>
          {/* ─── App Store Search & Controls ─── */}
      <div className="space-y-4">
        <div className="bg-stone-950 p-3.5 border border-stone-900 rounded-xl flex items-center">
          <span className="text-stone-600 text-sm mr-3 font-mono">🔍</span>
          <input
            type="text"
            placeholder="Search pre-trained AI Employees by keywords, department, or capability..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-0 text-xs outline-none font-medium placeholder-stone-600 text-stone-200"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeCategory === cat
                  ? "bg-white text-black font-black"
                  : "bg-stone-900/60 text-stone-400 hover:text-stone-200"
              }`}
            >
              {cat === "all" ? "All Divisions" : `${cat}`}
            </button>
          ))}
        </div>
      </div>

      {/* ─── App Store Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-stone-950 border border-stone-900 rounded-xl space-y-2">
            <span className="text-3xl block opacity-40">🛒</span>
            <p className="text-xs font-mono text-stone-500 uppercase tracking-widest">No AI Employees matched your criteria</p>
          </div>
        ) : (
          filteredItems.map((itm) => (
            <div
              key={itm.id}
              className="bg-stone-950 border border-stone-900 hover:border-stone-850 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-lg"
            >
              <div className="space-y-4">
                {/* Logo & Category Row */}
                <div className="flex justify-between items-start">
                  <div className="h-11 w-11 bg-stone-900 border border-stone-800 rounded-xl flex items-center justify-center text-xl shadow-md">
                    {itm.icon}
                  </div>
                  <span className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest bg-stone-900 border border-stone-900 px-2 py-0.5 rounded-md">
                    {itm.category}
                  </span>
                </div>

                {/* Info Text */}
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-white">{itm.name}</h3>
                  <p className="text-stone-400 text-xs leading-relaxed font-medium min-h-[50px] line-clamp-3">
                    {itm.description}
                  </p>
                </div>

                {/* Rating & Runs Metric Bar */}
                <div className="flex gap-4 text-[10px] font-mono text-stone-500">
                  <div>Rating: <span className="text-stone-300 font-bold">★ {itm.rating}</span></div>
                  <div>Monthly tasks: <span className="text-stone-300 font-bold">{itm.runsMonth}</span></div>
                </div>
              </div>

              {/* Install / Uninstall Button Actions Row */}
              <div className="border-t border-stone-900 pt-4 mt-5 flex justify-between items-center">
                <div>
                  <span className="text-[8px] font-mono uppercase text-stone-500 block">LICENSE</span>
                  <span className="text-xs font-bold text-white font-mono">{itm.price}</span>
                </div>

                <button
                  onClick={() => handleAction(itm.id, itm.installed)}
                  className={`text-[10px] font-mono font-black tracking-wide uppercase px-4 py-2 rounded-lg border transition-all ${
                    itm.installed
                      ? "bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200"
                      : "bg-white text-black border-white hover:bg-stone-100 font-black"
                  }`}
                >
                  {itm.installed ? "✓ Deployed" : "Deploy Employee"}
                </button>
              </div>

            </div>
          ))
        )}
      </div>
    </>
  )}

      {/* ─── Feedback Toast Confirmation ─── */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}
