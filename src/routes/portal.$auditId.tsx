import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/portal/$auditId")({
  beforeLoad: async () => {
    const res = await fetch("/api/me");
    if (!res.ok) {
      throw redirect({ to: "/login" });
    }
    const user = await res.json();
    return { user };
  },
  loader: async ({ params }) => {
    const res = await fetch(`/api/audits/${params.auditId}`);
    if (!res.ok) throw new Error("Audit not found");
    const audit = await res.json();
    return { audit };
  },
  component: AuditDetail,
});

function AuditDetail() {
  const { audit } = Route.useLoaderData();
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/submit-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId: audit.id, requestText: feedbackText }),
      });
      if (res.ok) setFeedbackSent(true);
    } catch (err) {
      console.error("Feedback failed:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-indigo-600">
            Simpler Life 100
          </Link>
          <Link
            to="/portal"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Audits
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-8 border-b bg-slate-50/50">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{audit.type}</h1>
                <p className="text-gray-600">Audit ID: {audit.id}</p>
              </div>
              <span className={`text-sm px-3 py-1 rounded-full font-bold uppercase ${
                audit.status === "completed" ? "bg-green-100 text-green-700" :
                audit.status === "in-progress" ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {audit.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-8 mt-6">
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ordered On</div>
                <div className="text-gray-900">{new Date(audit.createdAt).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Last Updated</div>
                <div className="text-gray-900">{new Date(audit.updatedAt).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
          <div className="p-8">
            <h2 className="text-xl font-bold mb-4">Results & Deliverables</h2>
            {audit.status === "completed" ? (
              <div className="space-y-6">
                {audit.results && (
                  <div className="prose max-w-none text-gray-600 bg-gray-50 p-6 rounded-xl border">
                    <pre className="whitespace-pre-wrap font-sans">{audit.results}</pre>
                  </div>
                )}
                <div className="flex gap-4 no-print">
                  <button
                    onClick={handlePrint}
                    className="flex items-center justify-center gap-2 flex-1 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Download PDF Report</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed">
                <div className="text-3xl mb-4">⏳</div>
                <h3 className="text-lg font-bold mb-2">Audit in Progress</h3>
                <p className="text-gray-600 max-w-sm mx-auto">
                  Our team is currently analyzing your workflows. You'll receive an email once your results are ready.
                </p>
              </div>
            )}
            <div className="mt-12 pt-12 border-t no-print">
              <h2 className="text-xl font-bold mb-4">Request Adjustments</h2>
              <p className="text-gray-600 mb-4 text-sm">
                Need to add more detail or adjust your audit focus? Let us know and we'll update your report.
              </p>
              {feedbackSent ? (
                <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl">
                  Your adjustment request has been received. Our team will review it within 24 hours.
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    placeholder="Describe what you'd like us to adjust or add to your audit..."
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                  />
                  <button
                    onClick={handleFeedback}
                    disabled={sending || !feedbackText.trim()}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
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
