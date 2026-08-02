import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const OPERATIONS_EMPLOYEE_ID = "operations";
export const MONDAY_PROVIDER_ID = "monday";

export const operationsCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({
    employeeId: OPERATIONS_EMPLOYEE_ID,
    capabilityId: "monday-read-boards",
    kind: "understand",
    status: "unverified",
    providerId: MONDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Monday.com provider module exposes board read capability; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: OPERATIONS_EMPLOYEE_ID,
    capabilityId: "monday-create-item",
    kind: "automate",
    status: "unverified",
    providerId: MONDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Monday.com provider module exposes item creation capability; authorized write, idempotency, and rollback evidence is pending.",
  }),
];

export interface OperationsAdapter {
  listBoards(tenantId: string): Promise<unknown>;
  createItem(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
}

export interface OperationsExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}

function requireTenant(options: OperationsExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}

function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }

export async function readBoards(adapter: OperationsAdapter, options: OperationsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.listBoards(options.tenantId);
      await options.audit({ capabilityId: "monday-read-boards", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "monday-read-boards", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

export async function createItem(adapter: OperationsAdapter, input: Record<string, unknown>, options: OperationsExecutionOptions, idempotencyKey: string): Promise<unknown> {
  requireTenant(options);
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.createItem(options.tenantId, input, idempotencyKey);
      await options.audit({ capabilityId: "monday-create-item", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "monday-create-item", tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}
