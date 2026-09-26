/**
 * native/dashboard/index.ts — Phase 3.6 native embedded dashboards/BI.
 * Re-exports the router surface + sweeper; prod-server registers the typed
 * events and wires the authed block AFTER the session check (401 fail-closed).
 */
export {
  handleNativeDashboardsAuthed,
  registerBuiltinNativeDashboardEventTypes,
  sweepDueDashboardSchedules,
} from "./router";
export type { NativeDashboardCtx } from "./router";
export {
  submitDashboardWrite,
  executePendingDashboardWrite,
  fireScheduleNow,
  setDashboardEmailSenderForTest,
} from "./gate";
export type { DashboardWriteRequest, DashboardWriteResult, EmailSender } from "./gate";
export * from "./types";