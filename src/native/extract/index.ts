/**
 * native/extract/index.ts — Phase 3.3 native AI document understanding, public surface.
 */
export { handleNativeExtractAuthed, registerBuiltinNativeExtractEventTypes } from "./router";
export { submitExtractWrite, executePendingExtractWrite, noteOwnerDecision } from "./gate";
export type { ExtractWriteRequest, ExtractWriteResult, ExtractRunnerDeps } from "./gate";
export * from "./types";
export { listPendingWrites, listAudit } from "./store";