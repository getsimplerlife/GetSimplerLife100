import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const COMPLIANCE_EMPLOYEE_ID = "compliance";
export const JIRA_PROVIDER_ID = "jira";
export const complianceCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: COMPLIANCE_EMPLOYEE_ID, capabilityId: "jira-read-audit-items", kind: "understand", status: "unverified", providerId: JIRA_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Jira provider module exposes audit-item read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: COMPLIANCE_EMPLOYEE_ID, capabilityId: "jira-create-audit-finding", kind: "automate", status: "unverified", providerId: JIRA_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Jira provider module exposes audit-finding creation capability; authorized write, idempotency, and rollback evidence is pending." }),
  defineCapabilityContract({
    employeeId: COMPLIANCE_EMPLOYEE_ID,
    capabilityId: "jira-read-projects",
    kind: "understand",
    status: "unverified",
    providerId: JIRA_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter capability path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMPLIANCE_EMPLOYEE_ID,
    capabilityId: "jira-link-issues",
    kind: "automate",
    status: "unverified",
    providerId: JIRA_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter capability path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMPLIANCE_EMPLOYEE_ID,
    capabilityId: "jira-read-comments",
    kind: "understand",
    status: "unverified",
    providerId: JIRA_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Provider adapter capability path exists; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMPLIANCE_EMPLOYEE_ID,
    capabilityId: "jira-transition-issue",
    kind: "automate",
    status: "unverified",
    providerId: JIRA_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Provider adapter capability path exists; authorized tenant evidence is pending.",
  }),
];
export interface ComplianceAdapter { listAuditItems(tenantId: string): Promise<unknown>; createAuditFinding(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>; }
export interface ComplianceExecutionOptions { tenantId: string; authToken?: string; audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void; maxAttempts?: number; }
function requireTenant(options: ComplianceExecutionOptions): void { if (!options.tenantId.trim()) throw new Error("Tenant scope is required"); if (!options.authToken?.trim()) throw new Error("Provider authentication is required"); }
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }
export async function readAuditItems(adapter: ComplianceAdapter, options: ComplianceExecutionOptions): Promise<unknown> { requireTenant(options); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.listAuditItems(options.tenantId); await options.audit({ capabilityId: "jira-read-audit-items", tenantId: options.tenantId, outcome: "succeeded" }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "jira-read-audit-items", tenantId: options.tenantId, outcome: "failed" }); throw lastError; }
export async function createAuditFinding(adapter: ComplianceAdapter, input: Record<string, unknown>, options: ComplianceExecutionOptions, idempotencyKey: string): Promise<unknown> { requireTenant(options); if (!idempotencyKey.trim()) throw new Error("Idempotency key is required"); let lastError: unknown; for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) { try { const result = await adapter.createAuditFinding(options.tenantId, input, idempotencyKey); await options.audit({ capabilityId: "jira-create-audit-finding", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey }); return result; } catch (error) { lastError = error; } } await options.audit({ capabilityId: "jira-create-audit-finding", tenantId: options.tenantId, outcome: "failed", idempotencyKey }); throw lastError; }


export interface ExtendedCapabilityAdapter {
  readProjects?(tenantId: string): Promise<unknown>;
  linkIssues?(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  readComments?(tenantId: string): Promise<unknown>;
  transitionIssue?(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
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

export async function readProjects(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readProjects) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readProjects!(tenant) }, "jira-read-projects", options);
}

export async function linkIssues(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!adapter.linkIssues) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ write: (_id, tenant, data, key) => adapter.linkIssues!(tenant, data, key) }, "jira-link-issues", options, input, idempotencyKey);
}

export async function readComments(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readComments) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readComments!(tenant) }, "jira-read-comments", options);
}

export async function transitionIssue(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!adapter.transitionIssue) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ write: (_id, tenant, data, key) => adapter.transitionIssue!(tenant, data, key) }, "jira-transition-issue", options, input, idempotencyKey);
}
