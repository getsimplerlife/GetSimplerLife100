/**
 * native/automation/index.ts — Phase 3.7 native automations / workflow builder.
 * Re-exports the router surface + wiring helpers; prod-server registers the
 * typed events, wires the observer, and adds the authed block AFTER the
 * session check (401 fail-closed) + the schedule sweeper interval.
 */
export {
  handleNativeAutomationsAuthed,
  registerBuiltinNativeAutomationEventTypes,
} from "./router";
export type { NativeAutomationCtx } from "./router";
export {
  dispatchAutomationActions,
  executePendingAutomationWrite,
  noteOwnerDecision,
  setAutomationEmailSenderForTest,
  submitAutomationWrite,
  wireAutomationEventObserver,
} from "./gate";
export type { AutomationWriteRequest, AutomationWriteResult, EmailSender } from "./gate";
export {
  evaluateConditions,
  fireRule,
  fireRuleForEvent,
  flattenPayload,
  sweepDueAutomationSchedules,
} from "./engine";
export * from "./types";