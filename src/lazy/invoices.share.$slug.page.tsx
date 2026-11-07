import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { Card, Badge } from "~/components/ui";
import { invoiceStatusLabel, invoiceStatusTone, type InvoiceStatusTone } from "~/lib/invoice-status";

/**
 * Public invoice page — what the CUSTOMER sees from the emailed link.
 * Read-only except for the ONE action a customer needs: paying it. When the
 * issuing firm has connected its own Stripe account, a real "Pay {amount}"
 * button hands off to a Stripe Checkout Session created on THAT FIRM'S account
 * (the money goes to them, never to us). When they have not connected one, the
 * page says plainly that payment is arranged with the issuer and shows no
 * button at all.
 *
 * SLICE 191 — the page renders the record's PAID state and can never take a
 * second payment. `paid` is true only after the issuing firm's own verified
 * Stripe webhook confirmed the money (the server's `isInvoicePayable` decides),
 * and then the page is a receipt: a Paid badge with the date, the amount paid,
 * no "Total due" line and no Pay button. `?checkout=return` is a flag anyone can
 * type into a URL, so the "payment was submitted" sentence needs the server's
 * own `paymentStartedAt` record behind it; without one the page says it has no
 * record that a payment was started.
 *
 * SLICE 182 — the server serves every ISSUED invoice (sent, failed, queued) and
 * 404s only a draft. So this page is reachable for an invoice whose email the
 * mail provider refused, and the badge must say so: the four states come from
 * src/lib/invoice-status.ts, so a `failed` invoice reads "Not delivered" — never
 * "Issued", never "Draft". "Issued" stays the word for `sent` on this page: it
 * is what the customer is looking at, and it is true.
 */
interface ShareLineItem {
  description: string;
  qty: number;
  unitPriceCents: number;
  amountCents: number;
}
interface InvoiceView {
  invoiceNumber: string;
  issuerName: string;
  billToName: string;
  currency: string;
  lineItems: ShareLineItem[];
  amountDueCents: number;
  issuedAt: string;
  dueDate: string;
  status: string;
  hasPdf: boolean;
  pdfPath: string;
  /** TRUE only when this invoice can take a payment right now (the server's
   *  `isInvoicePayable`: connected Stripe, a payable amount, not already paid). */
  canPay: boolean;
  /** Truthful "a payment was started" stamp — never a "paid" claim. */
  paymentStartedAt: string | null;
  /** TRUE only after the issuing firm's own verified Stripe webhook confirmed it. */
  paid: boolean;
  paidAt: string | null;
  amountPaidCents: number | null;
  /** Whether `issuedAt` is the SEND date or, when the record has none, its creation date. */
  issuedAtSource?: "sent" | "created";
}

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

/**
 * SLICE 191 — the pay panel is a TYPED DECISION, not a growing ternary: every
 * state has exactly one renderer in PAY_PANEL below, so a new state is a
 * compile error instead of a silent fall-through. Same discipline the audit
 * praised in `PUBLIC_INVOICE_STATUS`.
 */
type PayPanelState = "paid" | "returned" | "unconfirmed" | "payable" | "unpayable";

function payPanelState(view: InvoiceView, checkoutState: string | undefined): PayPanelState {
  // A confirmed payment outranks everything: the invoice is a receipt now.
  if (view.paid) return "paid";
  if (checkoutState === "return") {
    // `?checkout=return` is text in a URL — anyone can append it. It is evidence
    // of nothing on its own; it counts only when the server holds a record that
    // a checkout was actually started on THIS invoice.
    return view.paymentStartedAt ? "returned" : "unconfirmed";
  }
  return view.canPay ? "payable" : "unpayable";
}

interface PayPanelProps {
  view: InvoiceView;
  checkoutState: string | undefined;
  paying: boolean;
  payError: string;
  onPay: () => void;
}

/**
 * One renderer per state — `Record<PayPanelState, …>` means a state added to
 * `PayPanelState` without copy here does not compile.
 */
const PAY_PANEL: Record<PayPanelState, (p: PayPanelProps) => ReactNode> = {
  // A confirmed payment. Reads as a receipt: what was paid, when, and by whom —
  // never "Total due", never a button that could charge again.
  paid: ({ view }) => (
    <div>
      <div className="flex items-center gap-2">
        {/* SLICE 205 — the "Paid" badge moved to the header (one current state,
            never "ISSUED" beside "PAID"). The date stays here, next to what it
            dates: the confirmation, not the invoice. */}
        {view.paidAt && (
          <span className="text-sm text-stone-300">Confirmed {new Date(view.paidAt).toLocaleDateString()}</span>
        )}
      </div>
      <p className="mt-2 text-sm text-stone-100">
        Invoice {view.invoiceNumber}
        {view.amountPaidCents != null
          ? ` — ${money(view.amountPaidCents, view.currency)} paid to ${view.issuerName}.`
          : ` — paid to ${view.issuerName}.`}
      </p>
      {/* SLICE 205 — this sentence was `text-stone-600` on a `bg-stone-900` Card
          (components/ui.tsx:187), so the least legible text on the page was the
          one telling a paying customer their money arrived. It now uses the same
          light foreground as the rest of the receipt. The contrast has NOT been
          measured in a browser; that is still owed. */}
      <p className="mt-1 text-xs text-stone-300">
        Their own Stripe account confirmed this payment, so nothing further is due on this invoice and this page
        cannot take a second payment.
      </p>
    </div>
  ),
  // `?checkout=return` AND the server's record that a checkout was started.
  returned: ({ view }) => (
    <div>
      <p className="text-sm font-medium text-emerald-700">
        Thank you — your payment was submitted to {view.issuerName}.
      </p>
      <p className="mt-1 text-xs text-stone-600">
        Stripe handled the card payment on {view.issuerName}&apos;s own account and sent you a receipt. They will
        confirm it on their side — this page cannot mark the invoice as paid by itself.
      </p>
    </div>
  ),
  // The flag with nothing behind it. Say what this page knows: nothing.
  unconfirmed: ({ view }) => (
    <div>
      <p className="text-sm font-medium text-stone-700">
        This page has no record that a payment was started for this invoice.
      </p>
      <p className="mt-1 text-xs text-stone-600">
        Nothing was charged from this link. If you have just paid, {view.issuerName} will confirm it on their side —
        this page cannot mark the invoice as paid by itself.
      </p>
    </div>
  ),
  payable: ({ view, checkoutState, paying, payError, onPay }) => (
    <div>
      <button
        type="button"
        onClick={onPay}
        disabled={paying}
        className="w-full rounded bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
      >
        {paying ? "Starting secure checkout…" : `Pay ${money(view.amountDueCents, view.currency)}`}
      </button>
      <p className="mt-2 text-xs text-stone-500">
        You will be taken to a secure Stripe checkout. The payment goes directly to {view.issuerName}.
      </p>
      {view.paymentStartedAt && (
        <p className="mt-1 text-xs text-stone-500">
          A payment was started on {new Date(view.paymentStartedAt).toLocaleString()} — if you did not finish it, you
          can start again above.
        </p>
      )}
      {checkoutState === "cancelled" && (
        <p className="mt-2 text-xs text-amber-600">No payment was taken — you cancelled the checkout.</p>
      )}
      {payError && <p className="mt-2 text-xs text-red-600">{payError}</p>}
    </div>
  ),
  unpayable: ({ view }) => (
    <div>
      <p className="text-sm text-stone-700">
        Payment is arranged directly with {view.issuerName} — this page does not take payment.
      </p>
      {view.paymentStartedAt && (
        <p className="mt-1 text-xs text-stone-500">
          A payment was started on {new Date(view.paymentStartedAt).toLocaleString()}.
        </p>
      )}
    </div>
  ),
};

export default function InvoiceSharePage() {
  // SLICE 166 — route params and the ?checkout= flag come from the router, not
  // `window`. Reading `window.location` while rendering threw during SSR, so the
  // server fell back to client rendering for a customer-facing link.
  const { slug } = useParams({ from: "/invoices/share/$slug" });
  const { checkout: checkoutState } = useSearch({ from: "/invoices/share/$slug" });
  const [view, setView] = useState<InvoiceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payError, setPayError] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!slug) {
      setError("Invoice not found — this link looks incomplete.");
      setLoading(false);
      return;
    }
    fetch(`/api/native/invoice/share/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Invoice not found"))))
      .then((j) => setView(j.data as InvoiceView))
      .catch(() => setError("Invoice not found — this link may have expired or the invoice was never sent."))
      .finally(() => setLoading(false));
  }, [slug]);

  async function pay() {
    setPayError("");
    setPaying(true);
    try {
      const res = await fetch(`/api/native/invoice/share/${encodeURIComponent(slug)}/pay`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      const url = json?.data?.checkoutUrl as string | undefined;
      if (!res.ok || !url) {
        setPayError(json?.error || "We could not start the payment. Please try again or contact the issuer.");
        return;
      }
      window.location.href = url;
    } catch {
      setPayError("We could not reach the payment provider. Please try again or contact the issuer.");
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <div className="p-8 text-stone-500">Loading invoice…</div>;
  if (!view) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-2 text-2xl font-bold">Invoice not found</h1>
        <p className="text-sm text-stone-600">{error || "This invoice link is not valid."}</p>
        <p className="mt-3 text-sm text-stone-600">If you were expecting an invoice, ask the sender to re-send it.</p>
      </div>
    );
  }

  // The CURRENT lifecycle state, derived once (see the header comment below).
  const headerBadge: { label: string; variant: InvoiceStatusTone } = view.paid
    ? { label: "Paid", variant: "success" }
    : {
        label: view.status === "sent" ? "Issued" : invoiceStatusLabel(view.status),
        variant: invoiceStatusTone(view.status),
      };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Invoice {view.invoiceNumber}</h1>
          <p className="text-sm text-stone-500">
            From {view.issuerName} · Bill to {view.billToName}
          </p>
        </div>
        {/* SLICE 182 — the badge is derived from the server's status enum via
            src/lib/invoice-status.ts, so a failed delivery reads "Not delivered"
            (never the raw enum, never "Draft"). "Issued" is kept for `sent`:
            that is what the customer is holding.

            SLICE 205 — and PAYMENT OUTRANKS ISSUANCE. A paid invoice used to
            wear a green "ISSUED" badge in this corner while the body read
            "PAID 11/3/2026": two lifecycle states side by side on the page a
            customer reads, which the browser audit recorded as a contradiction.
            `isInvoicePayable` (the server's own predicate) sets `paid`, and the
            badge now shows the CURRENT state — one of them, never both. */}
        <Badge variant={headerBadge.variant}>{headerBadge.label}</Badge>
      </div>

      {/* A customer can reach this page for an invoice whose EMAIL was refused
          (slice 182). Say what "Not delivered" means here so the badge is not
          read as "this invoice is not real". */}
      {view.status === "failed" && (
        <p className="mb-4 text-sm text-stone-600">
          This invoice is valid as shown. The email copy of it was not delivered, so {view.issuerName} may not have
          reached you — they can send it again, and this page is the record.
        </p>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-stone-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {view.lineItems.map((li, idx) => (
              <tr key={`${li.description}-${idx}`} className="border-b">
                <td className="py-2">{li.description}</td>
                <td className="py-2 text-right">{li.qty}</td>
                <td className="py-2 text-right">{money(li.unitPriceCents, view.currency)}</td>
                <td className="py-2 text-right">{money(li.amountCents, view.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* SLICE 191 — a paid invoice has no "Total due": the receipt in the pay
            panel states what was actually paid. */}
        {!view.paid && (
          <p className="mt-3 text-right text-lg font-semibold">Total due: {money(view.amountDueCents, view.currency)}</p>
        )}
      </Card>

      <Card className="mt-4">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            {/* SLICE 191 — "Issued" only when the date really is the send date;
                otherwise say what the date is. The "(net 30)" parenthetical is
                gone: the record's due date is its own field, not a term this
                page can assert. */}
            <span className="text-stone-500">{view.issuedAtSource === "sent" ? "Issued:" : "Created:"}</span>{" "}
            {new Date(view.issuedAt).toLocaleDateString()}
          </p>
          <p>
            <span className="text-stone-500">Due:</span> {view.dueDate}
          </p>
        </div>
        {view.hasPdf && (
          <a
            className="mt-3 inline-block rounded border px-3 py-2 text-sm font-medium hover:bg-stone-50"
            href={view.pdfPath}
          >
            Download PDF
          </a>
        )}
      </Card>

      {/* PAY — the panel is decided ONCE, then rendered by the state's own
          entry in PAY_PANEL. A paid invoice never reaches the button. */}
      <Card className="mt-4">
        {PAY_PANEL[payPanelState(view, checkoutState)]({ view, checkoutState, paying, payError, onPay: pay })}
      </Card>
    </div>
  );
}
