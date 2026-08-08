import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const PROCUREMENT_EMPLOYEE_ID = "procurement";
export const COUPA_PROVIDER_ID = "coupa";
export const procurementCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: PROCUREMENT_EMPLOYEE_ID, capabilityId: "coupa-read-purchase-orders", kind: "understand", status: "unverified", providerId: COUPA_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Coupa provider module exposes purchase-order read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: PROCUREMENT_EMPLOYEE_ID, capabilityId: "coupa-create-purchase-order", kind: "automate", status: "unverified", providerId: COUPA_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Coupa provider module exposes purchase-order creation capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({ employeeId: PROCUREMENT_EMPLOYEE_ID, capabilityId: "coupa-monitor-purchase-orders", kind: "monitor", status: "unverified", providerId: COUPA_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Coupa provider module polls purchase orders for recent changes; authorized tenant monitor evidence is pending." }),
];
export interface ProcurementAdapter { listPurchaseOrders(tenantId: string): Promise<unknown>; createPurchaseOrder(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; /** Monitor: polls purchase orders for recent changes. */ monitorPurchaseOrders(tenantId: string): Promise<unknown>; }
export interface ProcurementExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: ProcurementExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readPurchaseOrders(adapter: ProcurementAdapter, options: ProcurementExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.listPurchaseOrders(options.tenantId); await options.audit({capabilityId:"coupa-read-purchase-orders",tenantId:options.tenantId,outcome:"succeeded"}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"coupa-read-purchase-orders",tenantId:options.tenantId,outcome:"failed"}); throw lastError; }
export async function createPurchaseOrder(adapter: ProcurementAdapter, input: Record<string, unknown>, options: ProcurementExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.createPurchaseOrder(options.tenantId,input,idempotencyKey); await options.audit({capabilityId:"coupa-create-purchase-order",tenantId:options.tenantId,outcome:"succeeded",idempotencyKey}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"coupa-create-purchase-order",tenantId:options.tenantId,outcome:"failed",idempotencyKey}); throw lastError; }
export async function monitorPurchaseOrders(adapter: ProcurementAdapter, options: ProcurementExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.monitorPurchaseOrders(options.tenantId); await options.audit({capabilityId:"coupa-monitor-purchase-orders",tenantId:options.tenantId,outcome:"succeeded"}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"coupa-monitor-purchase-orders",tenantId:options.tenantId,outcome:"failed"}); throw lastError; }


// Phase 1b extended capabilities
export const procurementCapabilitiesExtended: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({
    employeeId: PROCUREMENT_EMPLOYEE_ID,
    capabilityId: "coupa-read-suppliers",
    kind: "understand",
    status: "unverified",
    providerId: COUPA_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: PROCUREMENT_EMPLOYEE_ID,
    capabilityId: "coupa-read-receipts",
    kind: "understand",
    status: "unverified",
    providerId: COUPA_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: PROCUREMENT_EMPLOYEE_ID,
    capabilityId: "coupa-read-invoices-against-po",
    kind: "understand",
    status: "unverified",
    providerId: COUPA_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: PROCUREMENT_EMPLOYEE_ID,
    capabilityId: "coupa-read-approval-chains",
    kind: "understand",
    status: "unverified",
    providerId: COUPA_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
];
export interface ProcurementExtendedAdapter {
  readSuppliers(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readReceipts(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readInvoicesAgainstPo(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readApprovalChains(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  executeExtendedCapability?(capabilityId: string, tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
}
export async function executeExtendedCapability(adapter: ProcurementExtendedAdapter, capabilityId: string, options: { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; input?: Record<string, unknown>; idempotencyKey?: string; }): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  const write = new Set(["coupa-"]);
  if (write.has(capabilityId) && !options.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const method = capabilityId.replace(/^coupa-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const named = (adapter as any)[method];
  const fn = named ?? adapter.executeExtendedCapability;
  if (typeof fn !== "function") throw new Error("Unsupported capability");
  try { const result = named ? await fn.call(adapter, options.tenantId, options.input, options.idempotencyKey) : await fn.call(adapter, capabilityId, options.tenantId, options.input, options.idempotencyKey); await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); return result; }
  catch (error) { await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); throw error; }
}
