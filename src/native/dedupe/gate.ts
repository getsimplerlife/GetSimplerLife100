/**
 * native/dedupe/gate.ts — GATED WRITE PATH for Phase 4.2 native DEDUPE/MDM
 * (deterministic match rules + data-quality rules + scan-run ledger + merge
 * suggestions over the tenant's OWN 1.4 records + non-destructive merge).
 *
 * Mirrors the 3.4–3.8/4.1 gates exactly:
 *   - validation BEFORE the gate (forged create-ids, unknown in-tenant
 *     table/field references, caps, malformed payloads, llmAssist attempts
 *     NEVER queue) — fail-closed,
 *   - every mutation rides the Approval Queue verb-first: createMatchRule /
 *     updateMatchRule / deleteMatchRule / createQualityRule /
 *     updateQualityRule / deleteQualityRule / runDedupeScan / mergeRecords /
 *     deleteSuggestion — all verbs create/update/delete/run/delete are
 *     ALREADY in WRITE_VERB; `mergeRecords` REQUIRES the NEW `merge` verb
 *     ADDED to WRITE_VERB by this slice (classification test locks the
 *     fail-open guard: without `merge`, mergeRecords would be classified a
 *     READ and BYPASS the Approval Queue),
 *   - server-assigned ids ONLY (client-supplied ids on create → 400),
 *   - NON-DESTRUCTIVE MERGE: mergeRecords creates a durable record-identity
 *     pointer (survivor + superseded row ids + before/after audit
 *     snapshots). The 1.4 rows themselves are NEVER deleted or rewritten —
 *     reads keep using the survivor row as canonical,
 *   - HONEST OUTCOMES: the scan-run ledger records rows scanned, suggestions
 *     produced and quality issues found with an explicit note that no record
 *     was deleted or modified; the merge ledger records the identity pointer,
 *     never a claim that source rows were consolidated,
 *   - delete lanes fail closed on references (a match rule with open
 *     suggestions cannot be deleted),
 *   - the durable pending-write mirror lands with each approval card; the
 *     approve-path executor is idempotent (replay → alreadyApplied),
 *   - autonomy (#236): allow-listed actions auto-apply with
 *     recordAutonomyOutcome in the shared gate rules.
 */
import { approvalGate, markApproved, markRejected, type ApprovalGateOutcome } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import { getTable, getRow, listRows } from "../tables/store";
import {
  MATCH_MODES,
  MAX_AUDIT_SNAPSHOT_CHARS,
  MAX_DAILY_SCANS,
  MAX_DEDUPE_RUNS_PER_TENANT,
  MAX_MATCH_FIELDS_PER_RULE,
  MAX_MATCH_RULES_PER_TENANT,
  MAX_MERGE_SUPERSEDED_ROWS,
  MAX_OPEN_SUGGESTIONS,
  MAX_PAIR_COMPARISONS,
  MAX_PENDING_DEDUPE_WRITES,
  MAX_QUALITY_ISSUES_PER_RUN,
  MAX_QUALITY_RULES_PER_TENANT,
  MAX_RECORD_IDENTITIES_PER_TENANT,
  MAX_RULE_DESCRIPTION,
  MAX_RULE_NAME,
  MAX_SUGGESTIONS_PER_SCAN,
  NATIVE_DEDUPE_PROVIDER,
  NATIVE_DEDUPE_WORKFLOW_ID,
  QUALITY_RULE_TYPES,
  type DedupeOp,
  type DedupeRun,
  type MatchRule,
  type MergeSuggestion,
  type PendingDedupeWrite,
  type QualityRule,
  type RecordIdentity,
} from "./types";
import {
  appendAudit,
  canonicalSuggestionKey,
  countOpenSuggestions,
  countTodayScans,
  deleteMatchRuleRecord,
  deleteQualityRuleRecord,
  generateDedupeEntityId,
  getMatchRule,
  getPendingWriteByAction,
  getQualityRule,
  getSuggestion,
  listIdentities,
  listMatchRules,
  listPendingWrites,
  listQualityRules,
  listRuns,
  listSuggestions,
  markPendingWrite,
  rowIsResolved,
  saveIdentity,
  saveMatchRule,
  savePendingWrite,
  saveQualityRule,
  saveRun,
  saveSuggestion,
  suggestionExists,
} from "./store";
import { chooseSurvivor, evaluateQuality, matchPairsTable } from "./match";

/** Verb-first action names — every verb ∈ WRITE_VERB. `merge` is the NEW
 *  verb added by this slice (classification test asserts all nine; this
 *  slice's standing fail-open control). */
const ACTION_NAME: Record<DedupeOp, string> = {
  createMatchRule: "createMatchRule",
  updateMatchRule: "updateMatchRule",
  deleteMatchRule: "deleteMatchRule",
  createQualityRule: "createQualityRule",
  updateQualityRule: "updateQualityRule",
  deleteQualityRule: "deleteQualityRule",
  runDedupeScan: "runDedupeScan",
  mergeRecords: "mergeRecords",
  deleteSuggestion: "deleteSuggestion",
};

export type DedupeWriteResult =
  | { applied: true; pending: false; op: DedupeOp; id?: string; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: DedupeOp }
  | { applied: false; pending: false; error: string };

// ── validation helpers (fail-closed, BEFORE the gate) ────────────────────────
function assertName(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("name is required");
  const name = v.trim();
  if (name.length > MAX_RULE_NAME) throw new Error(`name must be ≤${MAX_RULE_NAME} characters`);
  return name;
}
function assertDescription(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new Error("description must be a string");
  const d = v.trim();
  if (d.length > MAX_RULE_DESCRIPTION) throw new Error(`description must be ≤${MAX_RULE_DESCRIPTION} characters`);
  return d;
}
function assertTable(dataDir: string, tenantId: string, v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("tableId is required");
  if (!getTable(dataDir, tenantId, v)) throw new Error("table not found"); // foreign/stranger → 400 (no IDOR)
  return v;
}
function assertFields(dataDir: string, tenantId: string, tableId: string, v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_MATCH_FIELDS_PER_RULE) {
    throw new Error(`fields must be an array of 1..${MAX_MATCH_FIELDS_PER_RULE} field keys`);
  }
  const table = getTable(dataDir, tenantId, tableId);
  const keys = new Set((table?.fields ?? []).map((f) => f.key));
  const fields: string[] = [];
  for (const f of v) {
    if (typeof f !== "string" || f.trim().length === 0 || f.length > MAX_MATCH_FIELDS_PER_RULE) {
      throw new Error("each field must be a table field key");
    }
    const key = f.trim();
    if (!keys.has(key)) throw new Error(`field "${key}" does not exist on table ${tableId}`); // no schema guessing
    if (!fields.includes(key)) fields.push(key);
  }
  return fields;
}
function assertMatchMode(v: unknown): MatchRule["matchMode"] {
  const mode = v as MatchRule["matchMode"];
  if (!MATCH_MODES.includes(mode)) throw new Error("matchMode must be exact|normalized");
  return mode;
}
function assertLlmAssist(v: unknown): void {
  // LLM-assisted matching is NOT enabled in this slice — locked off, honest note.
  if (v !== undefined && v !== null && v !== false) {
    throw new Error("llmAssist is reserved and locked to false — LLM-assisted matching is not enabled in this slice");
  }
}
function assertBool(v: unknown, field: string, fallback: boolean): boolean {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v !== "boolean") throw new Error(`${field} must be a boolean`);
  return v;
}
function assertQualityParams(v: unknown): { min?: number; max?: number } {
  const params: { min?: number; max?: number } = {};
  if (v === undefined || v === null) return params;
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("params must be an object");
  const p = v as Record<string, unknown>;
  if (p.min !== undefined && p.min !== null) {
    const n = Number(p.min);
    if (!Number.isFinite(n)) throw new Error("params.min must be a number");
    params.min = n;
  }
  if (p.max !== undefined && p.max !== null) {
    const n = Number(p.max);
    if (!Number.isFinite(n)) throw new Error("params.max must be a number");
    params.max = n;
  }
  if (params.min !== undefined && params.max !== undefined && params.min > params.max) {
    throw new Error("params.min must be ≤ params.max");
  }
  return params;
}

/** Validate a match-rule payload production-style (create + update merged). */
function validateMatchRule(dataDir: string, tenantId: string, body: Record<string, unknown>): {
  name: string;
  description: string;
  tableId: string;
  fields: string[];
  matchMode: MatchRule["matchMode"];
  llmAssist: false;
  active: boolean;
} {
  if (body.id !== undefined) throw new Error("client-supplied rule ids are not accepted"); // forged create-id → 400
  const name = assertName(body.name);
  const description = assertDescription(body.description);
  const tableId = assertTable(dataDir, tenantId, body.tableId);
  const fields = assertFields(dataDir, tenantId, tableId, body.fields);
  const matchMode = assertMatchMode(body.matchMode ?? "normalized");
  assertLlmAssist(body.llmAssist);
  const active = assertBool(body.active, "active", true);
  return { name, description, tableId, fields, matchMode, llmAssist: false, active };
}

/** Validate a quality-rule payload (rules typed per QUALITY_RULE_TYPES). */
function validateQualityRule(dataDir: string, tenantId: string, body: Record<string, unknown>): {
  name: string;
  description: string;
  tableId: string;
  field: string;
  ruleType: QualityRule["ruleType"];
  params: { min?: number; max?: number };
  active: boolean;
} {
  if (body.id !== undefined) throw new Error("client-supplied rule ids are not accepted");
  const name = assertName(body.name);
  const description = assertDescription(body.description);
  const tableId = assertTable(dataDir, tenantId, body.tableId);
  const table = getTable(dataDir, tenantId, tableId);
  const field = typeof body.field === "string" ? body.field.trim() : "";
  if (!field || field.length > MAX_MATCH_FIELDS_PER_RULE) throw new Error("field must be a table field key");
  if (!table || !table.fields.some((f) => f.key === field)) throw new Error(`field "${field}" does not exist on table ${tableId}`);
  const ruleType = body.ruleType as QualityRule["ruleType"];
  if (!QUALITY_RULE_TYPES.includes(ruleType)) throw new Error("ruleType must be required|email|phone|number-range|date-format");
  const params = assertQualityParams(body.params);
  if (ruleType !== "number-range" && (params.min !== undefined || params.max !== undefined)) {
    throw new Error(`params are only valid for ruleType number-range`);
  }
  if (ruleType === "number-range" && params.min === undefined && params.max === undefined) {
    throw new Error("number-range requires params.min or params.max");
  }
  const active = assertBool(body.active, "active", true);
  return { name, description, tableId, field, ruleType, params, active };
}

/** Validate a merge request: suggestion-driven OR explicit survivor/superseded.
 *  Returns the prepared (normalized) payload for the non-destructive merge. */
function validateMerge(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
): { tableId?: string; survivorRowId?: string; supersededRowIds?: string[]; suggestionId?: string } {
  const { suggestionId, survivorRowId, supersededRowIds } = body;
  if (suggestionId !== undefined && survivorRowId !== undefined) {
    throw new Error("provide either suggestionId or survivorRowId/supersededRowIds, not both");
  }
  if (suggestionId !== undefined) {
    if (typeof suggestionId !== "string") throw new Error("suggestionId must be a string");
    const sug = getSuggestion(dataDir, tenantId, suggestionId);
    if (!sug) throw new Error("suggestion not found"); // foreign/stranger → 400 (no IDOR)
    if (sug.status !== "open") throw new Error("suggestion is not open (already applied or dismissed)");
    if (!sug.tableId) throw new Error("suggestion has no table");
    const rows = sug.rowIds.map((rid) => getRow(dataDir, tenantId, rid)).filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length !== 2) throw new Error("suggestion must reference exactly 2 rows");
    const t = rows[0].tableId === rows[1].tableId ? rows[0].tableId : null;
    if (!t) throw new Error("suggestion rows must belong to the same table");
    if (sug.rowIds.some((rid) => rowIsResolved(dataDir, tenantId, rid))) {
      throw new Error("one of the suggestion rows is already part of a record identity");
    }
    // Normalize to the suggestion id ONLY — the resolved survivor/superseded
    // ids are recomputed deterministically at apply time (chooseSurvivor over
    // the same 2 rows). Storing both would break apply-time re-validation
    // (the mirror must revalidate its own normalized payload), and a client
    // sending both is rejected above.
    return { suggestionId: sug.id };
  }
  if (typeof survivorRowId !== "string" || survivorRowId.length === 0) throw new Error("survivorRowId is required");
  if (!Array.isArray(supersededRowIds) || supersededRowIds.length === 0 || supersededRowIds.length > MAX_MERGE_SUPERSEDED_ROWS) {
    throw new Error(`supersededRowIds must be an array of 1..${MAX_MERGE_SUPERSEDED_ROWS} row ids`);
  }
  for (const rid of supersededRowIds) {
    if (typeof rid !== "string" || rid.length === 0) throw new Error("each superseded row id must be a string");
  }
  const survivor = getRow(dataDir, tenantId, survivorRowId);
  if (!survivor) throw new Error("survivor row not found");
  if (rowIsResolved(dataDir, tenantId, survivorRowId)) throw new Error("survivor row is already part of a record identity");
  const tableId = survivor.tableId;
  const seen = new Set<string>([survivorRowId]);
  for (const rid of supersededRowIds) {
    if (seen.has(rid)) throw new Error("duplicate row id in supersededRowIds");
    seen.add(rid);
    const row = getRow(dataDir, tenantId, rid);
    if (!row) throw new Error(`superseded row ${rid} not found`);
    if (row.tableId !== tableId) throw new Error("all superseded rows must belong to the same table as the survivor row");
    if (rowIsResolved(dataDir, tenantId, rid)) throw new Error(`superseded row ${rid} is already part of a record identity`);
  }
  return { tableId, survivorRowId, supersededRowIds: [...supersededRowIds] };
}

export interface DedupeWriteRequest {
  payload: Record<string, unknown>;
  via?: string;
}

/**
 * Submit a gated dedupe/MDM write. Validation FIRST — bad writes 400 before
 * the queue. Returns applied / pending / error.
 */
export function submitDedupeWrite(
  dataDir: string,
  tenantId: string,
  op: DedupeOp,
  req: DedupeWriteRequest,
  actor: string,
): DedupeWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  const payload = req.payload ?? {};
  const action = ACTION_NAME[op];

  // 1. Fail-closed validation BEFORE the gate + cap pre-checks.
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, op, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }

  // 2. Gate (verb-first — mergeRecords rides the NEW `merge` WRITE verb).
  const gate: ApprovalGateOutcome = approvalGate(tenantId, action, NATIVE_DEDUPE_PROVIDER, { op, via: req.via ?? "portal" }, { dataDir, workflowId: NATIVE_DEDUPE_WORKFLOW_ID });
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  if (gate.allowed) {
    const out = applyNow(dataDir, tenantId, op, prepared, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error };
    if (gate.autonomy) recordAutonomyOutcome(tenantId, NATIVE_DEDUPE_WORKFLOW_ID, action, NATIVE_DEDUPE_PROVIDER, true, { dataDir, allowListId: gate.allowListId, target: out.id ?? "" });
    return { applied: true, pending: false, op, id: out.id, autonomy: !!gate.autonomy, actionId: gate.actionId };
  }

  // 3. Queue: cap the pending mirror, then persist the durable card.
  const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
  if (pending.length >= MAX_PENDING_DEDUPE_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_DEDUPE_WRITES}) — approve or reject before more` };
  }
  const dpw: PendingDedupeWrite = {
    id: generateDedupeEntityId("dpw"),
    tenantId,
    op,
    action,
    payload: prepared,
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, dpw);
  appendAudit(dataDir, { tenantId, actor, action: auditActionFor(op, "pending"), entityId: dpw.id, detail: `Queued ${action} for approval (${dpw.id})` });
  publishEvent(dataDir, tenantId, eventTypeFor(op, "pending"), { op, dpwId: dpw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Validate + normalize the payload into what applyNow persists. No secrets
 *  exist in this slice — payloads are plain normalized JSON. */
function prepareWrite(dataDir: string, tenantId: string, op: DedupeOp, payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object");
  switch (op) {
    case "createMatchRule": {
      if (listMatchRules(dataDir, tenantId).length >= MAX_MATCH_RULES_PER_TENANT) {
        throw new Error(`match-rule cap reached (${MAX_MATCH_RULES_PER_TENANT})`);
      }
      return validateMatchRule(dataDir, tenantId, payload) as unknown as Record<string, unknown>;
    }
    case "updateMatchRule": {
      if (typeof payload.ruleId !== "string" || !getMatchRule(dataDir, tenantId, payload.ruleId)) throw new Error("rule not found");
      const base = getMatchRule(dataDir, tenantId, payload.ruleId)!;
      const merged: Record<string, unknown> = {
        description: base.description,
        tableId: base.tableId,
        fields: base.fields,
        matchMode: base.matchMode,
        llmAssist: false,
        active: base.active,
        name: base.name,
        ...payload,
        id: undefined,
        ruleId: undefined,
      };
      const v = validateMatchRule(dataDir, tenantId, merged);
      return { ...v, ruleId: base.id } as unknown as Record<string, unknown>;
    }
    case "deleteMatchRule": {
      if (typeof payload.ruleId !== "string" || !getMatchRule(dataDir, tenantId, payload.ruleId)) throw new Error("rule not found");
      if (listSuggestions(dataDir, tenantId, "open").some((s) => s.ruleId === payload.ruleId)) {
        throw new Error("cannot delete a match rule that has open suggestions");
      }
      return { ruleId: payload.ruleId } as Record<string, unknown>;
    }
    case "createQualityRule": {
      if (listQualityRules(dataDir, tenantId).length >= MAX_QUALITY_RULES_PER_TENANT) {
        throw new Error(`quality-rule cap reached (${MAX_QUALITY_RULES_PER_TENANT})`);
      }
      return validateQualityRule(dataDir, tenantId, payload) as unknown as Record<string, unknown>;
    }
    case "updateQualityRule": {
      if (typeof payload.ruleId !== "string" || !getQualityRule(dataDir, tenantId, payload.ruleId)) throw new Error("rule not found");
      const base = getQualityRule(dataDir, tenantId, payload.ruleId)!;
      const merged: Record<string, unknown> = {
        description: base.description,
        tableId: base.tableId,
        field: base.field,
        ruleType: base.ruleType,
        params: base.params,
        active: base.active,
        name: base.name,
        ...payload,
        id: undefined,
        ruleId: undefined,
      };
      const v = validateQualityRule(dataDir, tenantId, merged);
      return { ...v, ruleId: base.id } as unknown as Record<string, unknown>;
    }
    case "deleteQualityRule": {
      if (typeof payload.ruleId !== "string" || !getQualityRule(dataDir, tenantId, payload.ruleId)) throw new Error("rule not found");
      return { ruleId: payload.ruleId } as Record<string, unknown>;
    }
    case "runDedupeScan": {
      if (countTodayScans(dataDir, tenantId) >= MAX_DAILY_SCANS) {
        throw new Error(`daily scan cap (${MAX_DAILY_SCANS}) reached`);
      }
      if (listRuns(dataDir, tenantId).length >= MAX_DEDUPE_RUNS_PER_TENANT) {
        throw new Error(`scan-ledger cap (${MAX_DEDUPE_RUNS_PER_TENANT}) reached`);
      }
      if (listMatchRules(dataDir, tenantId).filter((r) => r.active).length === 0 && listQualityRules(dataDir, tenantId).filter((r) => r.active).length === 0) {
        throw new Error("at least one active match or quality rule is required before scanning");
      }
      const matchRuleIds = resolveRuleIds(payload.matchRuleIds, "matchRuleIds", listMatchRules(dataDir, tenantId).filter((r) => r.active).map((r) => r.id), (id) => listMatchRules(dataDir, tenantId).some((r) => r.id === id));
      const qualityRuleIds = resolveRuleIds(payload.qualityRuleIds, "qualityRuleIds", listQualityRules(dataDir, tenantId).filter((r) => r.active).map((r) => r.id), (id) => listQualityRules(dataDir, tenantId).some((r) => r.id === id));
      if (matchRuleIds.length === 0 && qualityRuleIds.length === 0) {
        throw new Error("at least one active match or quality rule is required before scanning");
      }
      return { matchRuleIds, qualityRuleIds } as Record<string, unknown>;
    }
    case "mergeRecords": {
      if (listIdentities(dataDir, tenantId).length >= MAX_RECORD_IDENTITIES_PER_TENANT) {
        throw new Error(`record-identity cap reached (${MAX_RECORD_IDENTITIES_PER_TENANT})`);
      }
      return validateMerge(dataDir, tenantId, payload) as unknown as Record<string, unknown>;
    }
    case "deleteSuggestion": {
      if (typeof payload.suggestionId !== "string" || !getSuggestion(dataDir, tenantId, payload.suggestionId)) throw new Error("suggestion not found");
      if (getSuggestion(dataDir, tenantId, payload.suggestionId)!.status !== "open") throw new Error("suggestion is not open");
      return { suggestionId: payload.suggestionId } as Record<string, unknown>;
    }
    default:
      throw new Error("unknown dedupe op");
  }
}

function resolveRuleIds(
  v: unknown,
  field: string,
  activeDefaults: string[],
  owner: (id: string) => boolean,
): string[] {
  const ids: string[] = [];
  // Absent OR an empty array resolves to all active rules — this keeps the
  // gated mirror idempotent: submit-time normalization must revalidate at
  // apply-time even when the tenant has no active rules of one kind yet.
  if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) {
    ids.push(...activeDefaults);
  } else {
    if (!Array.isArray(v)) throw new Error(`${field} must be an array of rule ids`);
    for (const id of v) {
      if (typeof id !== "string" || id.length === 0) throw new Error(`each ${field} entry must be a rule id`);
      if (!owner(id)) throw new Error("rule not found"); // foreign/stranger → 400 (no IDOR)
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/** Execute the write under authority (autonomy auto-apply or approve path). */
function applyNow(
  dataDir: string,
  tenantId: string,
  op: DedupeOp,
  p: Record<string, unknown>,
  actor: string,
  autonomy: boolean,
): { ok: true; id?: string } | { ok: false; error: string } {
  const now = new Date().toISOString();
  const auditActor = autonomy ? "system/autonomy" : actor;
  const suffix = autonomy ? " (autonomy)" : "";
  try {
    if (op === "createMatchRule") {
      const r: MatchRule = {
        id: generateDedupeEntityId("mru"),
        tenantId,
        name: p.name as string,
        description: p.description as string,
        tableId: p.tableId as string,
        fields: p.fields as string[],
        matchMode: p.matchMode as MatchRule["matchMode"],
        llmAssist: false,
        active: p.active as boolean,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
      };
      saveMatchRule(dataDir, r);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.dedupe.rule.created", entityId: r.id, detail: `Created match rule "${r.name}" (${r.fields.length} fields, ${r.matchMode})${suffix}. LLM-assisted matching: OFF.` });
      publishEvent(dataDir, tenantId, "native.dedupe.rule.created", { ruleId: r.id, name: r.name });
      return { ok: true, id: r.id };
    }
    if (op === "updateMatchRule") {
      const base = getMatchRule(dataDir, tenantId, p.ruleId as string);
      if (!base) return { ok: false, error: "rule not found" };
      const next: MatchRule = { ...base, name: p.name as string, description: p.description as string, tableId: p.tableId as string, fields: p.fields as string[], matchMode: p.matchMode as MatchRule["matchMode"], active: p.active as boolean, updatedAt: now, updatedBy: actor };
      saveMatchRule(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.dedupe.rule.updated", entityId: base.id, detail: `Updated match rule "${next.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.dedupe.rule.updated", { ruleId: base.id, name: next.name });
      return { ok: true, id: base.id };
    }
    if (op === "deleteMatchRule") {
      deleteMatchRuleRecord(dataDir, tenantId, p.ruleId as string);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.dedupe.rule.deleted", entityId: p.ruleId as string, detail: `Deleted match rule${suffix}` });
      publishEvent(dataDir, tenantId, "native.dedupe.rule.deleted", { ruleId: p.ruleId });
      return { ok: true, id: p.ruleId as string };
    }
    if (op === "createQualityRule") {
      const r: QualityRule = {
        id: generateDedupeEntityId("qru"),
        tenantId,
        name: p.name as string,
        description: p.description as string,
        tableId: p.tableId as string,
        field: p.field as string,
        ruleType: p.ruleType as QualityRule["ruleType"],
        params: p.params as { min?: number; max?: number },
        active: p.active as boolean,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
      };
      saveQualityRule(dataDir, r);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.dedupe.quality.created", entityId: r.id, detail: `Created quality rule "${r.name}" (${r.ruleType} on ${r.field})${suffix}` });
      publishEvent(dataDir, tenantId, "native.dedupe.quality.created", { ruleId: r.id, name: r.name });
      return { ok: true, id: r.id };
    }
    if (op === "updateQualityRule") {
      const base = getQualityRule(dataDir, tenantId, p.ruleId as string);
      if (!base) return { ok: false, error: "rule not found" };
      const next: QualityRule = { ...base, name: p.name as string, description: p.description as string, tableId: p.tableId as string, field: p.field as string, ruleType: p.ruleType as QualityRule["ruleType"], params: p.params as { min?: number; max?: number }, active: p.active as boolean, updatedAt: now, updatedBy: actor };
      saveQualityRule(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.dedupe.quality.updated", entityId: base.id, detail: `Updated quality rule "${next.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.dedupe.quality.updated", { ruleId: base.id, name: next.name });
      return { ok: true, id: base.id };
    }
    if (op === "deleteQualityRule") {
      deleteQualityRuleRecord(dataDir, tenantId, p.ruleId as string);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.dedupe.quality.deleted", entityId: p.ruleId as string, detail: `Deleted quality rule${suffix}` });
      publishEvent(dataDir, tenantId, "native.dedupe.quality.deleted", { ruleId: p.ruleId });
      return { ok: true, id: p.ruleId as string };
    }
    if (op === "runDedupeScan") {
      const matchRuleIds = p.matchRuleIds as string[];
      const qualityRuleIds = p.qualityRuleIds as string[];
      const out = executeScan(dataDir, tenantId, matchRuleIds, qualityRuleIds, actor, now);
      if (!out.ok) return { ok: false, error: out.error };
      const run = out.run!;
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.dedupe.scan.recorded", entityId: run.id, detail: `Scan recorded: ${run.rowsScanned} rows scanned, ${run.suggestionsProduced} suggestions, ${run.qualityIssuesFound} quality issues${run.bounded ? " (pairwise budget reached — bounded)" : ""}${suffix}` });
      publishEvent(dataDir, tenantId, "native.dedupe.scan.recorded", { runId: run.id, rowsScanned: run.rowsScanned, suggestions: run.suggestionsProduced, qualityIssues: run.qualityIssuesFound, bounded: run.bounded });
      return { ok: true, id: run.id };
    }
    if (op === "mergeRecords") {
      const merged = applyMerge(dataDir, tenantId, p, actor, now);
      if (!merged.ok) return { ok: false, error: merged.error };
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.dedupe.record.merged", entityId: merged.id, detail: `Record identity ${merged.id}: survivor ${merged.survivorRowId}, superseded ${merged.supersededRowIds.length} row(s)${suffix}. Underlying 1.4 rows NOT deleted or modified — pointer only (non-destructive). BEFORE/AFTER: ${merged.snapshot}` });
      publishEvent(dataDir, tenantId, "native.dedupe.record.merged", { identityId: merged.id, survivorRowId: merged.survivorRowId, superseded: merged.supersededRowIds.length });
      return { ok: true, id: merged.id };
    }
    if (op === "deleteSuggestion") {
      const base = getSuggestion(dataDir, tenantId, p.suggestionId as string);
      if (!base) return { ok: false, error: "suggestion not found" };
      const next: MergeSuggestion = { ...base, status: "dismissed" };
      saveSuggestion(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.dedupe.suggestion.dismissed", entityId: base.id, detail: `Dismissed merge suggestion (${base.rowIds.join(", ")})${suffix}` });
      publishEvent(dataDir, tenantId, "native.dedupe.suggestion.dismissed", { suggestionId: base.id });
      return { ok: true, id: base.id };
    }
    return { ok: false, error: "unknown dedupe op" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** The deterministic scan. Read-only over 1.4 rows; produces suggestions and a
 *  durable run with HONEST outcomes. Never modifies 1.4 data. */
function executeScan(
  dataDir: string,
  tenantId: string,
  matchRuleIds: string[],
  qualityRuleIds: string[],
  actor: string,
  now: string,
): { ok: true; run: DedupeRun } | { ok: false; error: string } {
  try {
    const matchRules = listMatchRules(dataDir, tenantId).filter((r) => matchRuleIds.includes(r.id) && r.active);
    const qualityRules = listQualityRules(dataDir, tenantId).filter((r) => qualityRuleIds.includes(r.id) && r.active);
    let rowsScanned = 0;
    let pairComparisons = 0;
    let suggestionsProduced = 0;
    let qualityIssuesFound = 0;
    let bounded = false;

    // 1. Deterministic duplicate matching (identical-pair guard + budget).
    //    The run id is assigned FIRST so every suggestion it produces links
    //    to it directly (no orphan "pending" runId on a failed scan).
    const runId = generateDedupeEntityId("drn");
    for (const rule of matchRules) {
      const table = getTable(dataDir, tenantId, rule.tableId);
      if (!table) continue;
      const rows = listRows(dataDir, tenantId, rule.tableId).filter((r) => !rowIsResolved(dataDir, tenantId, r.id));
      rowsScanned += rows.length;
      const perRule = matchPairsTable(rule, rows, Math.max(1, MAX_PAIR_COMPARISONS - pairComparisons));
      pairComparisons += perRule.comparisons;
      if (perRule.bounded) bounded = true;
      if (countOpenSuggestions(dataDir, tenantId) >= MAX_OPEN_SUGGESTIONS) { bounded = true; break; }
      for (const pair of perRule.pairs) {
        if (suggestionsProduced >= MAX_SUGGESTIONS_PER_SCAN) { bounded = true; break; }
        if (countOpenSuggestions(dataDir, tenantId) >= MAX_OPEN_SUGGESTIONS) { bounded = true; break; }
        if (suggestionExists(dataDir, tenantId, rule.id, [pair.rowA.id, pair.rowB.id])) continue; // idempotent re-scan
        const s: MergeSuggestion = {
          id: generateDedupeEntityId("sug"),
          tenantId,
          tableId: rule.tableId,
          ruleId: rule.id,
          runId,
          rowIds: [pair.rowA.id, pair.rowB.id],
          matchedFields: pair.matchedFields,
          confidence: 1,
          status: "open",
          createdAt: now,
          createdBy: actor,
        };
        saveSuggestion(dataDir, s);
        suggestionsProduced++;
      }
    }

    // 2. Data-quality evaluation (deterministic validators).
    for (const rule of qualityRules) {
      const table = getTable(dataDir, tenantId, rule.tableId);
      const rows = table ? listRows(dataDir, tenantId, rule.tableId) : [];
      const totals = evaluateQuality([{ id: rule.id, field: rule.field, ruleType: rule.ruleType, params: rule.params }], table, rows, MAX_QUALITY_ISSUES_PER_RUN - qualityIssuesFound);
      qualityIssuesFound += totals[0]?.issues ?? 0;
    }

    // 3. Durable run record (suggestions created above already link to runId).
    const run: DedupeRun = {
      id: runId,
      tenantId,
      matchRuleIds,
      qualityRuleIds,
      rowsScanned,
      pairComparisons,
      suggestionsProduced,
      qualityIssuesFound,
      bounded,
      status: "applied",
      outcome: "recorded",
      note: "Deterministic dedupe/quality scan over the tenant's own records. Suggestions are candidates awaiting approval — no record was deleted, merged or modified by this slice. LLM-assisted matching is not enabled.",
      createdAt: now,
      createdBy: actor,
      decidedAt: now,
      decidedBy: actor,
    };
    saveRun(dataDir, run);
    return { ok: true, run };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** NON-DESTRUCTIVE merge → durable record-identity pointer + before/after
 *  snapshot. The 1.4 rows are NEVER deleted or modified by this function. */
function applyMerge(
  dataDir: string,
  tenantId: string,
  p: Record<string, unknown>,
  actor: string,
  now: string,
): { ok: true; id: string; survivorRowId: string; supersededRowIds: string[]; snapshot: string } | { ok: false; error: string } {
  try {
    const suggestionId = p.suggestionId as string | undefined;
    let tableId = p.tableId as string;
    let survivorRowId = p.survivorRowId as string;
    let supersededRowIds = Array.isArray(p.supersededRowIds) ? (p.supersededRowIds as string[]) : [];
    if (suggestionId) {
      // Suggestion-driven merge — recompute identically to submit-time
      // validation (deterministic chooseSurvivor over the same 2 rows).
      const sug = getSuggestion(dataDir, tenantId, suggestionId);
      if (!sug || sug.status !== "open") return { ok: false, error: "suggestion not found or not open" };
      const rows = sug.rowIds.map((rid) => getRow(dataDir, tenantId, rid)).filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length !== 2) return { ok: false, error: "suggestion must reference exactly 2 rows" };
      if (rows[0].tableId !== rows[1].tableId) return { ok: false, error: "suggestion rows must belong to the same table" };
      const survivor = chooseSurvivor(rows);
      tableId = sug.tableId;
      survivorRowId = survivor.id;
      supersededRowIds = rows.filter((r) => r.id !== survivor.id).map((r) => r.id);
    }
    const survivor = getRow(dataDir, tenantId, survivorRowId);
    if (!survivor) return { ok: false, error: "survivor row not found" };
    const superseded = supersededRowIds.map((rid) => getRow(dataDir, tenantId, rid)).filter((r): r is NonNullable<typeof r> => r !== null);
    if (superseded.length !== supersededRowIds.length) return { ok: false, error: "one or more superseded rows not found" };
    const before = { survivor: survivor.data, superseded: superseded.map((r) => ({ id: r.id, data: r.data })) };
    const id: RecordIdentity = {
      id: generateDedupeEntityId("gem"),
      tenantId,
      tableId,
      survivorRowId,
      supersededRowIds: [...supersededRowIds],
      suggestionId,
      mergedAt: now,
      mergedBy: actor,
      note: "Record-identity pointer only — the underlying 1.4 rows were NOT deleted or modified. The survivor row is canonical for reads; superseded rows remain in the table.",
    };
    saveIdentity(dataDir, id);
    if (suggestionId) {
      const sug = getSuggestion(dataDir, tenantId, suggestionId);
      if (sug && sug.status === "open") {
        saveSuggestion(dataDir, { ...sug, status: "applied", appliedAt: now, appliedBy: actor });
      }
    }
    const after = { survivor: survivor.data, superseded: superseded.map((r) => ({ id: r.id, data: r.data })) };
    const snapshot = JSON.stringify({ before, after }).slice(0, MAX_AUDIT_SNAPSHOT_CHARS);
    return { ok: true, id: id.id, survivorRowId, supersededRowIds, snapshot };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Approve-path executor: applies the approved write once (idempotent). */
export function executePendingDedupeWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; id?: string; dpwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; dpwId?: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const dpw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!dpw) return { ok: false, reason: "no pending write for this approval action" };
  if (dpw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (dpw.status === "applied") {
    return { ok: true, alreadyApplied: true, id: (dpw.appliedResult?.id as string) ?? undefined, dpwId: dpw.id };
  }
  // Re-validate at apply time (authority does not bypass the contract).
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, dpw.op, dpw.payload as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, dpw.id, "rejected", { error: msg });
    return { ok: false, reason: msg, dpwId: dpw.id };
  }
  const out = applyNow(dataDir, tenantId, dpw.op, prepared, actor, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, dpw.id, "rejected", { error: out.error });
    return { ok: false, reason: out.error, dpwId: dpw.id };
  }
  markPendingWrite(dataDir, tenantId, dpw.id, "applied", { appliedResult: { id: out.id } });
  return { ok: true, id: out.id, dpwId: dpw.id };
}

/** REJECT path — the card is discarded; nothing is written. */
export function rejectDedupeWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; already?: boolean } | { ok: false; reason: string } {
  const dpw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!dpw) return { ok: false, reason: "no pending write for this approval action" };
  if (dpw.status !== "pending") return { ok: true, already: true };
  markPendingWrite(dataDir, tenantId, dpw.id, "rejected", { error: "rejected by owner" });
  markRejected(tenantId, dpw.approvalActionId, actor, dataDir);
  appendAudit(dataDir, { tenantId, actor, action: auditActionFor(dpw.op, "rejected"), entityId: dpw.id, detail: `Rejected ${dpw.action} (${dpw.id})` });
  publishEvent(dataDir, tenantId, eventTypeFor(dpw.op, "rejected"), { op: dpw.op, dpwId: dpw.id });
  return { ok: true };
}

/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const dpw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!dpw || dpw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingDedupeWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(
      tenantId,
      approvalActionId,
      owner,
      { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", id: res.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) },
      dataDir,
    );
  } else {
    markPendingWrite(dataDir, tenantId, dpw.id, "rejected", { error: "rejected by owner" });
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

/** Audit action name for an op+phase (native.dedupe.*). */
function auditActionFor(op: DedupeOp, phase: "pending" | "applied" | "rejected"): string {
  void op;
  return phase === "rejected" ? "native.dedupe.rejected" : "native.dedupe.pending";
}
function eventTypeFor(op: DedupeOp, phase: "pending" | "applied" | "rejected"): string {
  void op;
  if (phase === "pending") return "native.dedupe.pending";
  if (phase === "rejected") return "native.dedupe.rejected";
  return "native.dedupe.applied";
}

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, NATIVE_DEDUPE_PROVIDER);
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}

// ── Safe GET projections ─────────────────────────────────────────────────────
export function publicMatchRule(r: MatchRule): MatchRule {
  return { ...r };
}
export function publicQualityRule(r: QualityRule): QualityRule {
  return { ...r };
}
export function publicRun(r: DedupeRun): DedupeRun {
  return { ...r };
}
export function publicSuggestion(s: MergeSuggestion): MergeSuggestion {
  return { ...s };
}
export function publicIdentity(i: RecordIdentity): RecordIdentity {
  return { ...i };
}
export function getActionName(op: DedupeOp): string {
  return ACTION_NAME[op];
}
export function canonicalKey(ruleId: string, rowIds: string[]): string {
  return canonicalSuggestionKey(ruleId, rowIds);
}