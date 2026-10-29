import { useEffect, useState } from "react";
import { Card, Badge } from "~/components/ui";

/**
 * Public invoice page — what the CUSTOMER sees from the emailed link.
 * Read-only by design: no editing, no payment button, no tenant data beyond
 * this one invoice. The server refuses (404) any slug that is unknown, stale,
 * or belongs to an invoice that was not genuinely sent.
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
}

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export default function InvoiceSharePage() {
  const slug = (window.location.pathname.match(/\/invoices\/share\/([^/]+)/) || [])[1] || "";
  const [view, setView] = useState<InvoiceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        <p className="mt-3 text-xs text-stone-500">
          Payment is arranged directly with {view.issuerName}. This page is a read-only copy of the invoice and does not
          take payment.
        </p>
      </Card>
    </div>
  );
}
