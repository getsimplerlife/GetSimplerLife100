/**
 * native/tables/gate.ts — the gated write path (Phase 1.4 core).
 *
 * Every mutating op (insert / update / delete / import) flows through the
 * EXISTING Approval Queue gate (#164):
 *
 *   submitTableWrite(...)
 *     1. resolve table + validate the payload (fail-closed BEFORE the gate —
 *        invalid writes are rejected and never queued);
 *     2. approvalGate(tenant, verbedAction, "native-tables", { id, tableId, ... }, ...)
 *        - allow-listed autonomy (#236)  -> applied now + recordAutonomyOutcome;
 *        - otherwise                    -> Approval card + durable pending write
 *                                          (auditors see it); apply happens ONLY
 *                                          through executePendingTableWrite (the
 *                                          approve-path executor, idempotent);
 *     3. gate/store error               -> write BLOCKED (fail-closed), never
 *                                          applied without authority.
 *
 * Autonomy safety note: action names are verb-prefixed (createTableRow /
 * updateTableRow / deleteTableRow / importTableRows), so the shared
 * rules apply automatically — deletes need an EXPLICIT (non-glob) allow-list
 * entry + a known-row id target; nothing auto-writes by default.
 */
import { approvalGate, markApproved, markRejected, type ApprovalGateOutcome } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import {
  MAX_PENDING_WRITES,
  MAX_ROWS_PER_TABLE,
  type TableDef,
  type TableOp,
} from "./types";
import {
  countRows,
  deleteRow as deleteRowStore,
  generateTableEntityId,
  getPendingWriteByAction,
  getRow,
  getTable,
  insertRow,
  listPendingWrites,
  markPendingWrite,
  opVerb,
  savePendingWrite,
  updateRow,
} from "./store";
import { validateRowData, coerceCsvRow } from "./validate";

export interface WriteRequest {
  rowData: Record<string, unknown>;
  /** exact row id for update/delete (known-row target). */
  existingRowId?: string;
  /** rows for import (single gated action, applied idempotently). */
  importRows?: Record<string, unknown>[];
}

export type WriteResult = {
  applied: boolean;
  pending: boolean;
  approvalActionId?: string;
  rowId?: string;
  op: TableOp;
  autonomy: boolean;
  actionId?: string;
};

export interface ApplyReport {
  applied: true;
  op: TableOp;
  rowIds: string[];
}

/** Apply a validated row/import to the store + append row audit. */
function applyMutation(dataDir: string, tenantId: string, table: TableDef, op: TableOp, req: WriteRequest, actor: string): ApplyReport {
  if (op === "insert") {
    const row = { id: generateTableEntityId("row"), tenantId, tableId: table.id, data: req.rowData, createdAt: new Date().toISOString(), createdBy: actor, updatedAt: new Date().toISOString(), updatedBy: actor };
    insertRow(dataDir, row);
    return { applied: true, op, rowIds: [row.id] };
  }
  if (op === "update") {
    if (!req.existingRowId) throw new Error("update requires a row id");
    const existing = getRow(dataDir, tenantId, req.existingRowId);
    if (!existing || existing.tableId !== table.id) throw new Error("row not found");
    const merged = { ...existing.data, ...req.rowData };
    const check = validateRowData(table, merged);
    if (!check.ok) throw new Error(`Row no longer validates after merge: ${check.errors.join("; ")}`);
    updateRow(dataDir, tenantId, existing.id, check.data, actor);
    return { applied: true, op, rowIds: [existing.id] };
  }
  if (op === "delete") {
    if (!req.existingRowId) throw new Error("delete requires a row id");
    const gone = deleteRowStore(dataDir, tenantId, req.existingRowId, actor);
    if (!gone) throw new Error("row not found");
    return { applied: true, op, rowIds: [gone.id] };
  }
  // import — bounded multi-insert, applied idempotently in ONE gated action.
  const rows = req.importRows || [];
  const ids: string[] = [];
  for (const data of rows) {
    const row = { id: generateTableEntityId("row"), tenantId, tableId: table.id, data, createdAt: new Date().toISOString(), createdBy: actor, updatedAt: new Date().toISOString(), updatedBy: actor };
    insertRow(dataDir, row);
    ids.push(row.id);
  }
  return { applied: true, op, rowIds: ids };
}

/** The single write entry-point. Never throws on gating — fail-closed. */
export function submitTableWrite(
  dataDir: string,
  tenantId: string,
  tableId: string,
  op: TableOp,
  req: WriteRequest,
  actor: string,
): WriteResult {
  if (!tenantId?.trim() || !tableId?.trim() || !actor?.trim()) {
    throw new Error("tenantId, tableId and actor are required");
  }
  const table = getTable(dataDir, tenantId, tableId);
  if (!table) throw new Error("table not found");

  // Pre-validate BEFORE the gate — invalid writes never reach approval.
  if (op === "insert") {
    const check = validateRowData(table, req.rowData);
    if (!check.ok) throw new Error(`Row invalid: ${check.errors.join("; ")}`);
    req.rowData = check.data;
    if (countRows(dataDir, tenantId, tableId) >= MAX_ROWS_PER_TABLE) throw new Error(`Table at cap (${MAX_ROWS_PER_TABLE} rows)`);
  } else if (op === "update") {
    if (!req.existingRowId) throw new Error("update requires a row id");
    if (!getRow(dataDir, tenantId, req.existingRowId) || getRow(dataDir, tenantId, req.existingRowId)!.tableId !== tableId) throw new Error("row not found");
  } else if (op === "delete") {
    if (!req.existingRowId) throw new Error("delete requires a row id");
  } else if (op === "import") {
    if (!req.importRows || req.importRows.length === 0) throw new Error("import requires rows");
    if (countRows(dataDir, tenantId, tableId) + req.importRows.length > MAX_ROWS_PER_TABLE) throw new Error(`Import would exceed table cap (${MAX_ROWS_PER_TABLE})`);
    const validated: Record<string, unknown>[] = [];
    for (const dataRaw of req.importRows) {
      const data = coerceCsvRow(table, dataRaw);
      const check = validateRowData(table, data);
      if (!check.ok) throw new Error(`Import row invalid: ${check.errors.join("; ")}`);
      validated.push(check.data);
    }
    req.importRows = validated;
  } else {
    throw new Error(`unsupported op ${op}`);
  }

  const action = opVerb(op);
  // Known-row target for delete: params.id = row id (enables allow-listed
  // autonomy WITHOUT ever deleting unknown rows).
  const params: Record<string, string> = { tableId, id: req.existingRowId ?? "" };
  if (op === "insert" || op === "import") params.id = "";

  const gate: ApprovalGateOutcome = approvalGate(tenantId, action, "native-tables", params, {
    agentId: actor,
    dataDir,
  });

  if (gate.allowed) {
    // Two ways here: approval mode OFF (tenant opted out explicitly) OR an
    // allow-listed write (autonomy). Apply + audit either way.
    const report = applyMutation(dataDir, tenantId, table, op, req, actor);
    if (gate.autonomy) {
      try {
        recordAutonomyOutcome(tenantId, gate.workflowId || "default", action, "native-tables", true, {
          dataDir,
          allowListId: gate.allowListId,
        });
      } catch {
        // outcome recording must never block the already-authorized write.
      }
    }
    const rowId = report.rowIds.length === 1 ? report.rowIds[0] : undefined;
    return { applied: true, pending: false, rowId, op, autonomy: !!gate.autonomy, actionId: gate.actionId };
  }

  // NOT allowed → durable pending write mirroring the approval card.
  const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
  if (pending.length >= MAX_PENDING_WRITES) throw new Error(`Pending-write cap reached (${MAX_PENDING_WRITES}) — approve or reject before writing more`);
  const ptwId = generateTableEntityId("ptw");
  const snapshot: Record<string, unknown> = {
    tableId,
    op,
    rowData: req.rowData,
    existingRowId: op === "update" || op === "delete" ? req.existingRowId : undefined,
    importRows: op === "import" ? req.importRows : undefined,
  };
  savePendingWrite(dataDir, { id: ptwId, tenantId, tableId, op, payload: snapshot, status: "pending", approvalActionId: gate.actionId || "", requestedBy: actor, requestedAt: new Date().toISOString() });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op, autonomy: false };
}

/**
 * The APPROVE-path executor (the analog of the portal "run approved action
 * with the gate bypassed"): applies the pending write. Idempotent — a second
 * call for an already-applied action is a no-op (returns the stored report).
 * The approval queue card itself is transitioned via markApproved by the
 * caller (portal owner decision) — we apply the payload it authorized.
 */
export function executePendingTableWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; report: ApplyReport; ptwId: string; alreadyApplied?: boolean } | { ok: false; reason: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status === "applied") {
    // Idempotent replay: a second apply is NOT an error — return the stored
    // result so the approver endpoint answers 200 (HTTP idempotency).
    if (Array.isArray(ptw.appliedRowIds)) {
      return { ok: true, alreadyApplied: true, report: { applied: true, op: ptw.op, rowIds: ptw.appliedRowIds }, ptwId: ptw.id };
    }
    return { ok: false, reason: "already applied (idempotent no-op)" };
  }
  if (ptw.status === "rejected") return { ok: false, reason: "write was rejected" };
  const table = getTable(dataDir, tenantId, ptw.tableId);
  if (!table) {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: "table no longer exists" });
    return { ok: false, reason: "table no longer exists" };
  }
  const req: WriteRequest = { rowData: (ptw.payload.rowData || {}) as Record<string, unknown>, existingRowId: typeof ptw.payload.existingRowId === "string" ? ptw.payload.existingRowId : undefined, importRows: Array.isArray(ptw.payload.importRows) ? (ptw.payload.importRows as Record<string, unknown>[]) : undefined };
  try {
    const report = applyMutation(dataDir, tenantId, table, ptw.op, req, actor);
    markPendingWrite(dataDir, tenantId, ptw.id, "applied", actor, { appliedRowIds: report.rowIds });
    return { ok: true, report, ptwId: ptw.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
}

/** Record the owner decision on the native card + return for the caller to
 *  also transition the shared approval queue card (markApproved/markRejected). */
export function noteOwnerDecision(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  decision: "approved" | "rejected",
  owner: string,
): void {
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    executePendingTableWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: "applied" }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", owner);
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}