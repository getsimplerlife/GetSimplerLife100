/**
 * native-knowledgebase.test.ts — Phase 4.4 native KNOWLEDGE-BASE /
 * HELP-CENTER slice (article management: draft → published → archived,
 * categories, searchable tenant-owned content + AI answer-draft suggestions,
 * config-only OFF by default).
 *
 * Coverage (every standing contract):
 *   - write-verb classification: all nine mutation actions gate (verb-first;
 *     no NEW verb required — create/update/publish/archive/delete/request are
 *     ALREADY in WRITE_VERB — but the classification test is extended with the
 *     full surface so a future verb gap can't silently bypass the Queue),
 *     reads pass,
 *   - approval-by-default: article/category/draft requests queue and only the
 *     approve-path executor persists them,
 *   - lifecycle: draft → published → archived; update on draft/published;
 *     delete draft-only; archive terminal; category delete blocked while any
 *     article references it,
 *   - HONEST answer drafts: requestAnswerDraft queues and the approved record
 *     carries the explicit disabled note — LLM drafting is config-only, OFF by
 *     default, and the slice NEVER fabricates an answer,
 *   - idempotent apply (replay → alreadyApplied, no duplicates) + reject
 *     discards,
 *   - fail-closed validation BEFORE the gate (forged create-ids, foreign
 *     category/article refs, caps → never queued),
 *   - server-assigned ids only; cross-tenant/stranger ids → 404-no-IDOR,
 *   - tenant-scoped search (stranger content never surfaces),
 *   - typed native.knowledgebase.* event registration,
 *   - HTTP surface: 200/201/202/400/404/405 and cross-tenant reads return 404.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWriteAction } from "../lib/approval-queue";
import { handleNativeKnowledgeBaseAuthed, registerBuiltinNativeKnowledgeBaseEventTypes } from "../native/knowledgebase/router";
import { executePendingKnowledgeBaseWrite, rejectKnowledgeBaseWrite, submitKnowledgeBaseWrite } from "../native/knowledgebase/gate";
import { listAnswerDrafts, listArticles, listAudit, listCategories, listPendingWrites, searchArticles } from "../native/knowledgebase/store";
import {
  MAX_CATEGORIES_PER_TENANT,
  MAX_SOURCE_ARTICLE_REFS,
} from "../native/knowledgebase/types";
import { validateNativeEventType } from "../native/webhooks/registry";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-knowledgebase-"));
  registerBuiltinNativeKnowledgeBaseEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Submit a write and expect it to QUEUE (approval default ON). */
function queueVia(op: Parameters<typeof submitKnowledgeBaseWrite>[2], payload: Record<string, unknown>, tenant = T1, actor = tenant) {
  const res = submitKnowledgeBaseWrite(dir, tenant, op, { payload, via: "portal" }, actor);
  expect(res.applied, JSON.stringify(res)).toBe(false);
  if (res.applied || !("approvalActionId" in res)) throw new Error("expected pending");
  return res as Extract<ReturnType<typeof submitKnowledgeBaseWrite>, { pending: true }>;
}
/** Approve the queued write via the approve-path executor. */
function approveVia(approvalActionId: string, tenant = T1, actor = tenant) {
  const res = executePendingKnowledgeBaseWrite(dir, tenant, approvalActionId, actor);
  expect(res.ok, JSON.stringify(res)).toBe(true);
  if (!res.ok) throw new Error("expected ok, got: " + res.reason);
  return res as { ok: true; id?: string; kbwId: string; alreadyApplied?: boolean };
}
/** Create a category the approved way and return its server-assigned id. */
function seedCategory(name = "Operations", tenant = T1): string {
  approveVia(queueVia("createCategory", { name, description: "ops help" }, tenant).approvalActionId, tenant);
  const categories = listCategories(dir, tenant);
  expect(categories.length).toBeGreaterThan(0);
  return categories[categories.length - 1]!.id;
}
/** Create a draft article the approved way and return its server-assigned id
 *  (cumulative-safe — returns the newest article for the tenant). */
function seedArticle(categoryId?: string, tenant = T1): { id: string } {
  approveVia(queueVia("createArticle", { categoryId, title: "How to file", body: "Step by step filing guide", tags: ["filing"] }, tenant).approvalActionId, tenant);
  const articles = listArticles(dir, tenant);
  expect(articles.length).toBeGreaterThan(0);
  return { id: articles[articles.length - 1]!.id };
}

// ── 1. Write-verb classification (standing fail-open guard) ───────────────
describe("write-verb classification", () => {
  it("gates every knowledge-base mutation verb-first (verbs already in WRITE_VERB)", () => {
    for (const name of [
      "createArticle", "updateArticle", "publishArticle",
      "archiveArticle", "deleteArticle",
      "createCategory", "updateCategory", "deleteCategory",
      "requestAnswerDraft",
    ]) {
      expect(isWriteAction(name), name).toBe(true);
    }
  });
  it("never gates pure READ actions", () => {
    for (const name of [
      "listArticles", "getArticle", "listCategories", "getCategory",
      "searchArticles", "listAnswerDrafts", "getAnswerDraft",
      "listKnowledgeBaseWrites", "listKnowledgeBaseAudit",
    ]) {
      expect(isWriteAction(name), name).toBe(false);
    }
  });
});

// ── 2. Approval-by-default + article lifecycle ────────────────────────────
describe("article lifecycle (approval-gated)", () => {
  it("create queues; approve persists a draft article with server-assigned id", () => {
    const queued = queueVia("createArticle", { title: "How to file", body: "Step by step", tags: ["filing"] });
    const res = approveVia(queued.approvalActionId);
    const articles = listArticles(dir, T1);
    expect(articles).toHaveLength(1);
    expect(articles[0]!.id.startsWith("kba_")).toBe(true);
    expect(articles[0]!.status).toBe("draft");
    expect(articles[0]!.tags).toEqual(["filing"]);
    expect(res.id).toBe(articles[0]!.id);
  });

  it("publish/archive are gated transitions: draft → published → archived", () => {
    const { id } = seedArticle();
    approveVia(queueVia("publishArticle", { articleId: id }).approvalActionId);
    expect(listArticles(dir, T1)[0]!.status).toBe("published");
    expect(listArticles(dir, T1)[0]!.publishedBy).toBe(T1);

    approveVia(queueVia("archiveArticle", { articleId: id }).approvalActionId);
    expect(listArticles(dir, T1)[0]!.status).toBe("archived");
    expect(listArticles(dir, T1)[0]!.archivedBy).toBe(T1);

    // archived is terminal — publishing an archived article fails before the gate
    const bad = submitKnowledgeBaseWrite(dir, T1, "publishArticle", { payload: { articleId: id } }, T1);
    expect(bad.applied).toBe(false);
    expect("error" in bad && /only draft/.test(bad.error ?? "")).toBe(true);
  });

  it("update is gated and allowed on draft + published, not archived; delete only drafts", () => {
    const { id } = seedArticle();
    approveVia(queueVia("updateArticle", { articleId: id, title: "How to file (v2)", body: "New body", tags: ["filing", "guide"] }).approvalActionId);
    expect(listArticles(dir, T1)[0]!.title).toBe("How to file (v2)");

    approveVia(queueVia("publishArticle", { articleId: id }).approvalActionId);
    approveVia(queueVia("updateArticle", { articleId: id, title: "How to file (v3)", body: "Newer body" }).approvalActionId);
    expect(listArticles(dir, T1)[0]!.status).toBe("published");

    approveVia(queueVia("archiveArticle", { articleId: id }).approvalActionId);
    const badUpdate = submitKnowledgeBaseWrite(dir, T1, "updateArticle", { payload: { articleId: id, title: "nope" } }, T1);
    expect("error" in badUpdate && /only draft or published/.test(badUpdate.error ?? "")).toBe(true);
    const badDelete = submitKnowledgeBaseWrite(dir, T1, "deleteArticle", { payload: { articleId: id } }, T1);
    expect("error" in badDelete && /only draft articles can be deleted/.test(badDelete.error ?? "")).toBe(true);
  });

  it("delete is gated and works for drafts", () => {
    const { id } = seedArticle();
    approveVia(queueVia("deleteArticle", { articleId: id }).approvalActionId);
    expect(listArticles(dir, T1)).toHaveLength(0);
  });
});

// ── 3. Categories ──────────────────────────────────────────────────────────
describe("category lifecycle (approval-gated)", () => {
  it("create/update/delete are gated", () => {
    const queued = queueVia("createCategory", { name: "Onboarding", description: "new hire help" });
    approveVia(queued.approvalActionId);
    const cat = listCategories(dir, T1)[0]!;
    expect(cat.id.startsWith("kbc_")).toBe(true);

    approveVia(queueVia("updateCategory", { categoryId: cat.id, name: "Onboarding 2.0", description: "updated" }).approvalActionId);
    expect(listCategories(dir, T1)[0]!.name).toBe("Onboarding 2.0");

    approveVia(queueVia("deleteCategory", { categoryId: cat.id }).approvalActionId);
    expect(listCategories(dir, T1)).toHaveLength(0);
  });

  it("a category with articles cannot be deleted (fail-closed before the gate)", () => {
    const catId = seedCategory("Operations");
    seedArticle(catId);
    const res = submitKnowledgeBaseWrite(dir, T1, "deleteCategory", { payload: { categoryId: catId } }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /still has articles/.test(res.error ?? "")).toBe(true);
    // never queued
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(0);
  });
});

// ── 4. Answer drafts — honest, config-only ─────────────────────────────────
describe("requestAnswerDraft (honest answer drafts)", () => {
  it("request queues; approve persists an honest DISABLED note — no fabricated answer", () => {
    const { id } = seedArticle();
    const queued = queueVia("requestAnswerDraft", { question: "How do I file a claim?", sourceArticleIds: [id] });
    approveVia(queued.approvalActionId);

    const drafts = listAnswerDrafts(dir, T1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.id.startsWith("kbd_")).toBe(true);
    expect(drafts[0]!.status).toBe("disabled");
    expect(drafts[0]!.sourceArticleIds).toEqual([id]);
    expect(drafts[0]!.note).toContain("no answer was drafted by this slice");
    expect(drafts[0]!.note).toContain("not enabled");
    // A disabled draft must never carry a fabricated answer body.
    expect((drafts[0]! as unknown as { answer?: unknown }).answer).toBeUndefined();
  });

  it("reject discards the draft request (no record, nothing written)", () => {
    const { id } = seedArticle();
    const queued = queueVia("requestAnswerDraft", { question: "What is onboarding?", sourceArticleIds: [id] });
    const res = rejectKnowledgeBaseWrite(dir, T1, queued.approvalActionId, T1);
    expect(res.ok).toBe(true);
    expect(listAnswerDrafts(dir, T1)).toHaveLength(0);
  });

  it("idempotent approve → alreadyApplied, no duplicate draft", () => {
    const { id } = seedArticle();
    const queued = queueVia("requestAnswerDraft", { question: "How do I file?", sourceArticleIds: [id] });
    approveVia(queued.approvalActionId);
    const replay = approveVia(queued.approvalActionId);
    expect(replay.alreadyApplied).toBe(true);
    expect(listAnswerDrafts(dir, T1)).toHaveLength(1);
  });
});

// ── 5. Fail-closed validation ──────────────────────────────────────────────
describe("fail-closed validation", () => {
  it("forged create-ids never queue (articles + categories)", () => {
    const a = submitKnowledgeBaseWrite(dir, T1, "createArticle", { payload: { id: "kba_evil", title: "X", body: "Y" } }, T1);
    expect(a.applied).toBe(false);
    expect("error" in a && /not accepted/.test(a.error ?? "")).toBe(true);
    const c = submitKnowledgeBaseWrite(dir, T1, "createCategory", { payload: { id: "kbc_evil", name: "X" } }, T1);
    expect("error" in c && /not accepted/.test(c.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1)).toHaveLength(0);
  });

  it("foreign/stranger category refs are rejected (no IDOR)", () => {
    const res = submitKnowledgeBaseWrite(dir, T1, "createArticle", { payload: { categoryId: "kbc_0000foreign", title: "X", body: "Y" } }, T1);
    expect("error" in res && /category not found/.test(res.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1)).toHaveLength(0);
  });

  it("foreign/stranger source article refs are rejected", () => {
    const res = submitKnowledgeBaseWrite(dir, T1, "requestAnswerDraft", { payload: { question: "Q?", sourceArticleIds: ["kba_0000foreign"] } }, T1);
    expect("error" in res && /source article not found/.test(res.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1)).toHaveLength(0);
  });

  it("category cap is enforced before the gate", () => {
    for (let i = 0; i < MAX_CATEGORIES_PER_TENANT; i++) {
      approveVia(queueVia("createCategory", { name: `Cat ${i}` }).approvalActionId);
    }
    const res = submitKnowledgeBaseWrite(dir, T1, "createCategory", { payload: { name: "Overflow" } }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /category cap reached/.test(res.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(0);
  });

  it("source-article-ref cap is enforced before the gate (needs >MAX unique refs)", () => {
    const maxRefs: string[] = [];
    for (let i = 0; i < MAX_SOURCE_ARTICLE_REFS + 1; i++) {
      const { id } = seedArticle();
      maxRefs.push(id);
    }
    const overRefs = submitKnowledgeBaseWrite(dir, T1, "requestAnswerDraft", { payload: { question: "Q?", sourceArticleIds: maxRefs } }, T1);
    expect(overRefs.applied).toBe(false);
    expect("error" in overRefs && /sourceArticleIds must be ≤/.test(overRefs.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(0);
  });

  it("unknown ops fail closed", () => {
    const res = submitKnowledgeBaseWrite(dir, T1, "notAnOp" as never, { payload: {} }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /unknown knowledge-base op/.test(res.error ?? "")).toBe(true);
  });
});

// ── 6. Tenant isolation ────────────────────────────────────────────────────
describe("tenant isolation", () => {
  it("article/category reads are tenant-scoped; a stranger's id → 404", async () => {
    const { id } = seedArticle(seedCategory("Ops", T1), T1);
    // T2 sees nothing
    const t2List = await handleNativeKnowledgeBaseAuthed(new Request("http://x/api/native/knowledgebase/articles"), { userEmail: T2, dataDir: dir });
    expect(((await t2List.json()) as { data: { articles: unknown[] } }).data.articles).toEqual([]);
    // T2 asking for T1's article → 404 (no IDOR)
    const t2Get = await handleNativeKnowledgeBaseAuthed(new Request(`http://x/api/native/knowledgebase/articles/${id}`), { userEmail: T2, dataDir: dir });
    expect(t2Get.status).toBe(404);
  });

  it("search only ever surfaces the tenant's OWN articles", () => {
    seedArticle(undefined, T1);
    seedArticle(undefined, T2);
    const hits = searchArticles(dir, T1, "filing");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.tenantId).toBe(T1);
    expect(searchArticles(dir, T2, "filing")).toHaveLength(1);
  });
});

// ── 7. HTTP surface ────────────────────────────────────────────────────────
describe("HTTP surface", () => {
  it("authed reads return the tenant's own data", async () => {
    seedArticle(undefined, T1);
    const res = await handleNativeKnowledgeBaseAuthed(new Request("http://x/api/native/knowledgebase/articles"), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { articles: unknown[] } }).data.articles).toHaveLength(1);
  });

  it("create via HTTP returns 202 pending; malformed payloads → 400", async () => {
    const create = await handleNativeKnowledgeBaseAuthed(
      new Request("http://x/api/native/knowledgebase/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "HTTP Article", body: "Body", tags: [] }) }),
      { userEmail: T1, dataDir: dir },
    );
    expect(create.status).toBe(202);
    expect(((await create.json()) as { data: { approvalActionId: string } }).data.approvalActionId).toBeTruthy();

    const bad = await handleNativeKnowledgeBaseAuthed(
      new Request("http://x/api/native/knowledgebase/articles", { method: "POST", headers: { "content-type": "application/json" }, body: "not json" }),
      { userEmail: T1, dataDir: dir },
    );
    expect(bad.status).toBe(400);
  });

  it("unknown routes → 404; wrong method → 405 on writes", async () => {
    const nf = await handleNativeKnowledgeBaseAuthed(new Request("http://x/api/native/knowledgebase/nope"), { userEmail: T1, dataDir: dir });
    expect(nf.status).toBe(404);
    const m405 = await handleNativeKnowledgeBaseAuthed(new Request("http://x/api/native/knowledgebase/writes", { method: "POST" }), { userEmail: T1, dataDir: dir });
    expect(m405.status).toBe(405);
  });

  it("cross-tenant HTTP list stays tenant-scoped", async () => {
    seedArticle(undefined, T1);
    const t2 = await handleNativeKnowledgeBaseAuthed(new Request("http://x/api/native/knowledgebase/categories"), { userEmail: T2, dataDir: dir });
    expect(((await t2.json()) as { data: { categories: unknown[] } }).data.categories).toEqual([]);
  });
});

// ── 8. Audit + typed events ────────────────────────────────────────────────
describe("audit + typed events", () => {
  it("every mutation writes an immutable audit entry", () => {
    const queued = queueVia("createArticle", { title: "T", body: "B", tags: [] });
    approveVia(queued.approvalActionId);
    const audit = listAudit(dir, T1);
    expect(audit.length).toBeGreaterThanOrEqual(2); // pending + applied
    expect(audit.every((e) => e.action.startsWith("native.knowledgebase."))).toBe(true);
    expect(audit.every((e) => e.id.startsWith("kbu_"))).toBe(true);
  });

  it("registers typed native.knowledgebase.* event types", () => {
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
      const v = validateNativeEventType(t, { eventId: "evt_x" });
      expect(v.ok, `${t}: ${"reason" in v ? v.reason : "?"}`).toBe(true);
    }
  });
});

// ── 9. Honest LLM note (never a fabricated answer) ─────────────────────────
describe("honest LLM note", () => {
  it("answer drafts answer the tenant's OWN content only and never fabricate", () => {
    // T1 article; a T2 draft request must not be able to reference it
    const { id } = seedArticle(undefined, T1);
    const res = submitKnowledgeBaseWrite(dir, T2, "requestAnswerDraft", { payload: { question: "Q?", sourceArticleIds: [id] } }, T2);
    expect(res.applied).toBe(false);
    expect("error" in res && /source article not found/.test(res.error ?? "")).toBe(true);
  });
});