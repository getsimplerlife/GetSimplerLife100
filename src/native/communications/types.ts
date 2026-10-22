/**
 * native/communications/types.ts — P1-4 native COMMUNICATIONS slice
 * (portal "Communications" working Reply). Types, caps, keys, provider names.
 *
 * Honesty contract (owner bar): a "reply" persisted by this slice is a LOG
 * record in the tenant's OWN communications log — the slice has NO email-send
 * path, and every reply record + audit line says exactly that ("saved to your
 * communications log"; never "email sent"). Reads are tenant-scoped (userEmail
 * key) — zero cross-tenant paths; every mutation rides the Approval Queue
 * verb-first (createReply — "create" ∈ WRITE_VERB; classification test locks
 * the fail-open guard); validation happens BEFORE the gate (stranger/foreign
 * replyTo, empty/oversized body, forged ids, caps NEVER queue).
 */
export const NATIVE_COMMUNICATIONS_MESSAGES_KEY = "native_communications_messages.json";
export const NATIVE_COMMUNICATIONS_PENDING_KEY = "native_communications_pending.json";
export const NATIVE_COMMUNICATIONS_AUDIT_KEY = "native_communications_audit.json";
export const NATIVE_COMMUNICATIONS_PROVIDER = "native-communications";
export const NATIVE_COMMUNICATIONS_WORKFLOW_ID = "native-communications";

/** The tenant's own communications log file written by the legacy
 *  /api/data/communications surface (still read so previously logged rows
 *  appear in the thread; replies always write to the NEW native store). */
export const LEGACY_COMMUNICATIONS_KEY = "tenant_communications.json";

// ── Caps (fail-closed; enforced in gate.ts BEFORE the gate) ────────────────
export const MAX_MESSAGES_PER_TENANT = 500; // native reply store total
export const MAX_REPLY_BODY = 4000; // bounded compose text
export const MAX_PENDING_COMMUNICATIONS_WRITES = 20;

/** A single row in the tenant's native communications log. Replies are rows
 *  with direction "reply" + replyTo set to the parent message id (parent may
 *  live in the legacy log). Server-assigned ids only. */
export interface CommMessage {
  id: string; // cmm_<random> — server-assigned
  tenantId: string;
  from: string; // sender (inbound) or the replying user (direction "reply")
  subject: string;
  body: string;
  preview: string; // bounded preview
  channel: string; // e.g. "email" | "chat" | "portal"
  direction: "inbound" | "reply";
  replyTo?: string; // parent message id (direction "reply" only)
  time: string; // ISO
  sentiment: string;
  read: boolean;
  createdAt: string;
  createdBy: string;
}

export interface PendingCommunicationsWrite {
  id: string; // cmw_<random> — server-assigned
  tenantId: string;
  action: string; // "createReply"
  payload: Record<string, unknown>; // { replyTo, body }
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: Record<string, unknown>;
  error?: string;
}

export interface NativeCommunicationsAuditEntry {
  id: string; // cmu_<random> — server-assigned
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.communications.*
  entityId?: string;
  detail: string;
}