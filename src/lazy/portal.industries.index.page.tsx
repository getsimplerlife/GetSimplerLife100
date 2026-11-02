import { useState, useEffect } from "react";



function IndustriesHub() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTemplates = async (): Promise<any[]> => {
    const r = await fetch("/api/data/industries", { credentials: "include" });
    if (!r.ok) throw new Error(`Could not load industry templates (${r.status})`);
    const d = await r.json();
    const rows: any[] = d.data || [];
    setTemplates(rows);
    return rows;
  };

  useEffect(() => {
    loadTemplates()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * SLICE 176 — this handler used to print "Success: template … processed"
   * unconditionally (it never looked at `res.ok`), then mutate the row in the
   * browser and POST the whole object back. That second POST carries no
   * `action`, so the server ignores it outright — the badge only ever changed
   * because the client rewrote it, and a 401/400/500 still read as success.
   *
   * Now: check the response, then re-read the list from the server. The badge
   * shown is the server's own `status`, never a client invention.
   */
  const handleAction = async (name: string, action: string) => {
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const res = await fetch("/api/data/industries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "industry_" + action.toLowerCase(), resource: name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((j as { error?: string }).error || `Could not ${action} this template (${res.status}).`);
        return;
      }
      // The message is derived from what the SERVER now reports, never from the
      // action we asked for: if the row still says "Available", we say so.
      const rows = await loadTemplates();
      const row = rows.find((r) => r.name === name);
      setFeedback(`${name} — the server now reports status "${row?.status ?? "unknown"}".`);
      setTimeout(() => setFeedback(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      <div className="border-b border-stone-800 pb-6">
        <h1 className="text-3xl font-black text-stone-100 tracking-tight">🏢 Industry Templates</h1>
        <p className="text-stone-500 mt-1">Configure and manage the industry template your workspace starts from. Activating one records that choice for this workspace — it does not switch capabilities on or off. Nothing here is billed as a separate product.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {templates.map((b, idx) => (
          <div key={idx} className="bg-stone-900 p-6 rounded-3xl border border-stone-800 shadow-sm flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-stone-100">{b.name}</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  b.status === "Activated" ? "bg-emerald-500/15 text-emerald-300" : "bg-stone-800/60 text-stone-400"
                }`}>{b.status}</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed font-semibold">{b.description}</p>
              <div className="text-[10px] text-stone-400 font-bold">Capabilities: {b.features}</div>
            </div>
            <button
              onClick={() => handleAction(b.name, b.status === "Activated" ? "deactivate" : "activate")}
              disabled={busy}
              className={`w-full font-bold py-2 rounded-xl text-xs border transition-all ${
                b.status === "Activated" ? "bg-stone-50 border-stone-800 text-stone-700 hover:bg-stone-100" : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 shadow-lg"
              }`}
            >
              {b.status === "Activated" ? "Deactivate Template" : "Activate Template"}
            </button>
          </div>
        ))}
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}

export default IndustriesHub;
