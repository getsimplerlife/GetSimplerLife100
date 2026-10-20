/**
 * native/dedupe/router.ts — HTTP surface for Phase 4.2 native DEDUPE/MDM
 * (match rules + quality rules + scan-run ledger + merge suggestions +
 * non-destructive record identities over the tenant's OWN 1.4 records).
 * AUTHED ONLY (401 fail-closed upstream, no public share lane):
 *
 *   GET  /api/native/dedupe/rules                       match rules
 *   POST /api/native/dedupe/rules                       create (gated)
 *   GET  /api/native/dedupe/rules/:id                   get
 *   POST /api/native/dedupe/rules/:id/update|delete     (gated)
 *   GET  /api/native/dedupe/quality-rules               quality rules
 *   POST /api/native/dedupe/quality-rules               create (gated)
 *   GET  /api/native/dedupe/quality-rules/:id           get
 *   POST /api/native/dedupe/quality-rules/:id/update|delete (gated)
 *   GET  /api/native/dedupe/suggestions                 open suggestions
 *   GET  /api/native/dedupe/suggestions/:id             get
 *   POST /api/native/dedupe/suggestions/:id/delete      dismiss (gated)
 *   GET  /api/native/dedupe/runs                        honest run ledger
 *   GET  /api/native/dedupe/runs/:id                    get
 *   POST /api/native/dedupe/runs                        run scan (gated)
 *   GET  /api/native/dedupe/identities                  record identities
 *   GET  /api/native/dedupe/identities/:id              get
 *   POST /api/native/dedupe/merge                       non-destructive merge (gated)
 *   POST /api/native/dedupe/writes/:dpwId/apply|reject  APPROVE/REJECT paths
 *   GET  /api/native/dedupe/writes                      pending mirror
 *   GET  /api/native/dedupe/audit                       immutable audit
 *
 * Explicit-segment parsing only; every read is tenant-scoped and safe-projected;
 * every mutation flows through src/native/dedupe/gate.ts (validation BEFORE the
 * gate; non-destructive merge; honest run ledger).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  executePendingDedupeWrite,
  getActionName,
  noteOwnerDecision,
  publicIdentity,
  publicMatchRule,
  publicQualityRule,
  publicRun,
  publicSuggestion,
  submitDedupeWrite,
} from "./gate";
import {
  getIdentity,
  getMatchRule,
  getPendingWriteById,
  getQualityRule,
  getRun,
  getSuggestion,
  listAudit,
  listIdentities,
  listMatchRules,
  listPendingWrites,
  listQualityRules,
  listRuns,
  listSuggestions,
  appendAudit,
} from "./store";
import type { DedupeOp } from "./types";

export interface NativeDedupeCtx {
  userEmail: string;
  dataDir: string;
}

const jsonError = (error: string, status = 400) => Response.json({ error }, { status });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|not published|accepted|may not|exceeds|locked|rejected|reserved/.test(error);
  if (nf) return json404(error);
  if (bad) return jsonError(error);
  return jsonError(error);
}

const RE = {
  mru: /^mru_[A-Za-z0-9]+$/,
  qru: /^qru_[A-Za-z0-9]+$/,
  sug: /^sug_[A-Za-z0-9]+$/,
  drn: /^drn_[A-Za-z0-9]+$/,
  gem: /^gem_[A-Za-z0-9]+$/,
  dpw: /^dpw_[A-Za-z0-9]+$/,
};

async function handleAuthed(req: Request, ctx: NativeDedupeCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/dedupe\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const method = req.method;

  // ── match rules ──────────────────────────────────────────────────────────
  if (seg[0] === "rules") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { rules: listMatchRules(ctx.dataDir, tenantId).map(publicMatchRule) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitDedupeWrite(ctx.dataDir, tenantId, "createMatchRule", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "create failed");
    }
    if (seg.length === 2 && method === "GET" && RE.mru.test(seg[1] ?? "")) {
      const r = getMatchRule(ctx.dataDir, tenantId, seg[1]);
      if (!r) return json404("Rule not found");
      return Response.json({ data: { rule: publicMatchRule(r) } });
    }
    if (seg.length === 3 && (seg[2] === "update" || seg[2] === "delete") && method === "POST" && RE.mru.test(seg[1] ?? "")) {
      const r = getMatchRule(ctx.dataDir, tenantId, seg[1]);
      if (!r) return json404("Rule not found");
      const body = seg[2] === "update" ? await req.json().catch(() => null) : {};
      if (seg[2] === "update" && (!body || typeof body !== "object")) return jsonError("body must be a JSON object");
      const op: DedupeOp = seg[2] === "update" ? "updateMatchRule" : "deleteMatchRule";
      const res = submitDedupeWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), ruleId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    return json404("Unknown native dedupe endpoint");
  }

  // ── quality rules ────────────────────────────────────────────────────────
  if (seg[0] === "quality-rules") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { rules: listQualityRules(ctx.dataDir, tenantId).map(publicQualityRule) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitDedupeWrite(ctx.dataDir, tenantId, "createQualityRule", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "create failed");
    }
    if (seg.length === 2 && method === "GET" && RE.qru.test(seg[1] ?? "")) {
      const r = getQualityRule(ctx.dataDir, tenantId, seg[1]);
      if (!r) return json404("Rule not found");
      return Response.json({ data: { rule: publicQualityRule(r) } });
    }
    if (seg.length === 3 && (seg[2] === "update" || seg[2] === "delete") && method === "POST" && RE.qru.test(seg[1] ?? "")) {
      const r = getQualityRule(ctx.dataDir, tenantId, seg[1]);
      if (!r) return json404("Rule not found");
      const body = seg[2] === "update" ? await req.json().catch(() => null) : {};
      if (seg[2] === "update" && (!body || typeof body !== "object")) return jsonError("body must be a JSON object");
      const op: DedupeOp = seg[2] === "update" ? "updateQualityRule" : "deleteQualityRule";
      const res = submitDedupeWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), ruleId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    return json404("Unknown native dedupe endpoint");
  }

  // ── suggestions (merge candidates) ───────────────────────────────────────
  if (seg[0] === "suggestions") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { suggestions: listSuggestions(ctx.dataDir, tenantId, "open").map(publicSuggestion) } });
    }
    if (seg.length === 2 && method === "GET" && RE.sug.test(seg[1] ?? "")) {
      const s = getSuggestion(ctx.dataDir, tenantId, seg[1]);
      if (!s) return json404("Suggestion not found");
      return Response.json({ data: { suggestion: publicSuggestion(s) } });
    }
    if (seg.length === 3 && seg[2] === "delete" && method === "POST" && RE.sug.test(seg[1] ?? "")) {
      const s = getSuggestion(ctx.dataDir, tenantId, seg[1]);
      if (!s) return json404("Suggestion not found");
      const res = submitDedupeWrite(ctx.dataDir, tenantId, "deleteSuggestion", { payload: { suggestionId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "dismiss failed");
    }
    return json404("Unknown native dedupe endpoint");
  }

  // ── scan runs (durable honest ledger) ────────────────────────────────────
  if (seg[0] === "runs") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { runs: listRuns(ctx.dataDir, tenantId).map(publicRun) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitDedupeWrite(ctx.dataDir, tenantId, "runDedupeScan", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "scan failed");
    }
    if (seg.length === 2 && method === "GET" && RE.drn.test(seg[1] ?? "")) {
      const r = getRun(ctx.dataDir, tenantId, seg[1]);
      if (!r) return json404("Run not found");
      return Response.json({ data: { run: publicRun(r) } });
    }
    return json404("Unknown native dedupe endpoint");
  }

  // ── record identities (non-destructive merge pointers) ───────────────────
  if (seg[0] === "identities") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { identities: listIdentities(ctx.dataDir, tenantId).map(publicIdentity) } });
    }
    if (seg.length === 2 && method === "GET" && RE.gem.test(seg[1] ?? "")) {
      const i = getIdentity(ctx.dataDir, tenantId, seg[1]);
      if (!i) return json404("Identity not found");
      return Response.json({ data: { identity: publicIdentity(i) } });
    }
    return json404("Unknown native dedupe endpoint");
  }

  // ── non-destructive merge ────────────────────────────────────────────────
  if (seg[0] === "merge" && seg.length === 1 && method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
    const res = submitDedupeWrite(ctx.dataDir, tenantId, "mergeRecords", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error ?? "merge failed");
  }

  // ── pending writes / audit ───────────────────────────────────────────────
  if (seg[0] === "writes") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId).filter((w) => w.status === "pending").map((w) => ({ id: w.id, op: w.op, action: getActionName(w.op), status: w.status, requestedAt: w.requestedAt })) } });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject") && method === "POST" && RE.dpw.test(seg[1] ?? "")) {
      const w = getPendingWriteById(ctx.dataDir, tenantId, seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this dedupe action");
      if (seg[2] === "apply") {
        const res = executePendingDedupeWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        return Response.json({ data: { status: "applied", dpwId: res.dpwId, id: res.id, alreadyApplied: !!res.alreadyApplied } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", dpwId: w.id } });
    }
    return json405();
  }

  if (seg[0] === "audit" && seg.length === 1 && method === "GET") {
    return Response.json({ data: { audit: listAudit(ctx.dataDir, tenantId) } });
  }

  return json404("Unknown native dedupe endpoint");
}

/** AUTHED handler (prod-server wires this AFTER the session check). */
export function handleNativeDedupeAuthed(req: Request, ctx: NativeDedupeCtx): Promise<Response> {
  return handleAuthed(req, ctx).catch((e: any) => {
    const msg = e?.message || String(e);
    if (/required|invalid|cap|exceeds|must|reached|no .* found|may not|accepted|locked|reserved/i.test(msg)) {
      return jsonError(msg);
    }
    try {
      appendAudit(ctx.dataDir, { tenantId: ctx.userEmail, actor: "system", action: "native.dedupe.error", detail: msg });
    } catch { /* best-effort */ }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  });
}

/** Phase 1.1 typed-event registration (mirrors every other native slice). */
export function registerBuiltinNativeDedupeEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.dedupe.rule.created",
    "native.dedupe.rule.updated",
    "native.dedupe.rule.deleted",
    "native.dedupe.quality.created",
    "native.dedupe.quality.updated",
    "native.dedupe.quality.deleted",
    "native.dedupe.scan.pending",
    "native.dedupe.scan.recorded",
    "native.dedupe.suggestion.dismissed",
    "native.dedupe.record.merged",
    "native.dedupe.pending",
    "native.dedupe.applied",
    "native.dedupe.rejected",
  ]) {
    registerNativeEventType(t, base);
  }
}