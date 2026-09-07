/**
 * autonomy.ts — per-workflow FULLY AUTOMATED execution (AUTONOMY MODE).
 *
 * Owner decision 2026-09-07: customers may enable fully automated execution
 * (no human approvals) for whatever they explicitly allow — but it is
 * OPT-IN PER WORKFLOW, human approval remains the DEFAULT, and the safety
 * floor holds in every mode:
 *
 *   - non-destruction: auto mode never deletes unknown rows / never issues a
 *     delete to a connected system without an explicit allow-listed action
 *     AND a known-row target (explicit `id` in the payload).
 *   - per-tenant isolation: zero cross-tenant paths; autonomy of tenant A
 *     can never touch tenant B (every key is tenant-scoped).
 *   - durable audit trail: every auto-executed action is appended to a
 *     durable audit log (tenant id, workflow id, action, target, timestamp,
 *     outcome, actor="system/autonomy", matched allow-list id). Never
 *     deleted; immutable append.
 *   - instant kill switch: tenant-level AND owner-level global switch; both
 *     flip the workflow back to gated with immediate effect, regardless of
 *     allow-list.
 *   - error-budget fallback: per workflow, N consecutive auto-execution
 *     failures (default 3) revert the workflow to gated automatically
 *     (fail-closed), with a durable record of the fallback.
 *
 * DEFAULT: approvals ON. Anything NOT explicitly allow-listed stays
 * approval-gated even when autonomy is enabled for the workflow.
 *
 * Durable store: tenant_autonomy.json → { [tenantEmail]: { workflows: {...},
 * killSwitch?: boolean, ownerKillSwitch?: boolean } }
 * Audit log:     tenant_autonomy_audit.json → { [tenantEmail]: AutonomyAuditEntry[] }
 */
import { join } from "path";
import { readJSON, writeJSON, resolveDataDir } from "./data-store";

export const AUTONOMY_KEY = "tenant_autonomy.json";
export const AUTONOMY_AUDIT_KEY = "tenant_autonomy_audit.json";
export const AUTONOMY_MAX_CONSECUTIVE_FAILURES = 3;

/** An explicit write allow-list entry — action pattern + optional phase. */
export interface WriteAllowListEntry {
  /** Stable id (e.g. "al-invoice-create-01") used in the audit trail. */
  id: string;
  /** Exact action name OR case-insensitive glob e.g. "invoice-draft.create",
   *  "contact.upsert", "*.create", "doc.file". Explicit beats glob. */
  action: string;
  /** Optional free-text label shown in portal/audit. */
  label?: string;
}

export interface AutonomyWorkflowConfig {
  /** Per-workflow opt-in — default OFF. */
  enabled: boolean;
  /** Explicit writes that may auto-execute. Empty = nothing auto-executes. */
  allowList: WriteAllowListEntry[];
  /** Consecutive auto-execution failures (drives error-budget fallback). */
  consecutiveFailures: number;
  /** True once the workflow has auto-reverted due to error budget. */
  revertedByBudget?: boolean;
}

export interface TenantAutonomyConfig {
  /** Per-workflow autonomy config. Key = workflow id (agent/chain id). */
  workflows: Record<string, AutonomyWorkflowConfig>;
  /** Tenant-level kill switch — instantly gates ALL workflows. */
  killSwitch?: boolean;
  /** Owner-level global kill switch — gates ALL tenants. */
  ownerKillSwitch?: boolean;
}

export interface AutonomyAuditEntry {
  actionId: string;
  tenantEmail: string;
  workflowId: string;
  action: string;
  provider: string;
  target?: string;
  allowListId?: string;
  outcome: "executed" | "failed" | "reverted" | "blocked";
  error?: string;
  actor: "system/autonomy";
  createdAt: number;
}

type AutonomyIndex = Record<string, TenantAutonomyConfig>;
type AutonomyAuditIndex = Record<string, AutonomyAuditEntry[]>;

function defaultDataDir(): string {
  return resolveDataDir(
    process.env.DATA_DIR,
    typeof import.meta?.dir !== "undefined" ? import.meta.dir : process.cwd(),
  );
}
export function autonomyPath(dataDir?: string): string {
  return join(dataDir ?? defaultDataDir(), AUTONOMY_KEY);
}
export function autonomyAuditPath(dataDir?: string): string {
  return join(dataDir ?? defaultDataDir(), AUTONOMY_AUDIT_KEY);
}
function readIndex(dataDir?: string): AutonomyIndex {
  const raw = readJSON(autonomyPath(dataDir));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as AutonomyIndex;
  return {};
}
function writeIndex(index: AutonomyIndex, dataDir?: string): void {
  writeJSON(autonomyPath(dataDir), index);
}
function readAuditIndex(dataDir?: string): AutonomyAuditIndex {
  const raw = readJSON(autonomyAuditPath(dataDir));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as AutonomyAuditIndex;
  return {};
}
function writeAuditIndex(index: AutonomyAuditIndex, dataDir?: string): void {
  writeJSON(autonomyAuditPath(dataDir), index);
}
function makeEntryId(): string {
  return "auto-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function emptyWorkflow(): AutonomyWorkflowConfig {
  return { enabled: false, allowList: [], consecutiveFailures: 0 };
}

// ── Allow-list matching ────────────────────────────────────────────────
/** Match an action name against an allow-list entry (exact or glob). */
export function allowListMatches(entry: WriteAllowListEntry, actionName: string): boolean {
  if (!entry?.action) return false;
  const a = entry.action.toLowerCase();
  const name = (actionName || "").toLowerCase();
  if (a === name) return true;
  if (a.includes("*")) {
    const re = new RegExp("^" + a.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");
    return re.test(actionName || "");
  }
  return false;
}

/** Destructive write verbs — auto mode treats these specially (require both
 *  an explicit allow-list entry AND a known-row target). */
const DESTRUCTIVE_VERB = /^(delete|remove|trash|void|destroy|purge|wipe|cancel)/i;

/** A known-row target is a non-empty explicit `id` field in the payload
 *  (never a "filter"/"query" that could match unknown rows). */
function hasKnownRowTarget(params: Record<string, any> | undefined): boolean {
  if (!params || typeof params !== "object") return false;
  const id = (params as any).id;
  return typeof id === "string" && id.trim().length > 0;
}

/** True when an allow-list entry is an explicit (non-glob) action name. */
function isExactEntry(entry: WriteAllowListEntry): boolean {
  return !entry?.action?.includes("*");
}

/** True when `actionName` is an explicitly allow-listed NON-destructive write
 *  OR a destructive write with an explicit (non-glob) allow-list entry AND a
 *  known-row target. Anything else is NOT auto-eligible. Globs can never
 *  auto-approve a destructive verb (owner mandate: deletes must be explicit). */
export function isAutonomyEligible(
  entry: WriteAllowListEntry,
  actionName: string,
  params?: Record<string, any>,
): boolean {
  if (!entry || !actionName) return false;
  if (!allowListMatches(entry, actionName)) return false;
  // Destructive verbs need an EXPLICIT (exact, non-glob) allow-list entry
  // AND a known-row target — never delete unknown rows, never glob-delete.
  if (DESTRUCTIVE_VERB.test(actionName)) {
    return isExactEntry(entry) && hasKnownRowTarget(params);
  }
  return true;
}

// ── Tenant config accessors (fail-closed: unknown → OFF) ───────────────
export function getTenantAutonomy(tenantId: string, dataDir?: string): TenantAutonomyConfig {
  if (!tenantId) return { workflows: {} };
  return readIndex(dataDir)[tenantId] || { workflows: {} };
}
export function getAutonomyWorkflow(
  tenantId: string,
  workflowId: string,
  dataDir?: string,
): AutonomyWorkflowConfig {
  const cfg = getTenantAutonomy(tenantId, dataDir);
  return cfg.workflows?.[workflowId] || emptyWorkflow();
}

/** Is autonomy currently active for a tenant workflow? All gates must pass:
 *  tenant configured ON for this workflow, NOT kill-switched (tenant or
 *  owner), and the error budget NOT exhausted (not auto-reverted). */
export function isAutonomyEnabled(
  tenantId: string,
  workflowId: string,
  dataDir?: string,
): boolean {
  if (!tenantId || !workflowId) return false;
  const cfg = getTenantAutonomy(tenantId, dataDir);
  if (cfg.killSwitch || cfg.ownerKillSwitch) return false;
  const wf = cfg.workflows?.[workflowId];
  if (!wf || !wf.enabled) return false;
  if (wf.consecutiveFailures >= AUTONOMY_MAX_CONSECUTIVE_FAILURES || wf.revertedByBudget) return false;
  return true;
}

// ── Mutations (validated, durable, fail-closed) ────────────────────────
/** Enable/disable autonomy for a workflow with an explicit allow-list.
 *  Pass allowList=[] to enable with ZERO auto-eligible writes (everything
 *  still approval-gated) or to disable entirely (enabled=false). */
export function setAutonomyWorkflow(
  tenantId: string,
  workflowId: string,
  input: { enabled: boolean; allowList?: WriteAllowListEntry[] },
  dataDir?: string,
): TenantAutonomyConfig {
  if (!tenantId?.trim()) throw new Error("setAutonomyWorkflow requires a tenant id");
  if (!workflowId?.trim()) throw new Error("setAutonomyWorkflow requires a workflow id");
  const index = readIndex(dataDir);
  const current = index[tenantId] || { workflows: {} };
  const wf = current.workflows?.[workflowId] || emptyWorkflow();
  const list = (input.allowList || []).map((e) => ({
    id: e.id || makeEntryId(),
    action: e.action,
    label: e.label,
  }));
  for (const e of list) {
    if (!e.action?.trim()) throw new Error(`Allow-list entry ${e.id} requires an action`);
  }
  const nextWorkflow: AutonomyWorkflowConfig = {
    enabled: !!input.enabled,
    allowList: list,
    // Enabling/updating resets the error budget (a fresh explicit decision).
    consecutiveFailures: 0,
    revertedByBudget: false,
  };
  const next: TenantAutonomyConfig = {
    ...current,
    workflows: { ...(current.workflows || {}), [workflowId]: nextWorkflow },
  };
  index[tenantId] = next;
  writeIndex(index, dataDir);
  return next;
}

/** Tenant-level kill switch — instant revert to gated for ALL workflows. */
export function setTenantAutonomyKillSwitch(
  tenantId: string,
  value: boolean,
  dataDir?: string,
): TenantAutonomyConfig {
  if (!tenantId?.trim()) throw new Error("setTenantAutonomyKillSwitch requires a tenant id");
  const index = readIndex(dataDir);
  const current = index[tenantId] || { workflows: {} };
  const next: TenantAutonomyConfig = { ...current, killSwitch: !!value };
  index[tenantId] = next;
  writeIndex(index, dataDir);
  return next;
}

/** Owner-level global kill switch — gates ALL tenants immediately. */
export function setOwnerAutonomyKillSwitch(value: boolean, dataDir?: string): void {
  const index = readIndex(dataDir);
  for (const tenantId of Object.keys(index)) {
    index[tenantId] = { ...index[tenantId], ownerKillSwitch: !!value };
  }
  writeIndex(index, dataDir);
}

// ── Audit log (immutable append) ───────────────────────────────────────
export function appendAutonomyAudit(entry: Omit<AutonomyAuditEntry, "createdAt" | "actionId"> & { actionId?: string }, dataDir?: string): AutonomyAuditEntry {
  const index = readAuditIndex(dataDir);
  const tenantId = entry.tenantEmail;
  const rec: AutonomyAuditEntry = {
    actionId: entry.actionId || makeEntryId(),
    tenantEmail: tenantId,
    workflowId: entry.workflowId,
    action: entry.action,
    provider: entry.provider,
    target: entry.target,
    allowListId: entry.allowListId,
    outcome: entry.outcome,
    error: entry.error,
    actor: "system/autonomy" as const,
    createdAt: Date.now(),
  };
  const list = index[tenantId] || [];
  list.push(rec);
  index[tenantId] = list;
  writeAuditIndex(index, dataDir);
  return rec;
}

/** Append-only audit list for a tenant (newest first). */
export function autonomyAudit(tenantId: string, dataDir?: string): AutonomyAuditEntry[] {
  if (!tenantId) return [];
  const index = readAuditIndex(dataDir);
  return [...(index[tenantId] || [])].sort((a, b) => b.createdAt - a.createdAt);
}

// ── Error-budget fallback ──────────────────────────────────────────────
/**
 * Record an auto-execution outcome for a workflow. On FAILURE, increments the
 * workflow's consecutive-failure counter; when it reaches the max (3), the
 * workflow auto-reverts to gated (fail-closed) and a durable audit entry is
 * appended. On SUCCESS, resets the counter.
 */
export function recordAutonomyOutcome(
  tenantId: string,
  workflowId: string,
  action: string,
  provider: string,
  ok: boolean,
  opts?: { dataDir?: string; allowListId?: string; error?: string; target?: string },
): AutonomyAuditEntry {
  if (!tenantId || !workflowId) {
    throw new Error("recordAutonomyOutcome requires tenant + workflow");
  }
  const index = readIndex(opts?.dataDir);
  const current = index[tenantId] || { workflows: {} };
  const wf = current.workflows?.[workflowId] || emptyWorkflow();
  let outcome: AutonomyAuditEntry["outcome"] = "executed";
  let nextFailures = 0;
  let reverted = false;
  if (ok) {
    wf.consecutiveFailures = 0;
    wf.revertedByBudget = false;
  } else {
    outcome = "failed";
    nextFailures = (wf.consecutiveFailures || 0) + 1;
    wf.consecutiveFailures = nextFailures;
    if (nextFailures >= AUTONOMY_MAX_CONSECUTIVE_FAILURES) {
      wf.enabled = false;
      wf.revertedByBudget = true;
      wf.consecutiveFailures = 0;
      reverted = true;
      outcome = "reverted";
    }
  }
  const next: TenantAutonomyConfig = {
    ...current,
    workflows: { ...(current.workflows || {}), [workflowId]: wf },
  };
  index[tenantId] = next;
  writeIndex(index, opts?.dataDir);

  const entry = appendAutonomyAudit(
    {
      tenantEmail: tenantId,
      workflowId,
      action,
      provider,
      target: opts?.target,
      allowListId: opts?.allowListId,
      outcome,
      error: reverted ? `${opts?.error || "consecutive failures"} — workflow reverted to gated (error budget)` : opts?.error,
    },
    opts?.dataDir,
  );
  return entry;
}

/** Error budget + kill-switch status for a tenant workflow (portal display). */
export function autonomyStatus(
  tenantId: string,
  workflowId: string,
  dataDir?: string,
): {
  enabled: boolean;
  allowList: WriteAllowListEntry[];
  consecutiveFailures: number;
  revertedByBudget: boolean;
  tenantKillSwitch: boolean;
  ownerKillSwitch: boolean;
} {
  const cfg = getTenantAutonomy(tenantId, dataDir);
  const wf = getAutonomyWorkflow(tenantId, workflowId, dataDir);
  return {
    enabled: isAutonomyEnabled(tenantId, workflowId, dataDir),
    allowList: wf.allowList,
    consecutiveFailures: wf.consecutiveFailures,
    revertedByBudget: !!wf.revertedByBudget,
    tenantKillSwitch: !!cfg.killSwitch,
    ownerKillSwitch: !!cfg.ownerKillSwitch,
  };
}
