import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const IT_OPERATIONS_EMPLOYEE_ID = "it_operations";
export const SERVICENOW_PROVIDER_ID = "servicenow";
export const itOperationsCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: IT_OPERATIONS_EMPLOYEE_ID, capabilityId: "servicenow-read-incidents", kind: "understand", status: "unverified", providerId: SERVICENOW_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "ServiceNow provider module exposes incident read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: IT_OPERATIONS_EMPLOYEE_ID, capabilityId: "servicenow-create-incident", kind: "automate", status: "unverified", providerId: SERVICENOW_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "ServiceNow provider module exposes incident creation capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({
    employeeId: IT_OPERATIONS_EMPLOYEE_ID,
    capabilityId: "servicenow-read-change-requests",
    kind: "understand",
    status: "unverified",
    providerId: SERVICENOW_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: IT_OPERATIONS_EMPLOYEE_ID,
    capabilityId: "servicenow-read-problems",
    kind: "understand",
    status: "unverified",
    providerId: SERVICENOW_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: IT_OPERATIONS_EMPLOYEE_ID,
    capabilityId: "servicenow-read-cmdb-assets",
    kind: "understand",
    status: "unverified",
    providerId: SERVICENOW_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: IT_OPERATIONS_EMPLOYEE_ID,
    capabilityId: "servicenow-update-incident-severity",
    kind: "automate",
    status: "unverified",
    providerId: SERVICENOW_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: IT_OPERATIONS_EMPLOYEE_ID,
    capabilityId: "servicenow-update-incident-assignment",
    kind: "automate",
    status: "unverified",
    providerId: SERVICENOW_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
];
export interface ItOperationsAdapter { listIncidents(tenantId: string): Promise<unknown>; createIncident(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; 
  readChangeRequests(tenantId: string): Promise<unknown>;
  readProblems(tenantId: string): Promise<unknown>;
  readCmdbAssets(tenantId: string): Promise<unknown>;
  updateIncidentSeverity(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  updateIncidentAssignment(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;}
export interface ItOperationsExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: ItOperationsExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readIncidents(adapter: ItOperationsAdapter, options: ItOperationsExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.listIncidents(options.tenantId); await options.audit({capabilityId:"servicenow-read-incidents",tenantId:options.tenantId,outcome:"succeeded"}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"servicenow-read-incidents",tenantId:options.tenantId,outcome:"failed"}); throw lastError; }
export async function createIncident(adapter: ItOperationsAdapter, input: Record<string, unknown>, options: ItOperationsExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.createIncident(options.tenantId,input,idempotencyKey); await options.audit({capabilityId:"servicenow-create-incident",tenantId:options.tenantId,outcome:"succeeded",idempotencyKey}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"servicenow-create-incident",tenantId:options.tenantId,outcome:"failed",idempotencyKey}); throw lastError; }


export async function readChangeRequests(adapter: ItOperationsAdapter, options: ItOperationsExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readChangeRequests(options.tenantId);
  await options.audit({ capabilityId: "servicenow-read-change-requests", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readProblems(adapter: ItOperationsAdapter, options: ItOperationsExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readProblems(options.tenantId);
  await options.audit({ capabilityId: "servicenow-read-problems", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readCmdbAssets(adapter: ItOperationsAdapter, options: ItOperationsExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readCmdbAssets(options.tenantId);
  await options.audit({ capabilityId: "servicenow-read-cmdb-assets", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function updateIncidentSeverity(adapter: ItOperationsAdapter, options: ItOperationsExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  const result = await adapter.updateIncidentSeverity(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "servicenow-update-incident-severity", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}


export async function updateIncidentAssignment(adapter: ItOperationsAdapter, options: ItOperationsExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  const result = await adapter.updateIncidentAssignment(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "servicenow-update-incident-assignment", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}
