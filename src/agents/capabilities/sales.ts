import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const SALES_EMPLOYEE_ID = "sales";
export const SALESFORCE_PROVIDER_ID = "salesforce";
export const salesCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: SALES_EMPLOYEE_ID, capabilityId: "salesforce-read-opportunities", kind: "understand", status: "unverified", providerId: SALESFORCE_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Salesforce provider module exposes opportunity read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: SALES_EMPLOYEE_ID, capabilityId: "salesforce-update-opportunity", kind: "automate", status: "unverified", providerId: SALESFORCE_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Salesforce provider module exposes opportunity update capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({
    employeeId: SALES_EMPLOYEE_ID,
    capabilityId: "salesforce-read-accounts",
    kind: "understand",
    status: "unverified",
    providerId: SALESFORCE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_EMPLOYEE_ID,
    capabilityId: "salesforce-read-contacts",
    kind: "understand",
    status: "unverified",
    providerId: SALESFORCE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_EMPLOYEE_ID,
    capabilityId: "salesforce-read-leads",
    kind: "understand",
    status: "unverified",
    providerId: SALESFORCE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_EMPLOYEE_ID,
    capabilityId: "salesforce-read-pipeline",
    kind: "understand",
    status: "unverified",
    providerId: SALESFORCE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_EMPLOYEE_ID,
    capabilityId: "salesforce-create-task",
    kind: "automate",
    status: "unverified",
    providerId: SALESFORCE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_EMPLOYEE_ID,
    capabilityId: "salesforce-create-event",
    kind: "automate",
    status: "unverified",
    providerId: SALESFORCE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_EMPLOYEE_ID,
    capabilityId: "salesforce-update-lead",
    kind: "automate",
    status: "unverified",
    providerId: SALESFORCE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_EMPLOYEE_ID,
    capabilityId: "salesforce-monitor-pipeline",
    kind: "monitor",
    status: "unverified",
    providerId: SALESFORCE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter polls opportunity pipeline; authorized tenant evidence is pending.",
  }),
];
export interface SalesAdapter { listOpportunities(tenantId: string): Promise<unknown>; updateOpportunity(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; 
  readAccounts(tenantId: string): Promise<unknown>;
  readContacts(tenantId: string): Promise<unknown>;
  readLeads(tenantId: string): Promise<unknown>;
  readPipeline(tenantId: string): Promise<unknown>;
  createTask(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  createEvent(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  updateLead(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  /** Monitor: polls the opportunity pipeline for recent changes. */ monitorPipeline(tenantId: string): Promise<unknown>; }
export interface SalesExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: SalesExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readOpportunities(adapter: SalesAdapter, options: SalesExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.listOpportunities(options.tenantId); await options.audit({ capabilityId: "salesforce-read-opportunities", tenantId: options.tenantId, outcome: "succeeded" }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "salesforce-read-opportunities", tenantId: options.tenantId, outcome: "failed" }); throw lastError; }
export async function updateOpportunity(adapter: SalesAdapter, input: Record<string, unknown>, options: SalesExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.updateOpportunity(options.tenantId, input, idempotencyKey); await options.audit({ capabilityId: "salesforce-update-opportunity", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "salesforce-update-opportunity", tenantId: options.tenantId, outcome: "failed", idempotencyKey }); throw lastError; }


export async function readAccounts(adapter: SalesAdapter, options: SalesExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readAccounts(options.tenantId);
  await options.audit({ capabilityId: "salesforce-read-accounts", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readContacts(adapter: SalesAdapter, options: SalesExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readContacts(options.tenantId);
  await options.audit({ capabilityId: "salesforce-read-contacts", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readLeads(adapter: SalesAdapter, options: SalesExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readLeads(options.tenantId);
  await options.audit({ capabilityId: "salesforce-read-leads", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readPipeline(adapter: SalesAdapter, options: SalesExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readPipeline(options.tenantId);
  await options.audit({ capabilityId: "salesforce-read-pipeline", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function createTask(adapter: SalesAdapter, options: SalesExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  const result = await adapter.createTask(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "salesforce-create-task", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}


export async function createEvent(adapter: SalesAdapter, options: SalesExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  const result = await adapter.createEvent(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "salesforce-create-event", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}


export async function updateLead(adapter: SalesAdapter, options: SalesExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  const result = await adapter.updateLead(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "salesforce-update-lead", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}

export async function monitorPipeline(adapter: SalesAdapter, options: SalesExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.monitorPipeline(options.tenantId);
      await options.audit({ capabilityId: "salesforce-monitor-pipeline", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "salesforce-monitor-pipeline", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}
