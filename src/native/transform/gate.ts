/**
 * native/transform/gate.ts — GATED WRITE PATH for Phase 3.5 native data
 * transforms / EDI tooling. Mirrors the 2.1–3.4 gates exactly:
 *   - validation happens BEFORE the gate (bad body / forged ids / unknown
 *     ids / template refs outside the field map / caps / unparseable source
 *     NEVER queue),
 *   - every write rides the Approval Queue verb-first; ACTION_NAME uses
 *     createTransform/updateTransform/activateTransform/archiveTransform/
 *     deleteTransform/runTransform — verbs `run` + `activate` were ADDED to
 *     WRITE_VERB this slice (the 2.5/3.1/3.2/3.3/3.4 fail-open class; the
 *     classification test asserts all six),
 *   - the run is COMPUTED at queue time (validation) AND at apply (same
 *     deterministic result — pure engine, NO LLM, no randomness); replay →
 *     alreadyApplied with the SAME stored run (never recomputed),
 *   - autonomy (#236): allow-listed entries auto-apply; runTransform is
 *     non-destructive → eligible; recordAutonomyOutcome on auto-apply,
 *   - the run OUTPUT lives in this slice's own store (rows + optional
 *     artifact text); writing into 1.4 records is a SEPARATE approval card
 *     on the TABLES slice (createTableRow — already WRITE_VERB-classified),
 *     so there is no double-queue and no new cross-store write path,
 *   - caps at every level (≤50 transforms/tenant, ≤25 fields, ≤512KB source,
 *     ≤1000 output rows, ≤20 pending runs, ≤200 stored runs/tenant, ≤1MB
 *     artifact text),
 *   - every apply appends an immutable native.transform.* audit entry + a
 *     typed webhook event (Phase 1.1 registry).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { getTable } from "../tables/store";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  ARTIFACT_KINDS,
  COERCE_KINDS,
  MAX_FIELDS_PER_TRANSFORM,
  MAX_GENERATION_SEGMENTS,
  MAX_PENDING_TRANSFORM_WRITES,
  MAX_RUN_SOURCE_EXCERPT,
  MAX_TRANSFORMS_PER_TENANT,
  MAX_TRANSFORM_DESCRIPTION,
  MAX_TRANSFORM_NAME,
  TRANSFORM_SOURCE_KINDS,
  type FieldMapping,
  type GenerationConfig,
  type PendingTransformWrite,
  type TransformOp,
  type TransformRecord,
} from "./types";
import { executeTransform, validateFieldSource, validateRecordPath } from "./engine";
import {
  appendAudit,
  countRuns,
  deleteTransformRecord,
  generateTransformEntityId,
  getPendingWriteByAction,
  getTransform,
  listPendingWrites,
  listTransforms,
  markPendingWrite,
  savePendingWrite,
  saveRun,
  saveTransform,
} from "./store";
export type TransformWriteRequest = {
  transformId?: string;
  transform?: {
    /** FORGED-ID GUARD: a client-supplied transform id is REJECTED (server-assigned only). */
    id?: string;
    name?: string;
    description?: string;
    sourceKind?: string;
    outputMode?: string;
    artifactKind?: string | null;
    targetTableId?: string | null;
    recordPath?: string;
    fields?: Array<{ id?: string; source?: string; target?: string; coerce?: string | null; required?: boolean }>;
    generation?: GenerationConfig | null;
  };
  /** run only — the source text to parse/map/generate. */
  source?: string;
  via?: string;
};
export type TransformWriteResult =
  | { applied: true; pending: false; transformId?: string; runId?: string; op: TransformOp; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: TransformOp }
  | { applied: false; pending: false; error: string };
/** Verb-first action names — every verb is in WRITE_VERB (standing fail-open
 *  control; `run` + `activate` ADDED this slice). */
const ACTION_NAME: Record<TransformOp, string> = {
  create: "createTransform",
  update: "updateTransform",
  activate: "activateTransform",
  archive: "archiveTransform",
  delete: "deleteTransform",
  run: "runTransform",
};
const TARGET_FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const X12_ID_RE = /^[A-Za-z0-9]{2,15}$/;
const EDIFACT_ID_RE = /^[A-Za-z0-9]{1,35}$/;
const XML_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function validateGeneration(def: {
  outputMode: string;
  artifactKind?: string | null;
  generation?: GenerationConfig | null;
  fields: FieldMapping[];
}): void {
  if (def.outputMode !== "artifact") return;
  if (!def.artifactKind || !ARTIFACT_KINDS.includes(def.artifactKind as (typeof ARTIFACT_KINDS)[number])) {
    throw new Error("artifact output needs artifactKind csv|json|xml|edi_x12|edifact");
  }
  const g = def.generation;
  if (!g || typeof g !== "object") throw new Error("artifact output needs a generation config");
  if (g.delimiter !== undefined && (typeof g.delimiter !== "string" || g.delimiter.length !== 1)) {
    throw new Error("generation delimiter must be a single character");
  }
  if (g.rootTag !== undefined && (typeof g.rootTag !== "string" || !XML_NAME_RE.test(g.rootTag))) throw new Error("invalid xml rootTag name");
  if (g.rowTag !== undefined && (typeof g.rowTag !== "string" || !XML_NAME_RE.test(g.rowTag))) throw new Error("invalid xml rowTag name");
  const targets = new Set(def.fields.map((f) => f.target));
  const envelopes = ["x12_850", "edifact_orders", "none"] as const;
  if (!envelopes.includes((g.envelope as (typeof envelopes)[number]) ?? "none")) throw new Error("generation envelope must be x12_850|edifact_orders|none");
  const env = g.envelope ?? "none";
  if (env === "x12_850") {
    if (typeof g.senderId !== "string" || !X12_ID_RE.test(g.senderId)) throw new Error("x12_850 generation needs senderId (2..15 alphanumeric)");
    if (typeof g.receiverId !== "string" || !X12_ID_RE.test(g.receiverId)) throw new Error("x12_850 generation needs receiverId (2..15 alphanumeric)");
  }
  if (env === "edifact_orders") {
    if (typeof g.senderId !== "string" || !EDIFACT_ID_RE.test(g.senderId)) throw new Error("edifact_orders generation needs senderId (1..35 alphanumeric)");
    if (typeof g.receiverId !== "string" || !EDIFACT_ID_RE.test(g.receiverId)) throw new Error("edifact_orders generation needs receiverId (1..35 alphanumeric)");
  }
  if (g.segments !== undefined) {
    if (!Array.isArray(g.segments) || g.segments.length === 0 || g.segments.length > MAX_GENERATION_SEGMENTS) {
      throw new Error(`generation needs 1..${MAX_GENERATION_SEGMENTS} segment templates`);
    }
    for (const t of g.segments) {
      if (typeof t !== "string" || t.length > 300 || t.length === 0) throw new Error("each segment template must be 1..300 chars");
      const cleaned = t.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "");
      if (cleaned.includes("{") || cleaned.includes("}")) throw new Error(`segment template "${t}" has a malformed placeholder`);
      for (const m of t.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
        if (!targets.has(m[1]!)) throw new Error(`segment template references unknown field "${m[1]}" (not in the field map)`);
      }
    }
  }
}
function validateBodyShape(body: Record<string, unknown>): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("transform body must be a JSON object");
}
function validateFields(fields: Array<{ id?: string; source?: string; target?: string; coerce?: string | null; required?: boolean }>): FieldMapping[] {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > MAX_FIELDS_PER_TRANSFORM) {
    throw new Error(`a transform needs 1..${MAX_FIELDS_PER_TRANSFORM} field mappings`);
  }
  const seen = new Set<string>();
  const out: FieldMapping[] = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") throw new Error("each field mapping must be an object");
    if ("id" in f && f.id !== undefined) throw new Error("client-supplied field ids are not accepted"); // forged create-id → 400
    const source = f.source ?? "";
    const target = f.target ?? "";
    if (!TARGET_FIELD_RE.test(target)) throw new Error(`field target "${target}" must be a valid field name ([A-Za-z_][A-Za-z0-9_]{0,63})`);
    if (seen.has(target)) throw new Error(`duplicate field target "${target}"`);
    if (f.coerce !== undefined && f.coerce !== null && !COERCE_KINDS.includes(f.coerce as (typeof COERCE_KINDS)[number])) {
      throw new Error(`field coerce must be one of ${COERCE_KINDS.join("|")}`);
    }
    if (f.required !== undefined && typeof f.required !== "boolean") throw new Error("field required must be a boolean");
    out.push({ source, target, coerce: (f.coerce as FieldMapping["coerce"]) ?? null, required: f.required ?? false });
    seen.add(target);
  }
  return out;
}
function sourceKindOf(v: unknown): TransformRecord["sourceKind"] {
  if (typeof v !== "string" || !TRANSFORM_SOURCE_KINDS.includes(v as (typeof TRANSFORM_SOURCE_KINDS)[number])) {
    throw new Error("sourceKind must be json|xml|csv|edi_x12|edifact");
  }
  return v as TransformRecord["sourceKind"];
}
function validateTransformBody(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
  creating: boolean,
): { name: string; description: string; sourceKind: TransformRecord["sourceKind"]; outputMode: TransformRecord["outputMode"]; artifactKind: TransformRecord["artifactKind"]; targetTableId: TransformRecord["targetTableId"]; recordPath: string; fields: FieldMapping[]; generation: GenerationConfig | null } {
  if (creating && "id" in body && body.id !== undefined) throw new Error("client-supplied transform ids are not accepted"); // forged create-id → 400
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new Error("transform name is required");
  if (name.length > MAX_TRANSFORM_NAME) throw new Error(`transform name must be ≤${MAX_TRANSFORM_NAME} chars`);
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > MAX_TRANSFORM_DESCRIPTION)) {
    throw new Error(`description must be ≤${MAX_TRANSFORM_DESCRIPTION} chars`);
  }
  const sourceKind = sourceKindOf(body.sourceKind);
  if (body.outputMode !== "records" && body.outputMode !== "artifact") throw new Error("outputMode must be records|artifact");
  const outputMode = body.outputMode as TransformRecord["outputMode"];
  const artifactKind = (body.artifactKind == null ? null : (body.artifactKind as string)) as TransformRecord["artifactKind"];
  const targetTableId = body.targetTableId == null ? null : (body.targetTableId as string);
  if (targetTableId !== null) {
    if (!/^tbl_[A-Za-z0-9_-]+$/.test(targetTableId)) throw new Error("targetTableId must be a valid table id (tbl_)");
    const table = getTable(dataDir, tenantId, targetTableId);
    if (!table) throw new Error("target table not found"); // 404-no-IDOR (cross-tenant table id → not found)
  }
  const recordPath = typeof body.recordPath === "string" ? body.recordPath : "";
  validateRecordPath(sourceKind, recordPath);
  const fields = validateFields(body.fields as Array<{ id?: string; source?: string; target?: string; coerce?: string | null; required?: boolean }> | undefined ?? []);
  for (const f of fields) validateFieldSource(sourceKind, f.source);
  const generation = (body.generation as GenerationConfig | null | undefined) ?? null;
  validateGeneration({ outputMode, artifactKind, generation, fields });
  return { name, description: typeof body.description === "string" ? body.description : "", sourceKind, outputMode, artifactKind, targetTableId, recordPath, fields, generation };
}
function validateWrite(dataDir: string, tenantId: string, op: TransformOp, req: TransformWriteRequest): TransformRecord | null {
  switch (op) {
    case "create": {
      validateBodyShape((req.transform ?? {}) as Record<string, unknown>);
      const body = (req.transform ?? {}) as Record<string, unknown>;
      validateTransformBody(dataDir, tenantId, body, true);
      if (listTransforms(dataDir, tenantId).length >= MAX_TRANSFORMS_PER_TENANT) {
        throw new Error(`transform cap reached (${MAX_TRANSFORMS_PER_TENANT})`);
      }
      return null;
    }
    case "run": {
      if (!req.transformId || !/^trf_[A-Za-z0-9_-]+$/.test(req.transformId)) throw new Error("transformId is required");
      const def = getTransform(dataDir, tenantId, req.transformId);
      if (!def) throw new Error("transform not found"); // 404-no-IDOR
      if (def.status !== "active") throw new Error("transform is not active (activate it first)");
      if (typeof req.source !== "string") throw new Error("run needs source text");
      // Compute NOW — bad source / unknown paths / caps / required gaps never queue.
      executeTransform(def, req.source, `preflight:${def.id}`, new Date());
      const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
      if (pending.length >= MAX_PENDING_TRANSFORM_WRITES) {
        throw new Error(`Pending-write cap reached (${MAX_PENDING_TRANSFORM_WRITES}) — approve or reject before more`);
      }
      return def;
    }
    default: {
      if (!req.transformId || !/^trf_[A-Za-z0-9_-]+$/.test(req.transformId)) throw new Error("transformId is required");
      const def = getTransform(dataDir, tenantId, req.transformId);
      if (!def) throw new Error("transform not found");
      if (op === "update") {
        if (def.status !== "draft") throw new Error("transforms can only be edited in draft");
        const body = ((req.transform ?? {}) as Record<string, unknown>);
        validateTransformBody(dataDir, tenantId, body, false);
      } else if (op === "activate") {
        if (def.status !== "draft") throw new Error("only draft transforms can be activated");
      } else if (op === "archive") {
        if (def.status !== "active") throw new Error("only active transforms can be archived");
      } else if (op === "delete") {
        if (def.status !== "draft") throw new Error("only draft transforms can be deleted");
        if (countRuns(dataDir, tenantId, def.id) > 0) throw new Error("cannot delete a transform that has runs");
      }
      return def;
    }
  }
}
/** Execute the write under authority (autonomy auto-apply or approve path). */
function applyNow(
  dataDir: string,
  tenantId: string,
  op: TransformOp,
  req: TransformWriteRequest,
  actor: string,
  autonomy: boolean,
): { ok: boolean; error?: string; transformId?: string; runId?: string } {
  const now = new Date().toISOString();
  const who = autonomy ? "system/autonomy" : actor;
  if (op === "create") {
    const body = (req.transform ?? {}) as Record<string, unknown>;
    const v = validateTransformBody(dataDir, tenantId, body, true);
    const def: TransformRecord = {
      id: generateTransformEntityId("trf"),
      tenantId,
      name: v.name,
      description: v.description,
      sourceKind: v.sourceKind,
      outputMode: v.outputMode,
      artifactKind: v.artifactKind,
      targetTableId: v.targetTableId,
      recordPath: v.recordPath,
      fields: v.fields,
      generation: v.generation,
      status: "draft",
      version: 1,
      createdAt: now,
      createdBy: who,
      updatedAt: now,
      updatedBy: who,
    };
    saveTransform(dataDir, def);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.transform.created", transformId: def.id, detail: `Created ${v.sourceKind}→${v.outputMode} transform` });
    publishEvent(dataDir, tenantId, "native.transform.created", { transformId: def.id });
    return { ok: true, transformId: def.id };
  }
  const def = getTransform(dataDir, tenantId, req.transformId || "");
  if (!def) return { ok: false, error: "transform not found" };
  if (op === "update") {
    const body = ((req.transform ?? {}) as Record<string, unknown>);
    const v = validateTransformBody(dataDir, tenantId, body, false);
    const next: TransformRecord = {
      ...def,
      name: v.name,
      description: v.description,
      sourceKind: v.sourceKind,
      outputMode: v.outputMode,
      artifactKind: v.artifactKind,
      targetTableId: v.targetTableId,
      recordPath: v.recordPath,
      fields: v.fields,
      generation: v.generation,
      version: def.version + 1,
      updatedAt: now,
      updatedBy: who,
    };
    saveTransform(dataDir, next);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.transform.updated", transformId: def.id, detail: `Updated transform (v${next.version})` });
    publishEvent(dataDir, tenantId, "native.transform.updated", { transformId: def.id });
    return { ok: true, transformId: def.id };
  }
  if (op === "activate") {
    def.status = "active";
    def.version += 1;
    def.updatedAt = now;
    def.updatedBy = who;
    saveTransform(dataDir, def);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.transform.activated", transformId: def.id, detail: "Transform activated" });
    publishEvent(dataDir, tenantId, "native.transform.activated", { transformId: def.id });
    return { ok: true, transformId: def.id };
  }
  if (op === "archive") {
    def.status = "archived";
    def.version += 1;
    def.updatedAt = now;
    def.updatedBy = who;
    saveTransform(dataDir, def);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.transform.archived", transformId: def.id, detail: "Transform archived (terminal)" });
    publishEvent(dataDir, tenantId, "native.transform.archived", { transformId: def.id });
    return { ok: true, transformId: def.id };
  }
  if (op === "delete") {
    deleteTransformRecord(dataDir, tenantId, def.id);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.transform.deleted", transformId: def.id, detail: "Transform deleted" });
    publishEvent(dataDir, tenantId, "native.transform.deleted", { transformId: def.id });
    return { ok: true, transformId: def.id };
  }
  // run — deterministic engine; seed = the durable run id (control numbers stable on replay)
  const runId = generateTransformEntityId("trn");
  try {
    const exec = executeTransform(def, req.source ?? "", runId, new Date());
    const run = {
      id: runId,
      tenantId,
      transformId: def.id,
      status: "applied" as const,
      requestedBy: actor,
      requestedAt: now,
      appliedAt: now,
      rows: exec.rows,
      artifact: exec.artifact,
      rowCount: exec.rowCount,
      sourceExcerpt: (req.source ?? "").slice(0, MAX_RUN_SOURCE_EXCERPT),
      targetTableId: def.targetTableId,
    };
    saveRun(dataDir, run);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.transform.run.applied", transformId: def.id, runId, detail: `Run applied (${exec.rowCount} rows, ${exec.artifact ? "artifact " + exec.artifact.mime : "records"})` });
    publishEvent(dataDir, tenantId, "native.transform.run.applied", { transformId: def.id, runId, rowCount: exec.rowCount });
    return { ok: true, transformId: def.id, runId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
/** Submit a gated transform write. Validation FIRST — bad writes 400 before
 *  the queue. */
export function submitTransformWrite(
  dataDir: string,
  tenantId: string,
  op: TransformOp,
  req: TransformWriteRequest,
  actor: string,
): TransformWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  try {
    validateWrite(dataDir, tenantId, op, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = ACTION_NAME[op];
  const gate = approvalGate(tenantId, action, "native-transform", { transformId: req.transformId, op, via: req.via ?? "portal" }, { dataDir, workflowId: "native-transform" });
  if (gate.allowed) {
    const out = applyNow(dataDir, tenantId, op, req, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error };
    if (gate.autonomy) recordAutonomyOutcome(tenantId, gate.workflowId || "native-transform", action, "native-transform", true, { dataDir, allowListId: gate.allowListId, target: req.transformId || "" });
    return { applied: true, pending: false, ...(out.transformId ? { transformId: out.transformId } : {}), ...(out.runId ? { runId: out.runId } : {}), op, autonomy: !!gate.autonomy, ...(gate.actionId ? { actionId: gate.actionId } : {}) };
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  if (op === "run") {
    // Cap queued runs: bound the pending mirror; approve/reject before more.
    const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
    if (pending.length >= MAX_PENDING_TRANSFORM_WRITES) {
      return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_TRANSFORM_WRITES}) — approve or reject before more` };
    }
  }
  const ptw: PendingTransformWrite = {
    id: generateTransformEntityId("trw"),
    tenantId,
    transformId: req.transformId ?? null,
    op,
    payload: { ...req, via: req.via ?? "portal" },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: op === "run" ? "native.transform.run.queued" : "native.transform.pending", transformId: req.transformId ?? "", detail: `Queued ${action} for approval (${ptw.id})` });
  publishEvent(dataDir, tenantId, op === "run" ? "native.transform.run.queued" : "native.transform.pending", { transformId: req.transformId, ptwId: ptw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}
/** Approve-path executor: applies the approved write once (idempotent). */
export function executePendingTransformWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; transformId?: string; runId?: string; ptwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; ptwId?: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied") {
    return { ok: true, alreadyApplied: true, transformId: ptw.transformId ?? undefined, runId: ptw.appliedResult?.runId, ptwId: ptw.id };
  }
  try {
    validateWrite(dataDir, tenantId, ptw.op, ptw.payload as TransformWriteRequest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: msg });
    appendAudit(dataDir, { tenantId, actor: "system", action: ptw.op === "run" ? "native.transform.run.rejected" : "native.transform.rejected", transformId: ptw.transformId ?? "", detail: `Apply re-validation failed: ${msg}` });
    return { ok: false, reason: msg, ptwId: ptw.id };
  }
  const out = applyNow(dataDir, tenantId, ptw.op, ptw.payload as TransformWriteRequest, actor, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: out.error });
    appendAudit(dataDir, { tenantId, actor: "system", action: ptw.op === "run" ? "native.transform.run.rejected" : "native.transform.rejected", transformId: ptw.transformId ?? "", detail: `Apply failed: ${out.error}` });
    return { ok: false, reason: out.error, ptwId: ptw.id };
  }
  markPendingWrite(dataDir, tenantId, ptw.id, "applied", { ...(out.transformId ? { transformId: out.transformId } : {}), ...(out.runId ? { runId: out.runId } : {}) });
  return { ok: true, ...(out.transformId ? { transformId: out.transformId } : {}), ...(out.runId ? { runId: out.runId } : {}), ptwId: ptw.id };
}
/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingTransformWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", transformId: res.transformId, runId: res.runId } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected");
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}
/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-transform");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}