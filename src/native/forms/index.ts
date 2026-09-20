/**
 * native/forms/index.ts — Phase 1.3 native capability: FORMS BUILDER v1.
 * Barrel. Public submit (slug-gated, idempotent) + authed tenant CRUD;
 * submissions become typed `native.form.submission` workflow events through
 * the Phase 1.1 webhook/outbound machinery.
 */
import { handleNativeFormSubmit, handleNativeFormsAuthed, registerBuiltinNativeFormEventTypes, type NativeFormsCtx, type NativeFormsPublicCtx, type NativeFormSubmitResult } from "./router";
import { validateSubmission, applyPrefill, isFieldVisible, sniffFileKind, allFieldsOf } from "./logic";
export {
  handleNativeFormSubmit,
  handleNativeFormsAuthed,
  registerBuiltinNativeFormEventTypes,
  validateSubmission,
  applyPrefill,
  isFieldVisible,
  sniffFileKind,
  allFieldsOf,
};
export type { NativeFormsCtx, NativeFormsPublicCtx, NativeFormSubmitResult };
