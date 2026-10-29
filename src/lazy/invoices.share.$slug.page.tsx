import { useEffect, useState } from "react";
import { Card, Badge } from "~/components/ui";

/**
 * Public invoice page — what the CUSTOMER sees from the emailed link.
 * Read-only except for the ONE action a customer needs: paying it. When the
 * issuing firm has connected its own Stripe account, a real "Pay {amount}"
 * button hands off to a Stripe Checkout Session created on THAT FIRM'S account
 * (the money goes to them, never to us). When they have not connected one, the
 * page says plainly that payment is arranged with the issuer and shows no
 * button at all.
 *
 * The page never claims the invoice is paid: without a webhook from the firm's
 * own Stripe account we cannot know that, so after a checkout return it says the
 * payment was submitted and that the issuer confirms it.
 * The server refuses (404) any slug that is unknown, stale, or belongs to an
 * invoice that was not genuinely sent.
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
  /** TRUE only when the issuing firm connected its own Stripe account. */
  canPay: boolean;
  /** Truthful "a payment was started" stamp — never a "paid" claim. */
  paymentStartedAt: string | null;
}

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export default function InvoiceSharePage() {
  const slug = (window.location.pathname.match(/\/invoices\/share\/([^/]+)/) || [])[1] || "";
  const checkoutState = new URLSearchParams(window.location.search).get("checkout");
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

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Invoice {view.invoiceNumber}</h1>
          <p className="text-sm text-stone-500">
            From {view.issuerName} · Bill to {view.billToName}
          </p>
        </div>
        <Badge>{view.status === "sent" ? "Issued" : view.status}</Badge>
      </div>

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
        <p className="mt-3 text-right text-lg font-semibold">Total due: {money(view.amountDueCents, view.currency)}</p>
      </Card>

      <Card className="mt-4">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-stone-500">Issued:</span> {new Date(view.issuedAt).toLocaleDateString()}
          </p>
          <p>
            <span className="text-stone-500">Due:</span> {view.dueDate} (net 30)
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

      {/* PAY — only when the issuing firm connected its own Stripe account. */}
      <Card className="mt-4">
        {checkoutState === "return" ? (
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Thank you — your payment was submitted to {view.issuerName}.
            </p>
            <p className="mt-1 text-xs text-stone-600">
              Stripe handled the card payment on {view.issuerName}&apos;s own account and sent you a receipt. They will
              confirm it on their side — this page cannot mark the invoice as paid by itself.
            </p>
          </div>
        ) : view.canPay ? (
          <div>
            <button
              type="button"
              onClick={pay}
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
                A payment was started on {new Date(view.paymentStartedAt).toLocaleString()} — if you did not finish it,
                you can start again above.
              </p>
            )}
            {checkoutState === "cancelled" && (
              <p className="mt-2 text-xs text-amber-600">No payment was taken — you cancelled the checkout.</p>
            )}
            {payError && <p className="mt-2 text-xs text-red-600">{payError}</p>}
          </div>
        ) : (
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
        )}
      </Card>
    </div>
  );
}
