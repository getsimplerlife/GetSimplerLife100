/**
 * native/assistant/index.ts — Phase 3.8 native ASSISTANT (chat/ask surface
 * over the tenant's own native data). Barrel. Authed-only surface: gated
 * asks ride the Approval Queue verb-first (`assistantAsk` — verb `ask` added
 * to WRITE_VERB); answers are labeled DRAFTS from a SAFE tenant context
 * (tables 1.4 metadata + dashboards/reports 3.6 + document buckets 1.2);
 * LLM is config-only and defaults OFF (suite stays LLM-free); typed
 * native.assistant.* events via the Phase 1.1 registry; NO public share.
 */
import {
  handleNativeAssistantAuthed,
  registerBuiltinNativeAssistantEventTypes,
  type NativeAssistantCtx,
} from "./router";
import { submitAssistantAsk, executePendingAssistantWrite, rejectAssistantWrite } from "./gate";

export {
  handleNativeAssistantAuthed,
  registerBuiltinNativeAssistantEventTypes,
  submitAssistantAsk,
  executePendingAssistantWrite,
  rejectAssistantWrite,
};
export type { NativeAssistantCtx };
export * from "./types";