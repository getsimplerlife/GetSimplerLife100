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
    status: "verified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Native multipart intake (type allowlist + magic-byte sniffing, 25 MiB cap) → per-tenant vault bucket with content-hash dedupe; filing itself is approval-gated. Verified 09-10: intake/gating/dedup live-proven on the deployed instance; approve→execute loop proven end-to-end in the isolated harness after registering native vault executors (see feat/vault-verified-5ab).",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-file",
    kind: "automate",
    status: "verified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "evidence: "Structured filing contract file(document, route); rides the Approval Queue by default (approvals ON) and the autonomy allow-list with a known doc id otherwise. FULL-LOOP SMOKE 09-11 (live ab69e5c, tenant vault-loop-a): file action landed in the approval queue as pending (act-…, mode on) and audit recorded pending-outcome with actor/route/sha; approve→execute proven end-to-end in the isolated harness with the native vault executors registered (PR #241); NOTE: the DEPLOYED instance still returns Unknown action on approve until #241 merges + redeploys — loop completes only after that deploy."",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-move",
    kind: "automate",
    status: "verified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Re-routes an existing vault document; approval-gated, idempotent, audited. FULL-LOOP SMOKE 09-11 (live ab69e5c): pending-gating live-proven (approval queue + audit pending entry); approve→execute proven in the isolated harness with native executors (PR #241).",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-archive",
    kind: "automate",
    status: "verified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Retention-flag transition to archived; approval-gated; restore available. FULL-LOOP SMOKE 09-11 (live ab69e5c): pending-gating live-proven (approval queue + audit pending entry); approve→execute proven in the isolated harness with native executors (PR #241).",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-destroy",
    kind: "automate",
    status: "verified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Non-destructive exact-id delete: approval-gated (autonomy requires explicit allow-list + known id), never glob-delete; re-destroy of an already-destroyed exact id = audited success no-op (idempotent replay provable from the immutable audit); unknown ids fail closed. FULL-LOOP SMOKE 09-11 (live ab69e5c): destroy landed pending in the approval queue + audit pending entry; idempotent-replay + unknown-id fail-closed proven in the isolated harness (vault-approval-execution.test.ts); live approve-execute completes after PR #241 deploys.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-search",
    kind: "understand",
    status: "verified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: false,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Full-text search over name/route/tags/type/customer/project/text within the tenant own vault only. FULL-LOOP SMOKE 09-11 (live ab69e5c): search q=invoice returned the tenant doc; cross-tenant probe: tenant B search returned 0 hits.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-extract",
    kind: "understand",
    status: "unverified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Phase 1.5b LLM extraction pipeline (#240): per-doc-type extractors, classification with confidence, quality flags routed to the human-review lane; output NEVER writes — applying metadata is an Approval-Queue-gated write. LIVE 09-11: /api/vault/extract returns fail-closed {"error":"not-configured"} — LLM layer disabled in this deployment, so extraction EXECUTION is not yet live-verifiable (no write, no data). Flips to verified once the LLM layer is enabled and a live extract smoke produces a human-review-lane record.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-download",
    kind: "understand",
    status: "verified",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Versioned blob download streamed tenant-scoped with an audit entry per download. FULL-LOOP SMOKE 09-11 (live ab69e5c): GET /api/vault/download returned 200, Content-Type application/pdf, X-Vault-Version 1, Content-Length 458 — bytes byte-identical to the uploaded file (cmp). Cross-tenant: tenant B GET on A docId → 404 Document not found.",
  }),
];