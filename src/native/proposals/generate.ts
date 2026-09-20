/**
 * native/proposals/generate.ts — proposal PDF generation (Phase 2.1).
 *
 * Reuses the Phase 1.2 safe-HTML → PDF renderer (renderHtmlDocument) and the
 * document store (Phase 1.2) for durable, add-only versioned PDF records:
 *   - a per-tenant "proposals" bucket is auto-created on first use,
 *   - each generation is a NEW doc record (draft) or an add-only VERSION of
 *     the same doc record (send → v2) — identical discipline to the doc store.
 *   - every user-controlled string is HTML-escaped BEFORE it enters the safe
 *     subset renderer (no markup injection; renderer fails-closed on unknown
 *     tags/attributes),
 *   - money math is done in integer cents for stable totals.
 *
 * The signatures page is a PLACEHOLDER box — real e-sign arrives in Phase 2.2.
 */
import { escapeHtmlValue, renderHtmlDocument, type RenderedPdf } from "../documents/pdf";
import { createDocument, updateDocument, generateDocEntityId, getDoc } from "../documents/store";
import { getBucket, createBucket } from "../documents/store";
import { PROPOSAL_DOC_BUCKET, type ProposalRecord } from "./types";

export { sha256Of } from "../documents/store";

/** Integer cents math — stable totals regardless of float representation. */
function toCents(n: number): number {
  return Math.round(n * 100);
}
export function lineTotalCents(li: { qty: number; unitPrice: number }): number {
  return Math.round(toCents(li.unitPrice) * li.qty);
}
export function proposalTotalCents(p: Pick<ProposalRecord, "lineItems">): number {
  return p.lineItems.reduce((sum, li) => sum + lineTotalCents(li), 0);
}
export function formatCurrency(cents: number, currency: string): string {
  const v = (cents / 100).toFixed(2);
  return `${currency} ${v}`;
}

/**
 * Build the proposal HTML body from a record. All user text is escaped; the
 * line-item table is generated programmatically (no {{field}} placeholders in
 * the pricing block — mergeFields would reject scalar-only values anyway).
 */
export function proposalHtml(p: ProposalRecord, opts?: { final?: boolean }): string {
  const e = escapeHtmlValue;
  const totalCents = proposalTotalCents(p);
  const rows = p.lineItems
    .map((li) => {
      const line = lineTotalCents(li);
      return `<tr><td>${e(li.description)}</td><td align="right">${e(String(li.qty))}</td><td align="right">${e(formatCurrency(toCents(li.unitPrice), p.currency))}</td><td align="right">${e(formatCurrency(line, p.currency))}</td></tr>`;
    })
    .join("");
  const issued = new Date(p.createdAt).toISOString().slice(0, 10);
  const signatureBlock = opts?.final
    ? `<div><h3>Accepted by</h3><p>${e(p.clientName)} — ${e(p.currency)} ${e(
        formatCurrency(totalCents, p.currency),
      )}</p><p><strong>${e(p.status.toUpperCase())}</strong> on ${e(p.approvedAt?.slice(0, 10) ?? "")}</p><p>Authorized signature capture arrives with Phase 2.2 e-sign.</p></div>`
    : `<div><h3>Signature</h3><p>Authorized signature — to be completed after approval (Phase 2.2 e-sign).</p></div>`;
  return `
<h1>${e(p.title)}</h1>
<p><strong>Prepared for:</strong> ${e(p.clientName)}${p.clientCompany ? ` — ${e(p.clientCompany)}` : ""}${p.clientEmail ? ` — ${e(p.clientEmail)}` : ""}</p>
<p><strong>Issued:</strong> ${e(issued)} · <strong>Valid for:</strong> ${e(String(p.validityDays))} days · <strong>Proposal:</strong> ${e(p.id)}</p>
<hr />
<h2>Scope of work</h2>
<table>
<thead><tr><th>Description</th><th align="right">Qty</th><th align="right">Unit price</th><th align="right">Amount</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p><strong>Total:</strong> ${e(formatCurrency(totalCents, p.currency))}</p>
<hr />
<h2>Terms</h2>
<p>${e(p.terms || "Standard terms apply. Payment due within 30 days of invoice.")}</p>
${signatureBlock}
`.trim();
}

/**
 * Render the proposal to PDF bytes via the Phase 1.2 safe-HTML renderer.
 * Throws on unsafe HTML / unresolved placeholders (fail-closed).
 */
export function renderProposalPdf(proposal: ProposalRecord, opts?: { logo?: string; final?: boolean; footerText?: string }): RenderedPdf {
  const html = proposalHtml(proposal, { final: opts?.final });
  return renderHtmlDocument(html, {
    pageNumbers: true,
    logo: opts?.logo,
    footerText: opts?.footerText ?? `Proposal ${proposal.id}`,
  });
}

/** Ensure the per-tenant "proposals" document bucket exists (auto-created). */
export function ensureProposalBucket(dataDir: string, tenantId: string): { id: string } {
  const existing = getBucket(dataDir, tenantId, PROPOSAL_DOC_BUCKET);
  if (existing) return existing;
  const now = new Date().toISOString();
  const bucket = {
    id: generateDocEntityId("bkt"),
    tenantId,
    name: PROPOSAL_DOC_BUCKET,
    description: "Auto-created proposal PDF bucket (Phase 2.1)",
    createdBy: tenantId,
    createdAt: now,
  };
  createBucket(dataDir, bucket);
  return bucket;
}

/**
 * Store the rendered PDF as a native document record:
 *   - first generation → new doc record (kind "proposal"),
 *   - subsequent generation (send) → add-only VERSION of the existing record
 *     (cap 24 handled by updateDocument).
 * Returns the doc id.
 */
export function storeProposalPdf(
  dataDir: string,
  tenantId: string,
  proposal: ProposalRecord,
  rendered: RenderedPdf,
  actor: string,
  existingDocId: string | null,
): string {
  const bucket = ensureProposalBucket(dataDir, tenantId);
  const now = new Date().toISOString();
  if (existingDocId) {
    const existing = getDoc(dataDir, tenantId, existingDocId);
    if (existing) {
      updateDocument(
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
      name: `Proposal ${proposal.id} v${proposal.version}`,
      kind: "proposal",
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