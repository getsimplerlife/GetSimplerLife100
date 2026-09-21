/**
 * native/dealroom/index.ts — Phase 2.4 native DEAL ROOM (quote-to-cash slice 4).
 * Barrel. Authed tenant CRUD; gated lifecycle writes ride the Approval Queue;
 * public READ-ONLY share view via slug (no writes); typed native.dealroom.*
 * events (Phase 1.1 outbound). Proposal PDF + checklist progress are DERIVED
 * references to the linked records — no duplicated blobs.
 */
import {
  handleNativeDealRoomsAuthed,
  handleNativeDealRoomShare,
  registerBuiltinNativeDealRoomEventTypes,
  type NativeDealRoomsCtx,
  type NativeDealRoomsPublicCtx,
} from "./router";
import { submitDealRoomWrite, executePendingDealRoomWrite, noteOwnerDecision } from "./gate";
export {
  handleNativeDealRoomsAuthed,
  handleNativeDealRoomShare,
  registerBuiltinNativeDealRoomEventTypes,
  submitDealRoomWrite,
  executePendingDealRoomWrite,
  noteOwnerDecision,
};
export type { NativeDealRoomsCtx, NativeDealRoomsPublicCtx };