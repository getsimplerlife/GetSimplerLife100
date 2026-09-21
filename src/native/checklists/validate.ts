/**
 * native/checklists/validate.ts — fail-closed validation for checklist payloads.
 * Called BEFORE the gate (a never-valid write must never reach the queue) and
 * again inside the apply executor (defense in depth).
 */
import {
  MAX_ASSIGNEE_EMAIL,
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_NAME,
  MAX_CHECKLIST_DESC,
  MAX_ITEM_TITLE,
  type ChecklistItem,
  type ChecklistItemInput,
  type ChecklistItemStatus,
  type ChecklistKind,
  type ChecklistMutation,
} from "./types";
import { generateChecklistEntityId } from "./store";
export type ValidateResult = { ok: true } | { ok: false; error: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ITEM_STATUSES: ChecklistItemStatus[] = ["todo", "in_progress", "done"];
const KINDS: ChecklistKind[] = ["delivery", "custom"];

function checkStr(v: unknown, max: number, min = 0): boolean {
  if (typeof v !== "string") return false;
  const len = v.trim().length;
  return len >= min && len <= max;
}

/** Validate + normalize an item. Returns null when invalid. */
export function validateItemInput(item: unknown): ChecklistItemInput | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const v = item as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  if (title.length < 1 || title.length > MAX_ITEM_TITLE) return null;
  const status = v.status;
  if (typeof status !== "string" || !ITEM_STATUSES.includes(status as ChecklistItemStatus)) return null;
  const out: ChecklistItemInput = { title, status: status as ChecklistItemStatus };
  if (v.id !== undefined) {
    if (typeof v.id !== "string" || !/^cli_[A-Za-z0-9]+$/.test(v.id)) return null;
    out.id = v.id;
  }
  if (v.assignee !== undefined && v.assignee !== null && v.assignee !== "") {
    if (typeof v.assignee !== "string" || v.assignee.trim().length > MAX_ASSIGNEE_EMAIL || !EMAIL_RE.test(v.assignee.trim())) return null;
    out.assignee = v.assignee.trim();
  }
  return out;
}

/**
 * Normalize an incoming item set: items WITH an existing cli_ id keep their id;
 * items WITHOUT an id get a fresh one. The caller (gate) verifies that every
 * incoming id actually belongs to the current checklist — forged ids never slip
 * through. Returns null on a structurally invalid payload.
 */
export function normalizeItems(raw: unknown): ChecklistItemInput[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < 1 || raw.length > MAX_CHECKLIST_ITEMS) return null;
  const out: ChecklistItemInput[] = [];
  for (const item of raw) {
    const v = validateItemInput(item);
    if (!v) return null;
    out.push(v.id ? v : { ...v, id: generateChecklistEntityId("cli") });
  }
  return out;
}

/**
 * Validate a full create mutation (required: name + ≥1 item) or a partial
 * update mutation. Returns the sanitized mutation (never trusts raw input).
 */
export function validateChecklistMutation(m: ChecklistMutation, { requireItems = false }: { requireItems?: boolean } = {}): ValidateResult & { data?: ChecklistMutation } {
  const out: ChecklistMutation = {};
  if (m.name !== undefined) {
    if (!checkStr(m.name, MAX_CHECKLIST_NAME, 1)) return { ok: false, error: `name must be a 1..${MAX_CHECKLIST_NAME}-char string` };
    out.name = m.name.trim();
  }
  if (m.description !== undefined) {
    if (!checkStr(m.description, MAX_CHECKLIST_DESC, 0)) return { ok: false, error: `description must be ≤ ${MAX_CHECKLIST_DESC} chars` };
    out.description = m.description.trim();
  }
  if (m.kind !== undefined) {
    if (typeof m.kind !== "string" || !KINDS.includes(m.kind as ChecklistKind)) return { ok: false, error: "kind must be \"delivery\" or \"custom\"" };
    out.kind = m.kind;
  }
  if (m.linkedProposalId !== undefined) {
    if (m.linkedProposalId === null || m.linkedProposalId === "") {
      out.linkedProposalId = null;
    } else if (typeof m.linkedProposalId === "string" && /^prop_[A-Za-z0-9]+$/.test(m.linkedProposalId)) {
      out.linkedProposalId = m.linkedProposalId;
    } else {
      return { ok: false, error: "linkedProposalId must be a proposal id (prop_…) or empty" };
    }
  }
  if (m.items !== undefined) {
    const items = normalizeItems(m.items);
    if (items === null) return { ok: false, error: `items must be an array of 1..${MAX_CHECKLIST_ITEMS} valid items` };
    out.items = items;
  }
  if (requireItems && (!out.items || out.items.length === 0)) {
    return { ok: false, error: "at least one checklist item is required" };
  }
  return { ok: true, data: out };
}

/** Build a full ChecklistMutation from a create request body (defaults applied). */
export function createMutationFromInput(body: Record<string, unknown>): ChecklistMutation {
  const m: ChecklistMutation = {};
  if (typeof body.name === "string") m.name = body.name;
  if (typeof body.description === "string") m.description = body.description;
  if (typeof body.kind === "string") m.kind = body.kind as ChecklistKind;
  if (body.linkedProposalId !== undefined) m.linkedProposalId = body.linkedProposalId as string | null | undefined;
  if (body.items !== undefined) m.items = body.items as ChecklistItemInput[];
  return m;
}

/** Snapshot for progress computation inputs. */
export function toStoredItems(items: ChecklistItemInput[]): ChecklistItem[] {
  return items.map((it) => ({
    id: it.id!,
    title: it.title,
    status: it.status,
    ...(it.assignee !== undefined ? { assignee: it.assignee } : {}),
  }));
}