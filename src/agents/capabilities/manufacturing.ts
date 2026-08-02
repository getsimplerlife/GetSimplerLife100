import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const MANUFACTURING_EMPLOYEE_ID = "manufacturing";
export const SHOPIFY_PROVIDER_ID = "shopify";
export const manufacturingCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: MANUFACTURING_EMPLOYEE_ID, capabilityId: "shopify-read-orders", kind: "understand", status: "unverified", providerId: SHOPIFY_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Shopify provider module exposes order read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: MANUFACTURING_EMPLOYEE_ID, capabilityId: "shopify-create-product", kind: "automate", status: "unverified", providerId: SHOPIFY_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Shopify provider module exposes product creation capability; authorized write, idempotency, and rollback evidence is pending." }),
];
export interface ManufacturingAdapter { listOrders(tenantId: string): Promise<unknown>; createProduct(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; }
export interface ManufacturingExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: ManufacturingExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readOrders(adapter: ManufacturingAdapter, options: ManufacturingExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.listOrders(options.tenantId); await options.audit({capabilityId:"shopify-read-orders",tenantId:options.tenantId,outcome:"succeeded"}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"shopify-read-orders",tenantId:options.tenantId,outcome:"failed"}); throw lastError; }
export async function createProduct(adapter: ManufacturingAdapter, input: Record<string, unknown>, options: ManufacturingExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.createProduct(options.tenantId,input,idempotencyKey); await options.audit({capabilityId:"shopify-create-product",tenantId:options.tenantId,outcome:"succeeded",idempotencyKey}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"shopify-create-product",tenantId:options.tenantId,outcome:"failed",idempotencyKey}); throw lastError; }


// Phase 1b extended capabilities
export const manufacturingCapabilitiesExtended: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({
    employeeId: MANUFACTURING_EMPLOYEE_ID,
    capabilityId: "shopify-read-inventory",
    kind: "understand",
    status: "unverified",
    providerId: SHOPIFY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: MANUFACTURING_EMPLOYEE_ID,
    capabilityId: "shopify-read-fulfillments",
    kind: "understand",
    status: "unverified",
    providerId: SHOPIFY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: MANUFACTURING_EMPLOYEE_ID,
    capabilityId: "shopify-update-fulfillment",
    kind: "automate",
    status: "unverified",
    providerId: SHOPIFY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: MANUFACTURING_EMPLOYEE_ID,
    capabilityId: "shopify-read-product-variants",
    kind: "understand",
    status: "unverified",
    providerId: SHOPIFY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
];
export interface ManufacturingExtendedAdapter {
  readInventory(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readFulfillments(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  updateFulfillment(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readProductVariants(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  executeExtendedCapability?(capabilityId: string, tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
}
export async function executeExtendedCapability(adapter: ManufacturingExtendedAdapter, capabilityId: string, options: { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; input?: Record<string, unknown>; idempotencyKey?: string; }): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  const write = new Set(["shopify-update-fulfillment"]);
  if (write.has(capabilityId) && !options.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const method = capabilityId.replace(/^shopify-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const named = (adapter as any)[method];
  const fn = named ?? adapter.executeExtendedCapability;
  if (typeof fn !== "function") throw new Error("Unsupported capability");
  try { const result = named ? await fn.call(adapter, options.tenantId, options.input, options.idempotencyKey) : await fn.call(adapter, capabilityId, options.tenantId, options.input, options.idempotencyKey); await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); return result; }
  catch (error) { await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); throw error; }
}
