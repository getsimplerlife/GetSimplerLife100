import { useEffect, useState } from "react";
import { Card, Badge } from "~/components/ui";
interface ShareProposal {
  title: string;
  status: string;
  total: string;
  hasPdf: boolean;
  sharePath: string | null;
}
interface ShareChecklist {
  progress: { done: number; total: number };
  percentDone: number;
}
interface ShareView {
  dealRoomId: string;
  name: string;
  customerName: string;
  status: string;
  description: string;
  proposal: ShareProposal | null;
  checklist: ShareChecklist | null;
  updatedAt: string;
}
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};
export default function DealRoomSharePage() {
  const slug = (window.location.pathname.match(/\/deal-rooms\/share\/([^/]+)/) || [])[1] || "";
  const [view, setView] = useState<ShareView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/native/dealroom/share/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Deal room not found"))))
      .then((j) => setView(j.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [slug]);
  if (loading) return <div className="p-8 text-gray-500">Loading deal room…</div>;
  if (error && !view) return <div className="p-8 text-red-600">{error || "Deal room not found"}</div>;
  if (!view) return <div className="p-8 text-red-600">Deal room not found</div>;
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{view.name}</h1>
          <p className="text-sm text-gray-500">Prepared for {view.customerName}</p>
        </div>
        <Badge>{STATUS_LABEL[view.status] || view.status}</Badge>
      </div>
      {view.description ? (
        <Card className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-600">About this engagement</h3>
          <p className="text-sm whitespace-pre-wrap">{view.description}</p>
        </Card>
      ) : null}
      <Card className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">Proposal</h3>
        {view.proposal ? (
          <div className="text-sm">
            <p>
              <span className="font-medium">{view.proposal.title}</span> · <Badge>{view.proposal.status}</Badge>
            </p>
            <p className="mt-1 text-gray-600">Total: {view.proposal.total}</p>
            <p className="mt-1 text-xs text-gray-500">{view.proposal.hasPdf ? "Final PDF on file." : "Proposal document pending."}</p>
            {view.proposal.sharePath ? (
              <a className="mt-2 inline-block text-sm text-sky-600 underline" href={view.proposal.sharePath}>
                View the proposal
              </a>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No proposal is linked to this deal room yet.</p>
        )}
      </Card>
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-gray-600">Delivery progress</h3>
        {view.checklist ? (
          <div className="text-sm">
            <p className="text-gray-600">
              {view.checklist.progress.done} of {view.checklist.progress.total} steps complete ({view.checklist.percentDone}%)
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-200">
              <div
                className="h-full rounded bg-emerald-500"
                style={{ width: `${Math.min(100, Math.max(0, view.checklist.percentDone))}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No delivery checklist is linked yet.</p>
        )}
      </Card>
      <p className="mt-4 text-xs text-gray-400">Last updated {new Date(view.updatedAt).toLocaleDateString()}</p>
    </div>
  );
}
