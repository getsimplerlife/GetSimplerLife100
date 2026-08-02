import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const LOGISTICS_EMPLOYEE_ID = "logistics";
export const ONFLEET_PROVIDER_ID = "onfleet";
export const logisticsCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: LOGISTICS_EMPLOYEE_ID, capabilityId: "onfleet-read-tasks", kind: "understand", status: "unverified", providerId: ONFLEET_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Onfleet provider module exposes delivery-task read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: LOGISTICS_EMPLOYEE_ID, capabilityId: "onfleet-create-task", kind: "automate", status: "unverified", providerId: ONFLEET_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Onfleet provider module exposes delivery-task creation capability; authorized write, idempotency, and rollback evidence is pending." }),
];
export interface LogisticsAdapter { listTasks(tenantId: string): Promise<unknown>; createTask(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; }
export interface LogisticsExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: LogisticsExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readTasks(adapter: LogisticsAdapter, options: LogisticsExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.listTasks(options.tenantId); await options.audit({capabilityId:"onfleet-read-tasks",tenantId:options.tenantId,outcome:"succeeded"}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"onfleet-read-tasks",tenantId:options.tenantId,outcome:"failed"}); throw lastError; }
export async function createTask(adapter: LogisticsAdapter, input: Record<string, unknown>, options: LogisticsExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.createTask(options.tenantId,input,idempotencyKey); await options.audit({capabilityId:"onfleet-create-task",tenantId:options.tenantId,outcome:"succeeded",idempotencyKey}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"onfleet-create-task",tenantId:options.tenantId,outcome:"failed",idempotencyKey}); throw lastError; }


// Phase 1b extended capabilities
export const logisticsCapabilitiesExtended: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-read-workers",
    kind: "understand",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-read-teams",
    kind: "understand",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-update-task-status",
    kind: "automate",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-read-routes",
    kind: "understand",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
];
export interface LogisticsExtendedAdapter {
  readWorkers(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readTeams(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  updateTaskStatus(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readRoutes(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  executeExtendedCapability?(capabilityId: string, tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
}
export async function executeExtendedCapability(adapter: LogisticsExtendedAdapter, capabilityId: string, options: { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; input?: Record<string, unknown>; idempotencyKey?: string; }): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  const write = new Set(["onfleet-update-task-status"]);
  if (write.has(capabilityId) && !options.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const method = capabilityId.replace(/^onfleet-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const named = (adapter as any)[method];
  const fn = named ?? adapter.executeExtendedCapability;
  if (typeof fn !== "function") throw new Error("Unsupported capability");
  try { const result = named ? await fn.call(adapter, options.tenantId, options.input, options.idempotencyKey) : await fn.call(adapter, capabilityId, options.tenantId, options.input, options.idempotencyKey); await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); return result; }
  catch (error) { await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); throw error; }
}
