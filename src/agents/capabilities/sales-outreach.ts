import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const SALES_OUTREACH_EMPLOYEE_ID = "sales_outreach";
export const HUBSPOT_PROVIDER_ID = "hubspot";
export const salesOutreachCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: SALES_OUTREACH_EMPLOYEE_ID, capabilityId: "hubspot-read-contacts", kind: "understand", status: "unverified", providerId: HUBSPOT_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "HubSpot OAuth adapter and contact/deal read paths exist; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: SALES_OUTREACH_EMPLOYEE_ID, capabilityId: "hubspot-create-deal", kind: "automate", status: "unverified", providerId: HUBSPOT_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "HubSpot OAuth adapter and deal creation path exist; authorized write, idempotency, and rollback evidence is pending." }),
];
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
