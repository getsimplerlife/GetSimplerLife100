import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const ANALYTICS_EMPLOYEE_ID = "analytics";
export const TABLEAU_PROVIDER_ID = "tableau";
export const analyticsCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: ANALYTICS_EMPLOYEE_ID, capabilityId: "tableau-read-reports", kind: "understand", status: "unverified", providerId: TABLEAU_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Tableau provider module exposes report and dashboard read capability; authorized tenant read evidence is pending." }),
];
export interface AnalyticsAdapter { listReports(tenantId: string): Promise<unknown>; }
export interface AnalyticsExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: AnalyticsExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readReports(adapter: AnalyticsAdapter, options: AnalyticsExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.listReports(options.tenantId); await options.audit({ capabilityId: "tableau-read-reports", tenantId: options.tenantId, outcome: "succeeded" }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "tableau-read-reports", tenantId: options.tenantId, outcome: "failed" }); throw lastError; }
