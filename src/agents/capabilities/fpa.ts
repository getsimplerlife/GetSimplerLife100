import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const FPA_EMPLOYEE_ID = "fpa";
export const ANAPLAN_PROVIDER_ID = "anaplan";
export const fpaCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: FPA_EMPLOYEE_ID, capabilityId: "anaplan-read-budgets", kind: "understand", status: "unverified", providerId: ANAPLAN_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Anaplan provider module exposes budget read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: FPA_EMPLOYEE_ID, capabilityId: "anaplan-create-forecast", kind: "automate", status: "unverified", providerId: ANAPLAN_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Anaplan provider module exposes forecast creation capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({
    employeeId: FPA_EMPLOYEE_ID,
    capabilityId: "anaplan-read-models",
    kind: "understand",
    status: "unverified",
    providerId: ANAPLAN_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: FPA_EMPLOYEE_ID,
    capabilityId: "anaplan-read-modules",
    kind: "understand",
    status: "unverified",
    providerId: ANAPLAN_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: FPA_EMPLOYEE_ID,
    capabilityId: "anaplan-read-actuals-vs-budget",
    kind: "understand",
    status: "unverified",
    providerId: ANAPLAN_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: FPA_EMPLOYEE_ID,
    capabilityId: "anaplan-update-forecast-assumptions",
    kind: "automate",
    status: "unverified",
    providerId: ANAPLAN_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: FPA_EMPLOYEE_ID,
    capabilityId: "anaplan-read-scenarios",
    kind: "understand",
    status: "unverified",
    providerId: ANAPLAN_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
];
export interface FpaAdapter { listBudgets(tenantId: string): Promise<unknown>; createForecast(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; 
  readModels(tenantId: string): Promise<unknown>;
  readModules(tenantId: string): Promise<unknown>;
  readActualsVsBudget(tenantId: string): Promise<unknown>;
  updateForecastAssumptions(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  readScenarios(tenantId: string): Promise<unknown>;}
export interface FpaExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: FpaExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readBudgets(adapter: FpaAdapter, options: FpaExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.listBudgets(options.tenantId); await options.audit({ capabilityId: "anaplan-read-budgets", tenantId: options.tenantId, outcome: "succeeded" }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "anaplan-read-budgets", tenantId: options.tenantId, outcome: "failed" }); throw lastError; }
export async function createForecast(adapter: FpaAdapter, input: Record<string, unknown>, options: FpaExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.createForecast(options.tenantId, input, idempotencyKey); await options.audit({ capabilityId: "anaplan-create-forecast", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "anaplan-create-forecast", tenantId: options.tenantId, outcome: "failed", idempotencyKey }); throw lastError; }


export async function readModels(adapter: FpaAdapter, options: FpaExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readModels(options.tenantId);
  await options.audit({ capabilityId: "anaplan-read-models", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readModules(adapter: FpaAdapter, options: FpaExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readModules(options.tenantId);
  await options.audit({ capabilityId: "anaplan-read-modules", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function readActualsVsBudget(adapter: FpaAdapter, options: FpaExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readActualsVsBudget(options.tenantId);
  await options.audit({ capabilityId: "anaplan-read-actuals-vs-budget", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}


export async function updateForecastAssumptions(adapter: FpaAdapter, options: FpaExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  const result = await adapter.updateForecastAssumptions(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "anaplan-update-forecast-assumptions", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}


export async function readScenarios(adapter: FpaAdapter, options: FpaExecutionOptions): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  
  const result = await adapter.readScenarios(options.tenantId);
  await options.audit({ capabilityId: "anaplan-read-scenarios", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}
