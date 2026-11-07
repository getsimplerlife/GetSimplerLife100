import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { submitFeedback } from "~/db/queries";
import { Route } from '~/routes/portal.$auditId';

/**
 * SLICE 168 — D-9. `/portal/$auditId` is a dynamic child of `/portal`, so any
 * unknown path under the portal resolves here. Before this fix the page read
 * whatever the loader produced and, with no record, rendered
 * "⏳ Audit in Progress" + "ORDERED ON Invalid Date" + a "Request Adjustments"
 * form — inventing an order for a customer who ordered nothing. A missing
 * record now renders an explicit not-found state and nothing else.
 */

/**
 * A missing or unparseable timestamp renders as an em dash. `new Date(x)
 * .toLocaleDateString()` yields the literal string "Invalid Date" for
 * undefined/null/garbage, and that token must never reach a customer's screen.
 */
export function formatAuditDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/** The honest page for an id that resolves to no audit record. */
export function AuditNotFound() {
  return (
    <div className="min-h-screen bg-black">
      <header className="bg-stone-950 border-b border-stone-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-emerald-600">
            Simpler Life 100
          </Link>
          <Link to="/portal" className="tap-target text-sm font-medium text-stone-400 hover:text-emerald-400">
            ← Back to Dashboard
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-24 text-center" role="alert">
        <div className="text-4xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-stone-100 mb-3">We couldn't find that page</h1>
        <p className="text-stone-400 max-w-md mx-auto mb-8">
          There is no audit record at this address. The link may be mistyped or out of date —
          nothing was ordered or lost.
        </p>
        <Link
          to="/portal"
          className="inline-block bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
        >
          Go to your dashboard
        </Link>
      </main>
    </div>
  );
}

function AuditDetail() {
  const { audit, readFailed } = Route.useLoaderData();
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [sending, setSending] = useState(false);

  // 203 — a read that FAILED is not a record that does not exist. Before this,
  // the loader swallowed the throw and this page told the customer "There is no
  // audit record at this address" for a server error, which is the same defect
  // class 188/190/batch B closed everywhere else.
  if (readFailed) {
    return (
      <div className="min-h-screen bg-black">
        <main className="max-w-4xl mx-auto px-6 py-24 text-center" role="alert">
          <h1 className="text-2xl font-bold text-stone-100 mb-3">We couldn't load this record</h1>
          <p className="text-stone-400 max-w-md mx-auto mb-8">
            The audit record did not come back. This is a read failure, not a missing record —
            nothing was deleted.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-block bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
          >
            Try again
          </button>
        </main>
      </div>
    );
  }

  // D-9: no record → the not-found page. Never the in-progress copy.
  if (!audit || !audit.id) {
    return <AuditNotFound />;
  }

  const handlePrint = () => {
    window.print();
  };

  const handleFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSending(true);
    try {
      await submitFeedback({ data: { auditId: audit.id, requestText: feedbackText } });
      setFeedbackSent(true);
    } catch (err) {
      console.error("Feedback failed:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <style>{`
        @media print {
          no-print { display: none !important; }
          body { background: white !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>

      <header className="bg-stone-950 border-b border-stone-800 px-6 py-4 no-print">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-emerald-600">
            Simpler Life 100
          </Link>
          <Link to="/portal" className="tap-target text-sm font-medium text-stone-400 hover:text-emerald-400">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-stone-900 rounded-2xl border border-stone-800 shadow-lg shadow-black/20 overflow-hidden">
          <div className="p-8 border-b bg-stone-950/60">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-3xl font-bold text-stone-100">{audit.type}</h1>
                <p className="text-stone-400">Audit ID: {audit.id}</p>
              </div>
              <span className={`text-sm px-3 py-1 rounded-full font-bold uppercase ${
                audit.status === "completed" ? "bg-green-500/15 text-green-300" :
                audit.status === "in-progress" ? "bg-blue-500/15 text-blue-300" :
                "bg-stone-600/25 text-stone-300"
              }`}>
                {audit.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-8 mt-6">
              <div>
                <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Ordered On</div>
                <div className="text-stone-100">{formatAuditDate(audit.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Last Updated</div>
                <div className="text-stone-100">{formatAuditDate(audit.updatedAt)}</div>
              </div>
            </div>
          </div>

          <div className="p-8">
            <h2 className="text-xl font-bold mb-4">Results & Deliverables</h2>

            {audit.status === "completed" ? (
              <div className="space-y-6">
                {audit.results && (
                  <div className="prose max-w-none text-stone-300 bg-stone-900 p-6 rounded-xl border border-stone-800">
                    <pre className="whitespace-pre-wrap font-sans">{audit.results}</pre>
                  </div>
                )}
                <div className="flex gap-4 no-print">
                  <button
                    onClick={handlePrint}
                    className="flex items-center justify-center gap-2 flex-1 bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {/* SLICE 203 — this button promised a PDF download. The
                        handler is window.print(); no PDF is produced. The label now
                        names what the button does. */}
                    <span>Print this report</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 bg-stone-900 rounded-xl border border-dashed border-stone-700">
                <div className="text-3xl mb-4">⏳</div>
                <h3 className="text-lg font-bold mb-2">No results yet</h3>
                <p className="text-stone-400 max-w-sm mx-auto">
                  {/* SLICE 203 — this said "Our team is currently analyzing your
                      workflows. You'll receive an email once your results are
                      ready." Nothing transitions this record's status and nothing
                      sends that email. The copy now states what the page shows. */}
                  This audit has no results recorded yet. When results are added to the record, they appear on this page.
                </p>
              </div>
            )}

            {/* Feedback Section */}
            <div className="mt-12 pt-12 border-t no-print">
              <h2 className="text-xl font-bold mb-4">Request Adjustments</h2>
              <p className="text-stone-400 mb-4 text-sm">
                {/* SLICE 203 — this said "Let us know and we'll update your
                    report." Nothing here reaches anyone: `submitFeedback` is a
                    createServerFn whose handler never runs in the browser (the
                    polyfill returns `{}`), and prod-server has no feedback
                    endpoint at all, so the text is discarded. Saying so is the
                    honest minimum until the lane is built. */}
                Need to add more detail or adjust your audit focus? Describe it below. Nothing you type here is stored or sent yet.
              </p>
              {feedbackSent ? (
                <div className="bg-stone-800/60 border border-stone-600 text-stone-200 p-4 rounded-xl">
                  Nothing was recorded — the text was not stored or sent, and this audit record is unchanged.
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    rows={4}
                    className="w-full rounded-xl border border-stone-800 px-4 py-3 text-stone-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    placeholder="Describe what you'd like us to adjust or add to your audit..."
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                  />
                  <button
                    onClick={handleFeedback}
                    disabled={sending || !feedbackText.trim()}
                    className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Submit Adjustment Request"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default AuditDetail;
