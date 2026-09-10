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
 */
import { randomBytes } from "crypto";
import { join } from "path";
import { readJSON, writeJSON, resolveDataDir } from "./data-store";
import type { VaultDoc, VaultFolder, VaultFolderRule, VaultTenantFolders } from "./vault-types";

export const VAULT_FOLDERS_KEY = "vault_folders.json";
export const VAULT_ROUTE_MAX_SEGMENTS = 8;
export const VAULT_ROUTE_MAX_SEGMENT_LENGTH = 120;
export const VAULT_ROUTE_MAX_LENGTH = 1024;
export const ALLOWED_PLACEHOLDERS = ["{customer}", "{project}", "{type}", "{YYYY}", "{YYYY-MM}"] as const;

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

/** Ensure a canonical route has folder nodes (idempotent, additive only). */
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

/** Create or update an auto-folder rule (rule CRUD is metadata — safe). */
export function upsertFolderRule(
  dataDir: string,
  tenantEmail: string,
  rule: Omit<VaultFolderRule, "id" | "createdAt">,
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
    return { ok: true, rule: updated };
  }
  const created: VaultFolderRule = {
    ...rule,
    id: `rule_${randomBytes(6).toString("hex")}`,
    createdAt: now,
  };
  state.rules.push(created);
  saveTenantFolders(dataDir, tenantEmail, state);
  return { ok: true, rule: created };
}

/** Delete a rule by exact id (never glob). */
export function deleteFolderRule(
  dataDir: string,
  tenantEmail: string,
  ruleId: string,
): boolean {
  const state = loadTenantFolders(dataDir, tenantEmail);
  const idx = state.rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return false;
  state.rules.splice(idx, 1);
  saveTenantFolders(dataDir, tenantEmail, state);
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