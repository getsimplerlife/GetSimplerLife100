import React, { useState, useEffect } from "react";
import { Modal, Button, Input, Badge } from "./ui";
import { getProviderIcon, type Provider } from "./IntegrationsProviderCard";

interface IntegrationsConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectionSuccess: () => void;
}

export const IntegrationsConnectModal: React.FC<IntegrationsConnectModalProps> = ({
  isOpen,
  onClose,
  onConnectionSuccess,
}) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  
  // Connect configuration form states
  const [selectedProvider, setSelectedCategoryProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          setLoading(true);
          const res = await fetch("/api/integrations/providers", { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setProviders(data);
          }
        } catch (err) {
          console.error("Failed to load providers:", err);
        } finally {
          setLoading(false);
        }
      })();
    } else {
      // Reset form states when modal is closed
      setSelectedCategoryProvider(null);
      setApiKey("");
      setApiSecret("");
      setSubdomain("");
      setInstanceUrl("");
      setDisplayName("");
      setErrorMsg("");
    }
  }, [isOpen]);

  const categories = ["all", ...Array.from(new Set(providers.map((p) => p.category)))].sort();

  const filteredProviders = providers.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleProviderClick = (provider: Provider) => {
    if (provider.authType === "oauth2") {
      // OAuth redirect flow
      window.location.href = `/api/oauth/authorize?provider=${provider.id}`;
    } else {
      // API Key form setup
      setSelectedCategoryProvider(provider);
      setDisplayName(provider.name);
    }
  };

  const handleApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;

    try {
      setConnecting(true);
      setErrorMsg("");
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider.id,
          displayName,
          apiKey,
          apiSecret,
          subdomain,
          instanceUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to establish integration connection.");
      }

      // Sync/Trigger local refresh
      onConnectionSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during connection.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={selectedProvider ? `Connect to ${selectedProvider.name}` : "Connect a New Platform"}
    >
      {selectedProvider ? (
        // API Key/Credential form
        <form onSubmit={handleApiKeySubmit} className="space-y-4 select-none">
          <p className="text-xs text-stone-400 font-semibold mb-4 leading-relaxed">
            Enter your API credentials to connect with this service. Simpler Life 100 encrypts all credentials in safe storage before transit.
          </p>

          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder={`e.g. My ${selectedProvider.name}`}
            className="dark:bg-stone-950 dark:border-stone-850"
          />

          <Input
            label="API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            type="password"
            placeholder="api_key_..."
            className="dark:bg-stone-950 dark:border-stone-850"
          />

          {(selectedProvider.id === "sap" || selectedProvider.id === "netsuite" || selectedProvider.id === "shopify") && (
            <>
              <Input
                label="API Secret / Password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                type="password"
                placeholder="Secret / Pass"
                className="dark:bg-stone-950 dark:border-stone-850"
              />
              <Input
                label="Subdomain / Tenant ID"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                placeholder="e.g. us1-prod"
                className="dark:bg-stone-950 dark:border-stone-850"
              />
              <Input
                label="Instance URL / Host"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                placeholder="https://instance.domain.com"
                className="dark:bg-stone-950 dark:border-stone-850"
              />
            </>
          )}

          {errorMsg && (
            <p className="text-xs text-rose-500 font-bold bg-rose-950/20 p-3 rounded-xl border border-rose-900/40">
              ⚠️ {errorMsg}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-4 border-t border-stone-800">
            <Button
              variant="outline"
              type="button"
              onClick={() => setSelectedCategoryProvider(null)}
              disabled={connecting}
            >
              Back
            </Button>
            <Button variant="primary" type="submit" loading={connecting}>
              Establish Connection
            </Button>
          </div>
        </form>
      ) : (
        // Provider Selection list
        <div className="space-y-4 max-h-[500px] overflow-y-auto select-none pr-1">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search providers (e.g. Salesforce, Netsuite)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All Categories" : c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-stone-850 border-t-white rounded-full animate-spin mb-3" />
              <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">
                Loading Integration Catalog...
              </p>
            </div>
          ) : filteredProviders.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredProviders.map((p) => {
                const icon = getProviderIcon(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => handleProviderClick(p)}
                    className="flex items-center gap-3 p-3 bg-stone-950 border border-stone-900 hover:border-emerald-500/30 rounded-2xl transition-all text-left w-full group active:scale-[0.98]"
                  >
                    <div className="h-9 w-9 bg-stone-900 border border-stone-850 rounded-xl flex items-center justify-center text-lg">
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                          {p.name}
                        </h4>
                        <Badge variant={p.authType === "oauth2" ? "blue" : "stone"} className="text-[7px] scale-90">
                          {p.authType === "oauth2" ? "OAuth" : "API"}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-stone-500 font-medium truncate uppercase mt-0.5">
                        {p.category}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 border border-stone-900 rounded-3xl bg-stone-950/20">
              <span className="text-xl">📭</span>
              <p className="text-stone-500 text-xs font-bold mt-2">No matching integration providers found.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
