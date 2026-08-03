import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const FINANCE_EMPLOYEE_ID = "finance";
export const QUICKBOOKS_PROVIDER_ID = "quickbooks-online";

export const financeCapabilities: ReadonlyArray<CapabilityContract> = [
  /* ── understand (read) ── */
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-read-transactions",
    kind: "understand",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "QuickBooks Online provider module exposes transaction read capability; authorized tenant read evidence is pending.",
  }),
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
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
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
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
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
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
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
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-read-customers",
    kind: "understand",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "QuickBooks Online provider module exposes customer read capability; authorized tenant read evidence is pending.",
  }),
  /* ── automate (write) ── */
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-create-invoice",
    kind: "automate",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "QuickBooks Online provider module exposes invoice creation capability; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-create-customer",
    kind: "automate",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "QuickBooks Online provider module exposes customer creation capability; authorized write, idempotency, and rollback evidence is pending.",
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
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  /* ── monitor ── */
  defineCapabilityContract({
    employeeId: FINANCE_EMPLOYEE_ID,
    capabilityId: "quickbooks-monitor-transactions",
    kind: "monitor",
    status: "unverified",
    providerId: QUICKBOOKS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "QuickBooks Online provider module exposes transaction monitoring capability; authorized tenant evidence is pending.",
  }),
];

export interface FinanceAdapter {
  readTransactions(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  readChartOfAccounts(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  readProfitLoss(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  readBalanceSheet(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  readBills(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  readCustomers(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  createInvoice(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  createCustomer(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  reconcileBankFeed(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  monitorTransactions(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
}

export interface FinanceExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}

function requireTenant(options: FinanceExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }

/** Execute a read capability with retry and audit. */
async function executeRead(
  adapter: FinanceAdapter,
  capabilityId: string,
  fn: () => Promise<unknown>,
  options: FinanceExecutionOptions,
): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await fn();
      await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

/** Execute a write capability with retry, audit, and idempotency. */
async function executeWrite(
  adapter: FinanceAdapter,
  capabilityId: string,
  fn: () => Promise<unknown>,
  options: FinanceExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  requireTenant(options);
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await fn();
      await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}

export async function readTransactions(adapter: FinanceAdapter, options: FinanceExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead(adapter, "quickbooks-read-transactions", () => adapter.readTransactions(options.tenantId, input), options);
}
export async function readChartOfAccounts(adapter: FinanceAdapter, options: FinanceExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead(adapter, "quickbooks-read-chart-of-accounts", () => adapter.readChartOfAccounts(options.tenantId, input), options);
}
export async function readProfitLoss(adapter: FinanceAdapter, options: FinanceExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead(adapter, "quickbooks-read-profit-loss", () => adapter.readProfitLoss(options.tenantId, input), options);
}
export async function readBalanceSheet(adapter: FinanceAdapter, options: FinanceExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead(adapter, "quickbooks-read-balance-sheet", () => adapter.readBalanceSheet(options.tenantId, input), options);
}
export async function readBills(adapter: FinanceAdapter, options: FinanceExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead(adapter, "quickbooks-read-bills", () => adapter.readBills(options.tenantId, input), options);
}
export async function readCustomers(adapter: FinanceAdapter, options: FinanceExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead(adapter, "quickbooks-read-customers", () => adapter.readCustomers(options.tenantId, input), options);
}
export async function createInvoice(adapter: FinanceAdapter, input: Record<string, unknown>, options: FinanceExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return executeWrite(adapter, "quickbooks-create-invoice", () => adapter.createInvoice(options.tenantId, input, idempotencyKey), options, idempotencyKey);
}
export async function createCustomer(adapter: FinanceAdapter, input: Record<string, unknown>, options: FinanceExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return executeWrite(adapter, "quickbooks-create-customer", () => adapter.createCustomer(options.tenantId, input, idempotencyKey), options, idempotencyKey);
}
export async function reconcileBankFeed(adapter: FinanceAdapter, input: Record<string, unknown>, options: FinanceExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return executeWrite(adapter, "quickbooks-reconcile-bank-feed", () => adapter.reconcileBankFeed(options.tenantId, input, idempotencyKey), options, idempotencyKey);
}
export async function monitorTransactions(adapter: FinanceAdapter, options: FinanceExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead(adapter, "quickbooks-monitor-transactions", () => adapter.monitorTransactions(options.tenantId, input), options);
}
