/**
 * native/dealroom/validate.ts — fail-closed validation for deal room payloads.
 * Called BEFORE the gate (a never-valid write must never reach the queue) and
 * again inside the apply executor (defense in depth). Link EXISTENCE checks
 * (proposal/checklist belong to the tenant) happen in gate.ts where the stores
 * are reachable — this file validates shape/syntax only.
 */
import {
  MAX_CUSTOMER_EMAIL,
  MAX_CUSTOMER_NAME,
  MAX_DEAL_ROOM_DESC,
  MAX_DEAL_ROOM_NAME,
  type DealRoomMutation,
  type DealRoomStatus,
} from "./types";
export type ValidateResult = { ok: true } | { ok: false; error: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STATUSES: DealRoomStatus[] = ["draft", "active", "archived"];
const PROP_RE = /^prop_[A-Za-z0-9]+$/;
const CHK_RE = /^chk_[A-Za-z0-9]+$/;

function checkStr(v: unknown, max: number, min = 0): boolean {
  if (typeof v !== "string") return false;
  const len = v.trim().length;
  return len >= min && len <= max;
}

/**
 * Validate a full/partial deal room mutation (name required on create, handled
 * by the gate's requireName flag). Returns the sanitized mutation — never
 * trusts raw input.
 */
export function validateDealRoomMutation(
  m: DealRoomMutation,
  { requireName = false }: { requireName?: boolean } = {},
): ValidateResult & { data?: DealRoomMutation } {
  const out: DealRoomMutation = {};
  if (m.name !== undefined) {
    if (!checkStr(m.name, MAX_DEAL_ROOM_NAME, 1)) return { ok: false, error: `name must be a 1..${MAX_DEAL_ROOM_NAME}-char string` };
    out.name = m.name.trim();
  }
  if (m.customerName !== undefined) {
    if (!checkStr(m.customerName, MAX_CUSTOMER_NAME, 1)) return { ok: false, error: `customerName must be a 1..${MAX_CUSTOMER_NAME}-char string` };
    out.customerName = m.customerName.trim();
  }
  if (m.customerEmail !== undefined) {
    if (typeof m.customerEmail !== "string" || !EMAIL_RE.test(m.customerEmail.trim()) || m.customerEmail.trim().length > MAX_CUSTOMER_EMAIL) {
      return { ok: false, error: "customerEmail must be a valid email address" };
    }
    out.customerEmail = m.customerEmail.trim();
  }
  if (m.description !== undefined) {
    if (!checkStr(m.description, MAX_DEAL_ROOM_DESC, 0)) return { ok: false, error: `description must be ≤ ${MAX_DEAL_ROOM_DESC} chars` };
    out.description = m.description.trim();
  }
  if (m.linkedProposalId !== undefined) {
    if (m.linkedProposalId === null || m.linkedProposalId === "") {
      return { ok: false, error: "linkedProposalId is required (prop_…)" };
    }
    if (typeof m.linkedProposalId !== "string" || !PROP_RE.test(m.linkedProposalId)) {
      return { ok: false, error: "linkedProposalId must be a proposal id (prop_…)" };
    }
    out.linkedProposalId = m.linkedProposalId;
  }
  if (m.linkedChecklistId !== undefined) {
    if (m.linkedChecklistId === null || m.linkedChecklistId === "") {
      out.linkedChecklistId = null;
    } else if (typeof m.linkedChecklistId === "string" && CHK_RE.test(m.linkedChecklistId)) {
      out.linkedChecklistId = m.linkedChecklistId;
    } else {
      return { ok: false, error: "linkedChecklistId must be a checklist id (chk_…) or empty" };
    }
  }
  if (m.status !== undefined) {
    if (typeof m.status !== "string" || !STATUSES.includes(m.status as DealRoomStatus)) {
      return { ok: false, error: "status must be \"draft\", \"active\" or \"archived\"" };
    }
    out.status = m.status as DealRoomStatus;
  }
  if (requireName && !out.name?.trim()) return { ok: false, error: "name is required" };
  if (requireName && !out.customerName?.trim()) return { ok: false, error: "customerName is required" };
  if (requireName && !out.customerEmail?.trim()) return { ok: false, error: "customerEmail is required" };
  if (requireName && !out.linkedProposalId?.trim()) return { ok: false, error: "linkedProposalId is required" };
  return { ok: true, data: out };
}

/** Build a DealRoomMutation from a create/update request body. */
export function createDealRoomMutationFromInput(body: Record<string, unknown>): DealRoomMutation {
  const m: DealRoomMutation = {};
  if (typeof body.name === "string") m.name = body.name;
  if (typeof body.customerName === "string") m.customerName = body.customerName;
  if (typeof body.customerEmail === "string") m.customerEmail = body.customerEmail;
  if (typeof body.description === "string") m.description = body.description;
  if (body.linkedProposalId !== undefined) m.linkedProposalId = body.linkedProposalId as string | null | undefined;
  if (body.linkedChecklistId !== undefined) m.linkedChecklistId = body.linkedChecklistId as string | null | undefined;
  if (typeof body.status === "string") m.status = body.status as DealRoomStatus;
  return m;
}

/** Exact-id safety: a deal room id must match the dea_ pattern (server-assigned). */
export function isDealRoomId(v: unknown): v is string {
  return typeof v === "string" && /^dea_[A-Za-z0-9]+$/.test(v);
}