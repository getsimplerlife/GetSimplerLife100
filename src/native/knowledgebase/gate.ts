/**
 * native/knowledgebase/gate.ts — GATED WRITE PATH for Phase 4.4 native
 * KNOWLEDGE-BASE / HELP-CENTER slice (article management: draft → published →
 * archived, categories, searchable tenant-owned content + AI answer-draft
 * suggestions that are config-only and OFF by default).
 *
 * Mirrors the 3.4–3.8/4.1–4.3 gates exactly:
 *   - validation BEFORE the gate (forged create-ids, unknown in-tenant
 *     category/article refs, caps, malformed payloads NEVER queue) —
 *     fail-closed,
 *   - every mutation rides the Approval Queue verb-first: createArticle /
 *     updateArticle / publishArticle / archiveArticle / deleteArticle /
 *     createCategory / updateCategory / deleteCategory / requestAnswerDraft —
 *     every verb (create/update/publish/archive/delete/request) is ALREADY in
 *     WRITE_VERB; NO new verb was needed, but the CLASSIFICATION TEST is
 *     extended with all nine gated writes + nine never-gated reads (the
 *     standing fail-open guard: a future action whose verb is not in
 *     WRITE_VERB would be classified a READ and BYPASS the Approval Queue),
 *   - server-assigned ids ONLY (client-supplied ids on create → 400),
 *   - HONEST OUTCOMES: publishing/archiving move the tenant's OWN article
 *     state; requestAnswerDraft persists a durable ANSWER-DRAFT record with an
 *     explicit disabled note — LLM answer drafting is config-only and OFF by
 *     default, and this slice NEVER fabricates an answer ("no answer was
 *     drafted by this slice"),
 *   - a published/archived article is never deleted (content durability);
 *     delete is draft-only; archive is terminal; categories can only be
 *     deleted when no article references them,
 *   - the durable pending-write mirror lands with each approval card; the
 *     approve-path executor is idempotent (replay → alreadyApplied),
 *   - autonomy (#236): allow-listed actions auto-apply with
 *     recordAutonomyOutcome in the shared gate rules.
 */
import { approvalGate, markApproved, markRejected, type ApprovalGateOutcome } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  ANSWER_DRAFT_STATUSES,
  ARTICLE_STATUSES,
  MAX_ANSWER_DRAFTS_PER_TENANT,
  MAX_ARTICLE_BODY,
  MAX_ARTICLE_TITLE,
  MAX_ARTICLES_PER_TENANT,
  MAX_CATEGORIES_PER_TENANT,
  MAX_CATEGORY_DESCRIPTION,
  MAX_CATEGORY_NAME,
  MAX_DAILY_ANSWER_DRAFT_REQUESTS,
  MAX_DRAFT_NOTE_CHARS,
  MAX_PENDING_KNOWLEDGEBASE_WRITES,
  MAX_QUESTION_CHARS,
  MAX_SOURCE_ARTICLE_REFS,
  MAX_TAG_CHARS,
  MAX_TAGS_PER_ARTICLE,
  NATIVE_KNOWLEDGEBASE_PROVIDER,
  NATIVE_KNOWLEDGEBASE_WORKFLOW_ID,
  type AnswerDraft,
  type ArticleStatus,
  type KbArticle,
  type KbCategory,
  type KbOp,
  type PendingKnowledgeBaseWrite,
} from "./types";
import {
  appendAnswerDraft,
  appendAudit,
  countAnswerDrafts,
  countArticlesInCategory,
  deleteArticleRecord,
  deleteCategoryRecord,
  generateKnowledgeBaseEntityId,
  getAnswerDraft,
  getArticle,
  getCategory,
  getPendingWriteByAction,
  listAnswerDrafts,
  listArticles,
  listCategories,
  listPendingWrites,
  markPendingWrite,
  saveArticle,
  saveCategory,
  savePendingWrite,
} from "./store";

/** Verb-first action names — every verb ∈ WRITE_VERB (create/update/publish/
 *  archive/delete/request). No new verb was required by this slice; the
 *  classification test asserts all nine so a future verb gap can't silently
 *  bypass the Queue (the standing 2.5/3.1–3.8/4.1–4.3 fail-open guard). */
const ACTION_NAME: Record<KbOp, string> = {
  createArticle: "createArticle",
  updateArticle: "updateArticle",
  publishArticle: "publishArticle",
  archiveArticle: "archiveArticle",
  deleteArticle: "deleteArticle",
  createCategory: "createCategory",
  updateCategory: "updateCategory",
  deleteCategory: "deleteCategory",
  requestAnswerDraft: "requestAnswerDraft",
};

export type KnowledgeBaseWriteResult =
  | { applied: true; pending: false; op: KbOp; id?: string; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: KbOp }
  | { applied: false; pending: false; error: string };

// ── validation helpers (fail-closed, BEFORE the gate) ────────────────────────
function assertCategoryName(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("name is required");
  const name = v.trim();
  if (name.length > MAX_CATEGORY_NAME) throw new Error(`name must be ≤${MAX_CATEGORY_NAME} characters`);
  return name;
}
function assertCategoryDescription(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new Error("description must be a string");
  const d = v.trim();
  if (d.length > MAX_CATEGORY_DESCRIPTION) throw new Error(`description must be ≤${MAX_CATEGORY_DESCRIPTION} characters`);
  return d;
}
function assertTitle(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("title is required");
  const title = v.trim();
  if (title.length > MAX_ARTICLE_TITLE) throw new Error(`title must be ≤${MAX_ARTICLE_TITLE} characters`);
  return title;
}
function assertBody(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("body is required");
  const body = v.trim();
  if (body.length > MAX_ARTICLE_BODY) throw new Error(`body must be ≤${MAX_ARTICLE_BODY} characters`);
  return body;
}
function assertTags(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("tags must be an array of tag strings");
  const tags: string[] = [];
  for (const t of v) {
    if (typeof t !== "string" || t.trim().length === 0) throw new Error("each tag must be a non-empty string");
    if (t.length > MAX_TAG_CHARS) throw new Error(`each tag must be ≤${MAX_TAG_CHARS} characters`);
    if (!tags.includes(t.trim())) tags.push(t.trim());
  }
  if (tags.length > MAX_TAGS_PER_ARTICLE) throw new Error(`tags must be ≤${MAX_TAGS_PER_ARTICLE}`);
  return tags;
}
function assertCategoryRef(dataDir: string, tenantId: string, v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("categoryId must be a category id");
  if (!getCategory(dataDir, tenantId, v)) throw new Error("category not found"); // foreign/stranger → 400 (no IDOR)
  return v;
}
function assertQuestion(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("question is required");
  const q = v.trim();
  if (q.length > MAX_QUESTION_CHARS) throw new Error(`question must be ≤${MAX_QUESTION_CHARS} characters`);
  return q;
}
function assertSourceArticleIds(dataDir: string, tenantId: string, v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("sourceArticleIds must be an array of article ids");
  const ids: string[] = [];
  for (const id of v) {
    if (typeof id !== "string" || id.trim().length === 0) throw new Error("each sourceArticleId must be an article id");
    const article = getArticle(dataDir, tenantId, id);
    if (!article) throw new Error("source article not found"); // foreign/stranger → 400 (no IDOR)
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > MAX_SOURCE_ARTICLE_REFS) throw new Error(`sourceArticleIds must be ≤${MAX_SOURCE_ARTICLE_REFS}`);
  return ids;
}

/** Validate the category payload production-style (create + update merged). */
function validateCategory(
  body: Record<string, unknown>,
): {
  name: string;
  description: string;
} {
  if (body.id !== undefined) throw new Error("client-supplied category ids are not accepted"); // forged create-id → 400
  const name = assertCategoryName(body.name);
  const description = assertCategoryDescription(body.description);
  return { name, description };
}

/** Validate the article payload production-style (create + update merged). */
function validateArticle(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
): {
  categoryId?: string;
  title: string;
  body: string;
  tags: string[];
} {
  if (body.id !== undefined) throw new Error("client-supplied article ids are not accepted"); // forged create-id → 400
  const categoryId = assertCategoryRef(dataDir, tenantId, body.categoryId);
  const title = assertTitle(body.title);
  const content = assertBody(body.body);
  const tags = assertTags(body.tags);
  return { categoryId, title, body: content, tags };
}

/** Validate + normalize the payload into what applyNow persists. */
function prepareWrite(dataDir: string, tenantId: string, op: KbOp, payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object");
  switch (op) {
    case "createCategory": {
      if (listCategories(dataDir, tenantId).length >= MAX_CATEGORIES_PER_TENANT) {
        throw new Error(`category cap reached (${MAX_CATEGORIES_PER_TENANT})`);
      }
      return validateCategory(payload) as unknown as Record<string, unknown>;
    }
    case "updateCategory": {
      if (typeof payload.categoryId !== "string" || !getCategory(dataDir, tenantId, payload.categoryId)) throw new Error("category not found");
      const base = getCategory(dataDir, tenantId, payload.categoryId)!;
      const merged: Record<string, unknown> = {
        name: base.name,
        description: base.description,
        ...payload,
        id: undefined,
        categoryId: undefined,
      };
      const v = validateCategory(merged);
      return { ...v, categoryId: base.id } as unknown as Record<string, unknown>;
    }
    case "deleteCategory": {
      if (typeof payload.categoryId !== "string" || !getCategory(dataDir, tenantId, payload.categoryId)) throw new Error("category not found");
      if (countArticlesInCategory(dataDir, tenantId, payload.categoryId) > 0) {
        throw new Error("category still has articles — move or delete them first");
      }
      return { categoryId: payload.categoryId } as Record<string, unknown>;
    }
    case "createArticle": {
      if (listArticles(dataDir, tenantId).length >= MAX_ARTICLES_PER_TENANT) {
        throw new Error(`article cap reached (${MAX_ARTICLES_PER_TENANT})`);
      }
      return validateArticle(dataDir, tenantId, payload) as unknown as Record<string, unknown>;
    }
    case "updateArticle": {
      if (typeof payload.articleId !== "string" || !getArticle(dataDir, tenantId, payload.articleId)) throw new Error("article not found");
      const base = getArticle(dataDir, tenantId, payload.articleId)!;
      if (base.status !== "draft" && base.status !== "published") throw new Error("only draft or published articles can be edited");
      const merged: Record<string, unknown> = {
        categoryId: base.categoryId,
        title: base.title,
        body: base.body,
        tags: base.tags,
        ...payload,
        id: undefined,
        articleId: undefined,
      };
      const v = validateArticle(dataDir, tenantId, merged);
      return { ...v, articleId: base.id, _status: base.status } as unknown as Record<string, unknown>;
    }
    case "publishArticle": {
      if (typeof payload.articleId !== "string" || !getArticle(dataDir, tenantId, payload.articleId)) throw new Error("article not found");
      const base = getArticle(dataDir, tenantId, payload.articleId)!;
      if (base.status !== "draft") throw new Error("only draft articles can be published");
      return { articleId: base.id } as Record<string, unknown>;
    }
    case "archiveArticle": {
      if (typeof payload.articleId !== "string" || !getArticle(dataDir, tenantId, payload.articleId)) throw new Error("article not found");
      const base = getArticle(dataDir, tenantId, payload.articleId)!;
      if (base.status !== "draft" && base.status !== "published") throw new Error("only draft or published articles can be archived");
      return { articleId: base.id } as Record<string, unknown>;
    }
    case "deleteArticle": {
      if (typeof payload.articleId !== "string" || !getArticle(dataDir, tenantId, payload.articleId)) throw new Error("article not found");
      const base = getArticle(dataDir, tenantId, payload.articleId)!;
      if (base.status !== "draft") throw new Error("only draft articles can be deleted (published/archived articles keep their content)");
      return { articleId: base.id } as Record<string, unknown>;
    }
    case "requestAnswerDraft": {
      if (countAnswerDrafts(dataDir, tenantId) >= MAX_ANSWER_DRAFTS_PER_TENANT) {
        throw new Error(`answer-draft cap reached (${MAX_ANSWER_DRAFTS_PER_TENANT})`);
      }
      if (countDraftRequestsToday(dataDir, tenantId) >= MAX_DAILY_ANSWER_DRAFT_REQUESTS) {
        throw new Error(`daily answer-draft request cap (${MAX_DAILY_ANSWER_DRAFT_REQUESTS}) reached`);
      }
      const question = assertQuestion(payload.question);
      const sourceArticleIds = assertSourceArticleIds(dataDir, tenantId, payload.sourceArticleIds);
      return { question, sourceArticleIds } as Record<string, unknown>;
    }
    default:
      throw new Error("unknown knowledge-base op");
  }
}

function countDraftRequestsToday(dataDir: string, tenantId: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return listAnswerDrafts(dataDir, tenantId).filter((d) => d.requestedAt.slice(0, 10) === today).length;
}

/** Honest note carried by every answer-draft this slice persists. */
export const ANSWER_DRAFT_DISABLED_NOTE =
  "AI answer drafting is not enabled — no answer was drafted by this slice. " +
  "Answer drafts require the owner to configure an LLM provider (config-only, OFF by default).";

/** Execute the write under authority (autonomy auto-apply or approve path). */
function applyNow(
  dataDir: string,
  tenantId: string,
  op: KbOp,
  p: Record<string, unknown>,
  actor: string,
  autonomy: boolean,
): { ok: true; id?: string } | { ok: false; error: string } {
  const now = new Date().toISOString();
  const auditActor = autonomy ? "system/autonomy" : actor;
  const suffix = autonomy ? " (autonomy)" : "";
  try {
    if (op === "createCategory") {
      const c: KbCategory = {
        id: generateKnowledgeBaseEntityId("kbc"),
        tenantId,
        name: p.name as string,
        description: p.description as string,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
      };
      saveCategory(dataDir, c);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.knowledgebase.category.created", entityId: c.id, detail: `Created category "${c.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.knowledgebase.category.created", { categoryId: c.id, name: c.name });
      return { ok: true, id: c.id };
    }
    if (op === "updateCategory") {
      const base = getCategory(dataDir, tenantId, p.categoryId as string);
      if (!base) return { ok: false, error: "category not found" };
      const next: KbCategory = { ...base, name: p.name as string, description: p.description as string, updatedAt: now, updatedBy: actor };
      saveCategory(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.knowledgebase.category.updated", entityId: base.id, detail: `Updated category "${next.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.knowledgebase.category.updated", { categoryId: base.id, name: next.name });
      return { ok: true, id: base.id };
    }
    if (op === "deleteCategory") {
      deleteCategoryRecord(dataDir, tenantId, p.categoryId as string);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.knowledgebase.category.deleted", entityId: p.categoryId as string, detail: `Deleted category${suffix}` });
      publishEvent(dataDir, tenantId, "native.knowledgebase.category.deleted", { categoryId: p.categoryId });
      return { ok: true, id: p.categoryId as string };
    }
    if (op === "createArticle") {
      const a: KbArticle = {
        id: generateKnowledgeBaseEntityId("kba"),
        tenantId,
        categoryId: (p.categoryId as string | undefined) || undefined,
        title: p.title as string,
        body: p.body as string,
        tags: p.tags as string[],
        status: "draft",
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
      };
      saveArticle(dataDir, a);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.knowledgebase.article.created", entityId: a.id, detail: `Created article draft "${a.title}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.knowledgebase.article.created", { articleId: a.id, title: a.title });
      return { ok: true, id: a.id };
    }
    if (op === "updateArticle") {
      const base = getArticle(dataDir, tenantId, p.articleId as string);
      if (!base) return { ok: false, error: "article not found" };
      const next: KbArticle = { ...base, categoryId: (p.categoryId as string | undefined) || undefined, title: p.title as string, body: p.body as string, tags: p.tags as string[], updatedAt: now, updatedBy: actor };
      saveArticle(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.knowledgebase.article.updated", entityId: base.id, detail: `Updated article "${next.title}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.knowledgebase.article.updated", { articleId: base.id, title: next.title });
      return { ok: true, id: base.id };
    }
    if (op === "publishArticle") {
      const base = getArticle(dataDir, tenantId, p.articleId as string);
      if (!base) return { ok: false, error: "article not found" };
      if (base.status !== "draft") return { ok: false, error: "only draft articles can be published" };
      const next: KbArticle = { ...base, status: "published", publishedAt: now, publishedBy: actor, updatedAt: now, updatedBy: actor };
      saveArticle(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.knowledgebase.article.published", entityId: base.id, detail: `Published article "${next.title}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.knowledgebase.article.published", { articleId: base.id, title: next.title });
      return { ok: true, id: base.id };
    }
    if (op === "archiveArticle") {
      const base = getArticle(dataDir, tenantId, p.articleId as string);
      if (!base) return { ok: false, error: "article not found" };
      const next: KbArticle = { ...base, status: "archived", archivedAt: now, archivedBy: actor, updatedAt: now, updatedBy: actor };
      saveArticle(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.knowledgebase.article.archived", entityId: base.id, detail: `Archived article "${next.title}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.knowledgebase.article.archived", { articleId: base.id, title: next.title });
      return { ok: true, id: base.id };
    }
    if (op === "deleteArticle") {
      deleteArticleRecord(dataDir, tenantId, p.articleId as string);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.knowledgebase.article.deleted", entityId: p.articleId as string, detail: `Deleted draft article${suffix}` });
      publishEvent(dataDir, tenantId, "native.knowledgebase.article.deleted", { articleId: p.articleId });
      return { ok: true, id: p.articleId as string };
    }
    if (op === "requestAnswerDraft") {
      const draft: AnswerDraft = {
        id: generateKnowledgeBaseEntityId("kbd"),
        tenantId,
        question: p.question as string,
        sourceArticleIds: p.sourceArticleIds as string[],
        status: "disabled",
        note: ANSWER_DRAFT_DISABLED_NOTE.slice(0, MAX_DRAFT_NOTE_CHARS),
        requestedBy: actor,
        requestedAt: now,
        completedAt: now,
      };
      appendAnswerDraft(dataDir, draft);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.knowledgebase.answerdraft.requested", entityId: draft.id, detail: `Queued answer-draft request "${draft.question.slice(0, 80)}" — NO answer drafted (LLM config-only, OFF by default)${suffix}` });
      publishEvent(dataDir, tenantId, "native.knowledgebase.answerdraft.requested", { draftId: draft.id, question: draft.question.slice(0, 160), status: draft.status });
      return { ok: true, id: draft.id };
    }
    return { ok: false, error: "unknown knowledge-base op" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Submit a gated knowledge-base write. Validation FIRST — bad writes 400 before
 * the queue. Returns applied / pending / error.
 */
export function submitKnowledgeBaseWrite(
  dataDir: string,
  tenantId: string,
  op: KbOp,
  req: { payload: Record<string, unknown>; via?: string },
  actor: string,
): KnowledgeBaseWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  const payload = req.payload ?? {};
  const action = ACTION_NAME[op];

  // 1. Fail-closed validation BEFORE the gate + cap pre-checks.
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, op, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }

  // 2. Gate (verb-first — every KB action verb is already ∈ WRITE_VERB).
  const gate: ApprovalGateOutcome = approvalGate(tenantId, action, NATIVE_KNOWLEDGEBASE_PROVIDER, { op, via: req.via ?? "portal" }, { dataDir, workflowId: NATIVE_KNOWLEDGEBASE_WORKFLOW_ID });
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  if (gate.allowed) {
    const out = applyNow(dataDir, tenantId, op, prepared, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error };
    if (gate.autonomy) recordAutonomyOutcome(tenantId, NATIVE_KNOWLEDGEBASE_WORKFLOW_ID, action, NATIVE_KNOWLEDGEBASE_PROVIDER, true, { dataDir, allowListId: gate.allowListId, target: out.id ?? "" });
    return { applied: true, pending: false, op, id: out.id, autonomy: !!gate.autonomy, actionId: gate.actionId };
  }

  // 3. Queue: cap the pending mirror, then persist the durable card.
  const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
  if (pending.length >= MAX_PENDING_KNOWLEDGEBASE_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_KNOWLEDGEBASE_WRITES}) — approve or reject before more` };
  }
  const kbw: PendingKnowledgeBaseWrite = {
    id: generateKnowledgeBaseEntityId("kbw"),
    tenantId,
    op,
    action,
    payload: prepared,
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, kbw);
  appendAudit(dataDir, { tenantId, actor, action: auditActionFor(op, "pending"), entityId: kbw.id, detail: `Queued ${action} for approval (${kbw.id})` });
  publishEvent(dataDir, tenantId, eventTypeFor(op, "pending"), { op, kbwId: kbw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Approve-path executor: applies the approved write once (idempotent). */
export function executePendingKnowledgeBaseWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; id?: string; kbwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; kbwId?: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const kbw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!kbw) return { ok: false, reason: "no pending write for this approval action" };
  if (kbw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (kbw.status === "applied") {
    return { ok: true, alreadyApplied: true, id: (kbw.appliedResult?.id as string) ?? undefined, kbwId: kbw.id };
  }
  // Re-validate at apply time (authority does not bypass the contract).
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, kbw.op, kbw.payload as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, kbw.id, "rejected", { error: msg });
    return { ok: false, reason: msg, kbwId: kbw.id };
  }
  const out = applyNow(dataDir, tenantId, kbw.op, prepared, actor, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, kbw.id, "rejected", { error: out.error });
    return { ok: false, reason: out.error, kbwId: kbw.id };
  }
  markPendingWrite(dataDir, tenantId, kbw.id, "applied", { appliedResult: { id: out.id } });
  return { ok: true, id: out.id, kbwId: kbw.id };
}

/** REJECT path — the card is discarded; nothing is written. */
export function rejectKnowledgeBaseWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; already?: boolean } | { ok: false; reason: string } {
  const kbw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!kbw) return { ok: false, reason: "no pending write for this approval action" };
  if (kbw.status !== "pending") return { ok: true, already: true };
  markPendingWrite(dataDir, tenantId, kbw.id, "rejected", { error: "rejected by owner" });
  markRejected(tenantId, kbw.approvalActionId, actor, dataDir);
  appendAudit(dataDir, { tenantId, actor, action: auditActionFor(kbw.op, "rejected"), entityId: kbw.id, detail: `Rejected ${kbw.action} (${kbw.id})` });
  publishEvent(dataDir, tenantId, eventTypeFor(kbw.op, "rejected"), { op: kbw.op, kbwId: kbw.id });
  return { ok: true };
}

/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const kbw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!kbw || kbw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingKnowledgeBaseWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(
      tenantId,
      approvalActionId,
      owner,
      { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", id: res.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) },
      dataDir,
    );
  } else {
    markPendingWrite(dataDir, tenantId, kbw.id, "rejected", { error: "rejected by owner" });
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

/** Audit action name for an op+phase (native.knowledgebase.*). */
function auditActionFor(op: KbOp, phase: "pending" | "applied" | "rejected"): string {
  void op;
  return phase === "rejected" ? "native.knowledgebase.rejected" : "native.knowledgebase.pending";
}
function eventTypeFor(op: KbOp, phase: "pending" | "applied" | "rejected"): string {
  void op;
  if (phase === "pending") return "native.knowledgebase.pending";
  if (phase === "rejected") return "native.knowledgebase.rejected";
  return "native.knowledgebase.applied";
}

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, NATIVE_KNOWLEDGEBASE_PROVIDER);
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}

// ── Safe GET projections ─────────────────────────────────────────────────────
export function publicCategory(c: KbCategory): KbCategory {
  return { ...c };
}
export function publicArticle(a: KbArticle): KbArticle {
  return { ...a };
}
export function publicAnswerDraft(d: AnswerDraft): AnswerDraft {
  return { ...d };
}
export function getActionName(op: KbOp): string {
  return ACTION_NAME[op];
}
export { listAnswerDrafts, getAnswerDraft, searchArticles, listArticles, getArticle, listCategories, getCategory, ANSWER_DRAFT_STATUSES, ARTICLE_STATUSES };