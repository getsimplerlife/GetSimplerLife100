/**
 * native/invoice/generate.ts — invoice HTML + PDF generation (Phase 2.5).
 *
 * Reuses the Phase 1.2 safe-HTML → PDF renderer (renderHtmlDocument) and the
 * document store (Phase 1.2) for durable, add-only versioned PDF records:
 *   - a per-tenant "invoices" bucket is auto-created on first use,
 *   - each generation is a NEW doc record (first draft) or an add-only VERSION
 *     of the same doc record (send → v2) — identical discipline to proposals
 *     (2.1) and the doc store,
 *   - every user-controlled string is HTML-escaped BEFORE it enters the safe
 *     subset renderer (no markup injection; renderer fails-closed on unknown
 *     tags/attributes),
 *   - money math is all in integer cents (amountDueCents: qty × unitPriceCents)
 *     — no float drift in totals or display.
 */
import { escapeHtmlValue, renderHtmlDocument, type RenderedPdf } from "../documents/pdf";
import { createDocument, updateDocument, generateDocEntityId, getDoc } from "../documents/store";
import { getBucket, createBucket } from "../documents/store";
import { MAX_INVOICE_LINE_ITEMS, type InvoiceRecord } from "./types";

export const INVOICE_DOC_BUCKET = "invoices";

/** Integer cents math — no float drift anywhere in totals. */
export function lineTotalCents(li: { qty: number; unitPriceCents: number }): number {
  return Math.round(li.qty * li.unitPriceCents);
}
export function invoiceTotalCents(inv: Pick<InvoiceRecord, "lineItems">): number {
  return inv.lineItems.reduce((sum, li) => sum + lineTotalCents(li), 0);
}
export function formatCurrency(cents: number, currency: string): string {
  const v = (cents / 100).toFixed(2);
  return `${currency} ${v}`;
}

/**
 * Build the invoice HTML body. All user text escaped; the line-item table is
 * generated programmatically (no {{field}} placeholders in the pricing block).
 * Client-facing strings on the invoice body are the deal room customer name
 * plus the snapped proposal line descriptions — each escaped via escapeHtmlValue.
 */
export function invoiceHtml(inv: InvoiceRecord, billTo: { name: string }): string {
  const e = escapeHtmlValue;
  const totalCents = invoiceTotalCents(inv);
  const rows = inv.lineItems
    .map((li) => {
      const line = lineTotalCents(li);
      return `<tr><td>${e(li.description)}</td><td align="right">${e(String(li.qty))}</td><td align="right">${e(formatCurrency(li.unitPriceCents, inv.currency))}</td><td align="right">${e(formatCurrency(line, inv.currency))}</td></tr>`;
    })
    .join("");
  const issued = new Date(inv.createdAt).toISOString().slice(0, 10);
  return `
<h1>Invoice ${e(inv.invoiceNumber)}</h1>
<p><strong>Bill to:</strong> ${e(billTo.name)}</p>
<p><strong>Issued:</strong> ${e(issued)} · <strong>Invoice:</strong> ${e(inv.id)} · <strong>Status:</strong> ${e(inv.status)}</p>
<hr />
<h2>Services</h2>
<table>
<thead><tr><th>Description</th><th align="right">Qty</th><th align="right">Unit price</th><th align="right">Amount</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p><strong>Total due:</strong> ${e(formatCurrency(totalCents, inv.currency))}</p>
<hr />
<p><em>Posting to the customer's accounting books is handled by the connected accounting adapter (Xero/QuickBooks) and is labeled as such. This invoice is the native deliverable generated from the deal room.</em></p>
`.trim();
}

/**
 * Render the invoice to PDF bytes via the Phase 1.2 safe-HTML renderer.
 * Throws on unsafe HTML / unresolved placeholders (fail-closed).
 */
export function renderInvoicePdf(inv: InvoiceRecord, billTo: { name: string }): RenderedPdf {
  const html = invoiceHtml(inv, billTo);
  return renderHtmlDocument(html, {
    pageNumbers: true,
    footerText: `Invoice ${inv.invoiceNumber} · ${inv.id}`,
  });
}

/** Ensure the per-tenant "invoices" document bucket exists (auto-created). */
export function ensureInvoiceBucket(dataDir: string, tenantId: string): { id: string } {
  const existing = getBucket(dataDir, tenantId, INVOICE_DOC_BUCKET);
  if (existing) return existing;
  const now = new Date().toISOString();
  const bucket = {
    id: generateDocEntityId("bkt"),
    tenantId,
    name: INVOICE_DOC_BUCKET,
    description: "Auto-created invoice PDF bucket (Phase 2.5)",
    createdBy: tenantId,
    createdAt: now,
  };
  createBucket(dataDir, bucket);
  return bucket;
}

/**
 * Store the rendered PDF as a native document record:
 *   - first generation → new doc record (kind "invoice"),
 *   - subsequent generation (send) → add-only VERSION of the existing record
 *     (cap 24 handled by updateDocument).
 * Returns the doc id. THROWS (fail-closed) if the replace did not land.
 */
export function storeInvoicePdf(
  dataDir: string,
  tenantId: string,
  invoice: InvoiceRecord,
  rendered: RenderedPdf,
  actor: string,
  existingDocId: string | null,
): string {
  const bucket = ensureInvoiceBucket(dataDir, tenantId);
  const now = new Date().toISOString();
  if (existingDocId) {
    const existing = getDoc(dataDir, tenantId, existingDocId);
    if (existing) {
      const updated = updateDocument(
        dataDir,
        tenantId,
        existingDocId,
        {
          name: existing.name,
          checksum: rendered.checksum,
          sizeBytes: rendered.bytes.byteLength,
          pages: rendered.pages,
          textProjection: rendered.text.slice(0, 200_000),
        },
        rendered.bytes,
        actor,
      );
      // Fail-closed: never return a docId whose bytes were NOT replaced.
      if (!updated) throw new Error("failed to update invoice PDF record (add-only version)");
      return existingDocId;
    }
  }
  const docId = generateDocEntityId("doc");
  createDocument(
    dataDir,
    {
      id: docId,
      tenantId,
      bucketId: bucket.id,
      name: `Invoice ${invoice.invoiceNumber} v${invoice.version}`,
      kind: "invoice",
      textProjection: rendered.text.slice(0, 200_000),
      acl: { owner: tenantId, readers: [] },
      version: 1,
      checksum: rendered.checksum,
      sizeBytes: rendered.bytes.byteLength,
      pages: rendered.pages,
      history: [], // version 1 is the record itself; add-only history starts empty
      createdAt: now,
      updatedAt: now,
      updatedBy: actor,
    },
    rendered.bytes,
  );
  return docId;
}

export { MAX_INVOICE_LINE_ITEMS };