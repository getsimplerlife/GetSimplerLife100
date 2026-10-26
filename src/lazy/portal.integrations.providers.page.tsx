import { useState, useEffect } from "react";
import { IntegrationsProviderCard, type Provider } from "~/components/IntegrationsProviderCard";
import { Card } from "~/components/ui";



function ProviderDirectoryPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const loadData = async () => {
    try {
      setLoading(true);
      // Load providers
      const provRes = await fetch("/api/integrations/providers", { credentials: "include" });
      let provData: Provider[] = [];
      if (provRes.ok) {
        const json = await provRes.json();
        // Endpoint returns { data: [...] } after the admin-gate fix; unwrap
        // defensively and drop null/sparse entries (they crash .category reads).
        provData = (Array.isArray(json) ? json : (json.data || [])).filter(
          (p: any) => p && p.id && typeof p.category === "string"
        );
      }

      setProviders(provData);
    } catch (err) {
      console.error("Failed to load provider catalog:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const categories = ["all", ...Array.from(new Set(providers.map((p) => p.category)))].sort();

  const filteredProviders = providers.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // a2: connect-era actions retired — the catalog's one action is importing.
  const handleProviderClick = (_provider: Provider) => {
    window.location.href = "/portal/import";
  };

  if (loading && providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-850 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Loading Platform Catalog...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none pb-12">
      
      {/* Header */}
      <div className="border-b border-stone-900 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">🏢 Platform Directory</h1>
          <p className="text-stone-400 text-xs mt-1">
            Browse our directory of 133+ third-party integrations and connect them directly into your platform.
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <Card className="p-4 border border-stone-900 bg-stone-950 flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <input
            type="text"
            placeholder="Search providers by name, capabilities, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-3 text-xs rounded-xl border border-stone-900 bg-stone-950 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
          />
        </div>
        <div className="w-full sm:w-64">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-4 py-3 text-xs rounded-xl border border-stone-900 bg-stone-950 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All Categories" : c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Grid of Providers */}
      {filteredProviders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProviders.map((p) => (
            <IntegrationsProviderCard
              key={p.id}
              provider={p}
              onClick={() => handleProviderClick(p)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border border-stone-900 rounded-3xl bg-stone-950/10">
          <span className="text-3xl">📭</span>
          <h3 className="text-base font-bold text-white mt-4">No Providers Match Your Query</h3>
          <p className="text-xs text-stone-400 mt-1">
            Try checking spelling or choosing another integrations category category.
          </p>
        </div>
      )}



    </div>
  );
}

export default ProviderDirectoryPage;
