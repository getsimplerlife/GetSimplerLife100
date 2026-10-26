import { Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

/**
 * Import history — cleanup (a2). Previously "Connected Accounts" (a
 * persistent-connection manager with connect/disconnect + pack-era slot
 * cards). External tools are import/migration lanes only (owner 10-20): the
 * persistent connect handler and its flat credential store are retired, so
 * this page honestly shows the real record of imports already run — every
 * entry comes from the per-tenant import-job ledger (GET /api/native/import),
 * never from a "connected accounts" claim.
 */

interface ImportSummary {
  id?: string;
  provider?: string;
  sourceLabel?: string;
  status?: string;
  target?: { tableId?: string };
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

interface ImportHistoryResponse {
  data?: {
    imports?: ImportSummary[];
    total?: number;
  };
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-stone-800 text-stone-400 border-stone-700",
  staged: "bg-amber-950/40 text-amber-400 border-amber-900/40",
  committed: "bg-emerald-950/40 text-emerald-400 border-emerald-900/40",
  failed: "bg-rose-950/40 text-rose-400 border-rose-900/40",
};

function statusChip(status: string) {
  return (
    <span
      className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
        STATUS_STYLES[status] || "bg-stone-800 text-stone-400 border-stone-700"
      }`}
    >
      {status || "unknown"}
    </span>
  );
}

function ImportHistoryPage() {
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/native/import?limit=100", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to load import history (HTTP ${res.status})`);
      }
      const body = (await res.json()) as ImportHistoryResponse;
      setImports(Array.isArray(body?.data?.imports) ? body.data.imports : []);
      setTotal(typeof body?.data?.total === "number" ? body.data.total : null);
    } catch (err: any) {
      console.error("Error fetching import history:", err);
      setError(err?.message || "Failed to load import history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-stone-400 font-bold">{error}</p>
        <button onClick={fetchData} className="text-emerald-400 font-bold text-sm hover:text-emerald-300">
          Try Again
        </button>
      </div>
    );
  }

  const sorted = [...imports].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">📥 Import History</h1>
        <p className="text-stone-400 mt-1">
          The record of every import run in this workspace — one-shot, client-initiated transfers that
          pull data INTO your workspace from your external tools.
        </p>
      </div>

      {/* Honest framing */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🔐</div>
          <div className="text-xs text-stone-400 leading-relaxed">
            <span className="font-bold text-stone-200">Nothing stays connected.</span> External tools work
            as import/migration lanes only: each import runs once, on your say-so, using the access your
            own account in the external tool already grants. There is nothing to reconnect, and no
            credentials are entered or stored on this page — this list is history of what came in and when.
          </div>
        </div>
      </div>

      {/* Jobs */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black text-white">Imports run</h2>
            <span className="text-xs text-stone-500 font-mono">
              {total !== null ? `${total} total` : `${sorted.length} shown`}
            </span>
          </div>
          <Link to="/portal/import" className="text-xs text-emerald-400 hover:text-emerald-300 font-bold">
            Bring your data in →
          </Link>
        </div>

        {sorted.length === 0 ? (
          <div className="bg-stone-900 border border-dashed border-stone-800 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-2">📥</div>
            <p className="text-stone-400 font-bold text-sm">No imports yet</p>
            <p className="text-stone-500 text-xs mt-1">
              Your imports will appear here as history once you run your first one. Data comes in from
              your tools — it's never "connected" and there's nothing to manage.
            </p>
            <Link
              to="/portal/import"
              className="inline-block mt-3 text-emerald-400 font-bold text-sm hover:text-emerald-300"
            >
              Bring your data in →
            </Link>
          </div>
        ) : (
          <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-800 text-[10px] uppercase tracking-wider text-stone-500">
                  <th className="px-4 py-3 font-bold">Source</th>
                  <th className="px-4 py-3 font-bold">Target table</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Started</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((imp) => (
                  <tr key={imp.id} className="border-b border-stone-800/60 last:border-0">
                    <td className="px-4 py-3">
                      <div className="text-white font-bold">{imp.sourceLabel || imp.provider || "—"}</div>
                      {imp.provider && imp.sourceLabel && (
                        <div className="text-[10px] text-stone-500 font-mono">{imp.provider}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-400 font-mono text-xs">
                      {imp.target?.tableId || "—"}
                    </td>
                    <td className="px-4 py-3">{statusChip(imp.status || "")}</td>
                    <td className="px-4 py-3 text-stone-400 text-xs">
                      {imp.createdAt ? new Date(imp.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 text-[11px] text-stone-500 leading-relaxed">
          Imports are recorded by the platform's import ledger — each entry shows exactly what the import
          ran (draft → staged → committed) with nothing invented. Every import needs your approval before
          anything enters your workspace.
        </div>
      </section>
    </div>
  );
}

export default ImportHistoryPage;