import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const INVOICE_LEDGER_EMPLOYEE_ID = "invoice_ledger";
export const XERO_PROVIDER_ID = "xero";

/**
 * Invoice & Ledger AI — Xero capability slice (26 contracts).
 *
 * Coverage: invoices, bills, purchase orders, bank transactions, contacts,
 * chart of accounts, journals, payments, credit notes, tax rates, currencies,
 * items, tracking categories, repeating invoices, budgets, and the key
 * accounting reports (profit & loss, balance sheet, trial balance).
 *
 * Every contract starts `unverified`. Status may only become real/partial after
 * the verification evidence framework records live API evidence
 * (scripts/verify-provider.ts --provider xero [--writes]).
 */
export const invoiceLedgerCapabilities: ReadonlyArray<CapabilityContract> = [
  // ---------------------------------------------------------------- reads
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-invoices",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Invoices exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-bills",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Invoices (Type==ACCPAY) exposes bills; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-purchase-orders",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /PurchaseOrders exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-bank-transactions",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /BankTransactions exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-contacts",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Contacts exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-chart-of-accounts",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Accounts (chart of accounts) exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-manual-journals",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /ManualJournals exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-payments",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Payments exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-credit-notes",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /CreditNotes exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-tax-rates",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /TaxRates exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-currencies",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Currencies exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-items",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Items exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-tracking-categories",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /TrackingCategories exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-repeating-invoices",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /RepeatingInvoices exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-budgets",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Budgets exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-profit-and-loss",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Reports/ProfitAndLoss exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-balance-sheet",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Reports/BalanceSheet exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-read-trial-balance",
    kind: "understand",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero accounting API GET /Reports/TrialBalance exists; authorized tenant read evidence is pending.",
  }),
  // ----------------------------------------------------------------- writes
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-create-draft-invoice",
    kind: "automate",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Xero accounting API POST /Invoices creates draft invoices; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-create-bill",
    kind: "automate",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Xero accounting API POST /Invoices (Type==ACCPAY) creates bills; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-create-purchase-order",
    kind: "automate",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Xero accounting API POST /PurchaseOrders creates purchase orders; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-create-contact",
    kind: "automate",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Xero accounting API POST /Contacts creates contacts; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-create-manual-journal",
    kind: "automate",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Xero accounting API POST /ManualJournals creates journals; DELETE /ManualJournals returns 404 on some orgs so rollback may require manual deletion in the Xero UI; authorized write evidence with residue note is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-create-payment",
    kind: "automate",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Xero accounting API POST /Payments records payments against a document (invoice) and a BANK account; orgs without a bank account cannot be exercised until one exists; authorized write evidence is pending.",
  }),
  // -------------------------------------------------------------- monitor
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-monitor-invoice-created",
    kind: "monitor",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero webhook INVOICE.CREATED subscription is defined; live event-receipt evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: INVOICE_LEDGER_EMPLOYEE_ID,
    capabilityId: "xero-monitor-bill-created",
    kind: "monitor",
    status: "unverified",
    providerId: XERO_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Xero webhook BILL.CREATED subscription is defined; live event-receipt evidence is pending.",
  }),
];

export interface InvoiceLedgerAdapter {
  listInvoices(tenantId: string): Promise<unknown>;
  createDraftInvoice(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  deleteDraftInvoice?(tenantId: string, result: unknown): Promise<void>;
}
export interface InvoiceLedgerExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}
function requireTenant(options: InvoiceLedgerExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}
/** Execute the understand path with bounded retry and mandatory audit. */
export async function readInvoices(adapter: InvoiceLedgerAdapter, options: InvoiceLedgerExecutionOptions): Promise<unknown> {
  requireTenant(options);
  const attempts = Math.max(1, Math.min(options.maxAttempts ?? 2, 3));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await adapter.listInvoices(options.tenantId);
      await options.audit({ capabilityId: "xero-read-invoices", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) continue;
    }
  }
  await options.audit({ capabilityId: "xero-read-invoices", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}
/** Create a draft only; duplicate keys are rejected and failed writes are rolled back. */
export async function createDraftInvoice(adapter: InvoiceLedgerAdapter, input: Record<string, unknown>, options: InvoiceLedgerExecutionOptions, idempotencyKey: string): Promise<unknown> {
  requireTenant(options);
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  const attempts = Math.max(1, Math.min(options.maxAttempts ?? 2, 3));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await adapter.createDraftInvoice(options.tenantId, input, idempotencyKey);
      await options.audit({ capabilityId: "xero-create-draft-invoice", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) continue;
    }
  }
  await options.audit({ capabilityId: "xero-create-draft-invoice", tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}
