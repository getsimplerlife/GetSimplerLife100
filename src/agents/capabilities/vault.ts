/**
 * vault.ts — capability contracts for the NATIVE Document & File Intelligence
 * vault (Phase 1.5a, owner-greenlit 2026-09-10).
 *
 * providerId "vault" marks a NATIVE capability (no third-party provider).
 * Per the truthfulness gate, statuses stay "unverified" until the slice is
 * deployed and live-verified; they never claim a partner-powered or
 * self-owned rail. Every write capability is approval-gated by default
 * (Approval Queue #164) and audited immutably.
 *
 * FLIP GATE (review 09-11): the seven full-loop statuses may only flip to
 * "verified" once (a) the native vault executors are IN THE DEPLOYED BUILD
 * (PR #241: b5aa0af registers writeVaultDocument / moveVaultDocument /
 * archiveVaultDocument / deleteVaultDocument in the engine action registry)
 * AND (b) the full loop (upload → pending → approve → execute →
 * destroy-replay → extract) passes ON THE DEPLOYED INSTANCE. Until that
 * deploy + live smoke completes, status stays "unverified" with the
 * evidence below (what IS proven and what still gates the flip).
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
    evidence: "Native multipart intake (type allowlist + magic-byte sniffing, 25 MiB cap) → per-tenant vault bucket with content-hash dedupe; intake write itself is direct (upload is the intake verb), filing is approval-gated. LIVE-PROVEN 09-11 (deployed ab69e5c): multipart PDF upload → 200, magic-byte sniffed application/pdf, tenant hashed bucket (tenant vault-loop-a / vault-e2e-a-*@test.local). FLIP GATE: flips to verified after PR #241 merges + deploys AND the live full-loop smoke (upload→pending→approve→execute→destroy-replay) passes on the deployed instance.",
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
    evidence: "Structured filing contract file(document, route); rides the Approval Queue by default (approvals ON) and the autonomy allow-list with a known doc id otherwise. LIVE-PROVEN 09-11 (deployed ab69e5c, tenant vault-loop-a): file action landed in the approval queue as pending (act-…) and audit recorded pending-outcome with actor/route/sha. HARNESS-PROVEN: approve→execute completes end-to-end in the isolated harness with the native vault executors registered (PR #241) — vault-approval-execution.test.ts upload→file→approve asserts execution.success=true, doc active at route, immutable audit. FLIP GATE: deployed instance STILL returns Unknown action on approve until #241 merges + redeploys — flips after that deploy AND a live full-loop pass.",
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
    evidence: "Re-routes an existing vault document; approval-gated, idempotent, audited. LIVE-PROVEN 09-11 (deployed ab69e5c): pending-gating live-proven (approval queue + audit pending entry). HARNESS-PROVEN: approve→execute proven end-to-end with native executors (PR #241). FLIP GATE: flips to verified after #241 merges + deploys AND a live approve→execute smoke on the deployed instance passes.",
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
    evidence: "Retention-flag transition to archived; approval-gated; restore available. LIVE-PROVEN 09-11 (deployed ab69e5c): pending-gating live-proven (approval queue + audit pending entry). HARNESS-PROVEN: approve→execute proven end-to-end with native executors (PR #241). FLIP GATE: flips to verified after #241 merges + deploys AND a live approve→execute smoke on the deployed instance passes.",
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
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Non-destructive exact-id delete: approval-gated (autonomy requires explicit allow-list + known id), never glob-delete; re-destroy of an already-destroyed exact id = audited success no-op (idempotent replay provable from the immutable audit); unknown ids fail closed. LIVE-PROVEN 09-11 (deployed ab69e5c): destroy landed pending in the approval queue + audit pending entry. HARNESS-PROVEN: idempotent-replay + unknown-id fail-closed + approve→execute proven in the isolated harness (vault-approval-execution.test.ts). FLIP GATE: flips to verified after #241 merges + deploys AND a live destroy-replay smoke on the deployed instance passes.",
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
    evidence: "Full-text search over name/route/tags/type/customer/project/text within the tenant's own vault only. LIVE-PROVEN 09-11 (deployed ab69e5c): search q=invoice returned the tenant doc; cross-tenant probe: tenant B search returned 0 hits. FLIP GATE: flips to verified after #241 merges + deploys AND the live full-loop smoke passes on the deployed instance (kept in the same seven-contract set per review).",
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
    evidence: "Phase 1.5b LLM extraction pipeline (#240): per-doc-type extractors, classification with confidence, quality flags routed to the human-review lane; output NEVER writes — applying metadata is an Approval-Queue-gated write. LIVE 09-11: /api/vault/extract returns fail-closed {\"error\":\"not-configured\"} — LLM layer disabled in this deployment, so extraction EXECUTION is not yet live-verifiable (no write, no data). Flips to verified once the LLM layer is enabled and a live extract smoke produces a human-review-lane record.",
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
    evidence: "Versioned blob download streamed tenant-scoped with an audit entry per download. LIVE-PROVEN 09-11 (deployed ab69e5c): GET /api/vault/download returned 200, Content-Type application/pdf, X-Vault-Version 1, Content-Length 458 — bytes byte-identical to the uploaded file (cmp). Cross-tenant: tenant B GET on A docId → 404 Document not found. FLIP GATE: flips to verified after #241 merges + deploys AND the live full-loop smoke passes on the deployed instance (kept in the same seven-contract set per review).",
  }),
];