/**
 * vault-folder.ts — folder engine + auto-folder rules + route DSL.
 *
 * ROUTE DSL: workflows call file(document, route) where route is a human
 * string like "Customer X / Contracts / 2026". This module canonicalizes it
 * into a safe, unique, tenant-scoped folder path and resolves on-demand
 * folder nodes — FAIL-CLOSED: empty segments ("//"), "." / "..", backslashes,
 * control chars, >8 segments, or segments >120 chars are REJECTED (never a
 * guessed path).
 *
 * AUTO-FOLDER RULES: per-tenant rules map document attributes
 * (customer / project / type / date) to a route template, e.g.
 * target: "{customer}/{type}/{YYYY}" → "Acme Corp/Contracts/2026".
 * Unsupported placeholders are rejected at rule-save time. The rule engine
 * only PREDICTS a route (applyAutoRoute) — executing the filing is the
 * approval-gated vault-document.file write in vault-filing.ts.
 *
 * 5d (FILING LAYER — structured locations): this module owns the tenant
 * TAXONOMY — folder tree + labels + auto-folder rules. Every mutation here is
 * CATALOG METADATA (the same class as the 5c template catalog, never a vault
 * document), so the control floor mirrors templates: strict input validation,
 * an IMMUTABLE vault audit entry per mutation (vault.folder.create / .rename /
 * .delete / .labels / .rule.create / .rule.update / .rule.delete), exact-id
 * operations only (never glob), non-destructive deletes (a folder with child
 * folders or filed documents can never be renamed/deleted — no orphaned
 * routes), and idempotent-by-audit replay for re-deletes. Document-affecting
 * writes stay approval-gated in vault-filing.ts — this module never touches
 * vault documents.
 */
import { randomBytes } from "crypto";
import { join } from "path";
import { readJSON, writeJSON, resolveDataDir } from "./data-store";
import { appendVaultAudit, listVaultAudit } from "./vault-audit";
import { listVaultDocuments } from "./vault-store";
import type { VaultAuditEntry, VaultDoc, VaultFolder, VaultFolderRule, VaultTenantFolders } from "./vault-types";

export const VAULT_FOLDERS_KEY = "vault_folders.json";
export const VAULT_ROUTE_MAX_SEGMENTS = 8;
export const VAULT_ROUTE_MAX_SEGMENT_LENGTH = 120;
export const VAULT_ROUTE_MAX_LENGTH = 1024;
export const ALLOWED_PLACEHOLDERS = ["{customer}", "{project}", "{type}", "{YYYY}", "{YYYY-MM}"] as const;

/** 5d labels: bounded count + per-label length (taxonomy tags, never paths). */
export const VAULT_FOLDER_MAX_LABELS = 32;
export const VAULT_LABEL_MAX_LENGTH = 40;

/** Outcome of a folder/rule mutation (metadata — never a filed document).
 *  Plain object-outcome shape (5c template-catalog precedent) so callers can
 *  inspect fields without narrowing gymnastics. ok:false + error = failure;
 *  ok:true + unchanged = audited idempotent no-op. */
export type FolderOutcome = {
  ok: boolean;
  folder?: VaultFolder;
  unchanged?: boolean;
  created?: VaultFolder[];
  error?: string;
};

function foldersPath(dataDir: string): string {
  return join(resolveDataDir(dataDir, process.cwd()), VAULT_FOLDERS_KEY);
}

export function loadTenantFolders(dataDir: string, tenantEmail: string): VaultTenantFolders {
  const raw = readJSON(foldersPath(dataDir)) as Record<string, VaultTenantFolders>;
  const t = raw[tenantEmail];
  return {
    folders: Array.isArray(t?.folders) ? t.folders : [],
    rules: Array.isArray(t?.rules) ? t.rules : [],
  };
}

function saveTenantFolders(dataDir: string, tenantEmail: string, state: VaultTenantFolders): void {
  const raw = readJSON(foldersPath(dataDir)) as Record<string, VaultTenantFolders>;
  raw[tenantEmail] = state;
  writeJSON(foldersPath(dataDir), raw);
}

/** Split a route string into raw segments. */
function splitSegments(route: string): string[] {
  return (route || "").split("/").map((s) => s.trim());
}

/**
 * Canonicalize a route DSL string into a safe unique path.
 * Returns null when the route is invalid (fail-closed).
 */
export function canonicalizeRoute(route: string | undefined | null): string | null {
  if (!route) return null;
  if (route.length > VAULT_ROUTE_MAX_LENGTH) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(route)) return null; // backslashes + control chars
  const segments = splitSegments(route);
  const cleaned: string[] = [];
  for (const seg of segments) {
    if (seg === "") continue; // tolerate "A / B" spacing artifacts
    if (seg === "." || seg === "..") return null; // path traversal → reject
    if (seg.length > VAULT_ROUTE_MAX_SEGMENT_LENGTH) return null;
    cleaned.push(seg);
  }
  if (cleaned.length === 0) return null;
  if (cleaned.length > VAULT_ROUTE_MAX_SEGMENTS) return null;
  return cleaned.join("/");
}

/** Ensure a canonical route has folder nodes (idempotent, additive only).
 *  Newly created nodes are audited vault.folder.create (the filing gate has
 *  already passed when this runs — this is metadata provenance, not a write). */
export function ensureRouteFolders(
  dataDir: string,
  tenantEmail: string,
  canonicalRoute: string,
  actor: string,
): VaultFolder[] {
  const state = loadTenantFolders(dataDir, tenantEmail);
  const existing = new Set(state.folders.map((f) => f.path));
  const segments = canonicalRoute.split("/");
  const created: VaultFolder[] = [];
  let parentPath = "";
  for (const seg of segments) {
    const path = parentPath ? `${parentPath}/${seg}` : seg;
    if (!existing.has(path)) {
      const folder: VaultFolder = {
        id: `fol_${randomBytes(6).toString("hex")}`,
        path,
        name: seg,
        parentPath,
        createdBy: actor,
        createdAt: new Date().toISOString(),
      };
      state.folders.push(folder);
      existing.add(path);
      created.push(folder);
      auditFolderMutation(dataDir, tenantEmail, actor, "vault.folder.create", `Created folder "${path}" via filing`, folder.id, path);
    }
    parentPath = path;
  }
  if (created.length > 0) saveTenantFolders(dataDir, tenantEmail, state);
  return created;
}

/** List the tenant's folder tree (paths only — derived from canonical paths). */
export function listTenantFolders(dataDir: string, tenantEmail: string): VaultFolder[] {
  const state = loadTenantFolders(dataDir, tenantEmail);
  return state.folders.map((f) => ({ ...f }));
}

/* ── 5d filing layer — folder CRUD (metadata, audited, exact-id, non-destructive) ── */

/**
 * Fail-closed folder/rule audit: every mutation in this module MUST land an
 * immutable vault audit entry; an audit-store failure throws so the mutation
 * can never silently proceed without a record (same contract as the template
 * catalog and the gated filing floor).
 */
function auditFolderMutation(
  dataDir: string,
  tenantEmail: string,
  actor: string,
  action: VaultAuditEntry["action"],
  detail: string,
  folderId?: string,
  route?: string,
): void {
  try {
    appendVaultAudit(dataDir, tenantEmail, {
      actor,
      action,
      documentId: folderId,
      route: route || "",
      sha256: "",
      outcome: "ok",
      detail,
    });
  } catch {
    throw new Error(`Vault audit unavailable — ${action} blocked (fail-closed)`);
  }
}

/** Normalize a labels array: bounded, sanitized, deduped. null on violation. */
export function normalizeFolderLabels(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > VAULT_FOLDER_MAX_LABELS) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const label = item
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, VAULT_LABEL_MAX_LENGTH);
    if (!label) return null; // empty/whitespace-only label → reject, never guess
    if (seen.has(label)) continue; // dedupe silently
    if (label.includes("/") || label.includes("\\")) return null; // labels are tags, not paths
    seen.add(label);
    out.push(label);
  }
  return out;
}

/**
 * Create a structured location (folder) for the tenant taxonomy. The path goes
 * through the same route DSL as filing, so an explicitly created folder is
 * byte-identical to one the auto-folder engine would produce. Implicit parent
 * folders are created additively (each audited). Duplicate exact path → error
 * (never a guessed second node).
 */
export function createFolder(
  dataDir: string,
  tenantEmail: string,
  input: { path: string; labels?: unknown; actor: string },
): FolderOutcome {
  const canonical = canonicalizeRoute(input.path);
  if (!canonical) return { ok: false, error: "Invalid folder path" };
  const labels = normalizeFolderLabels(input.labels);
  if (labels === null) return { ok: false, error: `Invalid labels — expected up to ${VAULT_FOLDER_MAX_LABELS} sanitized tags` };

  const state = loadTenantFolders(dataDir, tenantEmail);
  if (state.folders.some((f) => f.path === canonical)) {
    return { ok: false, error: "Folder already exists" };
  }

  const segments = canonical.split("/");
  const existing = new Set(state.folders.map((f) => f.path));
  const created: VaultFolder[] = [];
  let parentPath = "";
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const path = parentPath ? `${parentPath}/${seg}` : seg;
    if (!existing.has(path)) {
      const isLeaf = i === segments.length - 1;
      const folder: VaultFolder = {
        id: `fol_${randomBytes(6).toString("hex")}`,
        path,
        name: seg,
        parentPath,
        labels: isLeaf && labels.length > 0 ? labels : undefined,
        createdBy: input.actor,
        createdAt: new Date().toISOString(),
      };
      state.folders.push(folder);
      existing.add(path);
      created.push(folder);
      auditFolderMutation(dataDir, tenantEmail, input.actor, "vault.folder.create", `Created folder "${path}"${isLeaf && labels.length > 0 ? ` with labels ${labels.join(",")}` : ""}`, folder.id, path);
    }
    parentPath = path;
  }
  if (created.length === 0) return { ok: false, error: "Folder already exists" };
  saveTenantFolders(dataDir, tenantEmail, state);
  return { ok: true, folder: created[created.length - 1], created };
}

/**
 * Rename a folder's LEAF segment by exact folder id. Non-destructive: refused
 * when the folder has child folders OR any document filed at/under its path
 * (renaming would orphan routes — never allowed). Target must not already
 * exist. Audited vault.folder.rename.
 */
export function renameFolder(
  dataDir: string,
  tenantEmail: string,
  folderId: string,
  newName: string,
  actor: string,
): FolderOutcome {
  if (!folderId) return { ok: false, error: "folderId required (exact single id)" };
  const state = loadTenantFolders(dataDir, tenantEmail);
  const folder = state.folders.find((f) => f.id === folderId);
  if (!folder) return { ok: false, error: "Folder not found" }; // fail-closed (unknown/other-tenant)

  const canonical = canonicalizeRoute(newName || "");
  if (!canonical || canonical.includes("/")) {
    return { ok: false, error: "Invalid folder name — single segment, no slashes" };
  }
  if (canonical === folder.name) return { ok: true, folder, unchanged: true };

  const newPath = folder.parentPath ? `${folder.parentPath}/${canonical}` : canonical;
  if (state.folders.some((f) => f.path === newPath)) {
    return { ok: false, error: "A folder with that name already exists here" };
  }
  // Non-destruction: never orphan children or filed documents.
  if (state.folders.some((f) => f.parentPath === folder.path || f.path.startsWith(folder.path + "/"))) {
    return { ok: false, error: "Folder has sub-folders — rename refused (never orphan the tree)" };
  }
  const filedUnder = listVaultDocuments(dataDir, tenantEmail).some(
    (d) => d.route === folder.path || d.route.startsWith(folder.path + "/"),
  );
  if (filedUnder) {
    return { ok: false, error: "Folder has filed documents — rename refused (never orphan a route)" };
  }

  const idx = state.folders.findIndex((f) => f.id === folderId);
  state.folders[idx] = { ...folder, name: canonical, path: newPath };
  saveTenantFolders(dataDir, tenantEmail, state);
  auditFolderMutation(dataDir, tenantEmail, actor, "vault.folder.rename", `Renamed folder "${folder.path}" → "${newPath}"`, folder.id, newPath);
  return { ok: true, folder: state.folders[idx] };
}

/**
 * Delete EXACTLY one empty folder (never glob; never deletes documents — a
 * folder with child folders or filed documents is REFUSED). Re-delete of an
 * already-deleted exact id = audited success no-op (idempotent-by-audit,
 * provable from the immutable audit); an unknown id fails closed.
 */
export function deleteFolder(
  dataDir: string,
  tenantEmail: string,
  folderId: string,
  actor: string,
): FolderOutcome {
  if (!folderId) return { ok: false, error: "folderId required (exact single id)" };
  const state = loadTenantFolders(dataDir, tenantEmail);
  const idx = state.folders.findIndex((f) => f.id === folderId);
  if (idx === -1) {
    // Idempotent-by-audit: a prior approved delete for this exact id from THIS
    // tenant is provable from the immutable audit → audited no-op success.
    const priorDelete = listVaultAudit(dataDir, tenantEmail).some(
      (e) => e.action === "vault.folder.delete" && e.documentId === folderId && e.outcome === "ok",
    );
    if (priorDelete) {
      auditFolderMutation(dataDir, tenantEmail, actor, "vault.folder.delete", "Idempotent replay — folder already deleted (prior delete on record)", folderId);
      return { ok: true, unchanged: true };
    }
    return { ok: false, error: "Folder not found" };
  }
  const folder = state.folders[idx];
  if (state.folders.some((f) => f.parentPath === folder.path || f.path.startsWith(folder.path + "/"))) {
    return { ok: false, error: "Folder has sub-folders — delete refused (never a glob delete)" };
  }
  const filedUnder = listVaultDocuments(dataDir, tenantEmail).some(
    (d) => d.route === folder.path || d.route.startsWith(folder.path + "/"),
  );
  if (filedUnder) {
    return { ok: false, error: "Folder has filed documents — delete refused (documents are never glob-deleted)" };
  }
  state.folders.splice(idx, 1);
  saveTenantFolders(dataDir, tenantEmail, state);
  auditFolderMutation(dataDir, tenantEmail, actor, "vault.folder.delete", `Deleted empty folder "${folder.path}"`, folder.id, folder.path);
  return { ok: true };
}

/** Set the taxonomy labels on one folder (exact id, audited vault.folder.labels). */
export function setFolderLabels(
  dataDir: string,
  tenantEmail: string,
  folderId: string,
  labels: unknown,
  actor: string,
): FolderOutcome {
  if (!folderId) return { ok: false, error: "folderId required (exact single id)" };
  const state = loadTenantFolders(dataDir, tenantEmail);
  const idx = state.folders.findIndex((f) => f.id === folderId);
  if (idx === -1) return { ok: false, error: "Folder not found" };
  const normalized = normalizeFolderLabels(labels);
  if (normalized === null) return { ok: false, error: `Invalid labels — expected up to ${VAULT_FOLDER_MAX_LABELS} sanitized tags` };
  const folder = state.folders[idx];
  if (JSON.stringify(folder.labels || []) === JSON.stringify(normalized)) {
    return { ok: true, folder, unchanged: true };
  }
  state.folders[idx] = { ...folder, labels: normalized.length > 0 ? normalized : undefined };
  saveTenantFolders(dataDir, tenantEmail, state);
  auditFolderMutation(dataDir, tenantEmail, actor, "vault.folder.labels", `Set labels on "${folder.path}": ${normalized.length > 0 ? normalized.join(",") : "(none)"}`, folder.id, folder.path);
  return { ok: true, folder: state.folders[idx] };
}

/** Validate a rule's target template — unknown placeholders fail closed. */
export function validateRuleTarget(target: string): string | null {
  if (!target || target.length > VAULT_ROUTE_MAX_LENGTH) return null;
  const match = target.match(/\{[a-zA-Z-]+\}/g) || [];
  for (const ph of match) {
    if (!(ALLOWED_PLACEHOLDERS as readonly string[]).includes(ph as (typeof ALLOWED_PLACEHOLDERS)[number])) {
      return `Unsupported placeholder ${ph}`;
    }
  }
  // Static segments must survive canonicalization once placeholders are filled.
  return null;
}

/** Create or update an auto-folder rule (rule CRUD is taxonomy metadata —
 *  every mutation lands an immutable vault.folder.rule.* audit entry; the
 *  audit store failing throws (fail-closed), exactly like the template
 *  catalog). idempotent: upserting an existing id updates it in place. */
export function upsertFolderRule(
  dataDir: string,
  tenantEmail: string,
  rule: Omit<VaultFolderRule, "id" | "createdAt"> & { id?: string },
): { ok: boolean; rule?: VaultFolderRule; error?: string } {
  const validationError = validateRuleTarget(rule.target);
  if (validationError) return { ok: false, error: validationError };
  const state = loadTenantFolders(dataDir, tenantEmail);
  const existingIdx = rule.id ? state.rules.findIndex((r) => r.id === rule.id) : -1;
  const now = new Date().toISOString();
  if (existingIdx >= 0) {
    const updated: VaultFolderRule = {
      ...state.rules[existingIdx],
      name: rule.name,
      enabled: rule.enabled,
      match: rule.match,
      dimensions: rule.dimensions,
      target: rule.target,
      priority: rule.priority,
      createdBy: rule.createdBy,
    };
    state.rules[existingIdx] = updated;
    saveTenantFolders(dataDir, tenantEmail, state);
    auditFolderMutation(dataDir, tenantEmail, rule.createdBy, "vault.folder.rule.update", `Updated rule "${updated.name}" (${updated.id}) target ${updated.target}`, updated.id, updated.target);
    return { ok: true, rule: updated };
  }
  const created: VaultFolderRule = {
    ...rule,
    id: `rule_${randomBytes(6).toString("hex")}`,
    createdAt: now,
  };
  state.rules.push(created);
  saveTenantFolders(dataDir, tenantEmail, state);
  auditFolderMutation(dataDir, tenantEmail, rule.createdBy, "vault.folder.rule.create", `Created rule "${created.name}" (${created.id}) target ${created.target}`, created.id, created.target);
  return { ok: true, rule: created };
}

/** Delete a rule by exact id (never glob). Deletion lands an immutable
 *  vault.folder.rule.delete audit entry; an UNKNOWN id returns false WITHOUT
 *  fabricating an audit entry (never claim a delete that did not happen). */
export function deleteFolderRule(
  dataDir: string,
  tenantEmail: string,
  ruleId: string,
  actor = "system/portal",
): boolean {
  const state = loadTenantFolders(dataDir, tenantEmail);
  const idx = state.rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return false;
  const [removed] = state.rules.splice(idx, 1);
  saveTenantFolders(dataDir, tenantEmail, state);
  auditFolderMutation(dataDir, tenantEmail, actor, "vault.folder.rule.delete", `Deleted rule "${removed.name}" (${removed.id})`, removed.id, removed.target);
  return true;
}

function dateParts(doc: VaultDoc): { YYYY: string; "YYYY-MM": string } {
  const d = new Date(doc.createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    YYYY: String(d.getFullYear()),
    "YYYY-MM": `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
  };
}

function fillTarget(target: string, doc: VaultDoc): string | null {
  const parts = dateParts(doc);
  const valueFor = (kind: string): string | null => {
    switch (kind) {
      case "{customer}":
        return doc.customer ? doc.customer.trim() : null;
      case "{project}":
        return doc.project ? doc.project.trim() : null;
      case "{type}":
        return doc.docType ? doc.docType.trim() : null;
      case "{YYYY}":
        return parts.YYYY;
      case "{YYYY-MM}":
        return parts["YYYY-MM"];
      default:
        return null; // unknown placeholder → never guess
    }
  };
  let out = target;
  const placeholders = out.match(/\{[a-zA-Z-]+\}/g) || [];
  for (const ph of placeholders) {
    const value = valueFor(ph);
    if (value === null || value === "") return null; // missing dimension → no route
    out = out.replaceAll(ph, value);
  }
  out = out.replace(/\/{2,}/g, "/").trim();
  return out.replace(/^\/+|\/+$/g, "");
}

/**
 * Auto-folder engine: pick the best matching enabled rule (lowest priority
 * number; tie → latest createdAt) and produce a canonical route for a doc.
 * Returns { route, ruleId } or null when no rule applies. PURE — predicts
 * only; the gated filing write executes the decision.
 */
export function applyAutoRoute(
  dataDir: string,
  tenantEmail: string,
  doc: VaultDoc,
): { route: string; ruleId: string } | null {
  const state = loadTenantFolders(dataDir, tenantEmail);
  const applicable = state.rules
    .filter((r) => r.enabled)
    .filter((r) => {
      if (!r.match) return true;
      if (r.match.docType && r.match.docType.length > 0 && !r.match.docType.includes(doc.docType || "")) return false;
      if (r.match.customer && r.match.customer.length > 0 && !r.match.customer.some((c) => c.toLowerCase() === (doc.customer || "").toLowerCase())) return false;
      if (r.match.tags && r.match.tags.length > 0 && !r.match.tags.some((t) => (doc.tags || []).includes(t))) return false;
      return true;
    })
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
  const rule = applicable[0];
  if (!rule) return null;
  const filled = fillTarget(rule.target, doc);
  if (!filled) return null;
  const canonical = canonicalizeRoute(filled);
  if (!canonical) return null; // invalid after fill → fail closed, no guess
  return { route: canonical, ruleId: rule.id };
}