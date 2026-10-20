/**
 * native/knowledgebase/types.ts — Phase 4.4 native KNOWLEDGE-BASE /
 * HELP-CENTER slice (article management: draft → published → archived,
 * categories, searchable content over the tenant's OWN articles + AI
 * answer-draft suggestions that are config-only and OFF by default).
 *
 * Discipline mirrors 1.4/3.4–3.8/4.1–4.3 exactly:
 *   - tenant-keyed stores + durable pending-write mirror + immutable
 *     native.knowledgebase.* audit; server-assigned ids ONLY
 *     (kbc_/kba_/kbd_/kbw_/kbu_),
 *   - every user-initiated WRITE rides the Approval Queue verb-first
 *     (createArticle / updateArticle / publishArticle / archiveArticle /
 *     deleteArticle / createCategory / updateCategory / deleteCategory /
 *     requestAnswerDraft) — every verb (create/update/publish/archive/delete/
 *     request) is ALREADY in WRITE_VERB, so this slice does not need a new
 *     verb; the classification test is EXTENDED with all nine gated writes +
 *     nine never-gated reads to lock the standing fail-open guard,
 *   - validation BEFORE the gate: forged create-ids, unknown in-tenant
 *     category/article refs, caps and malformed payloads NEVER queue
 *     (fail-closed),
 *   - HONEST OUTCOMES ONLY: publishing/archiving move the tenant's own article
 *     state; requestAnswerDraft persists a durable ANSWER-DRAFT record with an
 *     explicit disabled note — LLM answer drafting is config-only and OFF by
 *     default, and this slice NEVER fabricates an answer ("no answer was
 *     drafted by this slice"),
 *   - typed events native.knowledgebase.* via the Phase 1.1 registry;
 *     authed-only surface (401 fail-closed); NO public share lane.
 */
export const NATIVE_KNOWLEDGEBASE_CATEGORIES_KEY = "knowledgebase_categories.json";
export const NATIVE_KNOWLEDGEBASE_ARTICLES_KEY = "knowledgebase_articles.json";
export const NATIVE_KNOWLEDGEBASE_DRAFTS_KEY = "knowledgebase_drafts.json";
export const NATIVE_KNOWLEDGEBASE_PENDING_KEY = "knowledgebase_pending.json";
export const NATIVE_KNOWLEDGEBASE_AUDIT_KEY = "knowledgebase_audit.json";
export const NATIVE_KNOWLEDGEBASE_PROVIDER = "native-knowledgebase";
export const NATIVE_KNOWLEDGEBASE_WORKFLOW_ID = "native-knowledgebase";

// ── Caps (fail-closed; enforced in gate.ts BEFORE the gate) ────────────────
export const MAX_CATEGORIES_PER_TENANT = 20;
export const MAX_ARTICLES_PER_TENANT = 200;
export const MAX_ANSWER_DRAFTS_PER_TENANT = 50;
export const MAX_PENDING_KNOWLEDGEBASE_WRITES = 50;
export const MAX_DAILY_ANSWER_DRAFT_REQUESTS = 100;
export const MAX_CATEGORY_NAME = 80;
export const MAX_CATEGORY_DESCRIPTION = 300;
export const MAX_ARTICLE_TITLE = 160;
export const MAX_ARTICLE_BODY = 20000; // bounded content
export const MAX_TAGS_PER_ARTICLE = 10;
export const MAX_TAG_CHARS = 40;
export const MAX_QUESTION_CHARS = 500;
export const MAX_SOURCE_ARTICLE_REFS = 20;
export const MAX_DRAFT_NOTE_CHARS = 300;

export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];
/** Only status this slice ever produces — LLM answer drafting is config-only,
 *  OFF by default; a draft record carries an honest disabled note and never a
 *  fabricated answer. */
export const ANSWER_DRAFT_STATUSES = ["disabled"] as const;
export type AnswerDraftStatus = (typeof ANSWER_DRAFT_STATUSES)[number];

/** A knowledge-base category (tenant's own help-center taxonomy). */
export interface KbCategory {
  id: string; // kbc_<random> — server-assigned
  tenantId: string;
  name: string;
  description: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** A knowledge-base article — tenant-owned content (draft → published →
 *  archived). Updates allowed on draft/published; delete only from draft;
 *  archived is terminal (kept for audit + search). */
export interface KbArticle {
  id: string; // kba_<random> — server-assigned
  tenantId: string;
  categoryId?: string; // kbc_<...> — validated in-tenant
  title: string;
  body: string;
  tags: string[];
  status: ArticleStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  publishedAt?: string;
  publishedBy?: string;
  archivedAt?: string;
  archivedBy?: string;
}

/** AI answer-draft suggestion record. NEVER a fabricated answer: LLM answer
 *  drafting is config-only and OFF by default, so every draft this slice
 *  persists carries the honest disabled note below. sourceArticleIds are the
 *  tenant's OWN articles only (in-tenant validated). */
export interface AnswerDraft {
  id: string; // kbd_<random> — server-assigned
  tenantId: string;
  question: string;
  sourceArticleIds: string[];
  status: AnswerDraftStatus; // "disabled"
  note: string; // honest disabled note
  requestedBy: string;
  requestedAt: string;
  completedAt?: string;
}

export interface PendingKnowledgeBaseWrite {
  id: string; // kbw_<random> — server-assigned
  tenantId: string;
  op: KbOp;
  action: string; // approval action name (verb-first)
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: Record<string, unknown>;
  error?: string;
}

export interface NativeKnowledgeBaseAuditEntry {
  id: string; // kbu_<random> — server-assigned
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.knowledgebase.*
  entityId?: string;
  detail: string;
}

export type KbOp =
  | "createArticle"
  | "updateArticle"
  | "publishArticle"
  | "archiveArticle"
  | "deleteArticle"
  | "createCategory"
  | "updateCategory"
  | "deleteCategory"
  | "requestAnswerDraft";