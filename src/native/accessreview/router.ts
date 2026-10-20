/**
 * native/accessreview/router.ts — HTTP surface for Phase 4.3 native
 * ACCESS-REVIEW / CERTIFICATION-CAMPAIGN slice (campaigns over the tenant's
 * OWN member access + workflow inventory + append-only evidence log).
 * AUTHED ONLY (401 fail-closed upstream, no public share lane):
 *
 *   GET  /api/native/accessreview/campaigns              list campaigns
 *   POST /api/native/accessreview/campaigns              create (gated)
 *   GET  /api/native/accessreview/campaigns/:id          get
 *   POST /api/native/accessreview/campaigns/:id/update|delete|open|close|cancel (gated)
 *   POST /api/native/accessreview/campaigns/:id/reviewers/add|remove (gated)
 *   GET  /api/native/accessreview/campaigns/:id/items    campaign review items
 *   GET  /api/native/accessreview/items/:id              get item
 *   POST /api/native/accessreview/items/:id/attest       attest (gated, `attest` verb)
 *   GET  /api/native/accessreview/evidence?campaignId=   evidence log (append-only)
 *   GET  /api/native/accessreview/evidence/:id           get evidence
 *   GET  /api/native/accessreview/writes                 pending mirror
 *   POST /api/native/accessreview/writes/:apwId/apply|reject  APPROVE/REJECT paths
 *   GET  /api/native/accessreview/audit                  immutable audit
 *
 * Explicit-segment parsing only; every read is tenant-scoped and safe-projected;
 * every mutation flows through src/native/accessreview/gate.ts (validation BEFORE
 * the gate; honest attestations; append-only evidence; the slice never changes
 * access itself).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  executePendingAccessReviewWrite,
  getActionName,
  noteOwnerDecision,
  publicCampaign,
  publicEvidence,
  publicItem,
  submitAccessReviewWrite,
} from "./gate";
import {
  appendAudit,
  getCampaign,
  getEvidence,
  getItem,
  getPendingWriteById,
  listAudit,
  listCampaigns,
  listEvidence,
  listItems,
  listPendingWrites,
} from "./store";
import type { AccessReviewOp } from "./types";

export interface NativeAccessReviewCtx {
  userEmail: string;
  dataDir: string;
}

const jsonError = (error: string, status = 400) => Response.json({ error }, { status });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|not published|accepted|may not|exceeds|locked|rejected|reserved|already on/.test(error);
  if (nf) return json404(error);
  if (bad) return jsonError(error);
  return jsonError(error);
}

const RE = {
  arc: /^arc_[A-Za-z0-9]+$/,
  ari: /^ari_[A-Za-z0-9]+$/,
  aev: /^aev_[A-Za-z0-9]+$/,
  apw: /^apw_[A-Za-z0-9]+$/,
};

async function handleAuthed(req: Request, ctx: NativeAccessReviewCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/accessreview\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const method = req.method;

  // ── campaigns ────────────────────────────────────────────────────────────
  if (seg[0] === "campaigns") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { campaigns: listCampaigns(ctx.dataDir, tenantId).map(publicCampaign) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitAccessReviewWrite(ctx.dataDir, tenantId, "createReviewCampaign", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "create failed");
    }
    if (seg.length === 2 && method === "GET" && RE.arc.test(seg[1] ?? "")) {
      const c = getCampaign(ctx.dataDir, tenantId, seg[1]);
      if (!c) return json404("Campaign not found");
      return Response.json({ data: { campaign: publicCampaign(c) } });
    }
    if (seg.length === 3 && (seg[2] === "update" || seg[2] === "delete" || seg[2] === "open" || seg[2] === "close" || seg[2] === "cancel") && method === "POST" && RE.arc.test(seg[1] ?? "")) {
      const c = getCampaign(ctx.dataDir, tenantId, seg[1]);
      if (!c) return json404("Campaign not found");
      const body = seg[2] === "update" ? await req.json().catch(() => null) : {};
      if (seg[2] === "update" && (!body || typeof body !== "object")) return jsonError("body must be a JSON object");
      const op: AccessReviewOp = seg[2] === "update" ? "updateReviewCampaign" : seg[2] === "delete" ? "deleteReviewCampaign" : seg[2] === "open" ? "openReviewCampaign" : seg[2] === "close" ? "closeReviewCampaign" : "cancelReviewCampaign";
      const res = submitAccessReviewWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), campaignId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    if (seg.length === 4 && (seg[2] === "reviewers" && (seg[3] === "add" || seg[3] === "remove")) && method === "POST" && RE.arc.test(seg[1] ?? "")) {
      const c = getCampaign(ctx.dataDir, tenantId, seg[1]);
      if (!c) return json404("Campaign not found");
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const op: AccessReviewOp = seg[3] === "add" ? "addCampaignReviewer" : "removeCampaignReviewer";
      const res = submitAccessReviewWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), campaignId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    if (seg.length === 3 && seg[2] === "items" && method === "GET" && RE.arc.test(seg[1] ?? "")) {
      const c = getCampaign(ctx.dataDir, tenantId, seg[1]);
      if (!c) return json404("Campaign not found");
      return Response.json({ data: { items: listItems(ctx.dataDir, tenantId, seg[1]).map(publicItem) } });
    }
    return json404("Unknown native access-review endpoint");
  }

  // ── review items ─────────────────────────────────────────────────────────
  if (seg[0] === "items") {
    if (seg.length === 2 && method === "GET" && RE.ari.test(seg[1] ?? "")) {
      const i = getItem(ctx.dataDir, tenantId, seg[1]);
      if (!i) return json404("Item not found");
      return Response.json({ data: { item: publicItem(i) } });
    }
    if (seg.length === 3 && seg[2] === "attest" && method === "POST" && RE.ari.test(seg[1] ?? "")) {
      const i = getItem(ctx.dataDir, tenantId, seg[1]);
      if (!i) return json404("Item not found");
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitAccessReviewWrite(ctx.dataDir, tenantId, "attestReviewItem", { payload: { ...(body as Record<string, unknown>), itemId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "attest failed");
    }
    return json404("Unknown native access-review endpoint");
  }

  // ── evidence (append-only log) ───────────────────────────────────────────
  if (seg[0] === "evidence") {
    if (seg.length === 1 && method === "GET") {
      const campaignId = url.searchParams.get("campaignId") ?? undefined;
      if (campaignId && !RE.arc.test(campaignId)) return json404("Campaign not found");
      if (campaignId && !getCampaign(ctx.dataDir, tenantId, campaignId)) return json404("Campaign not found");
      return Response.json({ data: { evidence: listEvidence(ctx.dataDir, tenantId, campaignId).map(publicEvidence) } });
    }
    if (seg.length === 2 && method === "GET" && RE.aev.test(seg[1] ?? "")) {
      const e = getEvidence(ctx.dataDir, tenantId, seg[1]);
      if (!e) return json404("Evidence not found");
      return Response.json({ data: { evidence: publicEvidence(e) } });
    }
    return json404("Unknown native access-review endpoint");
  }

  // ── pending writes / audit ───────────────────────────────────────────────
  if (seg[0] === "writes") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId).filter((w) => w.status === "pending").map((w) => ({ id: w.id, op: w.op, action: getActionName(w.op), status: w.status, requestedAt: w.requestedAt })) } });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject") && method === "POST" && RE.apw.test(seg[1] ?? "")) {
      const w = getPendingWriteById(ctx.dataDir, tenantId, seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this access-review action");
      if (seg[2] === "apply") {
        const res = executePendingAccessReviewWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        return Response.json({ data: { status: "applied", apwId: res.apwId, id: res.id, alreadyApplied: !!res.alreadyApplied } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", apwId: w.id } });
    }
    return json405();
  }

  if (seg[0] === "audit" && seg.length === 1 && method === "GET") {
    return Response.json({ data: { audit: listAudit(ctx.dataDir, tenantId) } });
  }

  return json404("Unknown native access-review endpoint");
}

/** AUTHED handler (prod-server wires this AFTER the session check). */
export function handleNativeAccessReviewAuthed(req: Request, ctx: NativeAccessReviewCtx): Promise<Response> {
  return handleAuthed(req, ctx).catch((e: any) => {
    const msg = e?.message || String(e);
    if (/required|invalid|cap|exceeds|must|reached|no .* found|may not|accepted|locked|reserved/i.test(msg)) {
      return jsonError(msg);
    }
    try {
      appendAudit(ctx.dataDir, { tenantId: ctx.userEmail, actor: "system", action: "native.accessreview.error", detail: msg });
    } catch { /* best-effort */ }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  });
}

/** Phase 1.1 typed-event registration (mirrors every other native slice). */
export function registerBuiltinNativeAccessReviewEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.accessreview.campaign.created",
    "native.accessreview.campaign.updated",
    "native.accessreview.campaign.deleted",
    "native.accessreview.campaign.opened",
    "native.accessreview.campaign.closed",
    "native.accessreview.campaign.canceled",
    "native.accessreview.reviewer.added",
    "native.accessreview.reviewer.removed",
    "native.accessreview.item.attested",
    "native.accessreview.pending",
    "native.accessreview.applied",
    "native.accessreview.rejected",
  ]) {
    registerNativeEventType(t, base);
  }
}