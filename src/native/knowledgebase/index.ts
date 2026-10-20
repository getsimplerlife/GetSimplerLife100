/**
 * native/knowledgebase/index.ts — Phase 4.4 native KNOWLEDGE-BASE /
 * HELP-CENTER slice. Barrel. Article management (draft → published → archived,
 * categories, searchable tenant-owned content) + AI answer-draft suggestions
 * that are config-only and OFF by default. Every mutation rides the Approval
 * Queue verb-first (all nine KB actions reuse verbs ALREADY in WRITE_VERB —
 * create/update/publish/archive/delete/request; the classification test is
 * extended with the full surface: no new verb was needed, the fail-open guard
 * stays locked); answer drafts NEVER fabricate answers — they persist an honest
 * disabled note ("no answer was drafted by this slice") until the owner
 * configures an LLM provider.
 */
import { handleNativeKnowledgeBaseAuthed, registerBuiltinNativeKnowledgeBaseEventTypes, type NativeKnowledgeBaseCtx } from "./router";
import {
  submitKnowledgeBaseWrite,
  executePendingKnowledgeBaseWrite,
  rejectKnowledgeBaseWrite,
  noteOwnerDecision,
  publicCategory,
  publicArticle,
  publicAnswerDraft,
  getActionName,
  ANSWER_DRAFT_DISABLED_NOTE,
} from "./gate";
import {
  listCategories,
  getCategory,
  listArticles,
  getArticle,
  searchArticles,
  listAnswerDrafts,
  getAnswerDraft,
  listPendingWrites,
  listAudit,
  generateKnowledgeBaseEntityId,
} from "./store";
import {
  NATIVE_KNOWLEDGEBASE_CATEGORIES_KEY,
  NATIVE_KNOWLEDGEBASE_ARTICLES_KEY,
  NATIVE_KNOWLEDGEBASE_DRAFTS_KEY,
  NATIVE_KNOWLEDGEBASE_PENDING_KEY,
  NATIVE_KNOWLEDGEBASE_AUDIT_KEY,
  MAX_CATEGORIES_PER_TENANT,
  MAX_ARTICLES_PER_TENANT,
  MAX_ANSWER_DRAFTS_PER_TENANT,
  MAX_PENDING_KNOWLEDGEBASE_WRITES,
  MAX_DAILY_ANSWER_DRAFT_REQUESTS,
} from "./types";
export {
  handleNativeKnowledgeBaseAuthed,
  registerBuiltinNativeKnowledgeBaseEventTypes,
  submitKnowledgeBaseWrite,
  executePendingKnowledgeBaseWrite,
  rejectKnowledgeBaseWrite,
  noteOwnerDecision,
  publicCategory,
  publicArticle,
  publicAnswerDraft,
  getActionName,
  ANSWER_DRAFT_DISABLED_NOTE,
  listCategories,
  getCategory,
  listArticles,
  getArticle,
  searchArticles,
  listAnswerDrafts,
  getAnswerDraft,
  listPendingWrites,
  listAudit,
  generateKnowledgeBaseEntityId,
  NATIVE_KNOWLEDGEBASE_CATEGORIES_KEY,
  NATIVE_KNOWLEDGEBASE_ARTICLES_KEY,
  NATIVE_KNOWLEDGEBASE_DRAFTS_KEY,
  NATIVE_KNOWLEDGEBASE_PENDING_KEY,
  NATIVE_KNOWLEDGEBASE_AUDIT_KEY,
  MAX_CATEGORIES_PER_TENANT,
  MAX_ARTICLES_PER_TENANT,
  MAX_ANSWER_DRAFTS_PER_TENANT,
  MAX_PENDING_KNOWLEDGEBASE_WRITES,
  MAX_DAILY_ANSWER_DRAFT_REQUESTS,
};
export type { NativeKnowledgeBaseCtx };