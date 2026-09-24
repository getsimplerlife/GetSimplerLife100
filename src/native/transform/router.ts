/**
 * native/transform/router.ts — HTTP surface for Phase 3.5 native data
 * transforms / EDI tooling.
 *
 * AUTHED ONLY (/api/native/transform*): transform builder list/create/get/
 * update/activate/archive/delete, run + run history + artifact download, and
 * the pending-write decision lanes. 404 on any foreign/unknown id
 * (fail-closed); forged create-ids → 400; prod-server wires this AFTER the
 * session check. NO public share surface (3.2/3.3 precedent — the 1.4 tables
 * lane owns record writes; a trading-partner network is a B-lane, never
 * native).
 *
 * Explicit-segment parsing only (no two-capture regex — the 1.4 rowMatch
 * shadowing class is avoided).
 */
import { registerNativeEventType } from "../webhooks/registry";
import { getTransform, listTransforms, listRuns, getRun, listPendingWrites, getPendingWriteById, countRuns } from "./store";
import { executePendingTransformWrite, noteOwnerDecision, submitTransformWrite } from "./gate";
export interface NativeTransformCtx {
  userEmail: string;
  dataDir: string;
}
const json400 = (error: string) => Response.json({ error }, { status: 400 });
const json401 = () => Response.json({ error: "Not authenticated" }, { status: 401 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|not active|accepted|matched no records/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 400 });
}
const ITRF_RE = /^trf_[A-Za-z0-9_-]+$/;
const IRUN_RE = /^trn_[A-Za-z0-9_-]+$/;
function runSummary(run: ReturnType<typeof getRun>): Record<string, unknown> {
  return {
    id: run!.id,
    transformId: run!.transformId,
    status: run!.status,
    rowCount: run!.rowCount,
    artifactKind: run!.artifact ? run!.artifact.mime : null,
    requestedBy: run!.requestedBy,
    requestedAt: run!.requestedAt,
    appliedAt: run!.appliedAt,
    error: run!.error ?? undefined,
  };
}
/** READ (no gate) — the mapping builder needs the full definition. */
function getHandler(seg: string[], tenantId: string, ctx: NativeTransformCtx): Response {
  // /api/native/transform — list
  if (seg.length === 0) {
    const transforms = listTransforms(ctx.dataDir, tenantId);
    return Response.json({
      data: { transforms: transforms.map((t) => ({ id: t.id, name: t.name, sourceKind: t.sourceKind, outputMode: t.outputMode, artifactKind: t.artifactKind, status: t.status, version: t.version, fieldCount: t.fields.length, runCount: countRuns(ctx.dataDir, tenantId, t.id), createdAt: t.createdAt, updatedAt: t.updatedAt })) },
    });
  }
  if (seg[0] === "writes") {
    if (seg.length === 1) {
      return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId).filter((w) => w.status === "pending").map((w) => ({ id: w.id, transformId: w.transformId, op: w.op, status: w.status, approvalActionId: w.approvalActionId, requestedBy: w.requestedBy, requestedAt: w.requestedAt })) } });
    }
    return json404("Unknown native transform endpoint");
  }
  if (seg[0] === "runs") {
    if (seg.length === 2 && IRUN_RE.test(seg[1] ?? "")) {
      const run = getRun(ctx.dataDir, tenantId, seg[1]!);
      if (!run) return json404("run not found"); // 404-no-IDOR (foreign → null)
      return Response.json({ data: { run } });
    }
    if (seg.length === 3 && seg[2] === "artifact" && IRUN_RE.test(seg[1] ?? "")) {
      const run = getRun(ctx.dataDir, tenantId, seg[1]!);
      if (!run || !run.artifact) return json404("run artifact not found");
      return new Response(run.artifact.text, {
        headers: {
          "content-type": run.artifact.mime,
          "content-disposition": `attachment; filename="transform-run-${run.id}.txt"`,
        },
      });
    }
    return json404("Unknown native transform endpoint");
  }
  if (seg.length === 1 && ITRF_RE.test(seg[0] ?? "")) {
    const t = getTransform(ctx.dataDir, tenantId, seg[0]!);
    if (!t) return json404("transform not found"); // 404-no-IDOR
    return Response.json({ data: { transform: t } });
  }
  if (seg.length === 2 && ITRF_RE.test(seg[0] ?? "") && seg[1] === "runs") {
    const t = getTransform(ctx.dataDir, tenantId, seg[0]!);
    if (!t) return json404("transform not found");
    return Response.json({ data: { runs: listRuns(ctx.dataDir, tenantId, t.id).map(runSummary) } });
  }
  return json404("Unknown native transform endpoint");
}
function handleAuthedAsync(req: Request, ctx: NativeTransformCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/transform\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail?.trim() ?? "";
  if (!tenantId) return Promise.resolve(json401());
  if (req.method === "GET") return Promise.resolve(getHandler(seg, tenantId, ctx));
  if (req.method === "DELETE") {
    if (seg.length === 1 && ITRF_RE.test(seg[0] ?? "")) {
      const res = submitTransformWrite(ctx.dataDir, tenantId, "delete", { transformId: seg[0]!, via: "portal" }, tenantId);
      return Promise.resolve(res.applied ? Response.json({ data: { status: "applied" } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "delete failed"));
    }
    return Promise.resolve(json404("Unknown native transform endpoint"));
  }
  if (req.method !== "POST") return Promise.resolve(json405());
  // POST lanes
  return (async () => {
    // /api/native/transform — create
    if (seg.length === 0) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return json400("body must be a JSON object");
      const res = submitTransformWrite(ctx.dataDir, tenantId, "create", { transform: body as Record<string, unknown>, via: "portal" }, tenantId);
      return res.applied ? Response.json({ data: { status: "applied", transformId: res.transformId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "create failed");
    }
    // /api/native/transform/writes/:id/apply|reject
    if (seg[0] === "writes" && seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject")) {
      const w = getPendingWriteById(ctx.dataDir, tenantId, seg[1]!);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this transform action");
      if (seg[2] === "apply") {
        const res = executePendingTransformWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        return Response.json({ data: { status: "applied", ptwId: res.ptwId, transformId: res.transformId, runId: res.runId, alreadyApplied: !!res.alreadyApplied } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", ptwId: w.id } });
    }
    // /api/native/transform/:id/{update,activate,archive,run}
    if (seg.length === 2 && ITRF_RE.test(seg[0] ?? "")) {
      const transformId = seg[0]!;
      const sub = seg[1]!;
      if (sub === "update" || sub === "activate" || sub === "archive" || sub === "run") {
        let reqBody: Parameters<typeof submitTransformWrite>[3];
        if (sub === "update" || sub === "run") {
          const body = await req.json().catch(() => null);
          if (!body || typeof body !== "object") return json400("body must be a JSON object");
          const b = body as Record<string, unknown>;
          if (sub === "run") {
            reqBody = { transformId, source: typeof b.source === "string" ? b.source : "", via: "portal" };
          } else {
            reqBody = { transformId, transform: b, via: "portal" };
          }
        } else {
          // activate/archive are body-less state transitions (mirror the
          // survey publish/archive lanes)
          reqBody = { transformId, via: "portal" };
        }
        const op = sub === "update" ? "update" : sub === "activate" ? "activate" : sub === "archive" ? "archive" : "run";
        const res = submitTransformWrite(ctx.dataDir, tenantId, op, reqBody, tenantId);
        return res.applied ? Response.json({ data: { status: "applied", transformId: res.transformId, runId: res.runId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? `${sub} failed`);
      }
    }
    return json404("Unknown native transform endpoint");
  })();
}
/** AUTHED handler (prod-server wires this AFTER the session check). */
export function handleNativeTransformsAuthed(req: Request, ctx: NativeTransformCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch(() => Response.json({ error: "Internal error" }, { status: 500 }));
}
// ── Built-in typed events (Phase 1.1 registry pattern, 2.1–3.4) ─────────────
export function registerBuiltinNativeTransformEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.transform.created",
    "native.transform.updated",
    "native.transform.activated",
    "native.transform.archived",
    "native.transform.deleted",
    "native.transform.pending",
    "native.transform.run.queued",
    "native.transform.run.applied",
    "native.transform.run.rejected",
  ]) {
    registerNativeEventType(t, base);
  }
}