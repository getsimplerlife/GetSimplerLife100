import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Route } from "~/routes/portal.integrations.$id";

/**
 * Provider detail — cleanup (a2). Previously a persistent-connection detail
 * page (rename/test/sync/logs/revoke of a stored connection). External tools
 * are import/migration lanes only: there is nothing stored to manage, so this
 * page honestly shows the provider's catalog entry and points to the Import
 * page (the one real way to bring that tool's data into the workspace).
 */

interface CatalogProvider {
  id: string;
  name: string;
  icon?: string;
  category?: string;
  description?: string;
  capabilities?: string[];
}

interface CatalogResponse {
  data?: CatalogProvider[];
  total?: number;
}

function ProviderDetailPage() {
  const { id } = Route.useParams();
  const [provider, setProvider] = useState<CatalogProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/integrations/providers", { credentials: "include" });
        if (!res.ok) throw new Error(`Catalog request failed (HTTP ${res.status})`);
        const body = (await res.json()) as CatalogResponse;
        const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        const found = list.find((p) => p?.id === id) || null;
        if (!found) throw new Error("Provider not found in the catalog");
        if (!cancelled) setProvider(found);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load provider");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-stone-400 font-bold">{error || "Provider not found"}</p>
        <Link to="/portal/integrations" className="text-emerald-400 font-bold text-sm hover:text-emerald-300">
          ← Back to the catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 text-stone-100">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 bg-stone-900 border border-stone-800 rounded-2xl flex items-center justify-center text-3xl">
          {provider.icon || "🧩"}
        </div>
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">{provider.name}</h1>
          <p className="text-xs text-stone-500 font-mono uppercase tracking-wider">{provider.category || "Integration"}</p>
        </div>
      </div>

      {provider.description && (
        <p className="text-sm text-stone-400 leading-relaxed">{provider.description}</p>
      )}

      {/* Honest framing */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5 text-xs text-stone-400 leading-relaxed">
        <span className="font-bold text-stone-200">How {provider.name} works with your workspace.</span>{" "}
        External tools are import/migration lanes only: you bring {provider.name} data INTO your
        workspace as a one-time, client-initiated import using the access your own {provider.name} account
        already grants. Nothing stays connected once the import finishes — the data is yours.
      </div>

      {/* Capabilities */}
      {provider.capabilities && provider.capabilities.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-stone-300 uppercase tracking-wider">Capabilities you can import</h3>
          <div className="flex flex-wrap gap-2">
            {provider.capabilities.map((cap) => (
              <span
                key={cap}
                className="text-[10px] font-mono font-bold uppercase px-2 py-1 rounded-full bg-stone-900 border border-stone-800 text-stone-400"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          to="/portal/import"
          className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl text-center transition-all"
        >
          Import from {provider.name} →
        </Link>
        <Link
          to="/portal/integrations"
          className="inline-block bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 font-bold text-sm px-6 py-3 rounded-2xl text-center transition-all"
        >
          ← Back to the catalog
        </Link>
      </div>

      <p className="text-[11px] text-stone-500 leading-relaxed">
        Imports run from the Import page: pick a source, preview what will come in, then approve. Every
        import is recorded in your Import History with exactly what ran — nothing is invented.
      </p>
    </div>
  );
}

export default ProviderDetailPage;