import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const CUSTOMER_SUCCESS_EMPLOYEE_ID = "customer_success";
export const INTERCOM_PROVIDER_ID = "intercom";

export const customerSuccessCapabilities: ReadonlyArray<CapabilityContract> = [
  /* ── understand (read) ── */
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-read-conversations",
    kind: "understand",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable",
    evidence: "Intercom provider module exposes conversation read capability; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-read-contacts",
    kind: "understand",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-read-companies",
    kind: "understand",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-read-conversation",
    kind: "understand",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable",
    evidence: "Intercom provider module exposes single-conversation read capability; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-read-contact",
    kind: "understand",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable",
    evidence: "Intercom provider module exposes single-contact read capability; authorized tenant evidence is pending.",
  }),
  /* ── automate (write) ── */
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-send-message",
    kind: "automate",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: true, retryPolicy: "bounded", rollback: "available",
    evidence: "Intercom provider module exposes message send capability; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-assign-conversation",
    kind: "automate",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: true, retryPolicy: "bounded", rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-tag-user",
    kind: "automate",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: true, retryPolicy: "bounded", rollback: "available",
    evidence: "Provider adapter path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-create-contact",
    kind: "automate",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: true, retryPolicy: "bounded", rollback: "available",
    evidence: "Intercom provider module exposes contact creation capability; authorized write, idempotency, and rollback evidence is pending.",
  }),
  /* ── monitor ── */
  defineCapabilityContract({
    employeeId: CUSTOMER_SUCCESS_EMPLOYEE_ID,
    capabilityId: "intercom-monitor-conversations",
    kind: "monitor",
    status: "unverified",
    providerId: INTERCOM_PROVIDER_ID,
    tenantScoped: true, authRequired: true, auditRequired: true,
    idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable",
    evidence: "Intercom provider module exposes conversation monitoring capability; authorized tenant evidence is pending.",
  }),
];

export interface CustomerSuccessAdapter {
  readConversations(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  readContacts(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  readCompanies(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  readConversation(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  readContact(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
  sendMessage(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  assignConversation(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  tagUser(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  createContact(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  monitorConversations(tenantId: string, input?: Record<string, unknown>): Promise<unknown>;
}

export interface CustomerSuccessExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}

function requireTenant(options: CustomerSuccessExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }

async function executeRead(
  capabilityId: string, fn: () => Promise<unknown>,
  options: CustomerSuccessExecutionOptions,
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

async function executeWrite(
  capabilityId: string, fn: () => Promise<unknown>,
  options: CustomerSuccessExecutionOptions, idempotencyKey: string,
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

export async function readConversations(adapter: CustomerSuccessAdapter, options: CustomerSuccessExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead("intercom-read-conversations", () => adapter.readConversations(options.tenantId, input), options);
}
export async function readContacts(adapter: CustomerSuccessAdapter, options: CustomerSuccessExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead("intercom-read-contacts", () => adapter.readContacts(options.tenantId, input), options);
}
export async function readCompanies(adapter: CustomerSuccessAdapter, options: CustomerSuccessExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead("intercom-read-companies", () => adapter.readCompanies(options.tenantId, input), options);
}
export async function readConversation(adapter: CustomerSuccessAdapter, options: CustomerSuccessExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead("intercom-read-conversation", () => adapter.readConversation(options.tenantId, input), options);
}
export async function readContact(adapter: CustomerSuccessAdapter, options: CustomerSuccessExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead("intercom-read-contact", () => adapter.readContact(options.tenantId, input), options);
}
export async function sendMessage(adapter: CustomerSuccessAdapter, input: Record<string, unknown>, options: CustomerSuccessExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return executeWrite("intercom-send-message", () => adapter.sendMessage(options.tenantId, input, idempotencyKey), options, idempotencyKey);
}
export async function assignConversation(adapter: CustomerSuccessAdapter, input: Record<string, unknown>, options: CustomerSuccessExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return executeWrite("intercom-assign-conversation", () => adapter.assignConversation(options.tenantId, input, idempotencyKey), options, idempotencyKey);
}
export async function tagUser(adapter: CustomerSuccessAdapter, input: Record<string, unknown>, options: CustomerSuccessExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return executeWrite("intercom-tag-user", () => adapter.tagUser(options.tenantId, input, idempotencyKey), options, idempotencyKey);
}
export async function createContact(adapter: CustomerSuccessAdapter, input: Record<string, unknown>, options: CustomerSuccessExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return executeWrite("intercom-create-contact", () => adapter.createContact(options.tenantId, input, idempotencyKey), options, idempotencyKey);
}
export async function monitorConversations(adapter: CustomerSuccessAdapter, options: CustomerSuccessExecutionOptions, input?: Record<string, unknown>): Promise<unknown> {
  return executeRead("intercom-monitor-conversations", () => adapter.monitorConversations(options.tenantId, input), options);
}
