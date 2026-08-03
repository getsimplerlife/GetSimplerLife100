import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const LOGISTICS_EMPLOYEE_ID = "logistics";
export const ONFLEET_PROVIDER_ID = "onfleet";

export const logisticsCapabilities: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({ employeeId: LOGISTICS_EMPLOYEE_ID, capabilityId: "onfleet-read-tasks", kind: "understand", status: "unverified", providerId: ONFLEET_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "Onfleet provider module exposes delivery-task read capability; authorized tenant read evidence is pending." }),
  defineCapabilityContract({ employeeId: LOGISTICS_EMPLOYEE_ID, capabilityId: "onfleet-create-task", kind: "automate", status: "unverified", providerId: ONFLEET_PROVIDER_ID, tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: true, retryPolicy: "bounded", rollback: "available", evidence: "Onfleet provider module exposes delivery-task creation capability; authorized write, idempotency, and rollback evidence is pending." }),
];

export interface LogisticsAdapter {
  listTasks(tenantId: string): Promise<unknown>;
  createTask(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
}
export interface LogisticsExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}
function requireTenant(options: LogisticsExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}
function boundedAttempts(value?: number): number {
  return Math.max(1, Math.min(value ?? 2, 3));
}
export async function readTasks(adapter: LogisticsAdapter, options: LogisticsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.listTasks(options.tenantId);
      await options.audit({ capabilityId: "onfleet-read-tasks", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId: "onfleet-read-tasks", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}
export async function createTask(adapter: LogisticsAdapter, input: Record<string, unknown>, options: LogisticsExecutionOptions, idempotencyKey: string): Promise<unknown> {
  requireTenant(options);
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.createTask(options.tenantId, input, idempotencyKey);
      await options.audit({ capabilityId: "onfleet-create-task", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId: "onfleet-create-task", tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}

// Phase 1b/3 extended capabilities — full Onfleet surface (11 contracts total).
export const logisticsCapabilitiesExtended: ReadonlyArray<CapabilityContract> = [
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-read-workers",
    kind: "understand",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Onfleet provider module exposes worker roster read capability; evidence pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-read-teams",
    kind: "understand",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Onfleet provider module exposes team read capability; evidence pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-read-routes",
    kind: "understand",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Onfleet provider module exposes team container (route) read capability; evidence pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-read-destinations",
    kind: "understand",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Onfleet provider module exposes destination directory read capability; evidence pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-monitor-tasks",
    kind: "monitor",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Onfleet provider module exposes task activity monitoring (updatedAt window); evidence pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-monitor-workers",
    kind: "monitor",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Onfleet provider module exposes worker roster monitoring; evidence pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-update-task-status",
    kind: "automate",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Onfleet provider module exposes task update capability; idempotency and rollback evidence pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-complete-task",
    kind: "automate",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Onfleet provider module exposes task completion capability; idempotency and rollback evidence pending.",
  }),
  defineCapabilityContract({
    employeeId: LOGISTICS_EMPLOYEE_ID,
    capabilityId: "onfleet-create-worker",
    kind: "automate",
    status: "unverified",
    providerId: ONFLEET_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Onfleet provider module exposes worker creation capability; idempotency and rollback evidence pending.",
  }),
];

export interface LogisticsExtendedAdapter {
  readWorkers(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readTeams(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readRoutes(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  readDestinations(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  monitorTasks(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  monitorWorkers(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  updateTaskStatus(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  completeTask(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
  createWorker(tenantId: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<unknown>;
}

export interface LogisticsExtendedExecutionOptions extends LogisticsExecutionOptions {
  input?: Record<string, unknown>;
  idempotencyKey?: string;
}

const LOGISTICS_READS = new Set([
  "onfleet-read-workers",
  "onfleet-read-teams",
  "onfleet-read-routes",
  "onfleet-read-destinations",
  "onfleet-monitor-tasks",
  "onfleet-monitor-workers",
]);
const LOGISTICS_WRITES = new Set([
  "onfleet-update-task-status",
  "onfleet-complete-task",
  "onfleet-create-worker",
]);

/** Typed dispatcher for the extended Onfleet surface. */
export async function executeLogisticsCapability(adapter: LogisticsExtendedAdapter, capabilityId: string, options: LogisticsExtendedExecutionOptions): Promise<unknown> {
  requireTenant(options);
  if (LOGISTICS_WRITES.has(capabilityId) && !options.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const method = capabilityId.replace(/^onfleet-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof LogisticsExtendedAdapter;
  const fn = adapter[method];
  if (typeof fn !== "function") throw new Error("Unsupported capability");
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await fn.call(adapter, options.tenantId, options.input, options.idempotencyKey);
      await options.audit({
        capabilityId,
        tenantId: options.tenantId,
        outcome: "succeeded",
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
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
    ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
  });
  throw lastError;
}

/** Backward-compatible dynamic dispatcher (legacy callers). */
export async function executeExtendedCapability(adapter: LogisticsExtendedAdapter, capabilityId: string, options: LogisticsExtendedExecutionOptions): Promise<unknown> {
  return executeLogisticsCapability(adapter, capabilityId, options);
}

export const logisticsReadCapabilityIds = [...LOGISTICS_READS];
export const logisticsWriteCapabilityIds = [...LOGISTICS_WRITES];
