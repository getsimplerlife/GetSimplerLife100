/**
 * vault-audit.ts — durable, immutable append-only audit for the document vault.
 *
 * OWNER MANDATE (applies in EVERY mode, including autonomy): every scan/create/
 * file move/archive/destroy action writes an immutable audit entry — actor,
 * tenant, action, route, checksum, timestamp. Entries are append-only:
 * this module exports NO update/delete surface, and `appendVaultAudit` is the
 * only writer. A vault action that refuses to record an audit entry fails
 * closed in the caller (the filing contract checks the entry exists before
 * reporting success).
 *
 * Durable store: vault_audit.json → { [tenantEmail]: VaultAuditEntry[] }
 * (same write-through JSON store used by the rest of the platform).
 */
import { readJSON, writeJSON, resolveDataDir } from "./data-store";
import type { VaultAuditEntry } from "./vault-types";

export const VAULT_AUDIT_KEY = "vault_audit.json";

function vaultAuditPath(dataDir: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${VAULT_AUDIT_KEY}`;
}

function loadAudit(dataDir: string): Record<string, VaultAuditEntry[]> {
  const raw = readJSON(vaultAuditPath(dataDir), {}) as Record<string, unknown>;
  const out: Record<string, VaultAuditEntry[]> = {};
  for (const [tenant, entries] of Object.entries(raw)) {
    if (Array.isArray(entries)) out[tenant] = entries as VaultAuditEntry[];
  }
  return out;
}

function entryId(): string {
  return `va-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Append one immutable audit entry for a tenant. Returns the stored entry. */
export function appendVaultAudit(
  dataDir: string,
  tenantEmail: string,
  entry: Omit<VaultAuditEntry, "id" | "ts" | "tenantEmail">,
): VaultAuditEntry {
  const full: VaultAuditEntry = {
    ...entry,
    id: entryId(),
    ts: new Date().toISOString(),
    tenantEmail,
  };
  const audit = loadAudit(dataDir);
  const tenantEntries = audit[tenantEmail] || [];
  tenantEntries.push(full); // append-only: pushes never replace prior entries
  audit[tenantEmail] = tenantEntries;
  writeJSON(vaultAuditPath(dataDir), audit);
  return full;
}

/** Read the full immutable audit trail for one tenant (newest last). */
export function listVaultAudit(dataDir: string, tenantEmail: string): VaultAuditEntry[] {
  const audit = loadAudit(dataDir);
  return (audit[tenantEmail] || []).map((e) => ({ ...e }));
}

/** Count of entries for a tenant (used in tests / admin surfaces). */
export function countVaultAudit(dataDir: string, tenantEmail: string): number {
  return listVaultAudit(dataDir, tenantEmail).length;
}

/** True when a tenant has at least one audit entry (cheap existence check). */
export function vaultAuditExists(dataDir: string, tenantEmail: string): boolean {
  return countVaultAudit(dataDir, tenantEmail) > 0;
}