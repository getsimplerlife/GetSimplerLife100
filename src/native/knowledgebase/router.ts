/**
 * native/knowledgebase/router.ts — HTTP surface for Phase 4.4 native
 * KNOWLEDGE-BASE / HELP-CENTER slice (article management: draft → published →
 * archived, categories, searchable tenant-owned content + AI answer-draft
 * suggestions, config-only OFF by default). AUTHED ONLY (401 fail-closed
 * upstream, NO public share lane):
 *
 *   GET  /api/native/knowledgebase/categories              list categories
 *   POST /api/native/knowledgebase/categories              create (gated)
 *   GET  /api/native/knowledgebase/categories/:id          get category
 *   POST /api/native/knowledgebase/categories/:id/update|delete (gated)
 *   GET  /api/native/knowledgebase/articles                list articles
 *   POST /api/native/knowledgebase/articles                create (gated)
 *   GET  /api/native/knowledgebase/articles/:id            get article
 *   POST /api/native/knowledgebase/articles/:id/update|publish|archive|delete (gated)
 *   GET  /api/native/knowledgebase/search?q=               search tenant's OWN articles
 *   GET  /api/native/knowledgebase/drafts                  answer-draft records
 *   GET  /api/native/knowledgebase/drafts/:id              get answer draft
 *   POST /api/native/knowledgebase/drafts/request          request answer draft (gated)
 *   GET  /api/native/knowledgebase/writes                  pending mirror
 *   POST /api/native/knowledgebase/writes/:kbwId/apply|reject  APPROVE/REJECT paths
 *   GET  /api/native/knowledgebase/audit                   immutable audit
 *
 * Explicit-segment parsing only; every read is tenant-scoped and safe-projected;
 * every mutation flows through src/native/knowledgebase/gate.ts (validation
 * BEFORE the gate; honest answer drafts with a disabled note — no fabricated
 * answers; the slice only ever reads/writes the tenant's OWN content).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  executePendingKnowledgeBaseWrite,
  getActionName,
  noteOwnerDecision,
  publicAnswerDraft,
  publicArticle,
  publicCategory,
  submitKnowledgeBaseWrite,
} from "./gate";
import {
  appendAudit,
  getAnswerDraft,
  getArticle,
  getCategory,
  getPendingWriteById,
  listAnswerDrafts,
  listArticles,
  listAudit,
  listCategories,
  listPendingWrites,
  searchArticles,
} from "./store";
import type { KbOp } from "./types";

export interface NativeKnowledgeBaseCtx {
  userEmail: string;
  dataDir: string;
}

const jsonError = (error: string, status = 400) => Response.json({ error }, { status });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|not published|accepted|may not|exceeds|locked|rejected|reserved|already on|still has/.test(error);
  if (nf) return json404(error);
  if (bad) return jsonError(error);
  return jsonError(error);
}

const RE = {
  kbc: /^kbc_[A-Za-z0-9]+$/,
  kba: /^kba_[A-Za-z0-9]+$/,
  kbd: /^kbd_[A-Za-z0-9]+$/,
  kbw: /^kbw_[A-Za-z0-9]+$/,
};

async function handleAuthed(req: Request, ctx: NativeKnowledgeBaseCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/knowledgebase\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const method = req.method;

  // ── categories ────────────────────────────────────────────────────────────
  if (seg[0] === "categories") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { categories: listCategories(ctx.dataDir, tenantId).map(publicCategory) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitKnowledgeBaseWrite(ctx.dataDir, tenantId, "createCategory", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "create failed");
    }
    if (seg.length === 2 && method === "GET" && RE.kbc.test(seg[1] ?? "")) {
      const c = getCategory(ctx.dataDir, tenantId, seg[1]);
      if (!c) return json404("Category not found");
      return Response.json({ data: { category: publicCategory(c) } });
    }
    if (seg.length === 3 && (seg[2] === "update" || seg[2] === "delete") && method === "POST" && RE.kbc.test(seg[1] ?? "")) {
      const c = getCategory(ctx.dataDir, tenantId, seg[1]);
      if (!c) return json404("Category not found");
      const body = seg[2] === "update" ? await req.json().catch(() => null) : {};
      if (seg[2] === "update" && (!body || typeof body !== "object")) return jsonError("body must be a JSON object");
      const op: KbOp = seg[2] === "update" ? "updateCategory" : "deleteCategory";
      const res = submitKnowledgeBaseWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), categoryId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    return json404("Unknown native knowledge-base endpoint");
  }

  // ── articles ──────────────────────────────────────────────────────────────
  if (seg[0] === "articles") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { articles: listArticles(ctx.dataDir, tenantId).map(publicArticle) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitKnowledgeBaseWrite(ctx.dataDir, tenantId, "createArticle", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "create failed");
    }
    if (seg.length === 2 && method === "GET" && RE.kba.test(seg[1] ?? "")) {
      const a = getArticle(ctx.dataDir, tenantId, seg[1]);
      if (!a) return json404("Article not found");
      return Response.json({ data: { article: publicArticle(a) } });
    }
    if (seg.length === 3 && (seg[2] === "update" || seg[2] === "publish" || seg[2] === "archive" || seg[2] === "delete") && method === "POST" && RE.kba.test(seg[1] ?? "")) {
      const a = getArticle(ctx.dataDir, tenantId, seg[1]);
      if (!a) return json404("Article not found");
      const body = seg[2] === "update" ? await req.json().catch(() => null) : {};
      if (seg[2] === "update" && (!body || typeof body !== "object")) return jsonError("body must be a JSON object");
      const op: KbOp = seg[2] === "update" ? "updateArticle" : seg[2] === "publish" ? "publishArticle" : seg[2] === "archive" ? "archiveArticle" : "deleteArticle";
      const res = submitKnowledgeBaseWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), articleId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    return json404("Unknown native knowledge-base endpoint");
  }

  // ── search (tenant's OWN articles) ────────────────────────────────────────
  if (seg[0] === "search" && seg.length === 1 && method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const hits = searchArticles(ctx.dataDir, tenantId, q);
    return Response.json({ data: { query: q, articles: hits.map((a) => publicArticle(a)) } });
  }

  // ── answer drafts (honest disabled records) ───────────────────────────────
  if (seg[0] === "drafts") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { drafts: listAnswerDrafts(ctx.dataDir, tenantId).map(publicAnswerDraft) } });
    }
    if (seg.length === 2 && seg[1] === "request" && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitKnowledgeBaseWrite(ctx.dataDir, tenantId, "requestAnswerDraft", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "request failed");
    }
    if (seg.length === 2 && method === "GET" && RE.kbd.test(seg[1] ?? "")) {
      const d = getAnswerDraft(ctx.dataDir, tenantId, seg[1]);
      if (!d) return json404("Answer draft not found");
      return Response.json({ data: { draft: publicAnswerDraft(d) } });
    }
    return json404("Unknown native knowledge-base endpoint");
  }

  // ── pending writes / audit ────────────────────────────────────────────────
  if (seg[0] === "writes") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId).filter((w) => w.status === "pending").map((w) => ({ id: w.id, op: w.op, action: getActionName(w.op), status: w.status, requestedAt: w.requestedAt })) } });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject") && method === "POST" && RE.kbw.test(seg[1] ?? "")) {
      const w = getPendingWriteById(ctx.dataDir, tenantId, seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this knowledge-base action");
      if (seg[2] === "apply") {
        const res = executePendingKnowledgeBaseWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        return Response.json({ data: { status: "applied", kbwId: res.kbwId, id: res.id, alreadyApplied: !!res.alreadyApplied } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", kbwId: w.id } });
    }
    return json405();
  }

  if (seg[0] === "audit" && seg.length === 1 && method === "GET") {
    return Response.json({ data: { audit: listAudit(ctx.dataDir, tenantId) } });
  }

  return json404("Unknown native knowledge-base endpoint");
}

/** AUTHED handler (prod-server wires this AFTER the session check). */
export function handleNativeKnowledgeBaseAuthed(req: Request, ctx: NativeKnowledgeBaseCtx): Promise<Response> {
  return handleAuthed(req, ctx).catch((e: any) => {
    const msg = e?.message || String(e);
    if (/required|invalid|cap|exceeds|must|reached|no .* found|may not|accepted|locked|reserved/i.test(msg)) {
      return jsonError(msg);
    }
    try {
      appendAudit(ctx.dataDir, { tenantId: ctx.userEmail, actor: "system", action: "native.knowledgebase.error", detail: msg });
    } catch { /* best-effort */ }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  });
}

/** Phase 1.1 typed-event registration (mirrors every other native slice). */
export function registerBuiltinNativeKnowledgeBaseEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.knowledgebase.category.created",
    "native.knowledgebase.category.updated",
    "native.knowledgebase.category.deleted",
    "native.knowledgebase.article.created",
    "native.knowledgebase.article.updated",
    "native.knowledgebase.article.published",
    "native.knowledgebase.article.archived",
    "native.knowledgebase.article.deleted",
    "native.knowledgebase.answerdraft.requested",
    "native.knowledgebase.pending",
    "native.knowledgebase.applied",
    "native.knowledgebase.rejected",
  ]) {
    registerNativeEventType(t, base);
  }
}