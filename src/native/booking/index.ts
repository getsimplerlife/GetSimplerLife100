/**
 * native/booking — Phase 3.1 native booking/scheduling (barrel).
 * Self-serve booking pages + availability + round-robin + approval-gated
 * confirmations; calendar sync stays the verified Google Calendar adapter lane.
 */
export * from "./types";
export * from "./validate";
export * from "./availability";
export * from "./sync";
export * from "./store";
export * from "./gate";
export * from "./router";