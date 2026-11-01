import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Card, Badge, Button } from "~/components/ui";
import { PortalEmptyState } from "~/components/PortalEmptyState";

/**
 * SLICE 167 — D-16. The proposal DETAIL view.
 *
 * THE DEFECT THIS EXISTS FOR (portal audit pass 2, D-16): on /portal/proposals
 * the row's "Open" button did not open anything — it queued an `open` write and
 * left the URL at /portal/proposals, so the quote itself could not be read
 * anywhere in the product. Once the status flipped to PENDING the row stopped
 * offering the control at all.
 *
 * This page is the read view the audit asked for: the client, the line items
 * with their quantities and unit prices, the terms, the share link and the
 * e-signature state, reachable by URL at /portal/proposals/$proposalId. Every
 * lifecycle write stays APPROVAL-GATED — the page says "queued" when the server
 * says 202 and never claims a write landed that the server has not applied.
 */
interface DetailLineItem {
  id?: string;
  description: string;
  qty: number;
  unitPrice: number;
}
interface DetailSignature {
  id?: string;
  signerName: string;
  signatureType: "typed" | "drawn" | string;
  payloadHash?: string;
  capturedAt?: string;
}
interface ProposalDetail {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  clientCompany: string;
  status: string;
  currency: string;
  total: string;
  totalCents?: number;
  validityDays: number;
  version: number;
  hasPdf: boolean;
  shareUrl: string | null;
  updatedAt: string;
  terms: string;
  lineItems: DetailLineItem[];
  signatures?: DetailSignature[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending client review",
  approved: "Approved",
  rejected: "Rejected",
  sent: "Sent",
};

/** `USD 1234.50` for a line item — same minor-unit discipline as the store. */
function money(currency: string, amount: number): string {
  return `${currency} ${amount.toFixed(2)}`;
}
function lineTotal(li: DetailLineItem): number {
  return (Math.round(li.unitPrice * 100) * li.qty) / 100;
}

export default function ProposalDetailPage() {
  // The id comes from the router (never from `window` — slice 166: reading
  // window while rendering throws during SSR).
  const { proposalId } = useParams({ from: "/portal/proposals/$proposalId" });
  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [clip, setClip] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/native/proposals/${proposalId}`, { credentials: "include" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error || `Could not load this proposal (${res.status})`);
    }
    const json = (await res.json()) as { data?: ProposalDetail };
    if (!json.data) throw new Error("The server returned no proposal data");
    setProposal(json.data);
  }, [proposalId]);

  useEffect(() => {
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [load]);

  async function action(verb: string) {
    setBusy(true);
    setFeedback("");
    try {
      const res = await fetch(`/api/native/proposals/${proposalId}/${verb}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; data?: { status?: string } };
      if (res.status === 202) setFeedback(`${verb} queued — approve it in the pending-writes queue on /portal/proposals.`);
      else if (res.ok) setFeedback(`${verb} applied.`);
      else setError(j.error || `${verb} failed (${res.status})`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyShare(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setClip("Copied — share this link with the client.");
    } catch {
      setClip(url);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-sm text-stone-500">Loading proposal…</p>
      </div>
    );
  }
  if (!proposal) {
    return (
      <div className="space-y-6 p-6">
        <Link className="text-sm text-sky-600 underline" to="/portal/proposals">
          ← Back to proposals
        </Link>
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error || "This proposal could not be loaded."}
        </div>
      </div>
    );
  }

  const signatures = proposal.signatures ?? [];
  const currency = proposal.currency || "USD";

  return (
    <div className="space-y-6 p-6">
      <Link className="text-sm text-sky-600 underline" to="/portal/proposals">
        ← Back to proposals
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{proposal.title}</h1>
          <p className="text-sm text-stone-500">
            <Badge>{STATUS_LABEL[proposal.status] || proposal.status}</Badge> · v{proposal.version} · updated{" "}
            {new Date(proposal.updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {proposal.status === "draft" && (
            <Button onClick={() => action("open")} disabled={busy}>
              Open for client review
            </Button>
          )}
          {proposal.status === "pending" && (
            <>
              <Button onClick={() => action("approve")} disabled={busy}>
                Approve
              </Button>
              <Button onClick={() => action("reject")} disabled={busy}>
                Reject
              </Button>
            </>
          )}
          {proposal.status === "approved" && (
            <Button onClick={() => action("send")} disabled={busy}>
              Send
            </Button>
          )}
          {proposal.hasPdf && (
            <a className="inline-flex items-center rounded border p-2 text-sm" href={`/api/native/proposals/${proposal.id}/pdf`}>
              PDF
            </a>
          )}
        </div>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {feedback && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{feedback}</div>
      )}
      {clip && <div className="rounded border border-sky-300 bg-sky-50 p-3 text-sm text-sky-800 break-all">{clip}</div>}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Client</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-stone-500">Name</dt>
            <dd className="font-medium">{proposal.clientName || "—"}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Company</dt>
            <dd className="font-medium">{proposal.clientCompany || "—"}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Email</dt>
            <dd className="font-medium break-all">{proposal.clientEmail || "—"}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Valid for</dt>
            <dd className="font-medium">{proposal.validityDays} days</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Line items</h2>
        {proposal.lineItems.length === 0 ? (
          <PortalEmptyState title="No line items" body="This proposal has no line items recorded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-stone-500">
                  <th className="py-2 pr-3 font-semibold">Description</th>
                  <th className="py-2 pr-3 font-semibold">Qty</th>
                  <th className="py-2 pr-3 font-semibold">Unit price</th>
                  <th className="py-2 text-right font-semibold">Line total</th>
                </tr>
              </thead>
              <tbody>
                {proposal.lineItems.map((li, i) => (
                  <tr key={li.id ?? `${li.description}-${i}`} className="border-b last:border-0">
                    <td className="py-2 pr-3">{li.description}</td>
                    <td className="py-2 pr-3">{li.qty}</td>
                    <td className="py-2 pr-3">{money(currency, li.unitPrice)}</td>
                    <td className="py-2 text-right">{money(currency, lineTotal(li))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-2 font-semibold" colSpan={3}>
                    Total
                  </td>
                  <td className="pt-2 text-right font-bold">{proposal.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Terms</h2>
        <p className="whitespace-pre-wrap text-sm text-stone-300">{proposal.terms || "No terms recorded on this proposal."}</p>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Share and e-signature</h2>
        {proposal.shareUrl ? (
          <div className="space-y-2">
            <p className="text-sm text-stone-400">The client opens this link to read the proposal and sign or decline it:</p>
            <p className="break-all text-sm text-sky-700">{proposal.shareUrl}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => copyShare(proposal.shareUrl!)}>Copy client link</Button>
              <a className="inline-flex items-center rounded border p-2 text-sm" href={proposal.shareUrl}>
                Open the client view
              </a>
            </div>
            <p className="text-xs text-stone-500">
              A client decision arrives as a pending write: nothing changes on this proposal until you approve it.
            </p>
          </div>
        ) : (
          <p className="text-sm text-stone-400">
            No client link yet. “Open for client review” generates one — that write is approval-gated, so the link appears once it
            is applied.
          </p>
        )}
        <div className="mt-4 border-t pt-3">
          <h3 className="mb-2 text-sm font-semibold">Signatures</h3>
          {signatures.length === 0 ? (
            <p className="text-sm text-stone-500">Not signed yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {signatures.map((s, i) => (
                <li key={s.id ?? `${s.signerName}-${i}`} className="text-stone-300">
                  <span className="font-medium">{s.signerName}</span> — {s.signatureType} signature
                  {s.capturedAt ? ` · ${new Date(s.capturedAt).toLocaleString()}` : ""}
                  {s.payloadHash ? <span className="block text-xs text-stone-500 break-all">sha256 {s.payloadHash}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
