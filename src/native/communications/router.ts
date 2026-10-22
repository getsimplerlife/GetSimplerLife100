/**
 * native/communications/router.ts — HTTP surface for the P1-4 native
 * COMMUNICATIONS slice (portal "Communications" working Reply). AUTHED ONLY
 * (401 fail-closed upstream via the prod-server session check, NO public
 * share lane):
 *
 *   GET  /api/native/communications                        list thread messages
 *   POST /api/native/communications/messages/:id/reply    compose reply (gated)
 *   GET  /api/native/communications/writes                pending mirror
 *   POST /api/native/communications/writes/:id/apply      APPROVE (executes once)
 *   POST /api/native/communications/writes/:id/reject     REJECT (discards)
 *   GET  /api/native/communications/audit                 immutable audit
 *
 * Explicit-segment parsing only; every read is tenant-scoped and safe-projected;
 * every mutation flows through gate.ts (validation BEFORE the gate; the single
 * mutation `createReply` rides the Approval Queue verb-first — "create" ∈
 * WRITE_VERB; classification test extended). Honest outcomes only: the reply
 * is saved to the tenant's OWN communications log — this slice has NO
 * email-send path and never claims one ("saved to your communications log").
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  ACTION_NAME,
  executePendingCommunicationsWrite,
  noteOwnerDecision,
  publicMessage,
  submitCommunicationsWrite,
} from "./gate";
import {
  appendAudit,
  getMessage,
  listAudit,
  listMessages,
  listPendingWrites,
} from "./store";
import type { CommunicationsOp } from "./gate";

export interface NativeCommunicationsCtx {
  userEmail: string;
  dataDir: string;
}

const jsonError = (error: string, status = 400) => Response.json({ error }, { status });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|may not|exceeds|still has/.test(error);
  if (nf) return json404(error);
  if (bad) return jsonError(error);
  return jsonError(error);
}

const RE = {
  cmm: /^cmm_[A-Za-z0-9]+$/,
  cmw: /^cmw_[A-Za-z0-9]+$/,
};

async function handleAuthed(req: Request, ctx: NativeCommunicationsCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/communications\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const method = req.method;

  // ── thread list ───────────────────────────────────────────────────────────
  if (seg.length === 0 && method === "GET") {
    return Response.json({ data: { messages: listMessages(ctx.dataDir, tenantId).map(publicMessage) } });
  }

  // ── compose reply (gated) ─────────────────────────────────────────────────
  if (seg.length === 3 && seg[0] === "messages" && seg[2] === "reply" && method === "POST") {
    const parentId = seg[1] ?? "";
    const parent = getMessage(ctx.dataDir, tenantId, parentId);
    if (!parent) return json404("Message not found"); // stranger/unknown → 404 (no IDOR)
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
    const op: CommunicationsOp = "createReply";
    const res = submitCommunicationsWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), replyTo: parentId }, via: "portal" }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error ?? "create failed");
  }

  // ── pending writes / audit ────────────────────────────────────────────────
  if (seg[0] === "writes") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId).filter((w) => w.status === "pending").map((w) => ({ id: w.id, action: w.action, status: w.status, requestedAt: w.requestedAt, replyTo: (w.payload?.replyTo as string | undefined) ?? null, subject: (w.payload?.subject as string | undefined) ?? null })) } });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject") && method === "POST" && RE.cmw.test(seg[1] ?? "")) {
      const w = listPendingWrites(ctx.dataDir, tenantId).find((x) => x.id === seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this communications action");
      if (seg[2] === "apply") {
        const res = executePendingCommunicationsWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        return Response.json({ data: { status: "applied", cmwId: res.cmwId, id: res.id, alreadyApplied: !!res.alreadyApplied } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", cmwId: w.id } });
    }
    return json405();
  }

  if (seg[0] === "audit" && seg.length === 1 && method === "GET") {
    return Response.json({ data: { audit: listAudit(ctx.dataDir, tenantId) } });
  }

  return json404("Unknown native communications endpoint");
}

/** AUTHED handler (prod-server wires this AFTER the session check). */
export function handleNativeCommunicationsAuthed(req: Request, ctx: NativeCommunicationsCtx): Promise<Response> {
  return handleAuthed(req, ctx).catch((e: any) => {
    const msg = e?.message || String(e);
    if (/required|invalid|cap|exceeds|must|reached|no .* found|may not|accepted|locked|reserved/i.test(msg)) {
      return jsonError(msg);
    }
    try {
      appendAudit(ctx.dataDir, { tenantId: ctx.userEmail, actor: "system", action: "native.communications.error", detail: msg });
    } catch { /* best-effort */ }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  });
}

/** Phase 1.1 typed-event registration (mirrors every other native slice). */
export function registerBuiltinNativeCommunicationsEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.communications.reply.pending",
    "native.communications.reply.applied",
    "native.communications.reply.rejected",
  ]) {
    registerNativeEventType(t, base);
  }
}

export { ACTION_NAME };