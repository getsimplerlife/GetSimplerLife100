/**
 * vault.ts — capability contracts for the NATIVE Document & File Intelligence
 * vault (Phase 1.5a, owner-greenlit 2026-09-10).
 *
 * providerId "vault" marks a NATIVE capability (no third-party provider).
 * Per the truthfulness gate, statuses stay "unverified" until the slice is
 * deployed and live-verified; they never claim a partner-powered or
 * self-owned rail. Every write capability is approval-gated by default
 * (Approval Queue #164) and audited immutably.
 */
import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const DOCUMENT_VAULT_EMPLOYEE_ID = "document_vault";
export const VAULT_PROVIDER_ID = "vault";

export const vaultCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-upload",
    kind: "automate",
    status: "unverified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Native multipart intake (type allowlist + magic-byte sniffing, 25 MiB cap) → per-tenant vault bucket with content-hash dedupe; filing itself is approval-gated. Live verification pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-file",
    kind: "automate",
    status: "unverified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Structured filing contract file(document, route) with route DSL; resolves against per-tenant auto-folder rules; rides the Approval Queue by default and the autonomy allow-list with a known doc id otherwise. Live verification pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-move",
    kind: "automate",
    status: "unverified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Re-routes an existing vault document; approval-gated, idempotent, audited. Live verification pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-archive",
    kind: "automate",
    status: "unverified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Retention-flag transition to archived; approval-gated; restore available. Live verification pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-destroy",
    kind: "automate",
    status: "unverified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Non-destructive delete: exactly ONE known doc id, approval-gated (autonomy requires an explicit allow-list entry + known id), never glob-delete (#235). Live verification pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-search",
    kind: "understand",
    status: "unverified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: false,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Full-text search over name/route/tags/type/customer/project/text within the tenant's own vault only. Live verification pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-download",
    kind: "understand",
    status: "unverified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Versioned blob download streamed tenant-scoped with an audit entry per download. Live verification pending.",
  }),
];