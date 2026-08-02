import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const INVOICE_LEDGER_EMPLOYEE_ID = "invoice_ledger";
export const XERO_PROVIDER_ID = "xero";

/** Truthful contracts: runtime provider evidence is still required before status can be real. */
export const invoiceLedgerCapabilities: ReadonlyArray<CapabilityContract> = [
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
    evidence: "Xero OAuth adapter and GET /Invoices path exist; authorized tenant read evidence is pending.",
  }),
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
    evidence: "Xero adapter exposes POST /Invoices; authorized write, idempotency, and rollback evidence is pending.",
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
