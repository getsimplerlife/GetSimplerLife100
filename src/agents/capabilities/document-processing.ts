import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const DOCUMENT_PROCESSING_EMPLOYEE_ID = "document_processing";
export const DOCUSIGN_PROVIDER_ID = "docusign";
export const documentProcessingCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: DOCUMENT_PROCESSING_EMPLOYEE_ID, capabilityId: "docusign-read-envelopes", kind: "understand", status: "unverified", providerId: DOCUSIGN_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "DocuSign provider module exposes envelope read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: DOCUMENT_PROCESSING_EMPLOYEE_ID, capabilityId: "docusign-send-document", kind: "automate", status: "unverified", providerId: DOCUSIGN_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "DocuSign provider module exposes envelope sending capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({
    employeeId: DOCUMENT_PROCESSING_EMPLOYEE_ID,
    capabilityId: "docusign-read-templates",
    kind: "understand",
    status: "unverified",
    providerId: DOCUSIGN_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_PROCESSING_EMPLOYEE_ID,
    capabilityId: "docusign-read-bulk-envelopes",
    kind: "understand",
    status: "unverified",
    providerId: DOCUSIGN_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_PROCESSING_EMPLOYEE_ID,
    capabilityId: "docusign-check-signing-status",
    kind: "understand",
    status: "unverified",
    providerId: DOCUSIGN_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: DOCUMENT_PROCESSING_EMPLOYEE_ID,
    capabilityId: "docusign-download-signed-doc",
    kind: "understand",
    status: "unverified",
    providerId: DOCUSIGN_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
];
export interface DocumentProcessingAdapter { listEnvelopes(tenantId: string): Promise<unknown>; sendDocument(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; 
  readTemplates(tenantId: string): Promise<unknown>;
  readBulkEnvelopes(tenantId: string): Promise<unknown>;
  checkSigningStatus(tenantId: string): Promise<unknown>;
  downloadSignedDoc(tenantId: string): Promise<unknown>;}
export interface DocumentProcessingExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: DocumentProcessingExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readEnvelopes(adapter: DocumentProcessingAdapter, options: DocumentProcessingExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.listEnvelopes(options.tenantId); await options.audit({ capabilityId: "docusign-read-envelopes", tenantId: options.tenantId, outcome: "succeeded" }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "docusign-read-envelopes", tenantId: options.tenantId, outcome: "failed" }); throw lastError; }
export async function sendDocument(adapter: DocumentProcessingAdapter, input: Record<string, unknown>, options: DocumentProcessingExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.sendDocument(options.tenantId, input, idempotencyKey); await options.audit({ capabilityId: "docusign-send-document", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "docusign-send-document", tenantId: options.tenantId, outcome: "failed", idempotencyKey }); throw lastError; }


export async function readTemplates(adapter: DocumentProcessingAdapter, options: DocumentProcessingExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readTemplates(options.tenantId);
  await options.audit({ capabilityId: "docusign-read-templates", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readBulkEnvelopes(adapter: DocumentProcessingAdapter, options: DocumentProcessingExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readBulkEnvelopes(options.tenantId);
  await options.audit({ capabilityId: "docusign-read-bulk-envelopes", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function checkSigningStatus(adapter: DocumentProcessingAdapter, options: DocumentProcessingExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.checkSigningStatus(options.tenantId);
  await options.audit({ capabilityId: "docusign-check-signing-status", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function downloadSignedDoc(adapter: DocumentProcessingAdapter, options: DocumentProcessingExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.downloadSignedDoc(options.tenantId);
  await options.audit({ capabilityId: "docusign-download-signed-doc", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}
