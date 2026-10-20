/**
 * native/transport/index.ts — Phase 4.1 native SECURE TRANSPORT (SFTP
 * connection config + pattern-matched transfer rules + PGP key ring + the
 * approval-gated transfer-run ledger). Barrel. Authed-only surface; every
 * mutation rides the Approval Queue verb-first (all verbs already in
 * WRITE_VERB — classification test asserts them); credentials + key material
 * encrypted at rest; run ledger records HONEST outcomes (never fabricated
 * "transferred"/"signed"); typed native.sftp.* / native.pgp.* events via the
 * Phase 1.1 registry; NO public share.
 */
import {
  handleNativeTransportAuthed,
  registerBuiltinNativeTransportEventTypes,
  type NativeTransportCtx,
} from "./router";
import {
  executePendingTransportWrite,
  rejectTransportWrite,
  submitTransportWrite,
} from "./gate";

export {
  handleNativeTransportAuthed,
  registerBuiltinNativeTransportEventTypes,
  executePendingTransportWrite,
  rejectTransportWrite,
  submitTransportWrite,
};
export type { NativeTransportCtx };
export * from "./types";
export { publicConnection, publicKey, publicRule, publicRun, getActionName } from "./gate";
export { matchesPattern, matchFiles, validatePattern, compilePattern } from "./pattern";
export { encryptSecret, decryptSecret, fingerprintOf } from "./store";