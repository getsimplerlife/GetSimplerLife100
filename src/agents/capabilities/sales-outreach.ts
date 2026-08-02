import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const SALES_OUTREACH_EMPLOYEE_ID = "sales_outreach";
export const HUBSPOT_PROVIDER_ID = "hubspot";
export const salesOutreachCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: SALES_OUTREACH_EMPLOYEE_ID, capabilityId: "hubspot-read-contacts", kind: "understand", status: "unverified", providerId: HUBSPOT_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "HubSpot OAuth adapter and contact/deal read paths exist; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: SALES_OUTREACH_EMPLOYEE_ID, capabilityId: "hubspot-create-deal", kind: "automate", status: "unverified", providerId: HUBSPOT_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "HubSpot OAuth adapter and deal creation path exist; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({ employeeId: SALES_OUTREACH_EMPLOYEE_ID, capabilityId: "hubspot-read-companies", kind: "understand", status: "unverified", providerId: HUBSPOT_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),  defineCapabilityContract({ employeeId: SALES_OUTREACH_EMPLOYEE_ID, capabilityId: "hubspot-read-deals-pipeline", kind: "understand", status: "unverified", providerId: HUBSPOT_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),  defineCapabilityContract({ employeeId: SALES_OUTREACH_EMPLOYEE_ID, capabilityId: "hubspot-update-contact", kind: "automate", status: "unverified", providerId: HUBSPOT_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),];
export interface SalesOutreachAdapter {
  listContacts(tenantId: string): Promise<unknown>;
  createDeal(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  deleteDeal?(tenantId: string, result: unknown): Promise<void>;
}
export interface SalesOutreachExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}
function requireTenant(options: SalesOutreachExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readContacts(adapter: SalesOutreachAdapter, options: SalesOutreachExecutionOptions): Promise<unknown> {
  requireTenant(options); let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try { const result = await adapter.listContacts(options.tenantId); await options.audit({ capabilityId: "hubspot-read-contacts", tenantId: options.tenantId, outcome: "succeeded" }); return result; }
    catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "hubspot-read-contacts", tenantId: options.tenantId, outcome: "failed" }); throw lastError;
}
export async function createDeal(adapter: SalesOutreachAdapter, input: Record<string, unknown>, options: SalesOutreachExecutionOptions, idempotencyKey: string): Promise<unknown> {
  requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try { const result = await adapter.createDeal(options.tenantId, input, idempotencyKey); await options.audit({ capabilityId: "hubspot-create-deal", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey }); return result; }
    catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "hubspot-create-deal", tenantId: options.tenantId, outcome: "failed", idempotencyKey }); throw lastError;
}


export interface ExtendedCapabilityAdapter {
  readCompanies?(tenantId: string): Promise<unknown>;
  readDealsPipeline?(tenantId: string): Promise<unknown>;
  updateContact?(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
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

export async function readCompanies(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readCompanies) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readCompanies!(tenant) }, "hubspot-read-companies", options);
}

export async function readDealsPipeline(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readDealsPipeline) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readDealsPipeline!(tenant) }, "hubspot-read-deals-pipeline", options);
}

export async function updateContact(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!adapter.updateContact) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ write: (_id, tenant, data, key) => adapter.updateContact!(tenant, data, key) }, "hubspot-update-contact", options, input, idempotencyKey);
}
