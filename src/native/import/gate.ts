/**
 * native/import/gate.ts — Phase 5.1 (6.1) native IMPORT / MIGRATION slice.
 * Approval-Queue verb-first gate (client-optional import lanes, owner 10-20).
 *
 * Security model (mirrors 3.5/4.1–4.4 exactly):
 *   - action names are verb-first (createImport/updateImport/deleteImport/
 *     pullImportData/mapImportFields/commitImport). `pull`, `map`, `commit`
 *     are ADDED to WRITE_VERB by this slice — without them these actions
 *     classify as READS and BYPASS the Approval Queue (fail-open guard
 *     class). The classification test is extended with the whole surface.
 *   - validation + caps BEFORE the gate: forged create-ids, unknown target
 *     tables, cap violations and malformed payloads NEVER queue (fail-closed),
 *   - COMMIT PRECEDENT-LOCKED: this slice NEVER writes to tables directly.
 *     commitImport builds the mapped rows from its own tenant-keyed staging,
 *     validates them against the target table schema, then submits the
 *     TABLES slice's existing gated `importTableRows` write to the Approval
 *     Queue (submitTableWrite). ONE approval card (the tables card); the
 *     import pending mirror links to the SAME card — no double-queue, no
 *     cross-store writes. Apply/reject delegate to the tables executor
 *     (executePendingTableWrite / noteOwnerDecision),
 *   - HONEST RUN LEDGER ONLY: pulled/mapped/skipped/committed/failed are
 *     recorded exactly; when no import source is wired for a provider in
 *     this build, pull reports that honestly (0 pulled — never fabricated),
 *   - deterministic mapping ONLY (NO LLM in the pipeline).
 */
import { randomBytes } from "node:crypto";
import { approvalGate, markApproved, markRejected, type ApprovalGateOutcome } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { getTable } from "../tables/store";
import { validateRowData } from "../tables/validate";
import { submitTableWrite, executePendingTableWrite, noteOwnerDecision as tablesNoteOwnerDecision } from "../tables/gate";
import {
  NATIVE_IMPORT_PROVIDER,
  NATIVE_IMPORT_WORKFLOW_ID,
  MAX_IMPORT_RUNS_PER_TENANT,
  MAX_STAGING_ROWS,
  MAX_IMPORT_BYTES,
  MAX_MAPPING_FIELDS,
  MAX_PENDING_IMPORT_WRITES,
  MAX_PULL_ATTEMPTS_PER_DAY,
  MAX_SOURCE_LABEL,
  MAX_SOURCE_FIELD_CHARS,
  MAX_TARGET_FIELD_CHARS,
  MAX_PROVIDER_ID,
  IMPORT_COERCE_KINDS,
  type ImportCoerceKind,
  type ImportFieldMapping,
  type ImportJob,
  type ImportOp,
  type ImportRun,
  type ImportStaging,
  type PendingImportWrite,
} from "./types";
import {
  appendAudit,
  appendRun,
  deleteJobRecord,
  generateImportEntityId,
  getJob,
  getPendingWriteByAction,
  getStaging,
  listJobs,
  listPendingWrites,
  listRuns,
  saveJob,
  savePendingWrite,
  saveStaging,
  markPendingWrite,
} from "./store";

export const ACTION_NAME: Record<ImportOp, string> = {
  createImport: "createImport",
  updateImport: "updateImport",
  deleteImport: "deleteImport",
  pullImportData: "pullImportData",
  mapImportFields: "mapImportFields",
  commitImport: "commitImport",
};
/** Import lanes known to the platform (verified read adapters from the
 *  client-import program). Sources are wired lane-by-lane in follow-up PRs
 *  (6.2 Xero first); until a lane's source is registered, pull honestly
 *  reports 0 pulled. Never a fabricated count. */
export const KNOWN_IMPORT_PROVIDERS = [
  "xero",
  "hubspot",
  "quickbooks",
  "google-calendar",
  "google-drive",
  "dropbox",
  "box",
  "sharepoint",
  "microsoft",
  "onedrive",
  "google-workspace",
  "docusign",
  "sendgrid",
  "slack",
  "priority",
  "sftp",
] as const;
export type ImportProviderId = (typeof KNOWN_IMPORT_PROVIDERS)[number];
export type ImportWriteResult =
  | { applied: true; pending: false; op: ImportOp; id?: string; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: ImportOp }
  | { applied: false; pending: false; error: string; op: ImportOp };

/**
 * Import SOURCE registry — a lane's read-only fetch. Follow-up slice 6.2
 * registers the Xero reader here; tests register deterministic fakes. Core
 * ships the registry EMPTY: pull on a provider with no reader fails honestly
 * (0 pulled) with a clear note. Reader receives the tenant's own context;
 * rows are bounded by the caller (caps).
 */
export type ImportSourceReader = (ctx: {
  dataDir: string;
  tenantId: string;
  importId: string;
  provider: string;
}) => Promise<{ rows: Record<string, unknown>[]; note?: string; httpStatus?: number }>;
const sourceReaders = new Map<string, ImportSourceReader>();
export function registerImportSource(providerId: string, reader: ImportSourceReader): void {
  sourceReaders.set(providerId.toLowerCase(), reader);
}
export function hasImportSource(providerId: string): boolean {
  return sourceReaders.has(providerId.toLowerCase());
}

// ── Validation helpers (fail-closed BEFORE the gate) ───────────────────────
function assertProvider(body: Record<string, unknown>): string {
  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  if (!provider) throw new Error("provider is required");
  if (provider.length > MAX_PROVIDER_ID) throw new Error(`provider must be ≤${MAX_PROVIDER_ID} chars`);
  if (!KNOWN_IMPORT_PROVIDERS.includes(provider as ImportProviderId)) {
    throw new Error(`unknown import provider "${provider}"`);
  }
  return provider;
}
function assertSourceLabel(body: Record<string, unknown>): string {
  const label = typeof body.sourceLabel === "string" ? body.sourceLabel.trim() : "";
  if (!label) throw new Error("sourceLabel is required");
  if (label.length > MAX_SOURCE_LABEL) throw new Error(`sourceLabel must be ≤${MAX_SOURCE_LABEL} chars`);
  return label;
}
function assertTarget(dataDir: string, tenantId: string, body: Record<string, unknown>): { kind: "table"; tableId: string } {
  const target = body.target as Record<string, unknown> | undefined;
  if (!target || typeof target !== "object" || Array.isArray(target)) throw new Error("target is required");
  if (target.kind !== "table") throw new Error('target.kind must be "table" (vault file lanes arrive in follow-up PRs)');
  const tableId = typeof target.tableId === "string" ? target.tableId.trim() : "";
  if (!/^tbl_[A-Za-z0-9]+$/.test(tableId)) throw new Error("target.tableId must be a server-assigned table id");
  // In-tenant target table only — a stranger's table id → 400 (no IDOR).
  const table = getTable(dataDir, tenantId, tableId);
  if (!table) throw new Error("target table not found");
  return { kind: "table", tableId };
}
function assertMapping(dataDir: string, tenantId: string, body: Record<string, unknown>): ImportFieldMapping[] {
  const raw = body.mapping;
  if (!Array.isArray(raw)) throw new Error("mapping must be an array");
  if (raw.length === 0) throw new Error("mapping must not be empty");
  if (raw.length > MAX_MAPPING_FIELDS) throw new Error(`mapping must be ≤${MAX_MAPPING_FIELDS} fields`);
  const targetTable = getTable(dataDir, tenantId, typeof body.targetTableId === "string" ? body.targetTableId : "");
  const tableId = typeof body.targetTableId === "string" ? body.targetTableId : "";
  if (!/^tbl_[A-Za-z0-9]+$/.test(tableId) || !targetTable) throw new Error("targetTableId must be a server-assigned in-tenant table id");
  const fieldKeys = new Set(targetTable.fields.map((f) => f.key));
  const seen = new Set<string>();
  const out: ImportFieldMapping[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("each mapping entry must be an object");
    const sourceField = typeof item.sourceField === "string" ? item.sourceField.trim() : "";
    const targetField = typeof item.targetField === "string" ? item.targetField.trim() : "";
    if (!sourceField || sourceField.length > MAX_SOURCE_FIELD_CHARS) throw new Error(`sourceField must be ≤${MAX_SOURCE_FIELD_CHARS} chars`);
    if (!targetField || targetField.length > MAX_TARGET_FIELD_CHARS) throw new Error(`targetField must be ≤${MAX_TARGET_FIELD_CHARS} chars`);
    if (!fieldKeys.has(targetField)) throw new Error(`targetField "${targetField}" is not a field of the target table`);
    if (seen.has(targetField)) throw new Error(`duplicate targetField "${targetField}"`);
    seen.add(targetField);
    let coerce: ImportCoerceKind | undefined;
    if (item.coerce !== undefined && item.coerce !== null) {
      if (typeof item.coerce !== "string" || !IMPORT_COERCE_KINDS.includes(item.coerce as ImportCoerceKind)) {
        throw new Error(`coerce must be one of ${IMPORT_COERCE_KINDS.join("/")}`);
      }
      coerce = item.coerce as ImportCoerceKind;
    }
    out.push({ sourceField, targetField, coerce });
  }
  return out;
}
function assertImportId(body: Record<string, unknown>): string {
  const id = typeof body.importId === "string" ? body.importId : "";
  if (!/^imp_[A-Za-z0-9]+$/.test(id)) throw new Error("importId must be a server-assigned import id");
  return id;
}
/** Deterministic value coercion (NO LLM — pure mapping). */
function coerceValue(value: unknown, coerce?: ImportCoerceKind): unknown {
  if (coerce === "string") return value == null ? "" : String(value);
  if (coerce === "number") {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    throw new Error("value is not a number");
  }
  if (coerce === "int") {
    const n = Number(value);
    if (typeof value === "string" && value.trim() !== "") {
      if (!Number.isFinite(n)) throw new Error("value is not an integer");
      return Math.trunc(n);
    }
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    throw new Error("value is not an integer");
  }
  if (coerce === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    throw new Error("value is not a boolean");
  }
  if (coerce === "trim") return typeof value === "string" ? value.trim() : value;
  return value;
}
/** Apply the job's mapping to one staged row → table-shaped row. Throws on
 *  a source-field flat-missing ONLY if referenced; missing values stay null
 *  unless coercion fails (then the row is SKIPPED, never dropped silently). */
function mapRow(mapping: ImportFieldMapping[], row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of mapping) {
    const raw = row[m.sourceField];
    try {
      out[m.targetField] = coerceValue(raw, m.coerce);
    } catch (e) {
      throw new Error(`row field "${m.targetField}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}
function jobFromCreate(dataDir: string, tenantId: string, body: Record<string, unknown>, actor: string): ImportJob {
  const now = new Date().toISOString();
  return {
    id: generateImportEntityId("imp"),
    tenantId,
    provider: assertProvider(body),
    sourceLabel: assertSourceLabel(body),
    target: assertTarget(dataDir, tenantId, body),
    mapping: [],
    status: "draft",
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor,
  };
}
function prepareWrite(dataDir: string, tenantId: string, op: ImportOp, payload: Record<string, unknown>, actor: string): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object");
  switch (op) {
    case "createImport": {
      if (listJobs(dataDir, tenantId).length >= MAX_IMPORT_RUNS_PER_TENANT) {
        throw new Error(`Import cap reached (${MAX_IMPORT_RUNS_PER_TENANT} per tenant)`);
      }
      // Validation-only: the id is server-generated at APPLY time so the
      // staged pending payload is idempotent (KB-identical). A client-supplied
      // create id is forged and fails closed here.
      if (payload.id !== undefined) throw new Error("client-supplied import ids are not accepted");
      const job = jobFromCreate(dataDir, tenantId, payload, actor);
      return { _create: true, provider: job.provider, sourceLabel: job.sourceLabel, target: job.target, _by: actor } as Record<string, unknown>;
    }
    case "updateImport": {
      const importId = assertImportId(payload);
      const existing = getJob(dataDir, tenantId, importId);
      if (!existing) throw new Error("Import not found");
      if (existing.status === "committed") throw new Error("committed imports cannot be updated");
      const target = assertTarget(dataDir, tenantId, payload);
      const sourceLabel = assertSourceLabel(payload);
      return { importId, sourceLabel, target, _props: { provider: existing.provider, createdBy: existing.createdBy, createdAt: existing.createdAt } } as unknown as Record<string, unknown>;
    }
    case "deleteImport": {
      const importId = assertImportId(payload);
      if (!getJob(dataDir, tenantId, importId)) throw new Error("Import not found");
      return { importId } as Record<string, unknown>;
    }
    case "pullImportData": {
      const importId = assertImportId(payload);
      const job = getJob(dataDir, tenantId, importId);
      if (!job) throw new Error("Import not found");
      if (job.status === "committed") throw new Error("committed imports cannot be pulled again");
      if (job.status === "failed") throw new Error("failed imports must be re-created before pulling");
      const existing = getStaging(dataDir, tenantId, importId);
      if (existing && existing.rows.length > 0) throw new Error("staged rows already exist; delete and re-create to pull again");
      // Daily pull quota — count today's pull runs for this tenant (honest).
      const today = new Date().toISOString().slice(0, 10);
      const pullsToday = listRuns(dataDir, tenantId).filter((r) => r.op === "pullImportData" && r.at.startsWith(today)).length;
      if (pullsToday >= MAX_PULL_ATTEMPTS_PER_DAY) {
        throw new Error(`Pull quota reached (${MAX_PULL_ATTEMPTS_PER_DAY} per day)`);
      }
      return { importId } as Record<string, unknown>;
    }
    case "mapImportFields": {
      const importId = assertImportId(payload);
      const job = getJob(dataDir, tenantId, importId);
      if (!job) throw new Error("Import not found");
      if (job.status === "committed") throw new Error("committed imports cannot be re-mapped");
      if (job.status === "failed") throw new Error("failed imports must be re-created before mapping");
      const target = assertTarget(dataDir, tenantId, { target: payload.target ?? job.target });
      const mapping = assertMapping(dataDir, tenantId, { mapping: payload.mapping, targetTableId: target.tableId });
      return { importId, mapping } as Record<string, unknown>;
    }
    case "commitImport": {
      const importId = assertImportId(payload);
      const job = getJob(dataDir, tenantId, importId);
      if (!job) throw new Error("Import not found");
      if (job.status === "committed") throw new Error("Import already committed");
      if (job.status !== "staged") throw new Error("nothing staged — pull before commit");
      const staging = getStaging(dataDir, tenantId, importId);
      if (!staging || staging.rows.length === 0) throw new Error("nothing staged — pull before commit");
      if (job.mapping.length === 0) throw new Error("no field mapping — map before commit");
      const table = getTable(dataDir, tenantId, job.target.tableId);
      if (!table) throw new Error("target table no longer exists");
      if (staging.rows.length > MAX_STAGING_ROWS) throw new Error(`staging exceeds ${MAX_STAGING_ROWS} rows`);
      if (staging.byteLength > MAX_IMPORT_BYTES) throw new Error("staging exceeds the 512 KiB payload cap");
      // Map + validate EVERY row BEFORE the gate — invalid rows never queue.
      const importRows: Record<string, unknown>[] = [];
      for (const row of staging.rows) {
        const mapped = mapRow(job.mapping, row);
        const check = validateRowData(table, mapped);
        if (!check.ok) throw new Error(`row invalid for target table: ${check.errors.join("; ")}`);
        importRows.push(check.data);
      }
      return { importId, _tableId: job.target.tableId, _importRows: importRows } as unknown as Record<string, unknown>;
    }
    default:
      throw new Error("unsupported import op");
  }
}
/** Apply a validated import write to the tenant store + append audit. */
async function applyNow(
  dataDir: string,
  tenantId: string,
  op: ImportOp,
  p: Record<string, unknown>,
  actor: string,
  autonomy: boolean,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const auditActor = `${actor}${autonomy ? " (autonomy)" : ""}`;
  const suffix = autonomy ? " (autonomy)" : "";
  const now = new Date().toISOString();
  try {
    if (op === "createImport") {
      const now2 = new Date().toISOString();
      const job: ImportJob = {
        id: generateImportEntityId("imp"),
        tenantId,
        provider: p.provider as string,
        sourceLabel: p.sourceLabel as string,
        target: p.target as { kind: "table"; tableId: string },
        mapping: [],
        status: "draft",
        createdAt: now2,
        createdBy: actor,
        updatedAt: now2,
        updatedBy: actor,
      };
      saveJob(dataDir, job);
      appendAudit(dataDir, { tenantId, actor: actor, action: "native.import.created", entityId: job.id, detail: `Created import "${job.sourceLabel}" from ${job.provider}${suffix}` });
      appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId: job.id, op: "createImport", at: now, by: auditActor, pulled: 0, mapped: 0, skipped: 0, committed: 0, failed: 0, note: "Import job created" });
      publishEvent(dataDir, tenantId, "native.import.created", { importId: job.id, provider: job.provider });
      return { ok: true, id: job.id };
    }
    if (op === "updateImport") {
      const job = getJob(dataDir, tenantId, p.importId as string);
      if (!job) return { ok: false, error: "Import not found" };
      const target = p.target as { kind: "table"; tableId: string };
      const props = (p._props ?? {}) as Record<string, unknown>;
      const next: ImportJob = {
        ...job,
        sourceLabel: p.sourceLabel as string,
        target,
        provider: (props.provider as string) ?? job.provider,
        createdAt: (props.createdAt as string) ?? job.createdAt,
        createdBy: (props.createdBy as string) ?? job.createdBy,
        updatedAt: now,
        updatedBy: actor,
      };
      saveJob(dataDir, next);
      appendAudit(dataDir, { tenantId, actor, action: "native.import.updated", entityId: next.id, detail: `Updated import "${next.sourceLabel}"${suffix}` });
      appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId: next.id, op: "updateImport", at: now, by: auditActor, pulled: 0, mapped: 0, skipped: 0, committed: 0, failed: 0, note: "Import updated" });
      publishEvent(dataDir, tenantId, "native.import.updated", { importId: next.id });
      return { ok: true, id: next.id };
    }
    if (op === "deleteImport") {
      const importId = p.importId as string;
      deleteJobRecord(dataDir, tenantId, importId);
      appendAudit(dataDir, { tenantId, actor, action: "native.import.deleted", entityId: importId, detail: `Deleted import${suffix}` });
      appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId, op: "deleteImport", at: now, by: auditActor, pulled: 0, mapped: 0, skipped: 0, committed: 0, failed: 0, note: "Import deleted" });
      publishEvent(dataDir, tenantId, "native.import.deleted", { importId });
      return { ok: true, id: importId };
    }
    if (op === "pullImportData") {
      const importId = p.importId as string;
      const job = getJob(dataDir, tenantId, importId);
      if (!job) return { ok: false, error: "Import not found" };
      const reader = sourceReaders.get(job.provider.toLowerCase());
      // HONEST pull: no wired source → 0 pulled with an explicit note.
      if (!reader) {
        appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId, op: "pullImportData", at: now, by: auditActor, pulled: 0, mapped: 0, skipped: 0, committed: 0, failed: 0, note: `No import source is wired for provider "${job.provider}" in this build yet — 0 rows pulled.` });
        return { ok: false, error: `No import source is wired for provider "${job.provider}" in this build yet.` };
      }
      // Provider read may fail (bad/expired credential, HTTP error). Record an
      // HONEST failed run (never silent, never fabricated) and fail closed.
      let out: { rows: Record<string, unknown>[]; note?: string; httpStatus?: number };
      try {
        out = await reader({ dataDir, tenantId, importId, provider: job.provider });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = typeof (e as { httpStatus?: number })?.httpStatus === "number" ? (e as { httpStatus: number }).httpStatus : undefined;
        appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId, op: "pullImportData", at: now, by: auditActor, pulled: 0, mapped: 0, skipped: 0, committed: 0, failed: 1, httpStatus: status, note: `Pull from ${job.provider} failed: ${msg} — 0 rows pulled.` });
        publishEvent(dataDir, tenantId, "native.import.failed", { importId, provider: job.provider, error: msg });
        return { ok: false, error: msg };
      }
      const rows = Array.isArray(out.rows) ? out.rows : [];
      if (rows.length > MAX_STAGING_ROWS) {
        appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId, op: "pullImportData", at: now, by: auditActor, pulled: 0, mapped: 0, skipped: 0, committed: 0, failed: 1, httpStatus: out.httpStatus, note: `Source returned ${rows.length} rows (cap ${MAX_STAGING_ROWS}) — 0 staged.` });
        return { ok: false, error: `Source returned ${rows.length} rows — exceeds the ${MAX_STAGING_ROWS}-row staging cap.` };
      }
      const byteLength = new TextEncoder().encode(JSON.stringify(rows)).byteLength;
      if (byteLength > MAX_IMPORT_BYTES) {
        appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId, op: "pullImportData", at: now, by: auditActor, pulled: 0, mapped: 0, skipped: 0, committed: 0, failed: 1, httpStatus: out.httpStatus, note: `Source payload exceeded 512 KiB (${byteLength} bytes) — 0 staged.` });
        return { ok: false, error: "Source payload exceeds the 512 KiB staging cap." };
      }
      const staging: ImportStaging = { importId, tenantId, rows, byteLength, pulledAt: now, pulledBy: actor };
      saveStaging(dataDir, staging);
      const next: ImportJob = { ...job, status: "staged", updatedAt: now, updatedBy: actor };
      saveJob(dataDir, next);
      appendAudit(dataDir, { tenantId, actor, action: "native.import.pulled", entityId: importId, detail: `Pulled ${rows.length} row(s) from ${job.provider}${out.note ? ` (${out.note})` : ""}${suffix}` });
      appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId, op: "pullImportData", at: now, by: auditActor, pulled: rows.length, mapped: 0, skipped: 0, committed: 0, failed: 0, httpStatus: out.httpStatus, note: `Staged ${rows.length} row(s)${out.note ? ` — ${out.note}` : ""}` });
      publishEvent(dataDir, tenantId, "native.import.pulled", { importId, provider: job.provider, pulled: out.rows.length });
      return { ok: true, id: importId };
    }
    if (op === "mapImportFields") {
      const importId = p.importId as string;
      const job = getJob(dataDir, tenantId, importId);
      if (!job) return { ok: false, error: "Import not found" };
      const next: ImportJob = { ...job, mapping: p.mapping as ImportFieldMapping[], updatedAt: now, updatedBy: actor };
      saveJob(dataDir, next);
      appendAudit(dataDir, { tenantId, actor, action: "native.import.mapped", entityId: importId, detail: `Saved ${(p.mapping as ImportFieldMapping[]).length} field mapping(s)${suffix}` });
      appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId, op: "mapImportFields", at: now, by: auditActor, pulled: 0, mapped: (p.mapping as ImportFieldMapping[]).length, skipped: 0, committed: 0, failed: 0, note: "Field mapping saved" });
      publishEvent(dataDir, tenantId, "native.import.mapped", { importId, fields: (p.mapping as ImportFieldMapping[]).length });
      return { ok: true, id: importId };
    }
    return { ok: false, error: "unknown import op" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
/**
 * Submit a gated import write. Validation FIRST — bad writes 400 before gating
 * (never queued). Gate verb-first: every op name here is a WRITE (pull/map/
 * commit ADDED to WRITE_VERB by this slice); commitImport additionally rides
 * the tables importTableRows card — ONE approval, no double-queue.
 */
export async function submitImportWrite(
  dataDir: string,
  tenantId: string,
  op: ImportOp,
  req: { payload: Record<string, unknown>; via?: string },
  actor: string,
): Promise<ImportWriteResult> {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required", op };
  const payload = req.payload ?? {};
  const action = ACTION_NAME[op];
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, op, payload, actor);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg, op };
  }
  // COMMIT PRECEDENT-LOCKED: commitImport rides the TABLES slice's OWN gated
  // importTableRows write — THE one approval card. We never create a second
  // import-slice card (no double-queue) and never write to tables directly
  // (submitTableWrite is the tables slice's own public gate). The pending
  // mirror below links to that SAME card for the import UI/ledger.
  if (op === "commitImport") {
    const importId = prepared.importId as string;
    const tableId = prepared._tableId as string;
    const importRows = (prepared._importRows as Record<string, unknown>[]) ?? [];
    const job = getJob(dataDir, tenantId, importId);
    if (!job) return { applied: false, pending: false, error: "Import not found", op };
    try {
      const res = submitTableWrite(dataDir, tenantId, tableId, "import", { rowData: {}, importRows }, actor);
      if (res.applied) {
        const now = new Date().toISOString();
        const next: ImportJob = { ...job, status: "committed", updatedAt: now, updatedBy: actor };
        saveJob(dataDir, next);
        appendAudit(dataDir, { tenantId, actor, action: "native.import.committed", entityId: importId, detail: `Committed ${importRows.length} row(s) into table ${tableId} (applied immediately, autonomy ${res.autonomy ? "yes" : "no"})` });
        appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId, op: "commitImport", at: now, by: actor, pulled: 0, mapped: 0, skipped: 0, committed: importRows.length, failed: 0, note: `Committed ${importRows.length} row(s) via tables importTableRows (applied immediately)` });
        publishEvent(dataDir, tenantId, "native.import.committed", { importId, tableId, committed: importRows.length, autonomy: !!res.autonomy });
        return { applied: true, pending: false, op, id: importId, autonomy: !!res.autonomy, actionId: res.actionId };
      }
      // Approval ON → ONE card (the tables importTableRows card). Mirror it.
      const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
      if (pending.length >= MAX_PENDING_IMPORT_WRITES) {
        return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_IMPORT_WRITES}) — approve or reject before more`, op };
      }
      const approvalActionId = res.approvalActionId || "";
      const imw: PendingImportWrite = {
        id: generateImportEntityId("imw"),
        tenantId,
        importId,
        op,
        action,
        status: "pending",
        approvalActionId,
        payload: prepared,
        requestedBy: actor,
        requestedAt: new Date().toISOString(),
      };
      savePendingWrite(dataDir, imw);
      appendAudit(dataDir, { tenantId, actor, action: "native.import.pending", entityId: importId, detail: `Commit submitted for approval (${importRows.length} rows into table ${tableId})` });
      publishEvent(dataDir, tenantId, "native.import.pending", { op, imwId: imw.id });
      return { applied: false, pending: true, approvalActionId, op };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId, op: "commitImport", at: new Date().toISOString(), by: actor, pulled: 0, mapped: 0, skipped: 0, committed: 0, failed: 1, note: `Commit rejected before writing: ${msg}` });
      return { applied: false, pending: false, error: msg, op };
    }
  }
  // Other ops → the import slice's OWN approval card (verb-first).
  const gate: ApprovalGateOutcome = approvalGate(tenantId, action, NATIVE_IMPORT_PROVIDER, { op, via: req.via ?? "portal" }, { dataDir, workflowId: NATIVE_IMPORT_WORKFLOW_ID });
  if (gate.error) return { applied: false, pending: false, error: gate.error, op };
  if (gate.allowed) {
    const out = await applyNow(dataDir, tenantId, op, prepared, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error, op };
    if (gate.autonomy) {
      try {
        recordAutonomyOutcome(tenantId, NATIVE_IMPORT_WORKFLOW_ID, action, NATIVE_IMPORT_PROVIDER, true, { dataDir, allowListId: gate.allowListId, target: out.id ?? "" });
      } catch { /* outcome recording must never block an authorized write */ }
    }
    return { applied: true, pending: false, op, id: out.id, autonomy: !!gate.autonomy, actionId: gate.actionId };
  }
  // Approval is ON → durable pending mirror (import's own card id).
  const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
  if (pending.length >= MAX_PENDING_IMPORT_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_IMPORT_WRITES}) — approve or reject before more`, op };
  }
  const approvalActionId = gate.actionId || "";
  const imw: PendingImportWrite = {
    id: generateImportEntityId("imw"),
    tenantId,
    importId: typeof prepared.importId === "string" ? prepared.importId : "",
    op,
    action,
    status: "pending",
    approvalActionId,
    payload: prepared,
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, imw);
  appendAudit(dataDir, { tenantId, actor, action: "native.import.pending", entityId: imw.importId || imw.id, detail: `Queued ${action} for approval (${imw.id})` });
  publishEvent(dataDir, tenantId, "native.import.pending", { op, imwId: imw.id });
  return { applied: false, pending: true, approvalActionId, op };
}
/**
 * APPROVE-path executor: applies the approved write once (idempotent). For
 * commitImport the apply DELEGATES to the TABLES slice's own executor
 * (executePendingTableWrite) — same card, same tables code path, no
 * cross-store write from this slice.
 */
export async function executePendingImportWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): Promise<{ ok: true; id?: string; imwId: string; alreadyApplied?: boolean; committed?: number } | { ok: false; reason: string; imwId?: string }> {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const imw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!imw) return { ok: false, reason: "no pending write for this approval action" };
  if (imw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (imw.status === "applied") {
    return { ok: true, alreadyApplied: true, id: undefined, imwId: imw.id, committed: imw.appliedResult?.committed };
  }
  const actorT = actor || imw.requestedBy;
  // COMMIT path: the card is the TABLES importTableRows card → delegate.
  if (imw.op === "commitImport") {
    const tableId = typeof imw.payload._tableId === "string" ? imw.payload._tableId : "";
    if (!tableId) return { ok: false, reason: "commit payload missing target table", imwId: imw.id };
    const res = executePendingTableWrite(dataDir, tenantId, approvalActionId, actorT);
    if (!res.ok) {
      markPendingWrite(dataDir, tenantId, imw.id, "rejected", { error: res.reason });
      return { ok: false, reason: res.reason, imwId: imw.id };
    }
    const committed = res.report.rowIds.length;
    markPendingWrite(dataDir, tenantId, imw.id, "applied", { appliedResult: { committed, rowIds: res.report.rowIds } });
    const job = getJob(dataDir, tenantId, imw.importId);
    if (job) {
      const now = new Date().toISOString();
      const next: ImportJob = { ...job, status: "committed", updatedAt: now, updatedBy: actorT };
      saveJob(dataDir, next);
      appendRun(dataDir, { id: generateImportEntityId("imr"), tenantId, importId: job.id, op: "commitImport", at: now, by: actorT, pulled: 0, mapped: 0, skipped: 0, committed, failed: 0, note: `Committed ${committed} row(s) into table ${tableId} (approved)` });
      appendAudit(dataDir, { tenantId, actor: actorT, action: "native.import.committed", entityId: job.id, detail: `Committed ${committed} row(s) into table ${tableId} (approved)` });
      publishEvent(dataDir, tenantId, "native.import.committed", { importId: job.id, tableId, committed });
    }
    return { ok: true, id: imw.importId, imwId: imw.id, committed };
  }
  // Non-commit ops → apply in OUR store (re-validate at apply time).
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, imw.op, imw.payload as Record<string, unknown>, actorT);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, imw.id, "rejected", { error: msg });
    return { ok: false, reason: msg, imwId: imw.id };
  }
  const out = await applyNow(dataDir, tenantId, imw.op, prepared, actorT, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, imw.id, "rejected", { error: out.error });
    return { ok: false, reason: out.error, imwId: imw.id };
  }
  markPendingWrite(dataDir, tenantId, imw.id, "applied", { appliedResult: { note: out.id } });
  return { ok: true, id: out.id, imwId: imw.id };
}
/** REJECT path — the card is discarded; nothing is written. For commitImport
 *  the tables card is rejected through the TABLES slice's own decision path. */
export function rejectImportWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; already?: boolean } | { ok: false; reason: string } {
  const imw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!imw) return { ok: false, reason: "no pending write for this approval action" };
  if (imw.status !== "pending") return { ok: true, already: true };
  const actorT = actor || imw.requestedBy;
  if (imw.op === "commitImport") {
    // The tables card is the ONE card — reject it through the tables slice.
    tablesNoteOwnerDecision(dataDir, tenantId, approvalActionId, "rejected", actorT);
  } else {
    markRejected(tenantId, approvalActionId, actorT, dataDir);
  }
  markPendingWrite(dataDir, tenantId, imw.id, "rejected", { error: "rejected by owner" });
  appendAudit(dataDir, { tenantId, actor: actorT, action: "native.import.rejected", entityId: imw.importId || imw.id, detail: `Rejected ${imw.action} (${imw.id})` });
  publishEvent(dataDir, tenantId, "native.import.rejected", { op: imw.op, imwId: imw.id });
  return { ok: true };
}
/** Record the owner decision + transition the shared card too. */
export async function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): Promise<void> {
  const imw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!imw || imw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = await executePendingImportWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(
      tenantId,
      approvalActionId,
      owner,
      { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", importId: res.id, committed: res.committed } : undefined, ...(res.ok ? {} : { error: res.reason }) },
      dataDir,
    );
  } else {
    rejectImportWrite(dataDir, tenantId, approvalActionId, owner);
  }
}
/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, NATIVE_IMPORT_PROVIDER);
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}

// ── Safe GET projections ─────────────────────────────────────────────────────
export function publicJob(job: ImportJob): Omit<ImportJob, "tenantId"> {
  const { tenantId: _t, ...rest } = job;
  void _t;
  return { ...rest };
}
export function publicRun(run: ImportRun): Omit<ImportRun, "tenantId"> {
  const { tenantId: _t, ...rest } = run;
  void _t;
  return { ...rest };
}
export function publicWrite(w: PendingImportWrite): Omit<PendingImportWrite, "tenantId"> {
  const { tenantId: _t, ...rest } = w;
  void _t;
  // Never project staged row payloads — a write mirror is evidence, not data.
  return { ...rest, payload: {} };
}
export function publicAudit(e: { tenantId: string; id: string; ts: string; actor: string; action: string; entityId: string; detail: string }) {
  const { tenantId: _t, ...rest } = e;
  void _t;
  return rest;
}
export { listRuns as listImportRuns, getStaging };
export function getActionName(op: ImportOp): string {
  return ACTION_NAME[op];
}