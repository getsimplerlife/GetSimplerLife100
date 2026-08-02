import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const COMMUNICATIONS_EMPLOYEE_ID = "communications";
export const SLACK_PROVIDER_ID = "slack";
export const communicationsCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: COMMUNICATIONS_EMPLOYEE_ID, capabilityId: "slack-read-messages", kind: "understand", status: "unverified", providerId: SLACK_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Slack provider module exposes channel message read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: COMMUNICATIONS_EMPLOYEE_ID, capabilityId: "slack-send-message", kind: "automate", status: "unverified", providerId: SLACK_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Slack provider module exposes message send capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({ employeeId: COMMUNICATIONS_EMPLOYEE_ID, capabilityId: "slack-read-channels", kind: "understand", status: "unverified", providerId: SLACK_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),  defineCapabilityContract({ employeeId: COMMUNICATIONS_EMPLOYEE_ID, capabilityId: "slack-read-users", kind: "understand", status: "unverified", providerId: SLACK_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),  defineCapabilityContract({ employeeId: COMMUNICATIONS_EMPLOYEE_ID, capabilityId: "slack-upload-file", kind: "automate", status: "unverified", providerId: SLACK_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),  defineCapabilityContract({ employeeId: COMMUNICATIONS_EMPLOYEE_ID, capabilityId: "slack-search-messages", kind: "understand", status: "unverified", providerId: SLACK_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Provider adapter capability path exists; authorized tenant evidence is pending." }),];
export interface CommunicationsAdapter { listMessages(tenantId: string): Promise<unknown>; sendMessage(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; }
export interface CommunicationsExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: CommunicationsExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readMessages(adapter: CommunicationsAdapter, options: CommunicationsExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.listMessages(options.tenantId); await options.audit({capabilityId:"slack-read-messages",tenantId:options.tenantId,outcome:"succeeded"}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"slack-read-messages",tenantId:options.tenantId,outcome:"failed"}); throw lastError; }
export async function sendMessage(adapter: CommunicationsAdapter, input: Record<string, unknown>, options: CommunicationsExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt=0; attempt<boundedAttempts(options.maxAttempts); attempt++) { try { const result=await adapter.sendMessage(options.tenantId,input,idempotencyKey); await options.audit({capabilityId:"slack-send-message",tenantId:options.tenantId,outcome:"succeeded",idempotencyKey}); return result; } catch(error) { lastError=error; } } await options.audit({capabilityId:"slack-send-message",tenantId:options.tenantId,outcome:"failed",idempotencyKey}); throw lastError; }


export interface ExtendedCapabilityAdapter {
  readChannels?(tenantId: string): Promise<unknown>;
  readUsers?(tenantId: string): Promise<unknown>;
  uploadFile?(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  searchMessages?(tenantId: string): Promise<unknown>;
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

export async function readChannels(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readChannels) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readChannels!(tenant) }, "slack-read-channels", options);
}

export async function readUsers(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readUsers) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readUsers!(tenant) }, "slack-read-users", options);
}

export async function uploadFile(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!adapter.uploadFile) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ write: (_id, tenant, data, key) => adapter.uploadFile!(tenant, data, key) }, "slack-upload-file", options, input, idempotencyKey);
}

export async function searchMessages(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.searchMessages) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.searchMessages!(tenant) }, "slack-search-messages", options);
}
