/**
 * native/survey/gate.ts — GATED WRITE PATH for Phase 3.4 native surveys.
 * Mirrors the 2.1–3.3 gates exactly:
 *   - validation BEFORE the gate (illegal status transitions, malformed
 *     answers, forged create-ids, unknown surveys NEVER queue),
 *   - every mutation rides the Approval Queue verb-first: createSurvey /
 *     updateSurvey / publishSurvey / archiveSurvey / deleteSurvey /
 *     submitSurveyResponse — every verb ∈ WRITE_VERB (classification test
 *     asserts all six; the standing fail-open control),
 *   - server-assigned ids ONLY: a client-supplied survey id or question id on
 *     create is rejected (forged create-id → 400),
 *   - edit-only-in-draft, publish draft→published, archive published→archived
 *     (terminal), delete only an empty draft; published surveys are frozen to
 *     respondents (answers validated against the PUBLISHED question set),
 *   - the durable pending-write mirror lands with each approval card; the
 *     approve-path executor is idempotent (replay → alreadyApplied),
 *   - autonomy (#236): allow-listed entries auto-apply with
 *     recordAutonomyOutcome; destructive delete requires an explicit
 *     allow-list + known id via the shared gate rules,
 *   - every apply appends an immutable native.survey.* audit entry + a typed
 *     webhook event (Phase 1.1 registry).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  MAX_PENDING_SURVEY_WRITES,
  MAX_QUESTIONS_PER_SURVEY,
  MAX_QUESTION_LABEL,
  MAX_RESPONSES_PER_SURVEY,
  MAX_SURVEYS_PER_TENANT,
  MAX_SURVEY_NAME,
  MAX_SURVEY_DESCRIPTION,
  SURVEY_KINDS,
  type PendingSurveyWrite,
  type SurveyAnswerValue,
  type SurveyOp,
  type SurveyQuestion,
  type SurveyRecord,
} from "./types";
import {
  appendAudit,
  countResponses,
  deleteSurveyRecord,
  generateSurveyEntityId,
  generateSurveySlug,
  getPendingWriteByAction,
  getSurvey,
  listPendingWrites,
  listSurveys,
  markPendingWrite,
  savePendingWrite,
  saveResponse,
  saveSurvey,
} from "./store";

export type SurveyWriteRequest = {
  surveyId?: string;
  /** create/update only — full survey draft body (ids are FORGED-ID rejected). */
  survey?: {
    /** FORGED-ID GUARD: a client-supplied survey id is REJECTED (server-assigned only). */
    id?: string;
    name?: string;
    description?: string;
    kind?: string;
    questions?: Array<{ id?: string; label?: string; kind?: string; required?: boolean; dimension?: string }>;
  };
  /** submit only — answers keyed by question id + optional comment. */
  answers?: Record<string, unknown>;
  comment?: string;
  via?: string;
};

export type SurveyWriteResult =
  | { applied: true; pending: false; surveyId?: string; responseId?: string; op: SurveyOp; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: SurveyOp }
  | { applied: false; pending: false; error: string };

/** Verb-first action names — every verb is in WRITE_VERB (approved by the
 *  classification test; this slice's standing fail-open control). */
const ACTION_NAME: Record<SurveyOp, string> = {
  create: "createSurvey",
  update: "updateSurvey",
  publish: "publishSurvey",
  archive: "archiveSurvey",
  delete: "deleteSurvey",
  submit: "submitSurveyResponse",
};

const isBodyId = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function validateQuestion(q: { label?: string; kind?: string; required?: boolean; dimension?: string }): void {
  if ("id" in q && q.id !== undefined) throw new Error("client-supplied question ids are not accepted"); // forged create-id → 400
  if (typeof q.label !== "string" || q.label.trim().length === 0 || q.label.length > MAX_QUESTION_LABEL) {
    throw new Error("each question needs a label (1..200 chars)");
  }
  if (q.kind !== "nps" && q.kind !== "rating" && q.kind !== "text") throw new Error("question kind must be nps|rating|text");
  if (q.dimension !== undefined && (typeof q.dimension !== "string" || q.dimension.length > 80)) {
    throw new Error("question dimension must be a short label");
  }
}

function validateAnswers(survey: SurveyRecord, answers: Record<string, unknown>, comment?: string): void {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("answers object is required");
  const questionById = new Map(survey.questions.map((q) => [q.id, q]));
  for (const [qid, raw] of Object.entries(answers)) {
    const q = questionById.get(qid);
    if (!q) throw new Error(`unknown question id: ${qid}`); // fail-closed
    if (q.kind === "nps" || q.kind === "rating") {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`question ${qid} expects a number`);
      const max = q.kind === "nps" ? 10 : 5;
      if (n < 0 || n > max) throw new Error(`question ${qid} must be 0..${max}`);
      answers[qid] = n;
    } else if (q.kind === "text") {
      if (typeof raw !== "string" || raw.length > 2000) throw new Error(`question ${qid} expects text (≤2000 chars)`);
    } else {
      throw new Error(`question ${qid} has unknown kind`);
    }
  }
  for (const q of survey.questions) {
    if (q.required && !(q.id in answers)) throw new Error(`required question not answered: ${q.id}`);
  }
  if (comment !== undefined && (typeof comment !== "string" || comment.length > 2000)) throw new Error("comment must be text (≤2000 chars)");
}

function validateWrite(dataDir: string, tenantId: string, op: SurveyOp, req: SurveyWriteRequest): SurveyRecord | null {
  switch (op) {
    case "create": {
      const body = req.survey || {};
      if (body.id !== undefined) throw new Error("client-supplied survey ids are not accepted"); // forged create-id → 400
      const name = body.name?.trim() ?? "";
      if (!name) throw new Error("survey name is required");
      if (name.length > MAX_SURVEY_NAME) throw new Error(`survey name must be ≤${MAX_SURVEY_NAME} chars`);
      if ((body.description?.length ?? 0) > MAX_SURVEY_DESCRIPTION) throw new Error(`description must be ≤${MAX_SURVEY_DESCRIPTION} chars`);
      if (!body.kind || !SURVEY_KINDS.includes(body.kind as (typeof SURVEY_KINDS)[number])) throw new Error("survey kind must be csat|nps|scorecard|custom");
      if (!Array.isArray(body.questions) || body.questions.length === 0 || body.questions.length > MAX_QUESTIONS_PER_SURVEY) {
        throw new Error(`survey needs 1..${MAX_QUESTIONS_PER_SURVEY} questions`);
      }
      for (const q of body.questions) validateQuestion(q);
      if (listSurveys(dataDir, tenantId).length >= MAX_SURVEYS_PER_TENANT) {
        throw new Error(`survey cap reached (${MAX_SURVEYS_PER_TENANT})`);
      }
      return null;
    }
    case "submit": {
      if (!req.surveyId) throw new Error("surveyId is required");
      const survey = getSurvey(dataDir, tenantId, req.surveyId || "");
      if (!survey) throw new Error("survey not found"); // 404-no-IDOR
      if (survey.status !== "published") throw new Error("survey is not published");
      if (countResponses(dataDir, tenantId, survey.id) >= MAX_RESPONSES_PER_SURVEY) {
        throw new Error(`response cap reached (${MAX_RESPONSES_PER_SURVEY}) for this survey`);
      }
      validateAnswers(survey, req.answers || {}, req.comment);
      return survey;
    }
    default: {
      if (!req.surveyId || !isBodyId(req.surveyId)) throw new Error("surveyId is required");
      const survey = getSurvey(dataDir, tenantId, req.surveyId);
      if (!survey) throw new Error("survey not found");
      if (op === "update") {
        if (survey.status !== "draft") throw new Error("surveys can only be edited in draft");
        const body = req.survey || {};
        if (body.questions) {
          if (body.questions.length === 0 || body.questions.length > MAX_QUESTIONS_PER_SURVEY) {
            throw new Error(`survey needs 1..${MAX_QUESTIONS_PER_SURVEY} questions`);
          }
          for (const q of body.questions) validateQuestion(q);
        }
      } else if (op === "publish") {
        if (survey.status !== "draft") throw new Error("only draft surveys can be published");
      } else if (op === "archive") {
        if (survey.status !== "published") throw new Error("only published surveys can be archived");
      } else if (op === "delete") {
        if (survey.status !== "draft") throw new Error("only draft surveys can be deleted");
        if (countResponses(dataDir, tenantId, survey.id) > 0) throw new Error("cannot delete a survey with responses");
      }
      return survey;
    }
  }
}

/** Submit a gated survey write. Validation FIRST — bad writes 400 before the
 *  queue. Returns the updated/created survey. */
export function submitSurveyWrite(
  dataDir: string,
  tenantId: string,
  op: SurveyOp,
  req: SurveyWriteRequest,
  actor: string,
): SurveyWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  try {
    validateWrite(dataDir, tenantId, op, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = ACTION_NAME[op];
  const gate = approvalGate(tenantId, action, "native-survey", { surveyId: req.surveyId, op, via: req.via ?? "portal" }, { dataDir, workflowId: "native-survey" });
  if (gate.allowed) {
    const out = applyNow(dataDir, tenantId, op, req, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error };
    if (gate.autonomy) recordAutonomyOutcome(tenantId, gate.workflowId || "native-survey", action, "native-survey", true, { dataDir, allowListId: gate.allowListId, target: req.surveyId || "" });
    return { applied: true, pending: false, surveyId: out.surveyId, responseId: out.responseId, op, autonomy: !!gate.autonomy, actionId: gate.actionId };
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };

  if (op === "submit") {
    // Cap queued submissions: bound the pending mirror; approve/reject before more.
    const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
    if (pending.length >= MAX_PENDING_SURVEY_WRITES) {
      return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_SURVEY_WRITES}) — approve or reject before more` };
    }
  }
  const ptw: PendingSurveyWrite = {
    id: generateSurveyEntityId("svw"),
    tenantId,
    surveyId: req.surveyId ?? null,
    op,
    payload: { ...req, via: req.via ?? (op === "submit" ? "public" : "portal") },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: op === "submit" ? "native.survey.response.queued" : "native.survey.pending", surveyId: req.surveyId ?? "", detail: `Queued ${action} for approval (${ptw.id})` });
  publishEvent(dataDir, tenantId, op === "submit" ? "native.survey.response.queued" : "native.survey.pending", { surveyId: req.surveyId, ptwId: ptw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Execute the write under authority (autonomy auto-apply or approve path). */
function applyNow(
  dataDir: string,
  tenantId: string,
  op: SurveyOp,
  req: SurveyWriteRequest,
  actor: string,
  autonomy: boolean,
): { ok: true; surveyId?: string; responseId?: string } | { ok: false; error: string } {
  if (op === "create") {
    const body = req.survey!;
    const now = new Date().toISOString();
    const survey: SurveyRecord = {
      id: generateSurveyEntityId("svy"),
      tenantId,
      slug: generateSurveySlug(),
      name: body.name!.trim(),
      description: body.description?.trim() ?? "",
      kind: body.kind as SurveyRecord["kind"],
      questions: body.questions!.map((q) => ({
        id: generateSurveyEntityId("q"),
        label: q.label!.trim(),
        kind: q.kind as SurveyQuestion["kind"],
        required: q.required ?? true,
        dimension: q.dimension?.trim() || undefined,
      })),
      status: "draft",
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    saveSurvey(dataDir, survey);
    appendAudit(dataDir, { tenantId, actor: autonomy ? "system/autonomy" : actor, action: "native.survey.created", surveyId: survey.id, detail: `Created ${survey.kind} survey "${survey.name}" (${survey.id})${autonomy ? " (autonomy)" : ""}` });
    publishEvent(dataDir, tenantId, "native.survey.created", { surveyId: survey.id, kind: survey.kind });
    return { ok: true, surveyId: survey.id };
  }
  if (op === "submit") {
    const survey = getSurvey(dataDir, tenantId, req.surveyId || "");
    if (!survey) return { ok: false, error: "survey not found" };
    const now = new Date().toISOString();
    const response = {
      id: generateSurveyEntityId("rsp"),
      tenantId,
      surveyId: survey.id,
      answers: req.answers as Record<string, SurveyAnswerValue>,
      comment: req.comment,
      status: "recorded" as const,
      submittedAt: now,
      submittedBy: actor,
      recordedAt: now,
    };
    saveResponse(dataDir, response);
    appendAudit(dataDir, { tenantId, actor, action: "native.survey.response.recorded", surveyId: survey.id, responseId: response.id, detail: `Response recorded (${Object.keys(response.answers).length} answers)` });
    publishEvent(dataDir, tenantId, "native.survey.response.recorded", { surveyId: survey.id, responseId: response.id });
    return { ok: true, surveyId: survey.id, responseId: response.id };
  }
  const survey = getSurvey(dataDir, tenantId, req.surveyId || "");
  if (!survey) return { ok: false, error: "survey not found" };
  const now = new Date().toISOString();
  if (op === "update") {
    const body = req.survey || {};
    const next: SurveyRecord = {
      ...survey,
      name: body.name?.trim() || survey.name,
      description: body.description?.trim() ?? survey.description,
      kind: (body.kind as SurveyRecord["kind"]) || survey.kind,
      questions: body.questions ? body.questions.map((q) => ({ id: generateSurveyEntityId("q"), label: q.label!.trim(), kind: q.kind as SurveyQuestion["kind"], required: q.required ?? true, dimension: q.dimension?.trim() || undefined })) : survey.questions,
      version: survey.version + 1,
      updatedAt: now,
      updatedBy: actor,
    };
    saveSurvey(dataDir, next);
    appendAudit(dataDir, { tenantId, actor: autonomy ? "system/autonomy" : actor, action: "native.survey.updated", surveyId: survey.id, detail: `Updated survey (v${next.version})` });
    publishEvent(dataDir, tenantId, "native.survey.updated", { surveyId: survey.id });
    return { ok: true, surveyId: survey.id };
  }
  if (op === "publish") {
    survey.status = "published";
    survey.version += 1;
    survey.updatedAt = now;
    survey.updatedBy = actor;
    saveSurvey(dataDir, survey);
    appendAudit(dataDir, { tenantId, actor: autonomy ? "system/autonomy" : actor, action: "native.survey.published", surveyId: survey.id, detail: "Survey published" });
    publishEvent(dataDir, tenantId, "native.survey.published", { surveyId: survey.id });
    return { ok: true, surveyId: survey.id };
  }
  if (op === "archive") {
    survey.status = "archived";
    survey.version += 1;
    survey.updatedAt = now;
    survey.updatedBy = actor;
    saveSurvey(dataDir, survey);
    appendAudit(dataDir, { tenantId, actor: autonomy ? "system/autonomy" : actor, action: "native.survey.archived", surveyId: survey.id, detail: "Survey archived (terminal)" });
    publishEvent(dataDir, tenantId, "native.survey.archived", { surveyId: survey.id });
    return { ok: true, surveyId: survey.id };
  }
  // delete: only empty drafts (validated above)
  deleteSurveyRecord(dataDir, tenantId, survey.id);
  appendAudit(dataDir, { tenantId, actor: autonomy ? "system/autonomy" : actor, action: "native.survey.deleted", surveyId: survey.id, detail: "Survey deleted" });
  publishEvent(dataDir, tenantId, "native.survey.deleted", { surveyId: survey.id });
  return { ok: true, surveyId: survey.id };
}

/** Approve-path executor: applies the approved write once (idempotent). */
export function executePendingSurveyWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; surveyId?: string; responseId?: string; ptwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; ptwId?: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied") {
    return { ok: true, alreadyApplied: true, surveyId: ptw.surveyId ?? undefined, responseId: ptw.appliedResult?.responseId, ptwId: ptw.id };
  }
  try {
    validateWrite(dataDir, tenantId, ptw.op, ptw.payload as SurveyWriteRequest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: msg });
    return { ok: false, reason: msg, ptwId: ptw.id };
  }
  const out = applyNow(dataDir, tenantId, ptw.op, ptw.payload as SurveyWriteRequest, actor, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: out.error });
    return { ok: false, reason: out.error, ptwId: ptw.id };
  }
  markPendingWrite(dataDir, tenantId, ptw.id, "applied", { responseId: out.responseId });
  return { ok: true, surveyId: out.surveyId, responseId: out.responseId, ptwId: ptw.id };
}

/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingSurveyWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", surveyId: res.surveyId, responseId: res.responseId } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected");
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-survey");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}