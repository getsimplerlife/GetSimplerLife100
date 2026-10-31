import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, Badge, Button } from "~/components/ui";
import { PortalEmptyState, scrollToId } from "~/components/PortalEmptyState";

interface DeliveryAttempt {
  at: string;
  by: string;
  channel: "sendgrid" | "smtp" | "none";
  outcome: "sent" | "failed" | "unconfigured";
  messageId?: string;
  error?: string;
}
interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  linkedDealRoomId: string;
  currency: string;
  amountDueCents: number;
  status: string;
  docId: string | null;
  customerEmail: string;
  dueDate: string;
  shareSlug: string | null;
  /** Set when the tenant revoked the public link (slice 152) — the link is dead. */
  shareRevokedAt?: string;
  lastAttempt: DeliveryAttempt | null;
  /** Truthful "a payment was started" stamp — never a "paid" claim. */
  paymentStartedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}
interface DealRoomChoice {
  id: string;
  name: string;
  status: string;
}
interface PendingWrite {
  id: string;
  op: string;
  invoiceId: string | null;
  status: string;
  approvalActionId: string;
  via: string;
  requestedBy: string;
  requestedAt: string;
}

/**
 * Status labels mirror the server's honest state machine exactly:
 *   draft   — nothing sent yet
 *   queued  — approved, dispatch in flight
 *   sent    — the email provider ACKNOWLEDGED the message
 *   failed  — the attempt did not deliver (reason shown), or no email lane
 */
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft — not sent",
  queued: "Queued — sending",
  sent: "Sent — delivered",
  failed: "Not delivered",
};

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}
function attemptSummary(a: DeliveryAttempt): string {
  const when = new Date(a.at).toLocaleString();
  if (a.outcome === "sent") return `Emailed ${when} via ${a.channel} — provider acknowledged${a.messageId ? ` (${a.messageId})` : ""}`;
  if (a.outcome === "unconfigured") return `No email was sent — the email lane is not configured (checked ${when})`;
  return `Attempted ${when} via ${a.channel} — not delivered`;
}

export default function InvoicesPage() {
  const [items, setItems] = useState<InvoiceSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [dealRooms, setDealRooms] = useState<DealRoomChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  const [dealRoomId, setDealRoomId] = useState("");
  const [composerEmail, setComposerEmail] = useState("");
  const [rowEmail, setRowEmail] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  /**
   * Whether THIS workspace can accept payment at all (it connected its own
   * Stripe account). `null` = not loaded yet. This is the tenant's own
   * capability flag — it carries no key material.
   */
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/native/invoice", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load invoices");
    const json = await res.json();
    setItems(json.data || []);
    const wr = await fetch("/api/native/invoice/writes", { credentials: "include" });
    if (wr.ok) setWrites((await wr.json()).data || []);
    const st = await fetch("/api/native/invoice/stripe", { credentials: "include" });
    if (st.ok) setStripeConnected(Boolean((await st.json()).data?.connected));
    const dr = await fetch("/api/native/dealroom", { credentials: "include" });
    if (dr.ok) {
      const dj = await dr.json();
      setDealRooms((dj.data || []).filter((d: { status: string }) => d.status === "active"));
    }
  }, []);

  useEffect(() => {
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [load]);

  async function createInvoice() {
    setCreating(true);
    setFeedback("");
    setError("");
    if (!dealRoomId) {
      setError("Pick a deal room to invoice first.");
      setCreating(false);
      return;
    }
    try {
      const res = await fetch("/api/native/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          linkedDealRoomId: dealRoomId,
          ...(composerEmail.trim() ? { customerEmail: composerEmail.trim() } : {}),
        }),
      });
      if (res.status === 202) setFeedback("Invoice queued — approve it in the queue below.");
      else if (res.ok) setFeedback("Invoice created as draft.");
      else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Failed to create invoice");
      }
      setDealRoomId("");
      setComposerEmail("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function verb(id: string, action: "generate" | "send" | "delete") {
    setFeedback("");
    setError("");
    const recipient = (rowEmail[id] || "").trim();
    const res = await fetch(`/api/native/invoice/${id}${action === "delete" ? "" : `/${action}`}`, {
      method: action === "delete" ? "DELETE" : "POST",
      credentials: "include",
      ...(action === "send" && recipient
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerEmail: recipient }) }
        : {}),
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 202) {
      setFeedback(`${action} queued — approve it in the queue below. Nothing is sent until it is approved.`);
    } else if (res.ok) {
      if (action === "send") {
        const status = j?.data?.invoiceStatus as string | undefined;
        const attempt = j?.data?.lastAttempt as DeliveryAttempt | null | undefined;
        if (status === "sent") setFeedback(`Invoice emailed — the provider acknowledged it${attempt?.messageId ? ` (${attempt.messageId})` : ""}.`);
        else if (status === "failed") setFeedback(`Invoice NOT delivered: ${attempt?.error || "the email provider did not accept it"}. The record says "Not delivered" — retry after fixing the cause.`);
        else setFeedback(`Send processed — invoice status is now "${status ?? "unknown"}".`);
      } else {
        setFeedback(`${action} applied.`);
      }
      if (recipient) setRowEmail((prev) => ({ ...prev, [id]: "" }));
    } else {
      if (j.error) setError(j.error);
      else setError(`Could not ${action} this invoice.`);
    }
    await load();
  }

  async function applyWrite(id: string) {
    const res = await fetch(`/api/native/invoice/writes/${id}/apply`, { method: "POST", credentials: "include" });
    const j = await res.json().catch(() => ({}));
    const status = j?.data?.invoiceStatus as string | undefined;
    const notice = (j?.data?.notice as string | undefined) || "";
    if (res.ok && notice) setFeedback(`Write applied. ${notice}`.trim());
    else if (res.ok && status === "failed") setFeedback("Write applied — the invoice was NOT delivered (see the reason on the invoice).");
    else if (res.ok && status === "sent") setFeedback("Write applied — the invoice was emailed and the provider acknowledged it.");
    else setFeedback(res.ok ? "Write applied." : "Write apply failed.");
    await load();
  }

  function publicLink(i: InvoiceSummary): string {
    return i.shareSlug ? `${window.location.origin}/invoices/share/${i.shareSlug}` : "";
  }
  async function copyLink(i: InvoiceSummary) {
    const url = publicLink(i);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("Customer link copied to the clipboard.");
    } catch {
      setFeedback(`Customer link: ${url}`);
    }
  }

  /**
   * Revoke or rotate the customer link (slice 152). Revoking kills the URL for
   * good; rotating kills it and hands back a fresh one. Both are gated writes,
   * so the response may be a queued approval — in which case the OLD link keeps
   * working until it is approved, and we say that rather than implying it is
   * already dead.
   */
  async function shareAction(id: string, action: "revoke" | "rotate") {
    setFeedback("");
    setError("");
    const res = await fetch(`/api/native/invoice/${id}/share/${action}`, { method: "POST", credentials: "include" });
    const j = await res.json().catch(() => ({}));
    if (res.status === 202) {
      setFeedback(
        `${action === "revoke" ? "Revoke" : "Rotate"} queued — approve it in the queue below. The current link keeps working until it is approved.`,
      );
    } else if (res.ok) {
      const url = (j?.data?.shareUrl as string | undefined) || "";
      const notice = (j?.data?.notice as string | undefined) || "";
      if (action === "rotate") setFeedback(`New customer link issued — the previous link no longer opens.${url ? ` ${url}` : ""} ${notice}`.trim());
      else setFeedback(`Customer link revoked — the old URL no longer opens for anyone. ${notice}`.trim());
    } else {
      setError(j.error || `Could not ${action} the customer link.`);
    }
    await load();
  }

  const visible = filter ? items.filter((i) => i.linkedDealRoomId === filter) : items;
  const dealName = (id: string) => dealRooms.find((d) => d.id === id)?.name ?? id;
  const sendable = (s: string) => s === "draft" || s === "failed";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-stone-500">
            Native invoices built from approved deal rooms. Sending emails the invoice and its PDF link to the customer;
            posting to the customer's books stays with the connected accounting adapter (Xero/QuickBooks).
          </p>
        </div>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {feedback && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{feedback}</div>}

      {/* Can this workspace take payment at all? (its OWN Stripe account) */}
      {stripeConnected !== null && (
        <Card>
          {stripeConnected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-400">Online payment is on</p>
                <p className="text-xs text-stone-400">
                  Customers pay from the invoice page through your own Stripe account. The money never passes through us.
                </p>
              </div>
              <Link to="/portal/settings" className="text-xs text-sky-400 underline">
                Payment settings
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-400">Online payment is not set up</p>
                <p className="text-xs text-stone-400">
                  Your invoice pages say payment is arranged directly with you and show no Pay button. Connect your own
                  Stripe account to add one — payments settle in your Stripe account, never ours.
                </p>
              </div>
              <Link
                to="/portal/settings"
                className="rounded bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Set up payments
              </Link>
            </div>
          )}
        </Card>
      )}

      <Card id="invoice-composer">
        <h2 className="mb-3 text-lg font-semibold">Create invoice from a deal room</h2>
        <div className="flex flex-wrap items-end gap-3">
          <select className="min-w-64 rounded border p-2" value={dealRoomId} onChange={(e) => setDealRoomId(e.target.value)}>
            <option value="">Pick an active deal room</option>
            {dealRooms.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input
            className="min-w-64 rounded border p-2"
            type="email"
            placeholder="Customer email (optional — defaults to the deal room's)"
            value={composerEmail}
            onChange={(e) => setComposerEmail(e.target.value)}
          />
          <Button onClick={createInvoice} disabled={creating || !dealRoomId}>
            {creating ? "Creating…" : "Create invoice"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Line items are snapshotted from the deal room's linked proposal (integer cents); the amount can only change
          through a new proposal revision. Payment is due net 30 from creation.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Invoices ({visible.length})</h2>
        <select className="mb-3 rounded border p-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All deal rooms</option>
          {dealRooms.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {loading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : items.length === 0 ? (
          dealRooms.length === 0 ? (
            <PortalEmptyState
              title="No invoices yet"
              body="Invoices are built from approved deal rooms. Create and approve a deal room first, then issue the invoice from the composer above."
              action={{ label: "Open deal rooms", to: "/deal-rooms/" }}
            />
          ) : (
            <PortalEmptyState
              title="No invoices yet"
              body="Invoices are built from approved deal rooms. Use the composer above to issue an invoice from an active deal room."
              action={{ label: "Open the composer", onClick: () => scrollToId("invoice-composer") }}
            />
          )
        ) : visible.length === 0 ? (
          <PortalEmptyState
            title="No invoices match this filter"
            body="Try a different deal room filter, or clear it to see every invoice."
            action={{ label: "Clear filter", onClick: () => setFilter("") }}
          />
        ) : (
          <div className="space-y-3">
            {visible.map((i) => (
              <div key={i.id} className="rounded border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{i.invoiceNumber}</span>
                      <Badge>{STATUS_LABEL[i.status] || i.status}</Badge>
                    </div>
                    <p className="text-sm text-stone-500">
                      {dealName(i.linkedDealRoomId)} · {money(i.amountDueCents, i.currency)} · due {i.dueDate} · v{i.version}
                    </p>
                    <p className="text-xs text-stone-400">
                      {i.docId ? "PDF on file" : "No PDF yet"} · issued {new Date(i.createdAt).toLocaleDateString()}
                      {i.sentAt ? ` · sent ${new Date(i.sentAt).toLocaleDateString()}` : ""}
                    </p>
                    <p className="text-xs text-stone-400">
                      Recipient: {i.customerEmail || <span className="text-amber-500">none on file — add one to send</span>}
                    </p>
                    {i.lastAttempt && <p className="text-xs text-stone-400">{attemptSummary(i.lastAttempt)}</p>}
                    {i.lastAttempt?.outcome === "unconfigured" && (
                      <p className="mt-1 text-xs text-amber-500">
                        Email not configured — the invoice PDF was generated only. Nothing was emailed.
                      </p>
                    )}
                    {i.paymentStartedAt && (
                      <p className="text-xs text-stone-400">
                        Payment started {new Date(i.paymentStartedAt).toLocaleString()} — not confirmed as paid (that
                        needs a confirmation from your Stripe account).
                      </p>
                    )}
                    {i.lastAttempt?.outcome === "failed" && i.lastAttempt.error && (
                      <p className="mt-1 text-xs text-red-500">Failure reason: {i.lastAttempt.error}</p>
                    )}
                    {i.status === "sent" && i.shareSlug && (
                      <div className="mt-2 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="max-w-full truncate rounded bg-stone-100 px-2 py-1 text-xs text-stone-700">
                            {publicLink(i)}
                          </code>
                          <button type="button" className="text-xs text-sky-600 underline" onClick={() => copyLink(i)}>
                            Copy customer link
                          </button>
                          <button type="button" className="text-xs text-stone-600 underline" onClick={() => shareAction(i.id, "rotate")}>
                            Replace with a new link
                          </button>
                          <button type="button" className="text-xs text-red-600 underline" onClick={() => shareAction(i.id, "revoke")}>
                            Revoke link
                          </button>
                        </div>
                        <p className="text-xs text-stone-500">
                          Revoking kills this URL for good. It does not cancel a payment page the customer already opened — that
                          page lives on your own Stripe account and may still be payable until it expires.
                        </p>
                      </div>
                    )}
                    {i.status === "sent" && !i.shareSlug && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-amber-500">
                          Public link revoked{i.shareRevokedAt ? ` ${new Date(i.shareRevokedAt).toLocaleString()}` : ""} — the old URL
                          no longer opens for anyone. A payment page the customer already opened is not cancelled by this.
                        </p>
                        <button type="button" className="text-xs text-stone-600 underline" onClick={() => shareAction(i.id, "rotate")}>
                          Issue a new link
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!i.customerEmail && sendable(i.status) && (
                      <input
                        className="rounded border p-1 text-xs"
                        type="email"
                        placeholder="customer@example.com"
                        value={rowEmail[i.id] || ""}
                        onChange={(e) => setRowEmail((prev) => ({ ...prev, [i.id]: e.target.value }))}
                      />
                    )}
                    {sendable(i.status) && <Button onClick={() => verb(i.id, "generate")}>Generate PDF</Button>}
                    {sendable(i.status) && (
                      <Button onClick={() => verb(i.id, "send")}>{i.status === "failed" ? "Retry send" : "Send invoice"}</Button>
                    )}
                    {sendable(i.status) && <Button onClick={() => verb(i.id, "delete")}>Delete</Button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Pending writes ({writes.filter((w) => w.status === "pending").length})</h2>
        {writes.filter((w) => w.status === "pending").length === 0 ? (
          <p className="text-sm text-stone-500">Nothing waiting for approval.</p>
        ) : (
          <div className="space-y-2">
            {writes.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span className="text-stone-400">
                  <code>{w.op}</code> · {w.via} · {new Date(w.requestedAt).toLocaleString()}
                </span>
                <Button onClick={() => applyWrite(w.id)}>Apply</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
