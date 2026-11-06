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
// SLICE 192b-3 — 193's rule, applied to THIS store. `isStoreUnreadable` /
// `reportUnreadableStore` / `StoreUnreadableError` are the ONE mechanism 193
// established for "a file that exists and does not parse is never overwritten";
// this lane consumes them rather than inventing a second convention.
import { readJSON, writeJSON, resolveDataDir, isStoreUnreadable, reportUnreadableStore, StoreUnreadableError } from "./data-store";
import { getTenantSettings } from "./tenant-settings";
import { isAutonomyEnabled, isAutonomyEligible, getAutonomyWorkflow } from "./autonomy";
// SLICE 198 — the queue asks the EXECUTOR's own registry whether an action can
// run before it mints a card for it. `../engine/action-registry` is the map the
// executor consults (no provider/OAuth graph), and `../native/actions` registers
// the native executors into that same map. Both are import-light on purpose:
// this module is loaded by every native gate.
import { actionRegistry } from "../engine/action-registry";
import { registerNativeExecutors, isQueueExecutableProvider } from "../native/actions";

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
  /**
   * SLICE 192b-3 — idempotency key for the CARD (not the write).
   *
   * A public client POST reaches `approvalGate` before any lane-level dedupe
   * runs, so before this key existed N identical POSTs produced N cards, N−1 of
   * which could only fail on approve. A caller that supplies a key derived from
   * (tenant, subject, decision) gets ONE pending card: the second enqueue
   * returns the card already in the queue instead of minting another.
   */
  dedupeKey?: string;
}

export type ApprovalQueueIndex = Record<string, PendingAction[]>;

export interface ApprovalGateOutcome {
  /** true = proceed with the write now (auto mode, or already approved). */
  allowed: boolean;
  /** Set when the write was routed to the pending queue instead. */
  actionId?: string;
  error?: string;
  /** True when this write auto-executed via AUTONOMY MODE (allow-listed). */
  autonomy?: boolean;
  /** The allow-list entry id that matched (autonomy only). */
  allowListId?: string;
  /** Workflow id the gate evaluated (enables audit + error budget). */
  workflowId?: string;
}

// ── Write-action classification ─────────────────────────────────────────
// Actions are classified by verb prefix. Anything that mutates provider
// state (create/update/delete/send/upload/copy/move/write/post/set/mark/
// complete/void/trash/ingest/trigger/submit/approve/reject/cancel/add/edit/
// archive/restore/rename/invite/assign/schedule/execute/import/export/start/
// stop/pause/resume/open/close/accept/decline/revoke/rotate) is a WRITE and
// needs approval. `revoke`/`rotate` were ADDED by slice 152: an invoice share
// link is a bearer credential, so killing or reissuing it is a state mutation —
// without these verbs revokeInvoiceShare/rotateInvoiceShare would classify as
// READS and BYPASS the Approval Queue (the same fail-open class as pull/map/
// commit in 5.1).
// Everything else (get/list/search/query/read/fetch/check/probe/health/
// analyze/test/describe/show/download/view/status...) is a READ and passes.
const WRITE_VERB = /^(create|update|delete|remove|send|upload|copy|move|write|post|set|mark|merge|complete|void|trash|ingest|trigger|submit|approve|reject|cancel|add|edit|archive|restore|rename|invite|assign|schedule|execute|generate|import|export|extract|start|stop|pause|resume|open|close|accept|decline|reopen|publish|confirm|request|run|activate|ask|attest|pull|map|commit|revoke|rotate)/i;
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

/**
 * Read the queue index.
 *
 * SLICE 192b-3 — A FILE THAT EXISTS AND DOES NOT PARSE IS NEVER OVERWRITTEN
 * (193's rule, applied to the store a PUBLIC lane can write to).
 *
 * This used to fall back to `{}` on a parse failure. `enqueueApproval` then
 * appended one card to that empty index and wrote the whole file back — so ONE
 * unauthenticated client POST replaced a tenant's corrupt-but-recoverable
 * approval history with a small, valid, wrong document. `writeJSON` now also
 * refuses that write (193), but a refusal that arrives after the read already
 * pretended the queue was empty is a refusal the caller cannot explain; the
 * read fails HERE, loudly, naming the file, and every writer inherits it.
 *
 * A MISSING file is not an error: creating a store is still allowed.
 */
function readIndex(dataDir?: string, where = "approvalQueue"): ApprovalQueueIndex {
  const path = approvalQueuePath(dataDir);
  if (isStoreUnreadable(path)) {
    reportUnreadableStore(path, where);
    throw new StoreUnreadableError(path);
  }
  const raw = readJSON(path);
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
 *
 * SLICE 192b-3 — IDEMPOTENT WHEN GIVEN A `dedupeKey`. A caller that knows what
 * the decision IS (tenant + subject + decision) passes a stable key; if a
 * PENDING card with that key already exists, that card is returned and no
 * second one is created. This is deliberately in the ONE enqueue path rather
 * than in each lane: the flood reached the queue through `approvalGate`, so the
 * fix has to sit where the card is minted. Only PENDING cards dedupe — once a
 * card is decided, a later identical request is a genuinely new decision and
 * gets its own card.
 */
export function enqueueApproval(
  input: Omit<PendingAction, "actionId" | "status" | "createdAt">,
  dataDir?: string,
): PendingAction {
  if (!input.tenantEmail?.trim()) throw new Error("enqueueApproval requires tenantEmail");
  if (!input.actionType?.trim()) throw new Error("enqueueApproval requires actionType");
  const index = readIndex(dataDir, "enqueueApproval"); // throws propagate → fail-closed
  const tenantActions = index[input.tenantEmail] || [];
  if (input.dedupeKey) {
    const existing = tenantActions.find((a) => a.status === "pending" && a.dedupeKey === input.dedupeKey);
    if (existing) return existing;
  }
  const record: PendingAction = {
    ...input,
    actionId: makeActionId(),
    status: "pending",
    createdAt: Date.now(),
  };
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
  opts?: {
    agentId?: string;
    dataDir?: string;
    chainId?: string;
    workflowId?: string;
    dedupeKey?: string;
    /** Who asked for this write (the portal actor, or "public:…" for a share
     *  link). Rendered on the card so it says what is true about its origin. */
    requestedBy?: string;
  },
): ApprovalGateOutcome {
  if (!isWriteAction(actionName)) return { allowed: true };
  const workflowId = opts?.workflowId || opts?.agentId || "default";
  // SLICE 198 — FAIL-CLOSED AT ENQUEUE. The sweep's P1-1: `createProposal` was
  // carded, and approving it answered `Unknown action` — the card left the
  // queue and the write stayed pending forever, with no way back. A card the
  // executor cannot run is worse than a refusal, because it looks like progress.
  // The registry consulted here is the EXECUTOR's own map, so the two cannot
  // disagree. Scoped to the providers whose writes execute through the engine
  // (see QUEUE_EXECUTABLE_PROVIDERS): the other native gates apply their writes
  // through their own module approve endpoint and must keep queueing.
  registerNativeExecutors(actionRegistry);
  if (isQueueExecutableProvider(provider) && !actionRegistry.hasAction(actionName)) {
    return {
      allowed: false,
      error:
        `No executor is registered for "${actionName}" (${provider}) — the write was refused instead of being ` +
        `queued as a card that could never run. Nothing was written and no approval card was created.`,
      workflowId,
    };
  }
  const mode = approvalModeForTenant(tenantId, opts?.dataDir);
  // Legacy tenant-wide "auto" opt-out is honored ONLY when the workflow is
  // explicitly autonomy-enabled AND the action is allow-listed. Anything
  // else stays approval-gated (fail-closed). A tenant that enabled "auto"
  // but never set an allow-list gets nothing auto-executed.
  if (mode === "auto" || isAutonomyEnabled(tenantId, workflowId, opts?.dataDir)) {
    const wf = getAutonomyWorkflow(tenantId, workflowId, opts?.dataDir);
    const matched = wf.allowList.find((e) => isAutonomyEligible(e, actionName, params));
    if (matched && isAutonomyEnabled(tenantId, workflowId, opts?.dataDir)) {
      // Explicit allow-listed write → auto-execute (audit recorded by the
      // caller via recordAutonomyOutcome; the gate is the ALLOW decision).
      return {
        allowed: true,
        autonomy: true,
        allowListId: matched.id,
        workflowId,
      };
    }
    // Fall through to gated: NOT allow-listed (or kill-switched / budget
    // reverted) → the write still needs human approval.
  }
  try {
    const record = enqueueApproval(
      {
        tenantEmail: tenantId,
        agentId: opts?.agentId || "ai-employee",
        actionType: actionName,
        provider,
        summary: summarizeAction(actionName, provider, params, { requestedBy: opts?.requestedBy }),
        payload: params || {},
        chainId: opts?.chainId,
        // SLICE 192b-3 — a lane that knows what the decision IS passes its key
        // here, so a repeated identical request reuses the queued card instead
        // of minting a second one (finding #9: the dedupe used to run AFTER
        // this call, so the queue grew by one card per POST).
        ...(opts?.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
      },
      opts?.dataDir,
    );
    return { allowed: false, actionId: record.actionId, workflowId };
  } catch (e: any) {
    // Fail-closed: store unavailable → never execute the write. A store that
    // exists and does not parse (192b-3 / 193) lands here too: nothing was
    // written, the bytes on disk are untouched, and the caller gets a refusal
    // it must surface as an error rather than as "queued".
    return { allowed: false, error: `Approval store unavailable — write blocked: ${e?.message || String(e)}`, workflowId };
  }
}

/**
 * SLICE 192b-3 — true when a refusal came from the STORE (193's guard or an
 * unreadable file) rather than from the decision itself.
 *
 * The public share lanes answer this with a generic 503: the client must know
 * their decision was NOT recorded, and must not be handed an internal path or a
 * parse error. The authenticated lanes keep the detailed message.
 */
export function isApprovalStoreUnavailable(error?: string | null): boolean {
  if (!error) return false;
  return /^Approval store unavailable/.test(error) || /does not parse|refusing to write/i.test(error);
}

/** Human-readable what/where/why summary for the portal card. */
export function summarizeAction(
  actionName: string,
  provider: string,
  params: Record<string, any>,
  opts?: { requestedBy?: string },
): { what: string; where: string; why: string } {
  const p = params || {};
  const keys = Object.keys(p).filter((k) => k !== "id");
  const detail = keys.slice(0, 4).map((k) => `${k}=${safeShort(p[k])}`).join(", ");
  return {
    what: `${actionName}${detail ? ` (${detail})` : ""}`,
    where: provider || "unknown system",
    // SLICE 198 — this line used to read "Agent-initiated write captured by the
    // approval queue" for a write the signed-in human had just made in the
    // portal. `src/agents/*` is retired; nothing agentic queued these. Say who
    // asked and what happens next, and claim nothing else.
    why: whyLine(opts?.requestedBy),
  };
}

function whyLine(requestedBy?: string): string {
  const who = (requestedBy || "").trim();
  if (who.startsWith("public:")) {
    return "Submitted through a public share link — nothing is written until it is approved here.";
  }
  if (who) return `Queued by ${who} — nothing is written until it is approved.`;
  return "Queued for approval — nothing is written until it is approved.";
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
