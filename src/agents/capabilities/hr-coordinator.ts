import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const HR_COORDINATOR_EMPLOYEE_ID = "hr_coordinator";
export const WORKDAY_PROVIDER_ID = "workday";

export const hrCoordinatorCapabilities: ReadonlyArray<CapabilityContract> = [
  /* ── understand (read) — 5 contracts ── */
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-read-employees",
    kind: "understand",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Workday provider module exposes worker list endpoint; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-read-org-chart",
    kind: "understand",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Workday provider module exposes organization hierarchy endpoint; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-read-time-off",
    kind: "understand",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Workday provider module exposes time-off balance endpoint; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-read-positions",
    kind: "understand",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Workday provider module exposes positions endpoint; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-read-job-requisitions",
    kind: "understand",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Workday provider module exposes job requisition endpoint; authorized tenant evidence is pending.",
  }),
  /* ── automate (write) — 4 contracts ── */
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-update-employee",
    kind: "automate",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Workday provider module exposes employee update capability; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-initiate-onboarding",
    kind: "automate",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Workday provider module exposes onboarding initiation capability; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-approve-time-off",
    kind: "automate",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Workday provider module exposes time-off approval capability; authorized tenant evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-create-job-requisition",
    kind: "automate",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Workday provider module exposes job requisition creation; authorized tenant evidence is pending.",
  }),
  /* ── monitor — 1 contract ── */
  defineCapabilityContract({
    employeeId: HR_COORDINATOR_EMPLOYEE_ID,
    capabilityId: "workday-monitor-employees",
    kind: "monitor",
    status: "unverified",
    providerId: WORKDAY_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Workday provider adapter polls worker list for changes; authorized tenant evidence is pending.",
  }),
];

/* ── Adapter interface ── */
export interface HrCoordinatorAdapter {
  listEmployees(tenantId: string): Promise<unknown>;
  updateEmployee(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  readOrgChart(tenantId: string): Promise<unknown>;
  readTimeOff(tenantId: string): Promise<unknown>;
  readPositions(tenantId: string): Promise<unknown>;
  readJobRequisitions(tenantId: string): Promise<unknown>;
  initiateOnboarding(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  approveTimeOff(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  createJobRequisition(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  monitorEmployees(tenantId: string): Promise<unknown>;
}

/* ── Execution helpers ── */
export interface HrCoordinatorExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}

function requireTenant(options: HrCoordinatorExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}

function boundedAttempts(value?: number): number {
  return Math.max(1, Math.min(value ?? 2, 3));
}

function requireIdempotency(key?: string): void {
  if (!key?.trim()) throw new Error("Idempotency key is required");
}

/* ── Read executors ── */
export async function readEmployees(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.listEmployees(options.tenantId);
      await options.audit({ capabilityId: "workday-read-employees", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-read-employees", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

export async function readOrgChart(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.readOrgChart(options.tenantId);
      await options.audit({ capabilityId: "workday-read-org-chart", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-read-org-chart", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

export async function readTimeOff(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.readTimeOff(options.tenantId);
      await options.audit({ capabilityId: "workday-read-time-off", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-read-time-off", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

export async function readPositions(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.readPositions(options.tenantId);
      await options.audit({ capabilityId: "workday-read-positions", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-read-positions", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

export async function readJobRequisitions(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.readJobRequisitions(options.tenantId);
      await options.audit({ capabilityId: "workday-read-job-requisitions", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-read-job-requisitions", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

/* ── Write executors ── */
export async function updateEmployee(adapter: HrCoordinatorAdapter, input: Record<string, unknown>, options: HrCoordinatorExecutionOptions, idempotencyKey: string): Promise<unknown> {
  requireTenant(options);
  requireIdempotency(idempotencyKey);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.updateEmployee(options.tenantId, input, idempotencyKey);
      await options.audit({ capabilityId: "workday-update-employee", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-update-employee", tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}

export async function initiateOnboarding(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  requireTenant(options);
  requireIdempotency(idempotencyKey);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.initiateOnboarding(options.tenantId, input, idempotencyKey);
      await options.audit({ capabilityId: "workday-initiate-onboarding", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-initiate-onboarding", tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}

export async function approveTimeOff(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  requireTenant(options);
  requireIdempotency(idempotencyKey);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.approveTimeOff(options.tenantId, input, idempotencyKey);
      await options.audit({ capabilityId: "workday-approve-time-off", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-approve-time-off", tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}

export async function createJobRequisition(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  requireTenant(options);
  requireIdempotency(idempotencyKey);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.createJobRequisition(options.tenantId, input, idempotencyKey);
      await options.audit({ capabilityId: "workday-create-job-requisition", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-create-job-requisition", tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}

/* ── Monitor executor ── */
export async function monitorEmployees(adapter: HrCoordinatorAdapter, options: HrCoordinatorExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.monitorEmployees(options.tenantId);
      await options.audit({ capabilityId: "workday-monitor-employees", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) { lastError = error; }
  }
  await options.audit({ capabilityId: "workday-monitor-employees", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}
