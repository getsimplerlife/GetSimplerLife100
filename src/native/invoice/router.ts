/**
 * native/invoice/router.ts — HTTP surface for Phase 2.5 invoices.
 *
 * AUTHED (tenant): /api/native/invoice* — list/create/view/generate/send/
 * delete + writes/apply/reject + audit. Reads are tenant-scoped
 * (ctx.userEmail); every mutation is a GATED write (gate.ts); 404 on any
 * foreign/unknown invoice id (fail-closed, no IDOR).
 *
 * PUBLIC (customer): /api/native/invoice/share/:slug[/pdf] — the read-only
 * invoice the customer received by email. Same signed-slug pattern as
 * proposals (2.1): the global index maps slug → tenantId ONLY, the slug is
 * unguessable, and the lane is READ-ONLY. Fail-closed rules:
 *   - unknown / malformed / stale slug → 404,
 *   - an invoice that is NOT "sent" → 404 (a draft or a failed delivery is
 *     never public),
 *   - the view carries ONLY that one invoice (number, amounts, line items,
 *     due date, issuer, bill-to) — no ids, no listing, no other records.
 * There is deliberately NO payment endpoint here (payment is out of scope).
 *
 * Route parsing uses EXPLICIT SEGMENTS, not a two-capture regex — avoids the
 * Phase 1.4 rowMatch/idMatch shadowing bug class entirely (2.1–2.4 discipline).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  listInvoices,
  getInvoice,
  getInvoiceBySlug,
  lookupInvoiceShareTenant,
  listPendingWrites,
  getPendingWriteById,
  listAudit,
} from "./store";
import { submitInvoiceWrite, executePendingInvoiceWrite, noteOwnerDecision, createInvoiceMutationFromInput } from "./gate";
import { isInvoiceId } from "./validate";
import { getDealRoom } from "../dealroom/store";
import { readDocumentBytes, getDoc } from "../documents/store";
import type { InvoiceRecord } from "./types";

export interface NativeInvoicesCtx {
  dataDir: string;
  userEmail: string; // tenant id
}
export interface NativeInvoicePublicCtx {
  dataDir: string;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Body must be a JSON object");
    return v as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON body: ${msg}`);
  }
}
const json400 = (error: string) => Response.json({ error }, { status: 400 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided|unknown linkedDealRoomId|linked deal room has no/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 500 });
}

/** Tenant-facing summary — the full record (internal surface). */
function summary(i: {
  id: string;
  invoiceNumber: string;
  linkedDealRoomId: string;
  currency: string;
  amountDueCents: number;
  status: string;
  docId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}) {
  return i;
}

/**
 * Customer-facing view of a SENT invoice — only what that invoice says.
 * No record ids, no docId, no deal-room id, no audit, no other records.
 */
export function publicInvoiceView(inv: InvoiceRecord, billToName: string): Record<string, unknown> {
  return {
    invoiceNumber: inv.invoiceNumber,
    issuerName: inv.tenantId, // the workspace that issued it (its account id)
    billToName,
    currency: inv.currency,
    lineItems: inv.lineItems.map((li) => ({
      description: li.description,
      qty: li.qty,
      unitPriceCents: li.unitPriceCents,
      amountCents: Math.round(li.qty * li.unitPriceCents),
    })),
    amountDueCents: inv.amountDueCents,
    issuedAt: inv.createdAt,
    dueDate: inv.dueDate,
    status: inv.status,
    hasPdf: inv.docId !== null,
    pdfPath: `/api/native/invoice/share/${inv.shareSlug}/pdf`,
  };
}

async function handleAuthedAsync(req: Request, ctx: NativeInvoicesCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/invoice\/?/, "").split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const dataDir = ctx.dataDir;

  // ── /api/native/invoice (index) — list / create ──
  if (seg.length === 0) {
    if (req.method === "GET") {
      // Optional ?dealRoomId= filter for the deal-room panel.
      const filter = url.searchParams.get("dealRoomId");
      const rows = listInvoices(dataDir, tenantId)
        .filter((i) => !filter || i.linkedDealRoomId === filter)
        .map((i) => summary(i));
      return Response.json({ data: rows });
    }
    if (req.method === "POST") {
      const b = parseJsonObject(await req.text());
      // Fail-closed: a client-supplied id on create is by definition forged —
      // reject the RAW body BEFORE any normalization (checklists 2.3 / deal room 2.4).
      if (b.id !== undefined) return json400("invalid id on create (ids are server-assigned)");
      if (b.status !== undefined) return json400("status must not be set on create (invoices always start as draft)");
      const data = createInvoiceMutationFromInput(b);
      const res = await submitInvoiceWrite(dataDir, tenantId, "create", { data, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", invoiceId: res.invoice.id, autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/invoice/writes — pending writes + apply/reject decisions ──
  if (seg[0] === "writes") {
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({
        data: listPendingWrites(dataDir, tenantId).map((w) => ({
          id: w.id,
          op: w.op,
          invoiceId: w.invoiceId,
          status: w.status,
          approvalActionId: w.approvalActionId,
          via: w.payload.via ?? "portal",
          requestedBy: w.requestedBy,
          requestedAt: w.requestedAt,
        })),
      });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject")) {
      if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      const ptw = getPendingWriteById(dataDir, tenantId, seg[1]);
      if (!ptw || ptw.tenantId !== tenantId) return json404("no pending write for this invoice action");
      if (seg[2] === "reject") {
        await noteOwnerDecision(dataDir, tenantId, ptw.approvalActionId, "rejected", tenantId);
        return Response.json({ data: { status: "rejected", id: ptw.id } });
      }
      const res = await executePendingInvoiceWrite(dataDir, tenantId, ptw.approvalActionId, tenantId);
      if (!res.ok) return gateErrorStatus(res.reason);
      return Response.json({ data: { status: res.alreadyApplied ? "alreadyApplied" : "applied", invoiceId: res.record.id, invoiceStatus: res.record.status, alreadyApplied: !!res.alreadyApplied } });
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/invoice/audit ──
  if (seg[0] === "audit") {
    if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
    return Response.json({ data: listAudit(dataDir, tenantId) });
  }

  // ── /api/native/invoice/:id[/verb] ──
  if (!isInvoiceId(seg[0])) return json404("Unknown native invoice endpoint");
  const invoiceId = seg[0];
  const invoice = getInvoice(dataDir, tenantId, invoiceId);
  if (!invoice) return json404("Invoice not found"); // foreign/stranger → 404 (no IDOR)

  if (seg.length === 1) {
    if (req.method === "GET") return Response.json({ data: summary(invoice) });
    if (req.method === "DELETE") {
      const res = await submitInvoiceWrite(dataDir, tenantId, "delete", { invoiceId, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/invoice/:id/<verb> — lifecycle transitions ──
  const verb = seg[1];
  if (verb === "generate" || verb === "send") {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    // `send` may carry an explicit recipient (validated BEFORE the gate).
    // An empty body is fine — the record's own customerEmail is then used.
    let data: { customerEmail?: string } | undefined;
    if (verb === "send") {
      const raw = await req.text().catch(() => "");
      if (raw.trim().length > 0) {
        const b = parseJsonObject(raw);
        if (b.customerEmail !== undefined && typeof b.customerEmail !== "string") {
          return json400("customerEmail must be a valid email address");
        }
        data = { customerEmail: b.customerEmail as string | undefined };
      }
    }
    const res = await submitInvoiceWrite(dataDir, tenantId, verb, { invoiceId, data, via: "portal" }, tenantId);
    if (res.applied) {
      return Response.json({
        data: {
          status: "applied",
          invoiceId: res.invoice.id,
          invoiceStatus: res.invoice.status,
          delivered: res.invoice.status === "sent",
          lastAttempt: res.invoice.lastAttempt,
          autonomy: res.autonomy,
        },
      });
    }
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error);
  }
  return json404("Unknown native invoice endpoint");
}

export function handleNativeInvoicesAuthed(req: Request, ctx: NativeInvoicesCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Invalid JSON|Body must/.test(msg)) return json400(msg);
    return Response.json({ error: "Internal error" }, { status: 500 });
  });
}

// ── PUBLIC share (customer read-only view + PDF download) ───────────────────
async function handleShareAsync(req: Request, ctx: NativeInvoicePublicCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/invoice\/share\/?/, "").split("/").filter(Boolean);
  if (seg.length === 0 || seg.length > 2) return json404("Unknown invoice share link");
  const slug = seg[0];
  if (!/^si_[A-Za-z0-9_-]+$/.test(slug)) return json404("Unknown invoice share link");
  const tenantId = lookupInvoiceShareTenant(ctx.dataDir, slug);
  if (!tenantId) return json404("Unknown invoice share link"); // unknown / retired slug
  const invoice = getInvoiceBySlug(ctx.dataDir, tenantId, slug);
  if (!invoice) return json404("Unknown invoice share link"); // stale index entry
  // FAIL-CLOSED: only a genuinely SENT invoice is public. A draft, an in-flight
  // dispatch (queued) or a failed delivery never resolves on the public lane.
  if (invoice.status !== "sent") return json404("Unknown invoice share link");

  if (seg.length === 2) {
    if (seg[1] !== "pdf") return json404("Unknown invoice share link");
    if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
    if (!invoice.docId) return json404("No PDF on file for this invoice");
    const doc = getDoc(ctx.dataDir, tenantId, invoice.docId);
    if (!doc) return json404("PDF record missing");
    const bytes = readDocumentBytes(ctx.dataDir, tenantId, invoice.docId);
    if (!bytes) return json404("PDF bytes missing");
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }
  if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const dealRoom = getDealRoom(ctx.dataDir, tenantId, invoice.linkedDealRoomId);
  return Response.json(
    { data: publicInvoiceView(invoice, dealRoom?.customerName || "Customer") },
    { headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } },
  );
}

/** Public lane entry point — never leaks internals, never throws past the 404. */
export function handleNativeInvoiceShare(req: Request, ctx: NativeInvoicePublicCtx): Promise<Response> {
  return handleShareAsync(req, ctx).catch(() => json404("Unknown invoice share link"));
}

// ── Built-in typed events (Phase 1.1 registry pattern, 2.1–2.4) ─────────────
export function registerBuiltinNativeInvoiceEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.invoiceId !== "string" || typeof p.eventId !== "string") {
        return { ok: false, reason: "payload needs invoiceId and eventId" };
      }
      return { ok: true };
    },
  };
  for (const t of [
    "native.invoice.created",
    "native.invoice.generated",
    "native.invoice.queued",
    "native.invoice.sent",
    "native.invoice.failed",
    "native.invoice.deleted",
  ]) {
    registerNativeEventType(t, base);
  }
}