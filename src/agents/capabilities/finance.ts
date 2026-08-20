import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const FINANCE_EMPLOYEE_ID = "finance";
export const QUICKBOOKS_PROVIDER_ID = "quickbooks";
export const financeCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: FINANCE_EMPLOYEE_ID, capabilityId: "quickbooks-read-transactions", kind: "understand", status: "unverified", providerId: QUICKBOOKS_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "QuickBooks provider module exposes transaction read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: FINANCE_EMPLOYEE_ID, capabilityId: "quickbooks-create-invoice", kind: "automate", status: "unverified", providerId: QUICKBOOKS_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "QuickBooks provider module exposes invoice creation capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({ employeeId: FINANCE_EMPLOYEE_ID, capabilityId: "quickbooks-read-invoices", kind: "understand", status: "unverified", providerId: QUICKBOOKS_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "QBO quote-to-cash: read invoices capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: FINANCE_EMPLOYEE_ID, capabilityId: "quickbooks-read-customers", kind: "understand", status: "unverified", providerId: QUICKBOOKS_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "QBO quote-to-cash: read customers/contacts capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: FINANCE_EMPLOYEE_ID, capabilityId: "quickbooks-create-estimate", kind: "automate", status: "unverified", providerId: QUICKBOOKS_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "QBO quote-to-cash: create estimate capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({ employeeId: FINANCE_EMPLOYEE_ID, capabilityId: "quickbooks-create-customer", kind: "automate", status: "unverified", providerId: QUICKBOOKS_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "QBO quote-to-cash: create customer capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({ employeeId: FINANCE_EMPLOYEE_ID, capabilityId: "quickbooks-monitor-invoice-created", kind: "monitor", status: "unverified", providerId: QUICKBOOKS_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "QBO invoice-created monitor; requires a live Intuit webhook receipt." }),
  defineCapabilityContract({ employeeId: FINANCE_EMPLOYEE_ID, capabilityId: "quickbooks-monitor-customer-created", kind: "monitor", status: "unverified", providerId: QUICKBOOKS_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "QBO customer-created monitor; requires a live Intuit webhook receipt." }),
];
export interface FinanceAdapter { listTransactions(tenantId: string): Promise<unknown>; createInvoice(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; }
export interface FinanceExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: FinanceExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readTransactions(adapter: FinanceAdapter, options: FinanceExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.listTransactions(options.tenantId); await options.audit({capabilityId:"quickbooks-read-transactions",tenantId:options.tenantId,outcome:"succeeded"}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"quickbooks-read-transactions",tenantId:options.tenantId,outcome:"failed"}); throw lastError; }
export async function createInvoice(adapter: FinanceAdapter, input: Record<string, unknown>, options: FinanceExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.createInvoice(options.tenantId,input,idempotencyKey); await options.audit({capabilityId:"quickbooks-create-invoice",tenantId:options.tenantId,outcome:"succeeded",idempotencyKey}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"quickbooks-create-invoice",tenantId:options.tenantId,outcome:"failed",idempotencyKey}); throw lastError; }


// Phase 1b extended capabilities
export const financeCapabilitiesExtended: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-read-chart-of-accounts",
    kind: "understand",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-read-profit-loss",
    kind: "understand",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-read-balance-sheet",
    kind: "understand",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-read-bills",
    kind: "understand",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider evidence for this capability is pending.",
  }),
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-reconcile-bank-feed",
    kind: "automate",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider evidence for this capability is pending.",
  }),
];
export interface FinanceExtendedAdapter {
  readChartOfAccounts(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readProfitLoss(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readBalanceSheet(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readBills(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  reconcileBankFeed(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  executeExtendedCapability?(capabilityId: string, tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
}
export async function executeExtendedCapability(adapter: FinanceExtendedAdapter, capabilityId: string, options: { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; input?: Record<string, unknown>; idempotencyKey?: string; }): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  const write = new Set(["quickbooks-reconcile-bank-feed"]);
  if (write.has(capabilityId) && !options.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const method = capabilityId.replace(/^quickbooks-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const named = (adapter as any)[method];
  const fn = named ?? adapter.executeExtendedCapability;
  if (typeof fn !== "function") throw new Error("Unsupported capability");
  try { const result = named ? await fn.call(adapter, options.tenantId, options.input, options.idempotencyKey) : await fn.call(adapter, capabilityId, options.tenantId, options.input, options.idempotencyKey); await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); return result; }
  catch (error) { await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) }); throw error; }
}
