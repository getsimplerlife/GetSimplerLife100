/**
 * native/automation/store.ts — durable, tenant-keyed AUTOMATION store (3.7).
 * Rules + run ledger + pending-write mirror + immutable native.automation.*
 * audit. Every read/write takes tenantId explicitly — zero cross-tenant paths.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  MAX_RUNS_PER_TENANT,
  NATIVE_AUTOMATION_AUDIT_KEY,
  NATIVE_AUTOMATION_PENDING_KEY,
  NATIVE_AUTOMATION_RULES_KEY,
  NATIVE_AUTOMATION_RUNS_KEY,
  type AutomationRule,
  type AutomationRun,
  type PendingAutomationWrite,
} from "./types";
export interface NativeAutomationAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.automation.<...>
  ruleId?: string;
  runId?: string;
  detail: string;
}
function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function load<T>(dataDir: string, key: string, fallback: T): T {
  try {
    const raw = readJSON(dataPath(dataDir, key));
    return (raw ?? fallback) as T;
  } catch {
    return fallback;
  }
}
function save(dataDir: string, key: string, value: unknown): void {
  writeJSON(dataPath(dataDir, key), value);
}
export function generateAutomationEntityId(kind: "rul" | "arn" | "apw" | "aud"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
// ── Rules ───────────────────────────────────────────────────────────────────
interface RuleIndex { rules: AutomationRule[] }
export function listRules(dataDir: string, tenantId: string): AutomationRule[] {
  return load<Record<string, RuleIndex>>(dataDir, NATIVE_AUTOMATION_RULES_KEY, {})[tenantId]?.rules ?? [];
}
export function getRule(dataDir: string, tenantId: string, id: string): AutomationRule | null {
  return listRules(dataDir, tenantId).find((r) => r.id === id) ?? null;
}
export function saveRule(dataDir: string, r: AutomationRule): void {
  const all = load<Record<string, RuleIndex>>(dataDir, NATIVE_AUTOMATION_RULES_KEY, {});
  const idx = all[r.tenantId] ?? { rules: [] };
  const i = idx.rules.findIndex((x) => x.id === r.id);
  if (i >= 0) idx.rules[i] = r;
  else idx.rules.push(r);
  all[r.tenantId] = idx;
  save(dataDir, NATIVE_AUTOMATION_RULES_KEY, all);
}
export function deleteRuleRecord(dataDir: string, tenantId: string, id: string): void {
  const all = load<Record<string, RuleIndex>>(dataDir, NATIVE_AUTOMATION_RULES_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.rules = idx.rules.filter((r) => r.id !== id);
  all[tenantId] = idx;
  save(dataDir, NATIVE_AUTOMATION_RULES_KEY, all);
}
/** ALL tenants' ACTIVE rules (engine discovery — never exposed over HTTP). */
export function listAllActiveRules(dataDir: string): Array<{ tenantId: string; rule: AutomationRule }> {
  const all = load<Record<string, RuleIndex>>(dataDir, NATIVE_AUTOMATION_RULES_KEY, {});
  const out: Array<{ tenantId: string; rule: AutomationRule }> = [];
  for (const tenantId of Object.keys(all)) {
    for (const rule of all[tenantId]?.rules ?? []) {
      if (rule.status === "active") out.push({ tenantId, rule });
    }
  }
  return out;
}
// ── Runs ────────────────────────────────────────────────────────────────────
interface RunIndex { runs: AutomationRun[] }
export function listRuns(dataDir: string, tenantId: string, ruleId?: string): AutomationRun[] {
  const runs = load<Record<string, RunIndex>>(dataDir, NATIVE_AUTOMATION_RUNS_KEY, {})[tenantId]?.runs ?? [];
  return ruleId ? runs.filter((r) => r.ruleId === ruleId) : runs;
}
export function getRun(dataDir: string, tenantId: string, id: string): AutomationRun | null {
  return listRuns(dataDir, tenantId).find((r) => r.id === id) ?? null;
}
export function findRunByRef(dataDir: string, tenantId: string, ruleId: string, triggerRef: string): AutomationRun | null {
  return listRuns(dataDir, tenantId, ruleId).find((r) => r.triggerRef === triggerRef) ?? null;
}
export function saveRun(dataDir: string, run: AutomationRun): void {
  const all = load<Record<string, RunIndex>>(dataDir, NATIVE_AUTOMATION_RUNS_KEY, {});
  const idx = all[run.tenantId] ?? { runs: [] };
  const i = idx.runs.findIndex((x) => x.id === run.id);
  if (i >= 0) idx.runs[i] = run;
  else idx.runs.push(run);
  // retention trim — first-in evicted (bounded consumer of file space)
  while (idx.runs.length > MAX_RUNS_PER_TENANT) idx.runs.shift();
  all[run.tenantId] = idx;
  save(dataDir, NATIVE_AUTOMATION_RUNS_KEY, all);
}
export function updateRun(
  dataDir: string,
  tenantId: string,
  runId: string,
  mutate: (run: AutomationRun) => AutomationRun,
): AutomationRun | null {
  const run = getRun(dataDir, tenantId, runId);
  if (!run) return null;
  const next = mutate(run);
  saveRun(dataDir, next);
  return next;
}
// ── Pending writes ──────────────────────────────────────────────────────────
interface PendingIndex { writes: PendingAutomationWrite[] }
export function listPendingWrites(dataDir: string, tenantId: string): PendingAutomationWrite[] {
  return load<Record<string, PendingIndex>>(dataDir, NATIVE_AUTOMATION_PENDING_KEY, {})[tenantId]?.writes ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingAutomationWrite): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_AUTOMATION_PENDING_KEY, {});
  const idx = all[w.tenantId] ?? { writes: [] };
  const i = idx.writes.findIndex((x) => x.id === w.id);
  if (i >= 0) idx.writes[i] = w;
  else idx.writes.push(w);
  all[w.tenantId] = idx;
  save(dataDir, NATIVE_AUTOMATION_PENDING_KEY, all);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingAutomationWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  result?: PendingAutomationWrite["appliedResult"],
  error?: string,
): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_AUTOMATION_PENDING_KEY, {});
  const idx = all[tenantId];
  const w = idx?.writes.find((x) => x.id === id);
  if (!w) return;
  w.status = status;
  if (result) w.appliedResult = result;
  if (error) w.error = error;
  save(dataDir, NATIVE_AUTOMATION_PENDING_KEY, all);
}
// ── Audit (immutable) ──────────────────────────────────────────────────────
function appendAudit(dataDir: string, entry: Omit<NativeAutomationAuditEntry, "id" | "ts">): void {
  const all = load<Record<string, { audit: NativeAutomationAuditEntry[] }>>(dataDir, NATIVE_AUTOMATION_AUDIT_KEY, {});
  const idx = all[entry.tenantId] ?? { audit: [] };
  idx.audit.push({ ...entry, id: generateAutomationEntityId("aud"), ts: new Date().toISOString() });
  if (idx.audit.length > 500) idx.audit.splice(0, idx.audit.length - 500);
  all[entry.tenantId] = idx;
  save(dataDir, NATIVE_AUTOMATION_AUDIT_KEY, all);
}
export function listAudit(dataDir: string, tenantId: string): NativeAutomationAuditEntry[] {
  return load<Record<string, { audit: NativeAutomationAuditEntry[] }>>(dataDir, NATIVE_AUTOMATION_AUDIT_KEY, {})[tenantId]?.audit ?? [];
}
export { appendAudit };