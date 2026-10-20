/**
 * native/transport/router.ts — HTTP surface for Phase 4.1 native SECURE
 * TRANSPORT (SFTP connection config + transfer rules + PGP key ring + the
 * approval-gated transfer-run ledger). AUTHED ONLY (401 fail-closed upstream,
 * no public share lane):
 *
 *   GET  /api/native/transport/connections             safe list (no secrets)
 *   POST /api/native/transport/connections             create (gated)
 *   GET  /api/native/transport/connections/:id         get (safe)
 *   POST /api/native/transport/connections/:id/update  update (gated)
 *   POST /api/native/transport/connections/:id/delete  delete (gated)
 *   GET  /api/native/transport/rules                   list
 *   POST /api/native/transport/rules                   create (gated)
 *   GET  /api/native/transport/rules/:id               get
 *   POST /api/native/transport/rules/:id/update        update (gated)
 *   POST /api/native/transport/rules/:id/delete        delete (gated)
 *   GET  /api/native/transport/runs                    run ledger
 *   POST /api/native/transport/runs                    request transfer (gated)
 *   GET  /api/native/transport/keys                    safe list (no material)
 *   POST /api/native/transport/keys                    create PGP key (gated)
 *   GET  /api/native/transport/keys/:id                get (safe)
 *   POST /api/native/transport/keys/:id/delete         delete (gated)
 *   POST /api/native/transport/writes/:tpwId/apply     APPROVE-path (idempotent)
 *   POST /api/native/transport/writes/:tpwId/reject    REJECT-path
 *   GET  /api/native/transport/writes                  pending mirror
 *   GET  /api/native/transport/audit                   immutable audit (sfp/pgp)
 *
 * Explicit-segment parsing only (no two-capture regex); every read is
 * tenant-scoped and safe-projected; every mutation flows through
 * src/native/transport/gate.ts (validation BEFORE the gate; secrets encrypted
 * before the mirror; run ledger records honest outcomes).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  executePendingTransportWrite,
  getActionName,
  noteOwnerDecision,
  publicConnection,
  publicKey,
  publicRule,
  publicRun,
  submitTransportWrite,
} from "./gate";
import {
  getConnection,
  getKey,
  getPendingWriteById,
  getRule,
  getRun,
  listAudit,
  listConnections,
  listKeys,
  listPendingWrites,
  listRules,
  listRuns,
  appendAudit,
} from "./store";
import type { TransferOp } from "./types";

export interface NativeTransportCtx {
  userEmail: string;
  dataDir: string;
}

const jsonError = (error: string, status = 400) => Response.json({ error }, { status });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|not published|accepted|may not|exceeds|rejected/.test(error);
  if (nf) return json404(error);
  if (bad) return jsonError(error);
  return jsonError(error);
}

const RE = {
  conn: /^sfc_[A-Za-z0-9]+$/,
  rule: /^tru_[A-Za-z0-9]+$/,
  run: /^trn_[A-Za-z0-9]+$/,
  key: /^pgk_[A-Za-z0-9]+$/,
  tpw: /^tpw_[A-Za-z0-9]+$/,
};

async function handleAuthed(req: Request, ctx: NativeTransportCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/transport\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const method = req.method;

  // ── connections ──────────────────────────────────────────────────────────
  if (seg[0] === "connections") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { connections: listConnections(ctx.dataDir, tenantId).map(publicConnection) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitTransportWrite(ctx.dataDir, tenantId, "createConnection", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "create failed");
    }
    if (seg.length === 2 && method === "GET" && RE.conn.test(seg[1] ?? "")) {
      const c = getConnection(ctx.dataDir, tenantId, seg[1]);
      if (!c) return json404("Connection not found");
      return Response.json({ data: { connection: publicConnection(c) } });
    }
    if (seg.length === 3 && (seg[2] === "update" || seg[2] === "delete") && method === "POST" && RE.conn.test(seg[1] ?? "")) {
      const conn = getConnection(ctx.dataDir, tenantId, seg[1]);
      if (!conn) return json404("Connection not found");
      const body = seg[2] === "update" ? await req.json().catch(() => null) : {};
      if (seg[2] === "update" && (!body || typeof body !== "object")) return jsonError("body must be a JSON object");
      const op: TransferOp = seg[2] === "update" ? "updateConnection" : "deleteConnection";
      const res = submitTransportWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), connectionId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    return json404("Unknown native transport endpoint");
  }

  // ── rules ────────────────────────────────────────────────────────────────
  if (seg[0] === "rules") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { rules: listRules(ctx.dataDir, tenantId).map(publicRule) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitTransportWrite(ctx.dataDir, tenantId, "createRule", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "create failed");
    }
    if (seg.length === 2 && method === "GET" && RE.rule.test(seg[1] ?? "")) {
      const r = getRule(ctx.dataDir, tenantId, seg[1]);
      if (!r) return json404("Rule not found");
      return Response.json({ data: { rule: publicRule(r) } });
    }
    if (seg.length === 3 && (seg[2] === "update" || seg[2] === "delete") && method === "POST" && RE.rule.test(seg[1] ?? "")) {
      const r = getRule(ctx.dataDir, tenantId, seg[1]);
      if (!r) return json404("Rule not found");
      const body = seg[2] === "update" ? await req.json().catch(() => null) : {};
      if (seg[2] === "update" && (!body || typeof body !== "object")) return jsonError("body must be a JSON object");
      const op: TransferOp = seg[2] === "update" ? "updateRule" : "deleteRule";
      const res = submitTransportWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), ruleId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    return json404("Unknown native transport endpoint");
  }

  // ── runs (transfer-run ledger) ───────────────────────────────────────────
  if (seg[0] === "runs") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { runs: listRuns(ctx.dataDir, tenantId).map(publicRun) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitTransportWrite(ctx.dataDir, tenantId, "runTransfer", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "run failed");
    }
    if (seg.length === 2 && method === "GET" && RE.run.test(seg[1] ?? "")) {
      const r = getRun(ctx.dataDir, tenantId, seg[1]);
      if (!r) return json404("Run not found");
      return Response.json({ data: { run: publicRun(r) } });
    }
    return json404("Unknown native transport endpoint");
  }

  // ── keys (PGP key ring) ──────────────────────────────────────────────────
  if (seg[0] === "keys") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { keys: listKeys(ctx.dataDir, tenantId).map(publicKey) } });
    }
    if (seg.length === 1 && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = submitTransportWrite(ctx.dataDir, tenantId, "createKey", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "create failed");
    }
    if (seg.length === 2 && method === "GET" && RE.key.test(seg[1] ?? "")) {
      const k = getKey(ctx.dataDir, tenantId, seg[1]);
      if (!k) return json404("Key not found");
      return Response.json({ data: { key: publicKey(k) } });
    }
    if (seg.length === 3 && seg[2] === "delete" && method === "POST" && RE.key.test(seg[1] ?? "")) {
      const k = getKey(ctx.dataDir, tenantId, seg[1]);
      if (!k) return json404("Key not found");
      const res = submitTransportWrite(ctx.dataDir, tenantId, "deleteKey", { payload: { keyId: seg[1] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "delete failed");
    }
    return json404("Unknown native transport endpoint");
  }

  // ── pending writes / audit ───────────────────────────────────────────────
  if (seg[0] === "writes") {
    if (seg.length === 1 && method === "GET") {
      return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId).filter((w) => w.status === "pending").map((w) => ({ id: w.id, op: w.op, action: getActionName(w.op), status: w.status, requestedAt: w.requestedAt })) } });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject") && method === "POST" && RE.tpw.test(seg[1] ?? "")) {
      const w = getPendingWriteById(ctx.dataDir, tenantId, seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this transport action");
      if (seg[2] === "apply") {
        const res = executePendingTransportWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        return Response.json({ data: { status: "applied", ptwId: res.ptwId, id: res.id, alreadyApplied: !!res.alreadyApplied } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", ptwId: w.id } });
    }
    return json405();
  }

  if (seg[0] === "audit" && seg.length === 1 && method === "GET") {
    return Response.json({ data: { audit: listAudit(ctx.dataDir, tenantId) } });
  }

  return json404("Unknown native transport endpoint");
}

/** AUTHED handler (prod-server wires this AFTER the session check). */
export function handleNativeTransportAuthed(req: Request, ctx: NativeTransportCtx): Promise<Response> {
  return handleAuthed(req, ctx).catch((e: any) => {
    const msg = e?.message || String(e);
    if (/required|invalid|cap|exceeds|must|reached|no .* found|may not|accepted/i.test(msg)) {
      return jsonError(msg);
    }
    try {
      appendAudit(ctx.dataDir, { tenantId: ctx.userEmail, actor: "system", action: "native.transport.error", detail: msg });
    } catch { /* best-effort */ }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  });
}

/** Phase 1.1 typed-event registration (mirrors every other native slice). */
export function registerBuiltinNativeTransportEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.sftp.connection.created",
    "native.sftp.connection.updated",
    "native.sftp.connection.deleted",
    "native.sftp.rule.created",
    "native.sftp.rule.updated",
    "native.sftp.rule.deleted",
    "native.sftp.run.pending",
    "native.sftp.run.recorded",
    "native.pgp.key.created",
    "native.pgp.key.deleted",
    "native.sftp.pending",
    "native.sftp.applied",
    "native.sftp.rejected",
    "native.pgp.key.pending",
    "native.pgp.key.applied",
    "native.pgp.key.rejected",
  ]) {
    registerNativeEventType(t, base);
  }
}