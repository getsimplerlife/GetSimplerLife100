/**
 * portal.accessreview.index.page.tsx — Phase 4.3 native ACCESS-REVIEW portal
 * surface (lazy route). Periodic certification campaigns over the tenant's OWN
 * member access + workflow inventory, with attestation decisions and an
 * append-only EVIDENCE log. All mutations ride the Approval Queue (pending
 * cards + approve/reject); the copy stays HONEST: opening a campaign snapshots
 * safe projections of the tenant's own rows + workflows, and attestation
 * records a durable decision — the slice never changes access itself.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";

interface CampaignView {
  id: string;
  name: string;
  description: string;
  cadence: string;
  memberTableId?: string;
  workflowIds: string[];
  reviewerEmails: string[];
  status: string;
  itemsGenerated: number;
  createdAt: string;
  updatedAt: string;
}
interface ItemView {
  id: string;
  campaignId: string;
  kind: "member" | "workflow";
  subjectRef: string;
  subjectName: string;
  status: string;
  attestedAt?: string;
  attestedBy?: string;
}
interface EvidenceView {
  id: string;
  campaignId: string;
  itemId: string;
  decision: string;
  decidedBy: string;
  comment: string;
  note: string;
  createdAt: string;
}
interface PendingWriteView {
  id: string;
  op: string;
  action: string;
  status: string;
  requestedAt: string;
}

export default function PortalAccessReviewIndexPage() {
  const [campaigns, setCampaigns] = useState<CampaignView[]>([]);
  const [items, setItems] = useState<ItemView[]>([]);
  const [evidence, setEvidence] = useState<EvidenceView[]>([]);
  const [writes, setWrites] = useState<PendingWriteView[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", cadence: "on-demand", memberTableId: "", workflowIds: "", reviewerEmails: "" });

  const load = useCallback(async () => {
    try {
      const [c, e, w] = await Promise.all([
        fetch("/api/native/accessreview/campaigns", { headers: { accept: "application/json" } }),
        fetch("/api/native/accessreview/evidence", { headers: { accept: "application/json" } }),
        fetch("/api/native/accessreview/writes", { headers: { accept: "application/json" } }),
      ]);
      if (c.ok) setCampaigns(((await c.json()) as { data: { campaigns: CampaignView[] } }).data.campaigns ?? []);
      if (e.ok) setEvidence(((await e.json()) as { data: { evidence: EvidenceView[] } }).data.evidence ?? []);
      if (w.ok) setWrites(((await w.json()) as { data: { writes: PendingWriteView[] } }).data.writes ?? []);
    } catch {
      setNotice("Could not reach the access-review service right now.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedCampaign) {
      setItems([]);
      return;
    }
    void fetch(`/api/native/accessreview/campaigns/${selectedCampaign}/items`, { headers: { accept: "application/json" } })
      .then(async (r) => {
        if (r.ok) setItems(((await r.json()) as { data: { items: ItemView[] } }).data.items ?? []);
      })
      .catch(() => setNotice("Could not load review items."));
  }, [selectedCampaign]);

  async function submit(path: string, body: unknown): Promise<void> {
    setNotice(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; data?: { status?: string } };
    if (res.ok || res.status === 202) {
      setNotice(json.data?.status === "pending" ? "Queued for approval — approve it from the pending list below." : "Saved.");
      void load();
    } else {
      setNotice(json.error ?? "That action could not be completed.");
    }
  }

  async function createCampaign(): Promise<void> {
    const workflowIds = form.workflowIds.trim() ? form.workflowIds.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const reviewerEmails = form.reviewerEmails.trim() ? form.reviewerEmails.split(",").map((s) => s.trim()).filter(Boolean) : [];
    await submit("/api/native/accessreview/campaigns", {
      name: form.name,
      description: form.description,
      cadence: form.cadence,
      memberTableId: form.memberTableId.trim() || undefined,
      workflowIds,
      reviewerEmails,
    });
  }

  async function attest(item: ItemView, decision: string): Promise<void> {
    await submit(`/api/native/accessreview/items/${item.id}/attest`, { decision });
  }

  const statusVariant = (s: string) => (s === "open" ? "success" : s === "closed" ? "stone" : s === "canceled" ? "danger" : "warning") as "success" | "stone" | "danger" | "warning";

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Access Reviews</h1>
        <p className="mt-1 text-sm text-stone-400">
          Periodic certification campaigns over your own member access + workflow inventory. Attestations record durable
          evidence — this slice never changes access itself.
        </p>
      </div>

      {notice && <div className="mb-4 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-3 text-lg font-medium">Start a certification campaign</h2>
            <div className="space-y-3">
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Campaign name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={form.cadence}
                onChange={(e) => setForm({ ...form, cadence: e.target.value })}
              >
                <option value="on-demand">On-demand</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi-annual">Semi-annual</option>
                <option value="annual">Annual</option>
              </select>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Member table id (optional — your own 1.4 table)"
                value={form.memberTableId}
                onChange={(e) => setForm({ ...form, memberTableId: e.target.value })}
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Workflow ids (comma-separated, optional — empty = all active)"
                value={form.workflowIds}
                onChange={(e) => setForm({ ...form, workflowIds: e.target.value })}
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Reviewers (comma-separated emails)"
                value={form.reviewerEmails}
                onChange={(e) => setForm({ ...form, reviewerEmails: e.target.value })}
              />
              <Button onClick={() => void createCampaign()}>Create campaign</Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="mb-3 text-lg font-medium">Campaigns</h2>
            {campaigns.length === 0 && <p className="text-sm text-stone-500">No campaigns yet.</p>}
            <div className="space-y-3">
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() => setSelectedCampaign(selectedCampaign === c.id ? null : c.id)}
                    >
                      {c.name}
                    </button>
                    <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {c.cadence} · {c.reviewerEmails.length} reviewer(s) · {c.itemsGenerated} item(s)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.status === "draft" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void submit(`/api/native/accessreview/campaigns/${c.id}/open`, {})}
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void submit(`/api/native/accessreview/campaigns/${c.id}/delete`, {})}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                    {c.status === "open" && (
                      <Button size="sm" onClick={() => void submit(`/api/native/accessreview/campaigns/${c.id}/close`, {})}>
                        Close
                      </Button>
                    )}
                    {(c.status === "draft" || c.status === "open") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void submit(`/api/native/accessreview/campaigns/${c.id}/cancel`, {})}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {selectedCampaign && (
        <Card className="mt-6">
          <CardBody>
            <h2 className="mb-3 text-lg font-medium">Review items — pending attestation</h2>
            {items.filter((i) => i.status === "pending").length === 0 && (
              <p className="text-sm text-stone-500">No pending items.</p>
            )}
            <div className="space-y-3">
              {items
                .filter((i) => i.status === "pending")
                .map((i) => (
                  <div key={i.id} className="rounded-md border p-3">
                    <p className="text-sm font-medium">
                      {i.kind === "member" ? "👤" : "⚡"} {i.subjectName}{" "}
                      <span className="text-xs text-stone-500">({i.kind})</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void attest(i, "certified")}>
                        Certify access
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void attest(i, "flagged")}>
                        Flag
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void attest(i, "removal-requested")}
                      >
                        Request removal
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="mt-6">
        <CardBody>
          <h2 className="mb-3 text-lg font-medium">Evidence log</h2>
          {evidence.length === 0 && <p className="text-sm text-stone-500">No attestations recorded yet.</p>}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {evidence.map((e) => (
              <div key={e.id} className="rounded-md border p-2 text-sm">
                <span className="font-medium">{e.decision}</span> · {e.itemId} by{" "}
                {e.decidedBy} · {new Date(e.createdAt).toLocaleString()}
                {e.comment && <p className="mt-1 text-xs text-stone-400">{e.comment}</p>}
                <p className="mt-1 text-xs text-stone-400">{e.note}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardBody>
          <h2 className="mb-3 text-lg font-medium">Pending approvals</h2>
          {writes.length === 0 && <p className="text-sm text-stone-500">Nothing awaiting approval.</p>}
          <div className="space-y-2">
            {writes.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>
                  {w.action} <span className="text-stone-500">· {new Date(w.requestedAt).toLocaleString()}</span>
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void submit(`/api/native/accessreview/writes/${w.id}/apply`, {})}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void submit(`/api/native/accessreview/writes/${w.id}/reject`, {})}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}