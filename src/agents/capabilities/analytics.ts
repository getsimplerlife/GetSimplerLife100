import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const ANALYTICS_EMPLOYEE_ID = "analytics";
export const TABLEAU_PROVIDER_ID = "tableau";

/**
 * Analytics / Tableau capability contracts (12 total):
 *   6 understand (read), 2 monitor, 4 automate (write).
 * All remain unverified until a tenant provides authorized Tableau credentials
 * and the Phase 7 adapter exercises them against the tenant's Tableau host.
 */
export const analyticsCapabilities: ReadonlyArray<CapabilityContract> = [
  /* ── understand (read) — 6 contracts ── */
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-read-reports",
    kind: "understand",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Tableau provider module exposes views (reports) read endpoint; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-read-dashboards",
    kind: "understand",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Tableau provider module exposes dashboard-type views read endpoint; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-read-workbooks",
    kind: "understand",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Tableau provider module exposes workbooks read endpoint; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-read-data-sources",
    kind: "understand",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Tableau provider module exposes datasources read endpoint; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-read-projects",
    kind: "understand",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Tableau provider module exposes projects read endpoint; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-read-users",
    kind: "understand",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Tableau provider module exposes site users read endpoint; authorized tenant read evidence is pending.",
  }),
  /* ── monitor — 2 contracts ── */
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-monitor-workbooks",
    kind: "monitor",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Tableau provider module exposes updated-since workbooks endpoint; authorized tenant monitor evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-monitor-datasources",
    kind: "monitor",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Tableau provider module exposes datasource refresh job endpoint; authorized tenant monitor evidence is pending.",
  }),
  /* ── automate (write) — 4 contracts ── */
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-create-project",
    kind: "automate",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Tableau provider module exposes project create capability; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-update-workbook",
    kind: "automate",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Tableau provider module exposes workbook update capability; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-add-site-user",
    kind: "automate",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Tableau provider module exposes site user add capability; authorized write, idempotency, and rollback evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: ANALYTICS_EMPLOYEE_ID,
    capabilityId: "tableau-refresh-datasource",
    kind: "automate",
    status: "unverified",
    providerId: TABLEAU_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Tableau provider module exposes datasource extract refresh capability; authorized write, idempotency, and rollback evidence is pending.",
  }),
];

/* ── Execution layer ── */
export interface AnalyticsAdapter {
  listReports(tenantId: string): Promise<unknown>;
  readDashboards(tenantId: string): Promise<unknown>;
  readWorkbooks(tenantId: string): Promise<unknown>;
  readDataSources(tenantId: string): Promise<unknown>;
  readProjects(tenantId: string): Promise<unknown>;
  readUsers(tenantId: string): Promise<unknown>;
  monitorWorkbooks(tenantId: string): Promise<unknown>;
  monitorDatasources(tenantId: string): Promise<unknown>;
  createProject(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  updateWorkbook(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  addSiteUser(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  refreshDatasource(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
}

export interface AnalyticsExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}

function requireTenant(options: AnalyticsExecutionOptions): void {
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
export async function readReports(adapter: AnalyticsAdapter, options: AnalyticsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.listReports(options.tenantId);
      await options.audit({ capabilityId: "tableau-read-reports", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId: "tableau-read-reports", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

export async function readDashboards(adapter: AnalyticsAdapter, options: AnalyticsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  const result = await adapter.readDashboards(options.tenantId);
  await options.audit({ capabilityId: "tableau-read-dashboards", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}

export async function readWorkbooks(adapter: AnalyticsAdapter, options: AnalyticsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  const result = await adapter.readWorkbooks(options.tenantId);
  await options.audit({ capabilityId: "tableau-read-workbooks", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}

export async function readDataSources(adapter: AnalyticsAdapter, options: AnalyticsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  const result = await adapter.readDataSources(options.tenantId);
  await options.audit({ capabilityId: "tableau-read-data-sources", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}

export async function readProjects(adapter: AnalyticsAdapter, options: AnalyticsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  const result = await adapter.readProjects(options.tenantId);
  await options.audit({ capabilityId: "tableau-read-projects", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}

export async function readUsers(adapter: AnalyticsAdapter, options: AnalyticsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  const result = await adapter.readUsers(options.tenantId);
  await options.audit({ capabilityId: "tableau-read-users", tenantId: options.tenantId, outcome: "succeeded" });
  return result;
}

/* ── Monitor executors ── */
export async function monitorWorkbooks(adapter: AnalyticsAdapter, options: AnalyticsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.monitorWorkbooks(options.tenantId);
      await options.audit({ capabilityId: "tableau-monitor-workbooks", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId: "tableau-monitor-workbooks", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

export async function monitorDatasources(adapter: AnalyticsAdapter, options: AnalyticsExecutionOptions): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await adapter.monitorDatasources(options.tenantId);
      await options.audit({ capabilityId: "tableau-monitor-datasources", tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId: "tableau-monitor-datasources", tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

/* ── Write executors (idempotency-key gated) ── */
export async function createProject(
  adapter: AnalyticsAdapter,
  options: AnalyticsExecutionOptions,
  input: Record<string, unknown>,
  idempotencyKey: string,
): Promise<unknown> {
  requireTenant(options);
  requireIdempotency(idempotencyKey);
  const result = await adapter.createProject(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "tableau-create-project", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}

export async function updateWorkbook(
  adapter: AnalyticsAdapter,
  options: AnalyticsExecutionOptions,
  input: Record<string, unknown>,
  idempotencyKey: string,
): Promise<unknown> {
  requireTenant(options);
  requireIdempotency(idempotencyKey);
  const result = await adapter.updateWorkbook(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "tableau-update-workbook", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}

export async function addSiteUser(
  adapter: AnalyticsAdapter,
  options: AnalyticsExecutionOptions,
  input: Record<string, unknown>,
  idempotencyKey: string,
): Promise<unknown> {
  requireTenant(options);
  requireIdempotency(idempotencyKey);
  const result = await adapter.addSiteUser(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "tableau-add-site-user", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}

export async function refreshDatasource(
  adapter: AnalyticsAdapter,
  options: AnalyticsExecutionOptions,
  input: Record<string, unknown>,
  idempotencyKey: string,
): Promise<unknown> {
  requireTenant(options);
  requireIdempotency(idempotencyKey);
  const result = await adapter.refreshDatasource(options.tenantId, input, idempotencyKey);
  await options.audit({ capabilityId: "tableau-refresh-datasource", tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
  return result;
}
