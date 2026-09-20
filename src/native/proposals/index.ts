/**
 * native/proposals/index.ts — Phase 2.1 native PROPOSALS (quote-to-cash slice 1).
 * Barrel. Authed tenant CRUD + public client share link; gated lifecycle
 * writes ride the Approval Queue; PDFs live in the Phase 1.2 document store;
 * lifecycle emits typed native.proposal.* events (Phase 1.1 outbound).
 */
import {
  handleNativeProposalsAuthed,
  handleNativeProposalShare,
  registerBuiltinNativeProposalEventTypes,
  type NativeProposalsCtx,
  type NativeProposalsPublicCtx,
} from "./router";
import { submitProposalWrite, executePendingProposalWrite, noteOwnerDecision } from "./gate";
import { renderProposalPdf, proposalHtml, proposalTotalCents, formatCurrency } from "./generate";
export {
  handleNativeProposalsAuthed,
  handleNativeProposalShare,
  registerBuiltinNativeProposalEventTypes,
  submitProposalWrite,
  executePendingProposalWrite,
  noteOwnerDecision,
  renderProposalPdf,
  proposalHtml,
  proposalTotalCents,
  formatCurrency,
};
export type { NativeProposalsCtx, NativeProposalsPublicCtx };