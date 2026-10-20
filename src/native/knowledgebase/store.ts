/**
 * native/knowledgebase/store.ts — durable, tenant-keyed KNOWLEDGE-BASE store
 * (Phase 4.4). Categories / articles / answer drafts / durable pending-write
 * mirror + immutable native.knowledgebase.* audit. Every read/write takes
 * tenantId explicitly — zero cross-tenant paths (a foreign entity id resolves
 * to null → fail-closed 404 upstream). All state lives here; the slice only
 * ever reads the tenant's OWN rows (via ../tables/store for search scope).
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_KNOWLEDGEBASE_CATEGORIES_KEY,
  NATIVE_KNOWLEDGEBASE_ARTICLES_KEY,
  NATIVE_KNOWLEDGEBASE_DRAFTS_KEY,
  NATIVE_KNOWLEDGEBASE_PENDING_KEY,
  NATIVE_KNOWLEDGEBASE_AUDIT_KEY,
  type AnswerDraft,
  type KbArticle,
  type KbCategory,
  type NativeKnowledgeBaseAuditEntry,
  type PendingKnowledgeBaseWrite,
} from "./types";

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function load<T>(dataDir: string, key: string, fallback: T): T {
  try {
    const raw = readJSON(dataPath(dataDir, key));
    return (raw ?? fallback) as T;
  } catch {
    return fallback;
  }
}
function save(dataDir: string, key: string, value: unknown): void {
  writeJSON(dataPath(dataDir, key), value);
}

/** Server-assigned ids only — never accept a client-provided id. */
export function generateKnowledgeBaseEntityId(kind: "kbc" | "kba" | "kbd" | "kbw" | "kbu"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── Categories ──────────────────────────────────────────────────────────────
interface CategoryIndex {
  categories: KbCategory[];
}
export function listCategories(dataDir: string, tenantId: string): KbCategory[] {
  return load<Record<string, CategoryIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_CATEGORIES_KEY, {})[tenantId]?.categories ?? [];
}
export function getCategory(dataDir: string, tenantId: string, categoryId: string): KbCategory | null {
  return listCategories(dataDir, tenantId).find((c) => c.id === categoryId) ?? null;
}
export function saveCategory(dataDir: string, c: KbCategory): void {
  const all = load<Record<string, CategoryIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_CATEGORIES_KEY, {});
  const idx = all[c.tenantId] ?? { categories: [] };
  const i = idx.categories.findIndex((x) => x.id === c.id);
  if (i >= 0) idx.categories[i] = c;
  else idx.categories.push(c);
  all[c.tenantId] = idx;
  save(dataDir, NATIVE_KNOWLEDGEBASE_CATEGORIES_KEY, all);
}
export function deleteCategoryRecord(dataDir: string, tenantId: string, categoryId: string): void {
  const all = load<Record<string, CategoryIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_CATEGORIES_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.categories = idx.categories.filter((x) => x.id !== categoryId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_KNOWLEDGEBASE_CATEGORIES_KEY, all);
}

// ── Articles ────────────────────────────────────────────────────────────────
interface ArticleIndex {
  articles: KbArticle[];
}
export function listArticles(dataDir: string, tenantId: string): KbArticle[] {
  return [...(load<Record<string, ArticleIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_ARTICLES_KEY, {})[tenantId]?.articles ?? [])].sort((a, b) =>
    a.createdAt > b.createdAt ? 1 : -1,
  );
}
export function getArticle(dataDir: string, tenantId: string, articleId: string): KbArticle | null {
  return listArticles(dataDir, tenantId).find((a) => a.id === articleId) ?? null;
}
export function saveArticle(dataDir: string, a: KbArticle): void {
  const all = load<Record<string, ArticleIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_ARTICLES_KEY, {});
  const idx = all[a.tenantId] ?? { articles: [] };
  const i = idx.articles.findIndex((x) => x.id === a.id);
  if (i >= 0) idx.articles[i] = a;
  else idx.articles.push(a);
  all[a.tenantId] = idx;
  save(dataDir, NATIVE_KNOWLEDGEBASE_ARTICLES_KEY, all);
}
export function deleteArticleRecord(dataDir: string, tenantId: string, articleId: string): void {
  const all = load<Record<string, ArticleIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_ARTICLES_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.articles = idx.articles.filter((x) => x.id !== articleId);
  all[tenantId] = idx;
  save(dataDir, NATIVE_KNOWLEDGEBASE_ARTICLES_KEY, all);
}
export function countArticlesInCategory(dataDir: string, tenantId: string, categoryId: string): number {
  return listArticles(dataDir, tenantId).filter((a) => a.categoryId === categoryId).length;
}
/** Search the tenant's OWN article content (title/body/tags) — read-only,
 *  never gated; strangers' articles never appear (tenant-scoped by keying). */
export function searchArticles(dataDir: string, tenantId: string, q: string): KbArticle[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const corpus = listArticles(dataDir, tenantId);
  const hits = corpus.filter((a) => {
    const inTitle = a.title.toLowerCase().includes(needle);
    const inBody = a.body.toLowerCase().includes(needle);
    const inTags = a.tags.some((t) => t.toLowerCase().includes(needle));
    return inTitle || inBody || inTags;
  });
  return hits;
}

// ── Answer drafts (append-only, honest disabled note) ───────────────────────
interface DraftIndex {
  drafts: AnswerDraft[];
}
export function listAnswerDrafts(dataDir: string, tenantId: string): AnswerDraft[] {
  return [...(load<Record<string, DraftIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_DRAFTS_KEY, {})[tenantId]?.drafts ?? [])].sort((a, b) =>
    a.requestedAt > b.requestedAt ? 1 : -1,
  );
}
export function getAnswerDraft(dataDir: string, tenantId: string, draftId: string): AnswerDraft | null {
  return listAnswerDrafts(dataDir, tenantId).find((d) => d.id === draftId) ?? null;
}
export function appendAnswerDraft(dataDir: string, d: AnswerDraft): void {
  const all = load<Record<string, DraftIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_DRAFTS_KEY, {});
  const idx = all[d.tenantId] ?? { drafts: [] };
  idx.drafts.push(d);
  all[d.tenantId] = idx;
  save(dataDir, NATIVE_KNOWLEDGEBASE_DRAFTS_KEY, all);
}
export function countAnswerDrafts(dataDir: string, tenantId: string): number {
  return listAnswerDrafts(dataDir, tenantId).length;
}

// ── Pending writes (durable mirror of the approval card) ───────────────────
interface PendingIndex {
  pendingWrites: PendingKnowledgeBaseWrite[];
}
export function listPendingWrites(dataDir: string, tenantId: string): PendingKnowledgeBaseWrite[] {
  return load<Record<string, PendingIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_PENDING_KEY, {})[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingKnowledgeBaseWrite): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_PENDING_KEY, {});
  const idx = all[w.tenantId] ?? { pendingWrites: [] };
  idx.pendingWrites.push(w);
  all[w.tenantId] = idx;
  save(dataDir, NATIVE_KNOWLEDGEBASE_PENDING_KEY, all);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingKnowledgeBaseWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingKnowledgeBaseWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  result?: { appliedResult?: Record<string, unknown>; error?: string },
): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_KNOWLEDGEBASE_PENDING_KEY, {});
  const idx = all[tenantId];
  const w = idx?.pendingWrites.find((x) => x.id === id);
  if (!idx || !w || w.status !== "pending") return; // idempotent
  w.status = status;
  if (status === "applied") w.appliedResult = result?.appliedResult;
  else w.error = result?.error ?? "rejected by owner";
  all[tenantId] = idx;
  save(dataDir, NATIVE_KNOWLEDGEBASE_PENDING_KEY, all);
}

// ── Immutable audit (append-only) ───────────────────────────────────────────
function loadAudit(dataDir: string): NativeKnowledgeBaseAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_KNOWLEDGEBASE_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeKnowledgeBaseAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeKnowledgeBaseAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({ id: generateKnowledgeBaseEntityId("kbu"), ts: new Date().toISOString(), ...entry });
  save(dataDir, NATIVE_KNOWLEDGEBASE_AUDIT_KEY, audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeKnowledgeBaseAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}