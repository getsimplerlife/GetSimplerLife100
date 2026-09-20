import { useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";

interface ShareLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}
interface ShareView {
  proposalId: string;
  title: string;
  clientName: string;
  clientCompany: string;
  status: string;
  currency: string;
  lineItems: ShareLineItem[];
  total: string;
  terms: string;
  validityDays: number;
  issuedAt: string;
}

export default function ProposalSharePage() {
  const slug = (window.location.pathname.match(/\/proposals\/share\/([^/]+)/) || [])[1] || "";
  const [view, setView] = useState<ShareView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [signerName, setSignerName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/native/proposals/share/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Proposal not found"))))
      .then((j) => setView(j.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [slug]);

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setFeedback("");
    try {
      const res = await fetch(`/api/native/proposals/share/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, signerName: signerName.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 202 || res.status === 200) {
        setFeedback(`Your ${decision} has been recorded — the proposal owner will confirm it.`);
      } else {
        setError(j.error || "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading proposal…</div>;
  if (error || !view) return <div className="p-8 text-red-600">{error || "Proposal not found"}</div>;

  const decided = view.status !== "pending";
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{view.title}</h1>
          <p className="text-sm text-gray-500">Prepared for {view.clientName}{view.clientCompany ? ` — ${view.clientCompany}` : ""}</p>
        </div>
        <Badge>{view.status}</Badge>
      </div>
      {feedback && <div className="mb-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm">{feedback}</div>}
      {error && <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</div>}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {view.lineItems.map((li) => (
              <tr key={li.description} className="border-b">
                <td className="py-2">{li.description}</td>
                <td className="py-2 text-right">{li.qty}</td>
                <td className="py-2 text-right">{li.unitPrice.toFixed(2)}</td>
                <td className="py-2 text-right">{(li.qty * li.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-lg font-semibold">Total: {view.total}</p>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-gray-600">Terms</h3>
        <p className="text-sm">{view.terms || "Standard terms apply."}</p>
        <p className="mt-2 text-xs text-gray-500">Valid for {view.validityDays} days · Issued {new Date(view.issuedAt).toLocaleDateString()}</p>
      </Card>

      {decided ? (
        <p className="mt-4 text-sm text-gray-600">This proposal has been {view.status}. The owner will follow up with next steps.</p>
      ) : (
        <Card className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-600">Accept or decline</h3>
          <input className="mb-3 w-full rounded border p-2" placeholder="Your name (optional)" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          <div className="flex gap-3">
            <Button onClick={() => decide("approve")} disabled={busy}>
              Accept proposal
            </Button>
            <Button onClick={() => decide("reject")} disabled={busy}>
              Decline
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}