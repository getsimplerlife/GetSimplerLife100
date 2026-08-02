import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const CUSTOMER_SUCCESS_EMPLOYEE_ID = "customer_success";
export const INTERCOM_PROVIDER_ID = "intercom";
export const customerSuccessCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID, capabilityId: "intercom-read-conversations", kind: "understand", status: "unverified", providerId: INTERCOM_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Intercom provider module exposes conversation read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID, capabilityId: "intercom-send-message", kind: "automate", status: "unverified", providerId: INTERCOM_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Intercom provider module exposes message send capability; authorized write, idempotency, and rollback evidence is pending." }),
];
export interface CustomerSuccessAdapter { listConversations(tenantId: string): Promise<unknown>; sendMessage(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; }
export interface CustomerSuccessExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: CustomerSuccessExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readConversations(adapter: CustomerSuccessAdapter, options: CustomerSuccessExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.listConversations(options.tenantId); await options.audit({capabilityId:"intercom-read-conversations",tenantId:options.tenantId,outcome:"succeeded"}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"intercom-read-conversations",tenantId:options.tenantId,outcome:"failed"}); throw lastError; }
export async function sendMessage(adapter: CustomerSuccessAdapter, input: Record<string, unknown>, options: CustomerSuccessExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.sendMessage(options.tenantId,input,idempotencyKey); await options.audit({capabilityId:"intercom-send-message",tenantId:options.tenantId,outcome:"succeeded",idempotencyKey}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"intercom-send-message",tenantId:options.tenantId,outcome:"failed",idempotencyKey}); throw lastError; }


// Phase 1b extended capabilities
export const customerSuccessCapabilitiesExtended: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-read-contacts",
    kind: "understand",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-read-companies",
    kind: "understand",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-assign-conversation",
    kind: "automate",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-tag-user",
    kind: "automate",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider evidence for this capability is pending.",
  }),
];
export interface CustomerSuccessExtendedAdapter {
  readContacts(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readCompanies(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  assignConversation(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  tagUser(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  executeExtendedCapability?(capabilityId: string, tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
}
export async function executeExtendedCapability(adapter: CustomerSuccessExtendedAdapter, capabilityId: string, options: { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; input?: Record<string, unknown>; idempotencyKey?: string; }): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  const write = new Set(["intercom-assign-conversation", "tag-user"]);
  if (write.has(capabilityId) && !options.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const method = capabilityId.replace(/^intercom-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const named = (adapter as any)[method];
  const fn = named ?? adapter.executeExtendedCapability;
  if (typeof fn !== "function") throw new Error("Unsupported capability");
  try { const result = named ? await fn.call(adapter, options.tenantId, options.input, options.idempotencyKey) : await fn.call(adapter, capabilityId, options.tenantId, options.input, options.idempotencyKey); await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); return result; }
  catch (error) { await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); throw error; }
}
