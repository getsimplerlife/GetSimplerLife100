/**
 * vault.ts — capability contracts for the NATIVE Document & File Intelligence
 * vault (Phase 1.5a, owner-greenlit 2026-09-10).
 *
 * providerId "vault" marks a NATIVE capability (no third-party provider).
 * Per the truthfulness gate, statuses flip to "verified" only after the slice
 * is deployed and live-verified on the deployed instance; they never claim a
 * partner-powered or self-owned rail. Every write capability is
 * approval-gated by default (Approval Queue #164) and audited immutably.
 *
 * VERIFIED 09-12: the live full-loop smoke (register → upload → file →
 * portal approve → search → download → move → archive → restore → destroy →
 * destroy-replay → unknown-id fail-closed) passed 24/24 against the DEPLOYED
 * instance (main d9bfbde, 59th publish). Seven of the eight contracts below
 * are therefore status:"real" (this repo's status literal for a live-proven
 * capability) with evidence citing the deployed sha and the 09-12 live probe.
 * `vault-document-extract` remains "unverified": the
 * LLM layer is disabled in this deployment — POST /api/vault/extract fails
 * closed {"error":"not-configured"} — so extraction execution is not yet
 * live-verifiable (no write, no data).
 */
import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const DOCUMENT_VAULT_EMPLOYEE_ID = "document_vault";
export const VAULT_PROVIDER_ID = "vault";

export const vaultCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-upload",
    kind: "automate",
    status: "real",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Native multipart intake (type allowlist + magic-byte sniffing, 25 MiB cap, sanitized filenames) → per-tenant vault bucket with content-hash dedupe; intake write itself is direct (upload is the intake verb), filing is approval-gated. LIVE-PROVEN 09-12 (deployed d9bfbde): multipart PDF upload → 200 {ok:true, mime:'application/pdf', documentId:'doc_bb29df946991997d62'}; 492-byte PDF magic-sniffed, version 1 sha256 e9271d50eaf78d…; vault.intake audit entry recorded.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-file",
    kind: "automate",
    status: "real",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Structured filing contract file(document, route); rides the Approval Queue by default (approvals ON) and the autonomy allow-list with a known doc id otherwise. LIVE-PROVEN 09-12 (deployed d9bfbde): file(doc, 'Acme Consulting/Invoices/2026') → pending + actionId (act-mtxqslnp-…) → portal approve → execution.success=true, actionType writeVaultDocument, result.ok=true; doc active at route; immutable audit shows writeVaultDocument pending + ok entries with actor/route/sha.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-move",
    kind: "automate",
    status: "real",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Re-routes an existing vault document; approval-gated, idempotent, audited. LIVE-PROVEN 09-12 (deployed d9bfbde): move(doc, 'Acme Consulting/Receipts/2026') → pending → portal approve → execution.success=true (actionType moveVaultDocument), doc re-routed from …/Invoices/2026; audit moveVaultDocument ok, detail 'Moved from Acme Consulting/Invoices/2026'. Cross-tenant: tenant B move on A docId → {ok:false, error:'Document not found'}, no pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-archive",
    kind: "automate",
    status: "real",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Retention-flag transition to archived; approval-gated; restore available. LIVE-PROVEN 09-12 (deployed d9bfbde): archive → pending → portal approve → execution.success=true (actionType archiveVaultDocument), doc status 'archived' (list includeArchived=1); unarchive → pending → approve → actionType restoreVaultDocument executed, doc status 'active' again; audit archiveVaultDocument + restoreVaultDocument ok entries.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-destroy",
    kind: "automate",
    status: "real",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Non-destructive exact-id delete: approval-gated (autonomy requires explicit allow-list + known id), never glob-delete; re-destroy of an already-destroyed exact id = audited success no-op (idempotent replay provable from the immutable audit); unknown ids fail closed. LIVE-PROVEN 09-12 (deployed d9bfbde): destroy → pending (act-mtxqsly5-…) → approve → execution.success=true, deleteVaultDocument result.ok=true; re-destroy SAME id → 200 {ok:true, unchanged:true}, pending undefined (no new approval); audit shows exactly 2 deleteVaultDocument/ok entries, the second detail 'idempotent replay — document already destroyed (prior approved destroy on record)'; never-seen id → 400 {ok:false, error:'Document not found'}, no pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-search",
    kind: "understand",
    status: "real",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: false,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Full-text search over name/route/tags/type/customer/project/text within the tenant's own vault only. LIVE-PROVEN 09-12 (deployed d9bfbde): search q=invoice returned the tenant's own doc (doc_bb29df…, name invoice-live-smoke.pdf); cross-tenant probe: tenant B search q=invoice → 0 hits.",
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
    evidence: "Phase 1.5b LLM extraction pipeline: per-doc-type extractors, classification with confidence, quality flags routed to the human-review lane; output NEVER writes — applying metadata is an Approval-Queue-gated write. LIVE-PROVEN 09-12 (deployed d9bfbde): POST /api/vault/extract fails closed 400 {ok:false, error:'not-configured', detail:'LLM layer is disabled for this deployment — extraction unavailable'} — the LLM layer is disabled in this deployment, so extraction execution is NOT yet live-verifiable (no write, no data). Flips to verified once the LLM layer is enabled and a live extract smoke produces a human-review-lane record.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-download",
    kind: "understand",
    status: "real",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Versioned blob download streamed tenant-scoped with an audit entry per download. LIVE-PROVEN 09-12 (deployed d9bfbde): GET /api/vault/download?docId=doc_bb29df… → 200, Content-Type application/pdf, X-Vault-Version 1, Content-Length 492 — byte-identical to the uploaded file; vault.download audit entry recorded. Cross-tenant: tenant B GET on A docId → 404 Document not found.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-template-library",
    kind: "automate",
    status: "real",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Phase 1.5c per-tenant template CATALOG (create / import / list / get / version / exact-id delete): strict input validation (field keys are [A-Za-z0-9_-] slugs, 64 KiB body cap, 1 MiB import cap, extension + content sniffing), add-only version history (never in-place overwrite, cap 24 + pruned-oldest audited), exact-id delete idempotent-by-audit (re-delete of an already-deleted id = audited no-op; unknown id fails closed), every mutation in the immutable vault audit. Catalog metadata never touches vault documents. LIVE-PROVEN 09-12 (deployed 764eaaf, prod PID 3472): tenant smoke5c-a-1789184718@smoke5c.local created tpl_kdfi10xagrs4w (v1) → listed → full-get → update v2 (previous 1, prior version preserved in add-only history) → delete + idempotent re-delete (unchanged:true) → unknown-id delete 400; multipart import (imp.json) accepted and listed; unauthenticated 401 on every catalog route; other-tenant template list/full-get fail closed (tenant B list shows none, full-get → 404). Deployed instance's own vault_audit.json records vaultTemplate.create/update/delete for A and zero entries for tenant B. KNOWN GAP FIXED IN THIS PR: upload provenance `vaultTemplate.import` entry now written to the immutable audit (regression-proven by vault-template-lib.test.ts).",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_VAULT_EMPLOYEE_ID,
    capabilityId: "vault-document-create",
    kind: "automate",
    status: "real",
    providerId: VAULT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Phase 1.5c NATIVE DOCUMENT CREATION: template + fields → local minimal PDF renderer (magic-byte-valid, escaped content, bounded) → intake through the SAME /api/vault intake path (sniffing + 25 MiB cap + content-hash dedupe) → optional filing on the approval-gated createVaultDocument write (Approval Queue default; autonomy only via explicit allow-list + known template id). Created docs are ordinary vault docs — file/move/archive/destroy/search/download apply unchanged. Idempotent replay provable from the immutable audit (intake dedupe + filed-on-creation entries). Cross-tenant template ids fail closed (Template not found, no pending). LIVE-PROVEN 09-12 (deployed 764eaaf, prod PID 3472): POST /api/vault/create from tpl_kdfi10xagrs4w → pending (actionId act-mtxudwe7-2xfbpfk1, actionType createVaultDocument, provider vault) → portal approve EXECUTED → documentId doc_08b3331c8d28a603cf → /api/vault/search?q=Friday finds it → /api/vault/docs lists it filed with route /acme/2026/proposals → /api/vault/download returns 921 bytes beginning %PDF-. Fail-closed live: tenant B create with A's template id → 400 {data:{ok:false,error:'Template not found'}}, no pending fabricated; unknown template id → 400; unauthenticated POST /api/vault/create → 401. Deployed instance's own vault_audit.json records createVaultDocument + vault.document.create + writeVaultDocument + vault.intake for A and zero entries for tenant B.",
  }),
];