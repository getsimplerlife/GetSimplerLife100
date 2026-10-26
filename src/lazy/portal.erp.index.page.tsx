import { Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

/**
 * ERP import sources — cleanup (a2). The pack-era "ERP connector" surface
 * (connect API keys, disconnect, slot gating) is retired with the persistent
 * connection store. External tools are import/migration lanes only (owner
 * 10-20): this page honestly lists ERP/accounting tools you can import from,
 * plus the real access health for this workspace (read-only, no asks).
 */

const ERP_PROVIDERS_MARKETING = [
  { id: "quickbooks", name: "QuickBooks", icon: "🟢", category: "Accounting" },
  { id: "xero", name: "Xero", icon: "🔵", category: "Accounting" },
  { id: "netsuite", name: "NetSuite", icon: "🏢", category: "ERP" },
  { id: "sage", name: "Sage", icon: "🏷️", category: "ERP" },
  { id: "microsoft-dynamics", name: "Microsoft Dynamics 365", icon: "💼", category: "ERP" },
];

interface AccessRow {
  provider: string;
  status: string;
  lastProbeAt?: string | null;
  lastError?: string | null;
}

function ErpPage() {
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/connections", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load access health (${res.status})`);
      const payload = await res.json();
      setAccess(Array.isArray(payload?.data?.connections) ? payload.data.connections : []);
    } catch (e) {
      console.error("Failed to load access health:", e);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-8 text-stone-100">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Bring your ERP &amp; accounting data in</h1>
        <p className="text-stone-400 mt-1 text-sm">
          Import your financial records from the ERP or accounting tool you already use. Transfers are
          one-time and client-initiated — they pull data INTO your workspace using the access your own
          tool account grants. Nothing syncs automatically and nothing writes back.
        </p>
      </div>

      {/* Honest framing */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🔐</div>
          <div className="text-xs text-stone-400 leading-relaxed">
            <span className="font-bold text-stone-200">Nothing stays connected.</span> External tools are
            import/migration lanes only — there is nothing to manage or reconnect here. After an import
            the data lives in your workspace, and every import is recorded in your Import History.
          </div>
        </div>
      </div>

      {/* Provider grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">ERP &amp; accounting tools to import from</h2>
          <Link to="/portal/import" className="text-xs text-emerald-400 hover:text-emerald-300 font-bold">
            Open the Import page →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ERP_PROVIDERS_MARKETING.map((p) => (
            <div key={p.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{p.icon}</span>
                <div>
                  <div className="font-bold text-white text-sm">{p.name}</div>
                  <span className="text-[10px] font-mono uppercase text-stone-500">{p.category}</span>
                </div>
              </div>
              <Link
                to="/portal/import"
                className="inline-block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-xl transition-all"
              >
                Import from {p.name} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Access health (read-only, real) */}
      <section className="space-y-3">
        <h3 className="text-xs font-black text-stone-300 uppercase tracking-wider">Access in this workspace</h3>
        {!loaded ? (
          <p className="text-xs text-stone-500">Checking access health…</p>
        ) : access.length === 0 ? (
          <p className="text-xs text-stone-500">
            No external-tool access is set up on this account yet. You can still import data from your
            tools from the Import page whenever you're ready.
          </p>
        ) : (
          <div className="space-y-2">
            {access.map((a) => (
              <div
                key={a.provider}
                className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    a.status === "ok" || a.status === "active" ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{a.provider}</div>
                  {a.lastError && <div className="text-[10px] text-rose-400 truncate">{a.lastError}</div>}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-stone-500">
              Health reflects the access this workspace already holds — read-only, nothing to reconnect.
            </p>
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 text-[11px] text-stone-500 leading-relaxed">
        <Link to="/portal/connected-accounts" className="text-emerald-400 hover:text-emerald-300 font-bold">
          View import history →
        </Link>{" "}
        — every import that has run in this workspace, straight from the platform's import ledger.
      </div>
    </div>
  );
}

export default ErpPage;