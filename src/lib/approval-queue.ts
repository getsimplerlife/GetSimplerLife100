/**
 * approval-queue.ts — cross-agent Approval Queue (highest-satisfaction feature).
 *
 * Every agent write action becomes an approvable card in the client portal:
 *   what / where / why, with Approve / Edit / Reject. No write executes until
 *   approved (default ON for all tenants).
 *
 * DATA MODEL (durable, per-tenant, write-through + fail-soft via data-store):
 *   key: tenant_approvals.json  → { [tenantEmail]: PendingAction[] }
 *   approval mode: stored in tenant_settings.json → { [tenantEmail]: { approvalMode: "on"|"auto" } }
 *
 * ENFORCEMENT: provider write adapters pass through `approvalGate` (or the
 * engine-level `executeAction` wrapper). If approval is ON for the tenant,
 * the write is routed to pending-actions instead of executing; only an
 * explicit portal approve executes it. FAIL-CLOSED: if the store is
 * unavailable the write is NOT executed (never write around the gate).
 *
 * REJECTED actions are DISCARDED — no API call to the provider, ever
 * (non-destruction mandate: this feature adds no destructive path).
 */
import { join } from "path";
import { readJSON, writeJSON, resolveDataDir } from "./data-store";
import { getTenantSettings } from "./tenant-settings";

export const APPROVAL_QUEUE_KEY = "tenant_approvals.json";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "edited";

export interface PendingAction {
  actionId: string;
  tenantEmail: string;
  agentId: string;
  actionType: string;      // e.g. "createXeroInvoice"
  provider: string;        // e.g. "xero"
  summary: { what: string; where: string; why: string };
  payload: Record<string, any>; // full params captured at enqueue time
  status: ApprovalStatus;
  createdAt: number;
  /** When the write was proposed by a multi-employee chain, the chain id it came from. */
  chainId?: string;
  decidedAt?: number;
  decidedBy?: string;
  /** Result of the executed write (approved actions only). */
  result?: any;
  /** Error from the executed write, if any. */
  resultError?: string;
}

export type ApprovalQueueIndex = Record<string, PendingAction[]>;

export interface ApprovalGateOutcome {
  /** true = proceed with the write now (auto mode, or already approved). */
  allowed: boolean;
  /** Set when the write was routed to the pending queue instead. */
  actionId?: string;
  error?: string;
}

// ── Write-action classification ─────────────────────────────────────────
// Actions are classified by verb prefix. Anything that mutates provider
// state (create/update/delete/send/upload/copy/move/write/post/set/mark/
// complete/void/trash/ingest/trigger/submit/approve/reject/cancel/add/edit/
// archive/restore/rename/invite/assign/schedule/execute/import/export/start/
// stop/pause/resume/open/close/accept/decline) is a WRITE and needs approval.
// Everything else (get/list/search/query/read/fetch/check/probe/health/
// analyze/test/describe/show/download/view/status...) is a READ and passes.
const WRITE_VERB = /^(create|update|delete|remove|send|upload|copy|move|write|post|set|mark|complete|void|trash|ingest|trigger|submit|approve|reject|cancel|add|edit|archive|restore|rename|invite|assign|schedule|execute|import|export|start|stop|pause|resume|open|close|accept|decline)/i;
const READ_VERB = /^(get|list|search|query|read|fetch|check|probe|health|analyze|test|describe|show|download|view|status|find|count|exists|verify|validate|preview)/i;

/** True when an action name mutates provider state and must be gated. */
export function isWriteAction(actionName: string): boolean {
  if (!actionName) return false;
  // Explicit reads win (e.g. getXeroInvoice) — never gate pure reads.
  if (READ_VERB.test(actionName)) return false;
  return WRITE_VERB.test(actionName);
}

// ── Approval mode (per tenant, default ON) ──────────────────────────────
export type ApprovalMode = "on" | "auto";
export const VALID_APPROVAL_MODES: readonly ApprovalMode[] = ["on", "auto"] as const;

export function approvalModeForTenant(tenantId: string, dataDir?: string): ApprovalMode {
  if (!tenantId) return "on"; // fail-closed: unknown tenant keeps approvals ON
  const settings = getTenantSettings(tenantId, dataDir);
  const mode = settings.approvalMode;
  return VALID_APPROVAL_MODES.includes(mode as ApprovalMode) ? (mode as ApprovalMode) : "on";
}

// ── Store helpers ───────────────────────────────────────────────────────
function defaultDataDir(): string {
  return resolveDataDir(
    process.env.DATA_DIR,
    typeof import.meta?.dir !== "undefined" ? import.meta.dir : process.cwd(),
  );
}

export function approvalQueuePath(dataDir?: string): string {
  return join(dataDir ?? defaultDataDir(), APPROVAL_QUEUE_KEY);
}

function readIndex(dataDir?: string): ApprovalQueueIndex {
  const raw = readJSON(approvalQueuePath(dataDir));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as ApprovalQueueIndex;
  return {};
}

function writeIndex(index: ApprovalQueueIndex, dataDir?: string): void {
  writeJSON(approvalQueuePath(dataDir), index);
}

function makeActionId(): string {
  return "act-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/** List a tenant's actions (optionally filtered by status). Sorted newest-first. */
export function listTenantActions(tenantId: string, dataDir?: string): PendingAction[] {
  if (!tenantId) return [];
  const index = readIndex(dataDir);
  return [...(index[tenantId] || [])].sort((a, b) => b.createdAt - a.createdAt);
}

export function listPendingActions(tenantId: string, dataDir?: string): PendingAction[] {
  return listTenantActions(tenantId, dataDir).filter((a) => a.status === "pending");
}

export function listDecidedActions(tenantId: string, dataDir?: string): PendingAction[] {
  return listTenantActions(tenantId, dataDir).filter((a) => a.status !== "pending");
}

/**
 * Enqueue a write for approval. THROWS if the store is unavailable —
 * callers (the engine gate) must treat a throw as fail-closed and NOT
 * execute the write. Returns the stored record on success.
 */
export function enqueueApproval(
  input: Omit<PendingAction, "actionId" | "status" | "createdAt">,
  dataDir?: string,
): PendingAction {
  if (!input.tenantEmail?.trim()) throw new Error("enqueueApproval requires tenantEmail");
  if (!input.actionType?.trim()) throw new Error("enqueueApproval requires actionType");
  const record: PendingAction = {
    ...input,
    actionId: makeActionId(),
    status: "pending",
    createdAt: Date.now(),
  };
  const index = readIndex(dataDir); // throws propagate → fail-closed
  const tenantActions = index[input.tenantEmail] || [];
  tenantActions.push(record);
  index[input.tenantEmail] = tenantActions;
  writeIndex(index, dataDir); // throws propagate → fail-closed
  return record;
}

/** Find one action for a tenant (tenant-scoped — never crosses tenants). */
export function getTenantAction(tenantId: string, actionId: string, dataDir?: string): PendingAction | null {
  if (!tenantId || !actionId) return null;
  const index = readIndex(dataDir);
  const actions = index[tenantId] || [];
  return actions.find((a) => a.actionId === actionId) || null;
}

/**
 * Approve an action: mark approved and (optionally) record the executed
 * result. The actual execution happens OUTSIDE this function (the portal
 * handler runs the stored payload through the engine with the gate
 * bypassed); we only transition state + store the outcome. Idempotent:
 * approving a non-pending action is a no-op returning null.
 */
export function markApproved(
  tenantId: string,
  actionId: string,
  decidedBy: string,
  outcome?: { result?: any; error?: string },
  dataDir?: string,
): PendingAction | null {
  const index = readIndex(dataDir);
  const actions = index[tenantId] || [];
  const rec = actions.find((a) => a.actionId === actionId);
  if (!rec || rec.status !== "pending") return null;
  rec.status = "approved";
  rec.decidedAt = Date.now();
  rec.decidedBy = decidedBy;
  if (outcome) {
    if (outcome.error !== undefined) rec.resultError = outcome.error;
    else rec.result = outcome.result;
  }
  index[tenantId] = actions;
  writeIndex(index, dataDir);
  return rec;
}

/** Reject an action: DISCARD it (no provider call, ever). Idempotent. */
export function markRejected(
  tenantId: string,
  actionId: string,
  decidedBy: string,
  dataDir?: string,
): PendingAction | null {
  const index = readIndex(dataDir);
  const actions = index[tenantId] || [];
  const rec = actions.find((a) => a.actionId === actionId);
  if (!rec || rec.status !== "pending") return null;
  rec.status = "rejected";
  rec.decidedAt = Date.now();
  rec.decidedBy = decidedBy;
  index[tenantId] = actions;
  writeIndex(index, dataDir);
  return rec;
}

/**
 * Edit a pending action's payload BEFORE approval (portal "Edit" action).
 * Only pending actions can be edited; the status stays "pending" so it can
 * still be approved (the edit is visible via the updated payload/summary and
 * the portal audit trail). Returns null when the action is not pending.
 */
export function editPendingAction(
  tenantId: string,
  actionId: string,
  newPayload: Record<string, any>,
  dataDir?: string,
): PendingAction | null {
  if (!newPayload || typeof newPayload !== "object") {
    throw new Error("editPendingAction requires a payload object");
  }
  const index = readIndex(dataDir);
  const actions = index[tenantId] || [];
  const rec = actions.find((a) => a.actionId === actionId);
  if (!rec || rec.status !== "pending") return null;
  rec.payload = newPayload;
  rec.summary = summarizeAction(rec.actionType, rec.provider, newPayload);
  index[tenantId] = actions;
  writeIndex(index, dataDir);
  return rec;
}

/**
 * The gate. Called by the engine before executing a provider write.
 *   - approval OFF for the tenant (explicit per-tenant opt-out) → allowed.
 *   - store unavailable → NOT allowed (fail-closed) with a clear error.
 *   - otherwise → enqueue and return allowed:false + actionId.
 */
export function approvalGate(
  tenantId: string,
  actionName: string,
  provider: string,
  params: Record<string, any>,
  opts?: { agentId?: string; dataDir?: string; chainId?: string },
): ApprovalGateOutcome {
  if (!isWriteAction(actionName)) return { allowed: true };
  if (approvalModeForTenant(tenantId, opts?.dataDir) === "auto") return { allowed: true };
  try {
    const record = enqueueApproval(
      {
        tenantEmail: tenantId,
        agentId: opts?.agentId || "ai-employee",
        actionType: actionName,
        provider,
        summary: summarizeAction(actionName, provider, params),
        payload: params || {},
        chainId: opts?.chainId,
      },
      opts?.dataDir,
    );
    return { allowed: false, actionId: record.actionId };
  } catch (e: any) {
    // Fail-closed: store unavailable → never execute the write.
    return { allowed: false, error: `Approval store unavailable — write blocked: ${e?.message || String(e)}` };
  }
}

/** Human-readable what/where/why summary for the portal card. */
export function summarizeAction(
  actionName: string,
  provider: string,
  params: Record<string, any>,
): { what: string; where: string; why: string } {
  const p = params || {};
  const keys = Object.keys(p).filter((k) => k !== "id");
  const detail = keys.slice(0, 4).map((k) => `${k}=${safeShort(p[k])}`).join(", ");
  return {
    what: `${actionName}${detail ? ` (${detail})` : ""}`,
    where: provider || "unknown system",
    why: "Agent-initiated write captured by the approval queue — pending human review.",
  };
}

function safeShort(v: unknown): string {
  try {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
    return String(v).slice(0, 60);
  } catch {
    return "";
  }
}
