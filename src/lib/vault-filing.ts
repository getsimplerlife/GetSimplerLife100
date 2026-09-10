/**
 * vault-filing.ts — the structured FILING CONTRACT (API + DSL) for the vault.
 *
 * Workflows (and the portal) call:
 *   fileDocument({ tenantId, documentId, route: "Customer X / Contracts / 2026", ... })
 * and the folder engine lands the document at the canonical route.
 *
 * SAFETY FLOOR (owner mandate — holds in EVERY mode):
 *   1. EVERY mutating call (file / move / archive / unarchive / destroy /
 *      update) passes through the SAME approvalGate (#164) as every other
 *      platform write. Approval ON (default) → the write returns
 *      { pending: true, actionId } and lands in the portal approvals queue;
 *      only an explicit portal approve executes it.
 *   2. AUTONOMY mode (#236) may auto-execute ONLY when the action is
 *      explicitly allow-listed (non-glob entry, e.g. "writeVaultDocument")
 *      AND the payload carries a KNOWN document id — never wildcard routes,
 *      never unknown ids. Auto-executions are recorded to the autonomy audit
 *      log (durable, immutable) and the vault audit log.
 *   3. DESTROY accepts exactly ONE known document id; never a glob/query.
 *   4. Every executed action appends an immutable vault audit entry
 *      (actor, tenant, action, route, checksum, timestamp). A write that
 *      fails to record its audit entry reports an error (fail-closed).
 *   5. Non-destruction: nothing is overwritten; versioning is add-only
 *      (vault-store.ts); routing is idempotent; unknown ids return null.
 */
import { approvalGate, markApproved, type PendingAction } from "./approval-queue";
import { recordAutonomyOutcome } from "./autonomy";
import { appendVaultAudit, listVaultAudit } from "./vault-audit";
import {
  getVaultDocument,
  attachRouteToDocument,
  setVaultDocumentStatus,
  updateVaultDocumentMeta,
  destroyVaultDocument,
  listVaultDocuments,
  readVaultDocumentBytes,
  type VaultDocStatus,
} from "./vault-store";
import { canonicalizeRoute, ensureRouteFolders, applyAutoRoute } from "./vault-folder";
import type {
  FilingOutcome,
  VaultAuditEntry,
  VaultDoc,
  VaultGateDecision,
  VaultRetention,
} from "./vault-types";

export const VAULT_PROVIDER_ID = "vault";
export const VAULT_ACTIONS = {
  file: "writeVaultDocument",
  move: "moveVaultDocument",
  archive: "archiveVaultDocument",
  unarchive: "restoreVaultDocument",
  destroy: "deleteVaultDocument",
  update: "updateVaultDocument",
} as const;

interface VaultWriteOpts {
  agentId?: string;
  workflowId?: string;
  dataDir: string;
}

function currentChecksum(doc: VaultDoc): string {
  const latest = doc.versions[doc.versions.length - 1];
  return latest ? latest.sha256 : "";
}

/** Gate a vault write through the platform Approval Queue (#164) / autonomy
 *  allow-list (#236). Fail-closed on store errors — never write around it. */
function gateVaultWrite(
  tenantId: string,
  action: string,
  params: Record<string, any>,
  opts: VaultWriteOpts,
): VaultGateDecision {
  try {
    const gate = approvalGate(tenantId, action, VAULT_PROVIDER_ID, params, {
      agentId: opts.agentId,
      workflowId: opts.workflowId,
      dataDir: opts.dataDir,
    });
    if (gate.allowed && gate.autonomy && gate.allowListId && gate.workflowId) {
      return {
        allowed: true,
        autonomy: true,
        allowListId: gate.allowListId,
        workflowId: gate.workflowId,
      };
    }
    if (gate.allowed) return { allowed: true };
    return {
      allowed: false,
      pending: true,
      actionId: gate.actionId,
      error: gate.error,
    };
  } catch (e: any) {
    return { allowed: false, error: `Vault approval store unavailable — write blocked: ${e?.message || String(e)}` };
  }
}

/** Record the autonomy outcome (error-budget + durable autonomy audit). */
function recordAutonomyOutcomeSafe(
  tenantId: string,
  workflowId: string,
  action: string,
  ok: boolean,
  opts: { dataDir?: string; allowListId?: string; error?: string; target?: string },
): void {
  if (!workflowId) return;
  try {
    recordAutonomyOutcome(tenantId, workflowId, action, VAULT_PROVIDER_ID, ok, opts);
  } catch {
    // Autonomy audit is best-effort secondary logging; the vault audit below
    // is the authoritative immutable record.
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * FILE — the flagship contract: file(document, route)
 * ──────────────────────────────────────────────────────────────────────── */
export function fileDocument(
  opts: VaultWriteOpts & {
    tenantId: string;
    documentId: string;
    route: string;
    actor: string;
  },
): FilingOutcome {
  const { tenantId, documentId, route, actor, dataDir } = opts;
  const doc = getVaultDocument(dataDir, tenantId, documentId);
  if (!doc) return { ok: false, error: "Document not found" }; // fail-closed
  const canonical = canonicalizeRoute(route);
  if (!canonical) return { ok: false, error: "Invalid route" }; // never a guessed path

  // Idempotent no-op: already filed to exactly this route → unchanged.
  if (doc.status === "active" && doc.route === canonical) {
    appendVaultAudit(dataDir, tenantId, {
      actor,
      action: "writeVaultDocument",
      documentId,
      route: canonical,
      sha256: currentChecksum(doc),
      version: doc.version,
      outcome: "ok",
      detail: "Idempotent no-op — document already filed to route",
    });
    return { ok: true, documentId, route: canonical, unchanged: true };
  }

  const gate = gateVaultWrite(tenantId, VAULT_ACTIONS.file, { documentId, route: canonical }, opts);
  if (!gate.allowed) {
    appendVaultAudit(dataDir, tenantId, {
      actor: opts.agentId ? `agent:${opts.agentId}` : actor,
      action: "writeVaultDocument",
      documentId,
      route: canonical,
      sha256: currentChecksum(doc),
      version: doc.version,
      outcome: gate.error ? "denied" : "pending",
      detail: gate.error ? gate.error : `Pending approval (${gate.actionId || "?"})`,
    });
    return {
      ok: false,
      pending: true,
      actionId: gate.actionId,
      documentId,
      route: canonical,
      error: gate.error,
    };
  }

  // Gate passed → execute (folders are additive metadata; the doc lands at
  // the canonical route; status flips active).
  ensureRouteFolders(dataDir, tenantId, canonical, actor);
  const updated = attachRouteToDocument(dataDir, tenantId, documentId, canonical);
  if (!updated) {
    recordAutonomyOutcomeSafe(tenantId, gate.workflowId || "", VAULT_ACTIONS.file, false, {
      dataDir,
      allowListId: gate.allowListId,
      error: "Document vanished after gate",
      target: documentId,
    });
    return { ok: false, error: "Document not found" };
  }
  appendVaultAudit(dataDir, tenantId, {
    actor: gate.autonomy ? "system/autonomy" : actor,
    action: "writeVaultDocument",
    documentId,
    route: canonical,
    sha256: currentChecksum(updated),
    version: updated.version,
    outcome: "ok",
    detail: gate.autonomy ? `Auto-filed (allow-list ${gate.allowListId})` : undefined,
  });
  if (gate.autonomy) {
    recordAutonomyOutcomeSafe(tenantId, gate.workflowId || "", VAULT_ACTIONS.file, true, {
      dataDir,
      allowListId: gate.allowListId,
      target: documentId,
    });
  }
  const suggested = applyAutoRoute(dataDir, tenantId, updated);
  return {
    ok: true,
    documentId,
    route: canonical,
    autonomy: gate.autonomy,
    ruleId: suggested?.ruleId,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * MOVE / ARCHIVE / UNARCHIVE / DESTROY / UPDATE — all gated identically
 * ──────────────────────────────────────────────────────────────────────── */
export function moveDocument(
  opts: VaultWriteOpts & {
    tenantId: string;
    documentId: string;
    route: string;
    actor: string;
  },
): FilingOutcome {
  const { tenantId, documentId, route, actor, dataDir } = opts;
  const doc = getVaultDocument(dataDir, tenantId, documentId);
  if (!doc) return { ok: false, error: "Document not found" };
  const canonical = canonicalizeRoute(route);
  if (!canonical) return { ok: false, error: "Invalid route" };
  if (doc.route === canonical) {
    return { ok: true, documentId, route: canonical, unchanged: true };
  }
  const gate = gateVaultWrite(tenantId, VAULT_ACTIONS.move, { documentId, route: canonical }, opts);
  if (!gate.allowed) {
    appendVaultAudit(dataDir, tenantId, {
      actor: opts.agentId ? `agent:${opts.agentId}` : actor,
      action: "moveVaultDocument",
      documentId,
      route: canonical,
      sha256: currentChecksum(doc),
      outcome: gate.error ? "denied" : "pending",
      detail: gate.error || `Pending approval (${gate.actionId || "?"})`,
    });
    return { ok: false, pending: true, actionId: gate.actionId, documentId, route: canonical, error: gate.error };
  }
  ensureRouteFolders(dataDir, tenantId, canonical, actor);
  const updated = attachRouteToDocument(dataDir, tenantId, documentId, canonical);
  if (!updated) return { ok: false, error: "Document not found" };
  appendVaultAudit(dataDir, tenantId, {
    actor: gate.autonomy ? "system/autonomy" : actor,
    action: "moveVaultDocument",
    documentId,
    route: canonical,
    sha256: currentChecksum(updated),
    version: updated.version,
    outcome: "ok",
    detail: `Moved from ${doc.route || "(inbox)"}`,
  });
  if (gate.autonomy) {
    recordAutonomyOutcomeSafe(tenantId, gate.workflowId || "", VAULT_ACTIONS.move, true, {
      dataDir,
      allowListId: gate.allowListId,
      target: documentId,
    });
  }
  return { ok: true, documentId, route: canonical, autonomy: gate.autonomy };
}

function setStatusGated(
  action: "archiveVaultDocument" | "restoreVaultDocument",
  status: VaultDocStatus,
  opts: VaultWriteOpts & { tenantId: string; documentId: string; actor: string },
): FilingOutcome {
  const { tenantId, documentId, actor, dataDir } = opts;
  const doc = getVaultDocument(dataDir, tenantId, documentId);
  if (!doc) return { ok: false, error: "Document not found" };
  if (doc.status === status) return { ok: true, documentId, unchanged: true };
  const gate = gateVaultWrite(tenantId, action, { documentId }, opts);
  if (!gate.allowed) {
    appendVaultAudit(dataDir, tenantId, {
      actor: opts.agentId ? `agent:${opts.agentId}` : actor,
      action,
      documentId,
      route: doc.route,
      sha256: currentChecksum(doc),
      outcome: gate.error ? "denied" : "pending",
      detail: gate.error || `Pending approval (${gate.actionId || "?"})`,
    });
    return { ok: false, pending: true, actionId: gate.actionId, documentId, error: gate.error };
  }
  const updated = setVaultDocumentStatus(dataDir, tenantId, documentId, status);
  if (!updated) return { ok: false, error: "Document not found" };
  appendVaultAudit(dataDir, tenantId, {
    actor: gate.autonomy ? "system/autonomy" : actor,
    action,
    documentId,
    route: updated.route,
    sha256: currentChecksum(updated),
    version: updated.version,
    outcome: "ok",
  });
  if (gate.autonomy) {
    recordAutonomyOutcomeSafe(tenantId, gate.workflowId || "", action, true, {
      dataDir,
      allowListId: gate.allowListId,
      target: documentId,
    });
  }
  return { ok: true, documentId, autonomy: gate.autonomy };
}

export function archiveDocument(
  opts: VaultWriteOpts & { tenantId: string; documentId: string; actor: string },
): FilingOutcome {
  return setStatusGated(VAULT_ACTIONS.archive, "archived", opts);
}

export function unarchiveDocument(
  opts: VaultWriteOpts & { tenantId: string; documentId: string; actor: string },
): FilingOutcome {
  return setStatusGated(VAULT_ACTIONS.unarchive, "active", opts);
}

/**
 * DESTROY — deletes exactly ONE known document. Gated like every other write;
 * in autonomy mode the allow-list entry must cover "deleteVaultDocument"
 * AND the payload's documentId must be a real vault id (the gate receives the
 * id, so a glob/unknown id is impossible). Unknown ids fail closed (null).
 */
export function destroyDocument(
  opts: VaultWriteOpts & { tenantId: string; documentId: string; actor: string },
): FilingOutcome {
  const { tenantId, documentId, actor, dataDir } = opts;
  const doc = getVaultDocument(dataDir, tenantId, documentId);
  if (!doc) return { ok: false, error: "Document not found" }; // never glob-delete
  const gate = gateVaultWrite(tenantId, VAULT_ACTIONS.destroy, { documentId }, opts);
  if (!gate.allowed) {
    appendVaultAudit(dataDir, tenantId, {
      actor: opts.agentId ? `agent:${opts.agentId}` : actor,
      action: "deleteVaultDocument",
      documentId,
      route: doc.route,
      sha256: currentChecksum(doc),
      outcome: gate.error ? "denied" : "pending",
      detail: gate.error || `Pending approval (${gate.actionId || "?"})`,
    });
    return { ok: false, pending: true, actionId: gate.actionId, documentId, error: gate.error };
  }
  const removed = destroyVaultDocument(dataDir, tenantId, documentId);
  if (!removed) return { ok: false, error: "Document not found" };
  appendVaultAudit(dataDir, tenantId, {
    actor: gate.autonomy ? "system/autonomy" : actor,
    action: "deleteVaultDocument",
    documentId,
    route: removed.route,
    sha256: currentChecksum(removed),
    version: removed.version,
    outcome: "ok",
  });
  if (gate.autonomy) {
    recordAutonomyOutcomeSafe(tenantId, gate.workflowId || "", VAULT_ACTIONS.destroy, true, {
      dataDir,
      allowListId: gate.allowListId,
      target: documentId,
    });
  }
  return { ok: true, documentId, autonomy: gate.autonomy };
}

export function updateDocumentMeta(
  opts: VaultWriteOpts & {
    tenantId: string;
    documentId: string;
    actor: string;
    tags?: string[];
    retention?: Partial<VaultRetention>;
    docType?: string;
    customer?: string;
    project?: string;
    text?: string;
  },
): FilingOutcome {
  const { tenantId, documentId, actor, dataDir } = opts;
  const doc = getVaultDocument(dataDir, tenantId, documentId);
  if (!doc) return { ok: false, error: "Document not found" };
  const gate = gateVaultWrite(
    tenantId,
    VAULT_ACTIONS.update,
    { documentId, tags: opts.tags, retention: opts.retention },
    opts,
  );
  if (!gate.allowed) {
    appendVaultAudit(dataDir, tenantId, {
      actor: opts.agentId ? `agent:${opts.agentId}` : actor,
      action: "updateVaultDocument",
      documentId,
      route: doc.route,
      sha256: currentChecksum(doc),
      outcome: gate.error ? "denied" : "pending",
      detail: gate.error || `Pending approval (${gate.actionId || "?"})`,
    });
    return { ok: false, pending: true, actionId: gate.actionId, documentId, error: gate.error };
  }
  const updated = updateVaultDocumentMeta(dataDir, tenantId, documentId, {
    tags: opts.tags,
    retention: opts.retention,
    docType: opts.docType,
    customer: opts.customer,
    project: opts.project,
    text: opts.text,
  });
  if (!updated) return { ok: false, error: "Document not found" };
  appendVaultAudit(dataDir, tenantId, {
    actor: gate.autonomy ? "system/autonomy" : actor,
    action: "updateVaultDocument",
    documentId,
    route: updated.route,
    sha256: currentChecksum(updated),
    version: updated.version,
    outcome: "ok",
    detail: [
      opts.tags ? `tags=${opts.tags.join(",")}` : "",
      opts.retention ? `retention=${opts.retention.policy}` : "",
      opts.docType ? `type=${opts.docType}` : "",
    ]
      .filter(Boolean)
      .join(";"),
  });
  if (gate.autonomy) {
    recordAutonomyOutcomeSafe(tenantId, gate.workflowId || "", VAULT_ACTIONS.update, true, {
      dataDir,
      allowListId: gate.allowListId,
      target: documentId,
    });
  }
  return { ok: true, documentId, autonomy: gate.autonomy };
}

/** Approve a pending vault approval from the portal approvals queue. The
 *  caller (portal route) re-executes the approved mutation through the normal
 *  gated path; this marks the PendingAction approved with the execution
 *  outcome (same contract as every other provider action approved in the
 *  queue — decided actions are never re-enqueued). */
export function approvePendingVaultAction(
  tenantId: string,
  actionId: string,
  dataDir: string,
  outcome?: { result?: any; error?: string },
): { ok: boolean; action: PendingAction | null } {
  const action = markApproved(tenantId, actionId, "portal", outcome, dataDir);
  return { ok: action !== null, action };
}

/* ────────────────────────────────────────────────────────────────────────
 * READ side (never gated — reads are safe)
 * ──────────────────────────────────────────────────────────────────────── */

/** List docs (optionally filtered) annotated with the auto-route suggestion. */
export function listVault(
  dataDir: string,
  tenantId: string,
  opts?: { includeArchived?: boolean },
): Array<VaultDoc & { suggestedRoute?: string; suggestedRuleId?: string }> {
  const statuses: VaultDocStatus[] = opts?.includeArchived
    ? ["pending_filing", "active", "archived"]
    : ["pending_filing", "active"];
  return listVaultDocuments(dataDir, tenantId, { status: statuses }).map((d) => {
    const suggested = applyAutoRoute(dataDir, tenantId, d);
    return {
      ...d,
      suggestedRoute: suggested?.route,
      suggestedRuleId: suggested?.ruleId,
    };
  });
}

/** Full-text-ish search over name/tags/route/type/customer/project/text. */
export function searchVault(
  dataDir: string,
  tenantId: string,
  query: string,
  opts?: { includeArchived?: boolean },
): Array<VaultDoc & { suggestedRoute?: string }> {
  const q = (query || "").toLowerCase().trim();
  const docs = listVault(dataDir, tenantId, opts);
  if (!q) return docs;
  const match = (d: VaultDoc): boolean =>
    d.name.toLowerCase().includes(q) ||
    d.route.toLowerCase().includes(q) ||
    (d.docType || "").toLowerCase().includes(q) ||
    (d.customer || "").toLowerCase().includes(q) ||
    (d.project || "").toLowerCase().includes(q) ||
    (d.text || "").toLowerCase().includes(q) ||
    (d.tags || []).some((t) => t.toLowerCase().includes(q));
  return docs.filter(match);
}

/** Direct, un-gated read of a doc's current-version bytes (portal download
 *  streams this; the download itself is audited by the caller). */
export function readVaultBytes(
  dataDir: string,
  tenantId: string,
  documentId: string,
  version?: number,
): { bytes: Uint8Array; doc: VaultDoc } | null {
  return readVaultDocumentBytes(dataDir, tenantId, documentId, version);
}

/** Vault audit trail (immutable read). */
export function vaultAudit(
  dataDir: string,
  tenantId: string,
): VaultAuditEntry[] {
  return listVaultAudit(dataDir, tenantId);
}