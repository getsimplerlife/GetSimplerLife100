/**
 * native/automation/router.ts — HTTP surface for Phase 3.7 native
 * automations / workflow builder (rules → conditions → actions).
 *
 * AUTHED ONLY (/api/native/automation*): rule CRUD + lifecycle + pending-write
 * decision lanes + run ledger reads + audit. 404 on any foreign/unknown id
 * (fail-closed — cross-tenant → null → 404, no IDOR); forged create-ids → 400
 * via the router raw-body check BEFORE normalization (server-assigned ids);
 * prod-server wires this AFTER the session check so anonymous → 401.
 * NO public share surface (3.2/3.3/3.5/3.6 precedent).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  getRule,
  listAudit,
  listPendingWrites,
  listRules,
  listRuns,
  getRun,
} from "./store";
import {
  executePendingAutomationWrite,
  noteOwnerDecision,
  submitAutomationWrite,
  type AutomationWriteRequest,
} from "./gate";
export interface NativeAutomationCtx {
  userEmail: string;
  dataDir: string;
}
const json400 = (error: string) => Response.json({ error }, { status: 400 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
/** Raw-body forged-id rejection BEFORE any normalization — server-assigned
 *  ids only (rule ids are rul_; never client-supplied). */
function rejectClientId(body: Record<string, unknown>): string | null {
  const id = body["id"];
  if (id !== undefined && id !== null) return "invalid id on create (ids are server-assigned)";
  return null;
}
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|not active|accepted/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 400 });
}
const RUL_RE = /^rul_[A-Za-z0-9_-]+$/;
const ARN_RE = /^arn_[A-Za-z0-9_-]+$/;
function ruleSummary(r: NonNullable<ReturnType<typeof getRule>>): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    trigger: r.trigger.kind === "schedule" ? { ...r.trigger } : { kind: "event", eventType: r.trigger.eventType },
    conditionCount: r.conditions.length,
    actionCount: r.actions.length,
    actions: r.actions,
    autonomyAllowList: r.autonomyAllowList,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
/** GET (read-only; no gate). */
function getHandler(seg: string[], tenantId: string, ctx: NativeAutomationCtx): Response {
  if (seg.length === 0) {
    return Response.json({ data: { rules: listRules(ctx.dataDir, tenantId).map(ruleSummary) } });
  }
  if (seg[0] === "rules") {
    if (seg.length === 1) {
      return Response.json({ data: { rules: listRules(ctx.dataDir, tenantId).map(ruleSummary) } });
    }
    if (seg.length === 2 && RUL_RE.test(seg[1] ?? "")) {
      const r = getRule(ctx.dataDir, tenantId, seg[1]!);
      if (!r) return json404("rule not found"); // 404-no-IDOR
      return Response.json({ data: { rule: ruleSummary(r) } });
    }
    return json404("Unknown native automation endpoint");
  }
  if (seg[0] === "runs") {
    if (seg.length === 1) {
      return Response.json({ data: { runs: listRuns(ctx.dataDir, tenantId).reverse().map((r) => ({ id: r.id, ruleId: r.ruleId, ruleName: r.ruleName, triggerKind: r.triggerKind, triggerRef: r.triggerRef, triggeredBy: r.triggeredBy, triggeredAt: r.triggeredAt, matched: r.matched, actionCount: r.actions.length, error: r.error ?? undefined })) } });
    }
    if (seg.length === 2 && ARN_RE.test(seg[1] ?? "")) {
      const run = getRun(ctx.dataDir, tenantId, seg[1]!);
      if (!run) return json404("run not found"); // 404-no-IDOR
      return Response.json({ data: { run } });
    }
    return json404("Unknown native automation endpoint");
  }
  if (seg[0] === "writes" && seg.length === 1) {
    return Response.json({
      data: { writes: listPendingWrites(ctx.dataDir, tenantId).filter((w) => w.status === "pending").map((w) => ({ id: w.id, op: w.op, status: w.status, approvalActionId: w.approvalActionId, requestedBy: w.requestedBy, requestedAt: w.requestedAt })) },
    });
  }
  if (seg[0] === "audit" && seg.length === 1) {
    return Response.json({ data: { audit: listAudit(ctx.dataDir, tenantId).slice(-100).reverse() } });
  }
  return json404("Unknown native automation endpoint");
}
function handleAuthedAsync(req: Request, ctx: NativeAutomationCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/automation\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail?.trim() ?? "";
  if (!tenantId) return Promise.resolve(json400("user email required"));
  if (req.method === "GET") return Promise.resolve(getHandler(seg, tenantId, ctx));
  if (req.method !== "POST") return Promise.resolve(json405());
  return (async () => {
    // ── WRITE lanes (all ride the Approval Queue verb-first) ─────────────
    // /api/native/automation/rules — create rule
    if (seg[0] === "rules" && seg.length === 1) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return json400("body must be a JSON object");
      const forged = rejectClientId(body as Record<string, unknown>);
      if (forged) return json400(forged);
      const res = submitAutomationWrite(ctx.dataDir, tenantId, "createRule", { rule: body as Record<string, unknown>, via: "portal" }, tenantId);
      return res.applied ? Response.json({ data: { status: "applied", ruleId: res.ruleId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "create failed");
    }
    // /api/native/automation/rules/:id/{update,activate,pause,archive,delete}
    if (seg[0] === "rules" && seg.length === 3 && RUL_RE.test(seg[1] ?? "")) {
      const ruleId = seg[1]!;
      const sub = seg[2]!;
      if (sub === "update" || sub === "activate" || sub === "pause" || sub === "archive" || sub === "delete") {
        let reqBody: AutomationWriteRequest;
        if (sub === "update") {
          const body = await req.json().catch(() => null);
          if (!body || typeof body !== "object") return json400("body must be a JSON object");
          const { id: _forged, ...rest } = body as Record<string, unknown>; // path id is authoritative
          reqBody = { rule: { id: ruleId, ...rest }, via: "portal" };
        } else {
          reqBody = { rule: { id: ruleId }, via: "portal" };
        }
        const op = sub === "update" ? "updateRule" : sub === "activate" ? "activateRule" : sub === "pause" ? "pauseRule" : sub === "archive" ? "archiveRule" : "deleteRule";
        const res = submitAutomationWrite(ctx.dataDir, tenantId, op, reqBody, tenantId);
        return res.applied ? Response.json({ data: { status: "applied", ruleId: res.ruleId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? `${sub} failed`);
      }
      return json404("Unknown native automation endpoint");
    }
    // /api/native/automation/writes/:id/{apply,reject}
    if (seg[0] === "writes" && seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject")) {
      const w = listPendingWrites(ctx.dataDir, tenantId).find((x) => x.id === seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this automation action");
      if (seg[2] === "apply") {
        const res = executePendingAutomationWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        return Response.json({ data: { status: "applied", ptwId: res.ptwId, ruleId: res.ruleId ?? undefined, alreadyApplied: !!res.alreadyApplied } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", ptwId: w.id } });
    }
    return json404("Unknown native automation endpoint");
  })();
}
/** AUTHED handler (prod-server wires this AFTER the session check). */
export function handleNativeAutomationsAuthed(req: Request, ctx: NativeAutomationCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch(() => Response.json({ error: "Internal error" }, { status: 500 }));
}
// ── Built-in typed events (Phase 1.1 registry pattern, 2.1–3.6) ─────────────
export function registerBuiltinNativeAutomationEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.automation.rule.created",
    "native.automation.rule.updated",
    "native.automation.rule.activated",
    "native.automation.rule.paused",
    "native.automation.rule.archived",
    "native.automation.rule.deleted",
    "native.automation.run.matched",
    "native.automation.run.unmatched",
    "native.automation.run.skipped",
    "native.automation.action.auto-applied",
    "native.automation.action.failed",
    "native.automation.notify.sent",
    "native.automation.webhook.published",
    "native.automation.pending",
  ]) {
    registerNativeEventType(t, base);
  }
}