/**
 * native/checklists/index.ts — Phase 2.3 native CHECKLISTS (quote-to-cash slice 3).
 * Barrel. Authed tenant CRUD; gated lifecycle writes ride the Approval Queue;
 * item progress is computed from the item set; lifecycle emits typed
 * native.checklist.* events (Phase 1.1 outbound).
 */
import {
  handleNativeChecklistsAuthed,
  registerBuiltinNativeChecklistEventTypes,
  type NativeChecklistsCtx,
} from "./router";
import { submitChecklistWrite, executePendingChecklistWrite, noteOwnerDecision } from "./gate";
export {
  handleNativeChecklistsAuthed,
  registerBuiltinNativeChecklistEventTypes,
  submitChecklistWrite,
  executePendingChecklistWrite,
  noteOwnerDecision,
};
export type { NativeChecklistsCtx };