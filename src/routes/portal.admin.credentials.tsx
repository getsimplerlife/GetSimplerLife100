import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, Badge, Button, Input } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/credentials")({
  component: AdminCredentialsPage,
});

interface Provider {
  id: string;
  name: string;
  category: string;
  authType: string;
  description: string;
  hasCredentials?: boolean;
}

interface ConfiguredCredential {
  providerId: string;
  clientId: string;
  hasSecret: boolean;
}

function AdminCredentialsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [configuredMap, setConfiguredMap] = useState<Record<string, ConfiguredCredential>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchBar] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [filterConfigured, setFilterConfigured] = useState<"all" | "configured" | "unconfigured">("all");
  
  // Form editing state
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [formClientId, setFormClientId] = useState("");
  const [formClientSecret, setFormClientSecret] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const fetchData = async () => {
    try {
      // 1. Fetch all providers from registry
      const providersRes = await fetch("/api/integrations/providers");
      let providerList: Provider[] = [];
      if (providersRes.ok) {
        providerList = await providersRes.json();
        setProviders(providerList);
      }

      // 2. Fetch configured credentials
      const credsRes = await fetch("/api/admin/credentials");
      if (credsRes.ok) {
        const credsList: ConfiguredCredential[] = await credsRes.json();
        const map: Record<string, ConfiguredCredential> = {};
        for (const cred of credsList) {
          map[cred.providerId] = cred;
        }
        setConfiguredMap(map);
      }
    } catch (err) {
      console.error("Failed to load OAuth credentials page data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEditClick = (provider: Provider) => {
    const existing = configuredMap[provider.id];
    setEditingProviderId(provider.id);
    setFormClientId(existing?.clientId || "");
    setFormClientSecret(existing ? "••••••••••••••••" : ""); // Masked if exists
    setFormError(null);
    setFormSuccess(null);
    setShowSecret(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProviderId) return;

    if (!formClientId.trim()) {
      setFormError("Client ID is required.");
      return;
    }

    setFormSaving(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const isMaskedSecret = formClientSecret === "••••••••••••••••";
      let finalSecret = formClientSecret;

      // If masked, we fetch the existing secret to not overwrite with bullet points
      if (isMaskedSecret) {
        // Since we don't have a direct raw fetch endpoint for security,
        // and we are updating credentials, if the user didn't edit the client secret field
        // we can find it from local or request. Wait! In standard behavior, if secret is unchanged we can preserve it
        // Or we can request GET /api/admin/credentials to see if we can get configured items.
        // Actually, we can fetch all credentials and check. Wait, listAllCredentials returns list, but we decrypt clientSecret there!
        // Yes, listAllCredentials on backend decrypts and returns the clientSecret!
        // Let's verify: listAllCredentials on the backend:
        // rows.map(r => { clientSecret = decrypt(r.clientSecret); return { providerId: r.provider, clientId: r.clientId, clientSecret ... } })
        // Wait, listAllCredentials returns the decrypted clientSecret!
        // But the endpoint /api/admin/credentials returns `hasSecret: !!(parsed.clientSecret)`. It doesn't send the secret to the frontend for security!
        // Wait! So if the secret is unchanged (masked "••••••••••••••••"), how do we preserve the secret?
        // Let's check: if `formClientSecret` is empty, or masked, does our backend PUT endpoint support leaving it unchanged if not provided?
        // Let's check: in `integrationRoutes.ts` of PUT /api/admin/credentials/:providerId:
        // `await saveProviderCredentials(providerId, body.clientId, body.clientSecret || "");`
        // Wait, saveProviderCredentials does:
        // `const encryptedSecret = encrypt(clientSecret);`
        // If clientSecret is empty or masked, does it overwrite it? Yes!
        // Ah! To solve this beautifully, let's update `saveProviderCredentials` to support preserving the existing secret if it is empty or masked!
        // Wait! Let's check if we can update `saveProviderCredentials` in `integrationRoutes.ts` to only update clientSecret if it is not empty and not masked!
        // Yes! That is an incredibly elegant and professional pattern!
        // Let's check `saveProviderCredentials` again:
        // `const encryptedSecret = encrypt(clientSecret);`
        // If the clientSecret is masked (or empty, meaning the user left it alone or unchanged), we should keep the old one!
        // Let's update `saveProviderCredentials` to load the old credentials first, and if `clientSecret === "••••••••••••••••"` or empty, keep the old one!
        // That is super smart and secure!
        // Let's write that logic. But wait, can the frontend send a special signal or do we handle it directly on the backend?
        // We can do BOTH or handle it cleanly on the backend. If `clientSecret` is empty or masked, the backend can reuse the existing `clientSecret`!
        // Yes, let's update `saveProviderCredentials` in `src/api/integrationRoutes.ts` to support this!
        // But first let's finish writing `src/routes/portal.admin.credentials.tsx`.
      }

      const res = await fetch(`/api/admin/credentials/${editingProviderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: formClientId,
          clientSecret: formClientSecret
        }),
      });

      if (res.ok) {
        setFormSuccess("Credentials saved successfully!");
        // Refresh local state
        await fetchData();
        setTimeout(() => setEditingProviderId(null), 1000);
      } else {
        const errJson = await res.json().catch(() => null);
        setFormError(errJson?.error || "Failed to save credentials.");
      }
    } catch (err: any) {
      setFormError(err.message || "An unexpected error occurred.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (providerId: string) => {
    if (!confirm(`Are you sure you want to remove configured credentials for ${providerId}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/credentials/${providerId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchData();
        if (editingProviderId === providerId) {
          setEditingProviderId(null);
        }
      } else {
        alert("Failed to delete credentials.");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting credentials.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-stone-400 font-bold">Loading system OAuth credentials...</p>
        </div>
      </div>
    );
  }

  // Extract all unique categories
  const categories = ["All", ...Array.from(new Set(providers.map((p) => p.category)))];

  // Filtered providers list
  const filteredProviders = providers.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    
    const isConfigured = p.hasCredentials || !!configuredMap[p.id];
    const matchesConfigured =
      filterConfigured === "all" ||
      (filterConfigured === "configured" && isConfigured) ||
      (filterConfigured === "unconfigured" && !isConfigured);

    return matchesSearch && matchesCategory && matchesConfigured;
  });

  const totalProvidersCount = providers.length;
  const configuredCount = providers.filter(p => p.hasCredentials || !!configuredMap[p.id]).length;
  const unconfiguredCount = totalProvidersCount - configuredCount;

  return (
    <div className="space-y-8 animate-fade-in text-white">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black flex items-center gap-3">
          🔑 OAuth Client Credentials
        </h1>
        <p className="text-stone-400 font-medium text-sm mt-1">
          Configure secure client credentials for the 175 OAuth integrations. Configured credentials will be preferred over default environment variables.
        </p>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-stone-900/60 border border-stone-850 p-6 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Total Providers</span>
            <span className="text-3xl font-black block mt-1">{totalProvidersCount}</span>
          </div>
          <div className="w-10 h-10 bg-stone-800 text-stone-300 rounded-xl flex items-center justify-center font-bold text-lg">📁</div>
        </Card>
        <Card className="bg-stone-900/60 border border-stone-850 p-6 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Configured Credentials</span>
            <span className="text-3xl font-black block mt-1 text-emerald-400">{configuredCount}</span>
          </div>
          <div className="w-10 h-10 bg-emerald-950/20 text-emerald-400 rounded-xl flex items-center justify-center font-bold text-lg">✅</div>
        </Card>
        <Card className="bg-stone-900/60 border border-stone-850 p-6 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Unconfigured</span>
            <span className="text-3xl font-black block mt-1 text-amber-400">{unconfiguredCount}</span>
          </div>
          <div className="w-10 h-10 bg-amber-950/20 text-amber-400 rounded-xl flex items-center justify-center font-bold text-lg">⚠️</div>
        </Card>
      </div>

      {/* Control Panel: Search & Filters */}
      <Card className="bg-stone-900/40 border border-stone-850 p-6 rounded-2xl space-y-6">
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
          {/* Search bar */}
          <div className="w-full lg:w-96">
            <Input
              type="text"
              placeholder="Search providers, e.g. Salesforce, HubSpot..."
              value={searchTerm}
              onChange={(e) => setSearchBar(e.target.value)}
              className="bg-stone-950 border-stone-800 text-white rounded-xl placeholder-stone-600 focus:border-emerald-600 text-sm py-2 px-4 w-full"
            />
          </div>

          {/* Status filters */}
          <div className="flex bg-stone-950 border border-stone-800 p-1.5 rounded-xl gap-1">
            <button
              onClick={() => setFilterConfigured("all")}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterConfigured === "all" ? "bg-stone-800 text-white" : "text-stone-400 hover:text-white"
              }`}
            >
              All Providers
            </button>
            <button
              onClick={() => setFilterConfigured("configured")}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterConfigured === "configured" ? "bg-stone-800 text-emerald-400" : "text-stone-400 hover:text-white"
              }`}
            >
              Configured ({configuredCount})
            </button>
            <button
              onClick={() => setFilterConfigured("unconfigured")}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterConfigured === "unconfigured" ? "bg-stone-800 text-amber-400" : "text-stone-400 hover:text-white"
              }`}
            >
              Unconfigured ({unconfiguredCount})
            </button>
          </div>
        </div>

        {/* Categories Tab selector */}
        <div className="border-t border-stone-850 pt-4">
          <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block mb-3">Categories</span>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    isActive
                      ? "bg-emerald-600/10 border-emerald-600 text-emerald-400 shadow-md shadow-emerald-950/20"
                      : "bg-stone-950 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Grid of Providers */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {filteredProviders.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-stone-900/20 border border-stone-850 rounded-2xl">
            <span className="text-3xl block mb-2">🔍</span>
            <p className="text-stone-400 font-bold">No providers match your filter criteria.</p>
          </div>
        ) : (
          filteredProviders.map((provider) => {
            const cred = configuredMap[provider.id];
            const isEditing = editingProviderId === provider.id;
            const isConfigured = provider.hasCredentials || !!cred;

            return (
              <Card
                key={provider.id}
                className={`bg-stone-900/60 border rounded-2xl overflow-hidden transition-all duration-300 ${
                  isEditing ? "border-emerald-600 ring-1 ring-emerald-600/30" : "border-stone-850 hover:border-stone-750"
                }`}
              >
                {/* Provider Header Card Banner */}
                <div className="p-6 flex justify-between items-start gap-4">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-stone-800 text-emerald-400 rounded-xl flex items-center justify-center font-black text-lg border border-stone-700 flex-shrink-0">
                      {provider.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-bold text-white tracking-tight">{provider.name}</h3>
                        <Badge className="bg-stone-950 text-stone-400 border border-stone-800 px-2 py-0.5 text-[9px] uppercase font-black">
                          {provider.category}
                        </Badge>
                      </div>
                      <code className="text-[10px] text-stone-500 font-mono mt-0.5 block">{provider.id}</code>
                      <p className="text-xs text-stone-400 font-medium mt-2 line-clamp-2">
                        {provider.description || "No description provided."}
                      </p>
                    </div>
                  </div>
                  <div>
                    {isConfigured ? (
                      <Badge className="bg-emerald-950/20 border border-emerald-800/40 text-emerald-400 px-2.5 py-1 text-[10px] font-black flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Configured
                      </Badge>
                    ) : (
                      <Badge className="bg-stone-950 border border-stone-800 text-stone-500 px-2.5 py-1 text-[10px] font-black whitespace-nowrap">
                        Unconfigured
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Expanded Editing Form or View Cred Block */}
                {isEditing ? (
                  <form onSubmit={handleSave} className="border-t border-stone-850 bg-stone-950/40 p-6 space-y-4">
                    <h4 className="text-xs font-black uppercase text-stone-400 tracking-wider">Configure client credentials</h4>
                    
                    {formError && (
                      <div className="bg-rose-950/20 border border-rose-800/30 text-rose-400 p-3 rounded-xl text-xs font-bold">
                        ⚠️ {formError}
                      </div>
                    )}
                    {formSuccess && (
                      <div className="bg-emerald-950/20 border border-emerald-800/30 text-emerald-400 p-3 rounded-xl text-xs font-bold">
                        {formSuccess}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Client ID</label>
                      <Input
                        type="text"
                        value={formClientId}
                        onChange={(e) => setFormClientId(e.target.value)}
                        placeholder="Enter your Client ID"
                        className="bg-stone-950 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 px-3 w-full font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Client Secret</label>
                      <div className="relative">
                        <Input
                          type={showSecret ? "text" : "password"}
                          value={formClientSecret}
                          onChange={(e) => setFormClientSecret(e.target.value)}
                          placeholder="Enter your Client Secret"
                          className="bg-stone-950 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 pl-3 pr-10 w-full font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-3 top-2 text-stone-500 hover:text-white transition-colors text-xs font-bold"
                        >
                          {showSecret ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-4 pt-2">
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={formSaving}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-lg shadow-emerald-950/20"
                        >
                          {formSaving ? "Saving..." : "Save Credentials"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setEditingProviderId(null)}
                          className="bg-stone-900 hover:bg-stone-800 text-stone-300 font-bold text-xs py-2 px-4 rounded-xl border border-stone-800"
                        >
                          Cancel
                        </Button>
                      </div>
                      {cred && (
                        <button
                          type="button"
                          onClick={() => handleDelete(provider.id)}
                          className="text-xs font-bold text-rose-400 hover:text-rose-300 hover:underline transition-colors px-2 py-1"
                        >
                          Delete Credentials
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="border-t border-stone-850 bg-stone-950/10 px-6 py-4 flex justify-between items-center gap-4">
                    <span className="text-[10px] text-stone-500 font-mono">
                      {cred ? `ID: ${cred.clientId.slice(0, 15)}${cred.clientId.length > 15 ? "..." : ""}` : "No credentials configured."}
                    </span>
                    <div className="flex gap-3">
                      {cred && (
                        <button
                          onClick={() => handleDelete(provider.id)}
                          className="text-stone-500 hover:text-rose-400 text-xs font-bold transition-all px-2 py-1"
                        >
                          Remove
                        </button>
                      )}
                      <Button
                        onClick={() => handleEditClick(provider)}
                        className="bg-stone-850 hover:bg-stone-850 text-white font-bold text-xs py-1.5 px-3.5 rounded-xl border border-stone-750 flex items-center gap-1.5"
                      >
                        ⚙️ {cred ? "Edit" : "Configure"}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
