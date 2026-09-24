/**
 * native/survey/types.ts — Phase 3.4 native SURVEYS / NPS / SCORECARDS
 * (survey builder → published share lane → gated responses → feedback
 * aggregation). Discipline mirrors 2.1–3.3 exactly:
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.survey.* audit; server-assigned ids ONLY (svy_/q_/rsp_/svw_),
 *   - every write rides the Approval Queue verb-first: owner ops
 *     createSurvey/updateSurvey/publishSurvey/archiveSurvey/deleteSurvey and
 *     the PUBLIC response submit `submitSurveyResponse` (verb-first, all
 *     verbs already in WRITE_VERB; the classification test asserts every one
 *     is a WRITE — standing fail-open control),
 *   - validation BEFORE the gate (bad answers / illegal status transitions /
 *     unknown survey never queue),
 *   - public share lane: slug-gated, rate-limited, replies carry ONLY
 *     {status}; safe summary exposes nothing tenant-internal (no-leak),
 *   - caps (≤50 surveys/tenant, ≤20 questions/survey, ≤1000 responses/survey,
 *     ≤20 pending response writes),
 *   - typed native.survey.* events via the Phase 1.1 registry + authed-only
 *     management surface (401 fail-closed).
 */
export type SurveyKind = "csat" | "nps" | "scorecard" | "custom";
export const SURVEY_KINDS: readonly SurveyKind[] = ["csat", "nps", "scorecard", "custom"];

export interface SurveyQuestion {
  id: string; // q_<random> — server-assigned
  /** Prompt shown to the respondent. */
  label: string;
  /** Scale kind: nps 0-10, rating 1-5, text free-form. */
  kind: "nps" | "rating" | "text";
  required: boolean;
  /** Scorecard only: which role/competency this question scores (optional). */
  dimension?: string;
}
export interface SurveyQuestionDef extends SurveyQuestion {}

export interface SurveyRecord {
  id: string; // svy_<random>
  tenantId: string;
  slug: string; // unique per tenant, server-assigned on create
  name: string;
  description: string;
  kind: SurveyKind;
  questions: SurveyQuestion[];
  status: "draft" | "published" | "archived"; // draft→published→archived (terminal)
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type SurveyAnswerValue = number | string;

export interface SurveyResponse {
  id: string; // rsp_<random>
  tenantId: string;
  surveyId: string;
  /** questionId → answer (validated against the question shape BEFORE gating). */
  answers: Record<string, SurveyAnswerValue>;
  comment?: string;
  status: "pending" | "recorded" | "rejected"; // gated: pending → recorded|rejected
  submittedAt: string;
  submittedBy: string; // "public:<anon>" or the authed actor
  recordedAt?: string;
}

export interface PendingSurveyWrite {
  id: string; // svw_<random>
  tenantId: string;
  surveyId: string | null;
  op: SurveyOp;
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { status?: string; responseId?: string };
  error?: string;
}

export type SurveyOp = "create" | "update" | "publish" | "archive" | "delete" | "submit";

// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_SURVEYS_PER_TENANT = 50;
export const MAX_QUESTIONS_PER_SURVEY = 20;
export const MAX_SURVEY_NAME = 120;
export const MAX_SURVEY_DESCRIPTION = 500;
export const MAX_QUESTION_LABEL = 200;
export const MAX_RESPONSES_PER_SURVEY = 1000;
export const MAX_PENDING_SURVEY_WRITES = 20;
export const PUBLIC_SHARE_RATE_LIMIT = 10; // per slug+client per minute

// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_SURVEY_KEY = "native_surveys.json";
export const NATIVE_SURVEY_RESPONSES_KEY = "native_survey_responses.json";
export const NATIVE_SURVEY_PENDING_KEY = "native_survey_pending.json";
export const NATIVE_SURVEY_AUDIT_KEY = "native_survey_audit.json";