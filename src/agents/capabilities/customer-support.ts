import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const CUSTOMER_SUPPORT_EMPLOYEE_ID = "customer_support";
export const ZENDESK_PROVIDER_ID = "zendesk";
export const customerSupportCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: CUSTOMER_SUPPORT_EMPLOYEE_ID, capabilityId: "zendesk-read-tickets", kind: "understand", status: "unverified", providerId: ZENDESK_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Zendesk provider module exposes ticket read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: CUSTOMER_SUPPORT_EMPLOYEE_ID, capabilityId: "zendesk-reply-ticket", kind: "automate", status: "unverified", providerId: ZENDESK_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Zendesk provider module exposes ticket reply capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUPPORT_EMPLOYEE_ID,
    capabilityId: "zendesk-read-ticket-fields",
    kind: "understand",
    status: "unverified",
    providerId: ZENDESK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter capability path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUPPORT_EMPLOYEE_ID,
    capabilityId: "zendesk-update-ticket-status",
    kind: "automate",
    status: "unverified",
    providerId: ZENDESK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter capability path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUPPORT_EMPLOYEE_ID,
    capabilityId: "zendesk-read-knowledge-base",
    kind: "understand",
    status: "unverified",
    providerId: ZENDESK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter capability path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: CUSTOMER_SUPPORT_EMPLOYEE_ID,
    capabilityId: "zendesk-monitor-ticket-created",
    kind: "monitor",
    status: "unverified",
    providerId: ZENDESK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter capability path exists; authorized tenant evidence is pending.",
  }),
];
export interface CustomerSupportAdapter { listTickets(tenantId: string): Promise<unknown>; replyTicket(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; }
export interface CustomerSupportExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: CustomerSupportExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readTickets(adapter: CustomerSupportAdapter, options: CustomerSupportExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.listTickets(options.tenantId); await options.audit({ capabilityId: "zendesk-read-tickets", tenantId: options.tenantId, outcome: "succeeded" }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "zendesk-read-tickets", tenantId: options.tenantId, outcome: "failed" }); throw lastError; }
export async function replyToTicket(adapter: CustomerSupportAdapter, input: Record<string, unknown>, options: CustomerSupportExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.replyTicket(options.tenantId, input, idempotencyKey); await options.audit({ capabilityId: "zendesk-reply-ticket", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "zendesk-reply-ticket", tenantId: options.tenantId, outcome: "failed", idempotencyKey }); throw lastError; }


export interface ExtendedCapabilityAdapter {
  readTicketFields?(tenantId: string): Promise<unknown>;
  updateTicketStatus?(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  readKnowledgeBase?(tenantId: string): Promise<unknown>;
  monitorTicketCreated?(tenantId: string): Promise<unknown>;
  read?(capabilityId: string, tenantId: string): Promise<unknown>;
  write?(capabilityId: string, tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
}
export interface ExtendedExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}
export async function executeExtendedCapability(
  adapter: ExtendedCapabilityAdapter,
  capabilityId: string,
  options: ExtendedExecutionOptions,
  input?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  const write = capabilityId.includes("create-")
    || capabilityId.includes("update-")
    || capabilityId.includes("initiate-")
    || capabilityId.includes("link-")
    || capabilityId.includes("transition-")
    || capabilityId.includes("upload-");
  if (write && !idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const attempts = Math.max(1, Math.min(options.maxAttempts ?? 2, 3));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const fn = write ? adapter.write : adapter.read;
      if (!fn) throw new Error("Capability adapter method is unavailable");
      const result = write
        ? await fn(capabilityId, options.tenantId, input ?? {}, idempotencyKey!)
        : await fn(capabilityId, options.tenantId);
      await options.audit({
        capabilityId,
        tenantId: options.tenantId,
        outcome: "succeeded",
        ...(write ? { idempotencyKey } : {}),
      });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({
    capabilityId,
    tenantId: options.tenantId,
    outcome: "failed",
    ...(write ? { idempotencyKey } : {}),
  });
  throw lastError;
}

export async function readTicketFields(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readTicketFields) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readTicketFields!(tenant) }, "zendesk-read-ticket-fields", options);
}

export async function updateTicketStatus(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!adapter.updateTicketStatus) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ write: (_id, tenant, data, key) => adapter.updateTicketStatus!(tenant, data, key) }, "zendesk-update-ticket-status", options, input, idempotencyKey);
}

export async function readKnowledgeBase(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readKnowledgeBase) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readKnowledgeBase!(tenant) }, "zendesk-read-knowledge-base", options);
}

export async function monitorTicketCreated(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.monitorTicketCreated) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.monitorTicketCreated!(tenant) }, "zendesk-monitor-ticket-created", options);
}
