import { useState, useEffect } from "react";
import { IntegrationsProviderCard, type Provider } from "~/components/IntegrationsProviderCard";
import { Card, PageHeader, SearchInput } from "~/components/ui";
import { authedJson } from "~/lib/portal-primitives";



function ProviderDirectoryPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  // SLICE 185: a failed read is not an empty catalog. Before this the page
  // dropped any non-2xx on the floor and then said "No Providers Match Your
  // Query — try checking spelling" over a catalog nobody had read.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadData = async () => {
    setLoading(true);
    const res = await authedJson<Provider[] | { data?: Provider[] }>("/api/integrations/providers");
    if (res.ok) {
      const raw = res.data as any;
      const list: Provider[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
      // Drop null/sparse entries (they crash .category reads).
      setProviders(list.filter((p: any) => p && p.id && typeof p.category === "string"));
      setLoadError(null);
      setSignedOut(false);
    } else {
      setProviders([]);
      setLoadError(res.error);
      setSignedOut(res.signedOut);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

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
      <PageHeader title={<>🏢 Platform Directory</>} subtitle={<>Browse our directory of 133+ third-party integrations and connect them directly into your platform.</>} />

      {/* Filters & Search */}
      <Card className="p-4 border border-stone-900 bg-stone-950 flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <SearchInput
            value={search}
            onChange={setSearch}
            label="Search providers"
            placeholder="Search providers by name, capabilities, or description..."
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

      {/* Grid of Providers — a failed read renders as a failure, never as an
          empty search result (slice 185). */}
      {loadError ? (
        <div className="text-center py-20 border border-red-900/60 rounded-3xl bg-red-950/20" role="alert">
          <span className="text-3xl">⚠️</span>
          <h3 className="text-base font-bold text-white mt-4">
            {signedOut ? "Your session is not active" : "The platform catalog could not be loaded"}
          </h3>
          <p className="text-xs text-stone-400 mt-1">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-5 px-4 py-2 text-[10px] font-mono tracking-widest uppercase rounded-lg border border-stone-800 text-stone-300 hover:text-white hover:border-stone-600"
          >
            Try again
          </button>
        </div>
      ) : filteredProviders.length > 0 ? (
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
            Try checking spelling or choosing another integrations category.
          </p>
        </div>
      )}



    </div>
  );
}

export default ProviderDirectoryPage;
