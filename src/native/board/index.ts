/**
 * native/board/index.ts — Phase 3.2 native task/project boards, public surface.
 */
export {
  handleNativeBoardsAuthed,
  registerBuiltinNativeBoardEventTypes,
} from "./router";
export {
  submitBoardWrite,
  executePendingBoardWrite,
  noteOwnerDecision,
} from "./gate";
export type { BoardWriteRequest, BoardWriteResult } from "./gate";
export * from "./types";
export { listBoards, getBoard, listCards, listCardsForBoard, listAudit } from "./store";