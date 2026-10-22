/**
 * native/communications/index.ts — P1-4 native COMMUNICATIONS slice. Barrel.
 * Portal "Communications" working Reply: reads the tenant's OWN thread (native
 * reply store + legacy log rows, both tenant-keyed) and composes replies that
 * ride the Approval Queue verb-first (`createReply` — "create" ∈ WRITE_VERB;
 * classification test extended: NO new verb was needed, the fail-open guard
 * stays locked). A reply is a LOG RECORD — this slice has NO email-send path;
 * every record + audit line says "saved to your communications log", never an
 * email-send claim (no fabricated send claims).
 */
import { handleNativeCommunicationsAuthed, registerBuiltinNativeCommunicationsEventTypes, type NativeCommunicationsCtx, ACTION_NAME } from "./router";
import {
  submitCommunicationsWrite,
  executePendingCommunicationsWrite,
  rejectCommunicationsWrite,
  noteOwnerDecision,
  publicMessage,
  REPLY_SAVED_NOTE,
} from "./gate";
import {
  listMessages,
  getMessage,
  listPendingWrites,
  listAudit,
  generateCommunicationsId,
} from "./store";
import {
  NATIVE_COMMUNICATIONS_MESSAGES_KEY,
  NATIVE_COMMUNICATIONS_PENDING_KEY,
  NATIVE_COMMUNICATIONS_AUDIT_KEY,
  MAX_MESSAGES_PER_TENANT,
  MAX_REPLY_BODY,
  MAX_PENDING_COMMUNICATIONS_WRITES,
} from "./types";
export {
  handleNativeCommunicationsAuthed,
  registerBuiltinNativeCommunicationsEventTypes,
  submitCommunicationsWrite,
  executePendingCommunicationsWrite,
  rejectCommunicationsWrite,
  noteOwnerDecision,
  publicMessage,
  REPLY_SAVED_NOTE,
  listMessages,
  getMessage,
  listPendingWrites,
  listAudit,
  generateCommunicationsId,
  NATIVE_COMMUNICATIONS_MESSAGES_KEY,
  NATIVE_COMMUNICATIONS_PENDING_KEY,
  NATIVE_COMMUNICATIONS_AUDIT_KEY,
  MAX_MESSAGES_PER_TENANT,
  MAX_REPLY_BODY,
  MAX_PENDING_COMMUNICATIONS_WRITES,
  ACTION_NAME,
};
export type { NativeCommunicationsCtx };