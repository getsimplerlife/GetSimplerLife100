import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Card, Badge, Button } from "~/components/ui";
import { invoiceStatusLabel, invoiceStatusTone } from "~/lib/invoice-status";

/**
 * SLICE 192a — the page a CLIENT opens from a deal-room link.
 *
 * WHAT CHANGED AND WHY. The server now applies a publish rule (only an `active`
 * room is shareable; see `isDealRoomPubliclyShareable`), so this page has three
 * real outcomes instead of one collapsed "Deal room not found":
 *   - 404 / 410 → "this link isn't available" — the sender has not published the
 *     room, has archived it, or the link was revoked. Nothing to retry.
 *   - anything else (5xx, unreadable payload, no network) → a failure WITH a
 *     retry. A failure must never render as an empty-but-confident room, and a
 *     200 carrying nothing must never render as a blank page.
 *   - 200 with a readable room → the room.
 *
 * The invoice list is the server's filtered view: an invoice the client may not
 * see (a draft) never reaches this page at all.
 *
 * SSR: the slug comes from the router (`useParams`), never `window.location` —
 * a `window` read while rendering throws on the server (slice 166).
 */

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
interface ShareInvoice {
  invoiceNumber: string;
  currency: string;
  amountDueCents: number;
  status: string;
}
interface ShareView {
  dealRoomId: string;
  name: string;
  customerName: string;
  status: string;
  description: string;
  proposal: ShareProposal | null;
  checklist: ShareChecklist | null;
  invoices: ShareInvoice[];
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

type Phase = "loading" | "ready" | "not-available" | "error";

export default function DealRoomSharePage() {
  // SLICE 166 — see proposals.share: the router knows the slug during SSR.
  const { slug } = useParams({ from: "/deal-rooms/share/$slug" });
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<ShareView | null>(null);
  const [notAvailable, setNotAvailable] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setLoadError("");
    setNotAvailable("");
    fetch(`/api/native/dealroom/share/${slug}`, { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (cancelled) return;
        const body = (await res.json().catch(() => null)) as
          | { data?: ShareView; error?: string; reason?: string }
          | null;
        // 404 = unknown/stale/revoked slug. 410 = the room exists but is not
        // published (draft) or is finished (archived). Both mean the same thing
        // to the reader: this link does not open. The server's own sentence is
        // printed rather than a guess about which case it was.
        if (res.status === 404 || res.status === 410) {
          setNotAvailable(body?.error || "");
          setPhase("not-available");
          return;
        }
        if (!res.ok) {
          setLoadError(body?.error || `The server answered with HTTP ${res.status}.`);
          setPhase("error");
          return;
        }
        const data = body?.data;
        // Never fall back to an empty room: a payload we cannot read is an
        // error the reader can retry, not a page that silently shows nothing.
        if (!data || typeof data.name !== "string") {
          setLoadError("The deal room arrived in a form this page cannot read.");
          setPhase("error");
          return;
        }
        setView({
          dealRoomId: typeof data.dealRoomId === "string" ? data.dealRoomId : "",
          name: data.name,
          customerName: typeof data.customerName === "string" ? data.customerName : "",
          status: typeof data.status === "string" ? data.status : "",
          description: typeof data.description === "string" ? data.description : "",
          proposal: data.proposal ?? null,
          checklist: data.checklist ?? null,
          invoices: Array.isArray(data.invoices) ? data.invoices : [],
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
        });
        setPhase("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("We could not reach the server. Check your connection and try again.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  if (phase === "loading") return <div className="p-8 text-gray-500">Loading deal room…</div>;

  if (phase === "not-available") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-6">
          <h1 className="text-2xl font-bold">This deal room isn&apos;t available</h1>
          <p className="mt-2 text-sm text-gray-600">
            {notAvailable ||
              "The link may be out of date, or the sender has not published this deal room. Ask them to send you a fresh link."}
          </p>
        </Card>
      </div>
    );
  }

  if (phase === "error" || !view) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-6">
          <h1 className="text-2xl font-bold">We couldn&apos;t load this deal room</h1>
          <p className="mt-2 text-sm text-gray-600">{loadError || "The deal room could not be loaded."}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

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
      <Card className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">Invoices</h3>
        {view.invoices.length > 0 ? (
          <div className="space-y-2">
            {view.invoices.map((inv) => (
              <div key={inv.invoiceNumber} className="flex items-center justify-between rounded border p-2 text-sm">
                <span className="font-medium">{inv.invoiceNumber}</span>
                <span className="text-gray-600">
                  {inv.currency} {(inv.amountDueCents / 100).toFixed(2)} ·{" "}
                  {/* SLICE 180 — this was `inv.status === "sent" ? "Sent" : "Draft"`,
                      so a `failed` invoice (delivery refused, nothing reached the
                      customer) and a `queued` one both read "Draft" — work in
                      progress — on the page the customer opens. The label and the
                      tone now come from the server's own status enum
                      (src/lib/invoice-status.ts). */}
                  <Badge variant={invoiceStatusTone(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
                </span>
              </div>
            ))}
            {/* SLICE 203 — a footer here claimed the connected accounting adapter
                posted this invoice to the client's books. There is no outbound
                posting lane at all: books-posting is out of scope
                (src/native/invoice/types.ts:21-22) and src/native/import/ ships a
                Xero SOURCE with no QuickBooks source, so both halves of the claim
                were false. Deleted rather than softened. */}
            <p className="text-xs text-gray-400">These are the invoices issued for this engagement.</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No invoice has been issued for this deal room yet.</p>
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
      {view.updatedAt ? (
        <p className="mt-4 text-xs text-gray-400">Last updated {new Date(view.updatedAt).toLocaleDateString()}</p>
      ) : null}
    </div>
  );
}
