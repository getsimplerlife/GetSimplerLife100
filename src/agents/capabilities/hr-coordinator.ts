import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const HR_COORDINATOR_EMPLOYEE_ID = "hr_coordinator";
export const WORKDAY_PROVIDER_ID = "workday";
export const hrCoordinatorCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: HR_COORDINATOR_EMPLOYEE_ID, capabilityId: "workday-read-employees", kind: "understand", status: "unverified", providerId: WORKDAY_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Workday provider module exposes employee read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: HR_COORDINATOR_EMPLOYEE_ID, capabilityId: "workday-update-employee", kind: "automate", status: "unverified", providerId: WORKDAY_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Workday provider module exposes employee update capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({ employeeId: HR_COORDINATOR_EMPLOYEE_ID, capabilityId: "workday-read-org-chart", kind: "understand", status: "unverified", providerId: WORKDAY_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),  defineCapabilityContract({ employeeId: HR_COORDINATOR_EMPLOYEE_ID, capabilityId: "workday-read-time-off", kind: "understand", status: "unverified", providerId: WORKDAY_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),  defineCapabilityContract({ employeeId: HR_COORDINATOR_EMPLOYEE_ID, capabilityId: "workday-initiate-onboarding", kind: "automate", status: "unverified", providerId: WORKDAY_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),];
export interface HrCoordinatorAdapter { listEmployees(tenantId: string): Promise<unknown>; updateEmployee(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; }
export interface HrCoordinatorExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: HrCoordinatorExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readEmployees(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.listEmployees(options.tenantId); await options.audit({ capabilityId: "workday-read-employees", tenantId: options.tenantId, outcome: "succeeded" }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "workday-read-employees", tenantId: options.tenantId, outcome: "failed" }); throw lastError; }
export async function updateEmployee(adapter: HrCoordinatorAdapter, input: Record<string, unknown>, options: HrCoordinatorExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.updateEmployee(options.tenantId, input, idempotencyKey); await options.audit({ capabilityId: "workday-update-employee", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "workday-update-employee", tenantId: options.tenantId, outcome: "failed", idempotencyKey }); throw lastError; }


export interface ExtendedCapabilityAdapter {
  readOrgChart?(tenantId: string): Promise<unknown>;
  readTimeOff?(tenantId: string): Promise<unknown>;
  initiateOnboarding?(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  read?(capabilityId: string, tenantId: string): Promise<unknown>;
  write?(capabilityId: string, tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
}
export interface ExtendedExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
export async function executeExtendedCapability(adapter: ExtendedCapabilityAdapter, capabilityId: string, options: ExtendedExecutionOptions, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  const write = capabilityId.includes("create-") || capabilityId.includes("update-") || capabilityId.includes("initiate-") || capabilityId.includes("link-") || capabilityId.includes("transition-") || capabilityId.includes("upload-");
  if (write && !idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const attempts = Math.max(1, Math.min(options.maxAttempts ?? 2, 3)); let lastError: unknown;
  for (let attempt=0; attempt<attempts; attempt++) try {
    const fn = write ? adapter.write : adapter.read; if (!fn) throw new Error("Capability adapter method is unavailable");
    const result = write ? await fn(capabilityId, options.tenantId, input ?? {}, idempotencyKey!) : await fn(capabilityId, options.tenantId);
    await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", ...(write ? { idempotencyKey } : {}) }); return result;
  } catch (error) { lastError=error; }
  await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", ...(write ? { idempotencyKey } : {}) }); throw lastError;
}

export async function readOrgChart(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readOrgChart) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readOrgChart!(tenant) }, "workday-read-org-chart", options);
}

export async function readTimeOff(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readTimeOff) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readTimeOff!(tenant) }, "workday-read-time-off", options);
}

export async function initiateOnboarding(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!adapter.initiateOnboarding) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ write: (_id, tenant, data, key) => adapter.initiateOnboarding!(tenant, data, key) }, "workday-initiate-onboarding", options, input, idempotencyKey);
}
