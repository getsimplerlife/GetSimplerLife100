/**
 * native/survey/index.ts — Phase 3.4 native surveys / NPS / scorecards, public surface.
 */
export { handleNativeSurveysAuthed, handleNativeSurveyShare, registerBuiltinNativeSurveyEventTypes } from "./router";
export { submitSurveyWrite, executePendingSurveyWrite, noteOwnerDecision } from "./gate";
export type { SurveyWriteRequest, SurveyWriteResult } from "./gate";
export * from "./types";
export { listPendingWrites, listAudit } from "./store";