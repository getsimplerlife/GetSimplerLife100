/**
 * native/invoice/router.ts — HTTP surface for Phase 2.5 invoices.
 *
 * AUTHED (tenant) only — there is NO public invoice share route: an invoice is
 * the final internal deliverable surfaced in the portal deal room + the
 * /portal/invoices page. Routes: /api/native/invoice* — list/create/view/
 * generate/send/delete + writes/apply/reject + audit. Reads are tenant-scoped
 * (ctx.userEmail); every mutation is a GATED write (gate.ts); 404 on any
 * foreign/unknown invoice id (fail-closed, no IDOR).
 *
 * Route parsing uses EXPLICIT SEGMENTS, not a two-capture regex — avoids the
 * Phase 1.4 rowMatch/idMatch shadowing bug class entirely (2.1–2.4 discipline).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  listInvoices,
  getInvoice,
  listPendingWrites,
  getPendingWriteById,
  listAudit,
} from "./store";
import { submitInvoiceWrite, executePendingInvoiceWrite, noteOwnerDecision, createInvoiceMutationFromInput } from "./gate";
import { isInvoiceId } from "./validate";

export interface NativeInvoicesCtx {
  dataDir: string;
  userEmail: string; // tenant id
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
      const res = submitInvoiceWrite(dataDir, tenantId, "create", { data, via: "portal" }, tenantId);
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
        noteOwnerDecision(dataDir, tenantId, ptw.approvalActionId, "rejected", tenantId);
        return Response.json({ data: { status: "rejected", id: ptw.id } });
      }
      const res = executePendingInvoiceWrite(dataDir, tenantId, ptw.approvalActionId, tenantId);
      if (!res.ok) return gateErrorStatus(res.reason);
      return Response.json({ data: { status: res.alreadyApplied ? "alreadyApplied" : "applied", invoiceId: res.record.id, alreadyApplied: !!res.alreadyApplied } });
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
      const res = submitInvoiceWrite(dataDir, tenantId, "delete", { invoiceId, via: "portal" }, tenantId);
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
    const res = submitInvoiceWrite(dataDir, tenantId, verb, { invoiceId, via: "portal" }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", invoiceId: res.invoice.id, autonomy: res.autonomy } });
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
  for (const t of ["native.invoice.created", "native.invoice.generated", "native.invoice.sent", "native.invoice.deleted"]) {
    registerNativeEventType(t, base);
  }
}