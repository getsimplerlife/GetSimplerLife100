import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const MARKETING_EMPLOYEE_ID = "marketing";
export const MARKETO_PROVIDER_ID = "marketo";
export const marketingCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: MARKETING_EMPLOYEE_ID, capabilityId: "marketo-read-campaigns", kind: "understand", status: "unverified", providerId: MARKETO_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Marketo provider module exposes campaign read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: MARKETING_EMPLOYEE_ID, capabilityId: "marketo-send-email", kind: "automate", status: "unverified", providerId: MARKETO_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Marketo provider module exposes campaign email sending capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({
    employeeId: MARKETING_EMPLOYEE_ID,
    capabilityId: "marketo-read-programs",
    kind: "understand",
    status: "unverified",
    providerId: MARKETO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: MARKETING_EMPLOYEE_ID,
    capabilityId: "marketo-read-assets",
    kind: "understand",
    status: "unverified",
    providerId: MARKETO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: MARKETING_EMPLOYEE_ID,
    capabilityId: "marketo-read-lead-scores",
    kind: "understand",
    status: "unverified",
    providerId: MARKETO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: MARKETING_EMPLOYEE_ID,
    capabilityId: "marketo-add-to-list",
    kind: "automate",
    status: "unverified",
    providerId: MARKETO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: MARKETING_EMPLOYEE_ID,
    capabilityId: "marketo-add-to-nurture",
    kind: "automate",
    status: "unverified",
    providerId: MARKETO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: MARKETING_EMPLOYEE_ID,
    capabilityId: "marketo-read-email-metrics",
    kind: "understand",
    status: "unverified",
    providerId: MARKETO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
];
export interface MarketingAdapter { listCampaigns(tenantId: string): Promise<unknown>; sendEmail(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; 
  readPrograms(tenantId: string): Promise<unknown>;
  readAssets(tenantId: string): Promise<unknown>;
  readLeadScores(tenantId: string): Promise<unknown>;
  addToList(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  addToNurture(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  readEmailMetrics(tenantId: string): Promise<unknown>;}
export interface MarketingExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: MarketingExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readCampaigns(adapter: MarketingAdapter, options: MarketingExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.listCampaigns(options.tenantId); await options.audit({capabilityId:"marketo-read-campaigns",tenantId:options.tenantId,outcome:"succeeded"}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"marketo-read-campaigns",tenantId:options.tenantId,outcome:"failed"}); throw lastError; }
export async function sendEmail(adapter: MarketingAdapter, input: Record<string, unknown>, options: MarketingExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.sendEmail(options.tenantId,input,idempotencyKey); await options.audit({capabilityId:"marketo-send-email",tenantId:options.tenantId,outcome:"succeeded",idempotencyKey}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"marketo-send-email",tenantId:options.tenantId,outcome:"failed",idempotencyKey}); throw lastError; }


export async function readPrograms(adapter: MarketingAdapter, options: MarketingExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readPrograms(options.tenantId);
  await options.audit({ capabilityId: "marketo-read-programs", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readAssets(adapter: MarketingAdapter, options: MarketingExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readAssets(options.tenantId);
  await options.audit({ capabilityId: "marketo-read-assets", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readLeadScores(adapter: MarketingAdapter, options: MarketingExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readLeadScores(options.tenantId);
  await options.audit({ capabilityId: "marketo-read-lead-scores", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function addToList(adapter: MarketingAdapter, options: MarketingExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  const result = await adapter.addToList(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "marketo-add-to-list", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}


export async function addToNurture(adapter: MarketingAdapter, options: MarketingExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  const result = await adapter.addToNurture(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "marketo-add-to-nurture", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}


export async function readEmailMetrics(adapter: MarketingAdapter, options: MarketingExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readEmailMetrics(options.tenantId);
  await options.audit({ capabilityId: "marketo-read-email-metrics", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}
