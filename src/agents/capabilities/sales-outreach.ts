import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

export const SALES_OUTREACH_EMPLOYEE_ID = "sales_outreach";
export const HUBSPOT_PROVIDER_ID = "hubspot";

/**
 * Sales Outreach AI — HubSpot CRM capability slice (11 contracts).
 *
 * Coverage: contacts, deals, companies, tickets, deal pipeline stages, owners,
 * and deal stage change monitoring. Every contract starts `unverified`; status
 * may only become real/partial after the verification evidence framework records
 * live API evidence (scripts/verify-provider.ts --provider hubspot [--writes]).
 */
export const salesOutreachCapabilities: ReadonlyArray<CapabilityContract> = [
  // ---------------------------------------------------------------- reads
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-read-contacts",
    kind: "understand",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "HubSpot CRM POST /crm/v3/objects/contacts/search exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-read-deals",
    kind: "understand",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "HubSpot CRM POST /crm/v3/objects/deals/search exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-read-companies",
    kind: "understand",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "HubSpot CRM POST /crm/v3/objects/companies/search exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-read-tickets",
    kind: "understand",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "HubSpot CRM POST /crm/v3/objects/tickets/search exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-read-pipeline-stages",
    kind: "understand",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "HubSpot CRM GET /crm/v3/pipelines/deals exists but returns 403 for user-level OAuth tokens ('User level OAuth token is not allowed for this endpoint'); requires a private-app token — pending evidence.",
  }),
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-read-owners",
    kind: "understand",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "HubSpot CRM GET /crm/v3/owners exists but returns 403 for user-level OAuth tokens ('User level OAuth token is not allowed for this endpoint'); requires a private-app token — pending evidence.",
  }),
  // ---------------------------------------------------------------- writes
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-create-deal",
    kind: "automate",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "HubSpot CRM POST /crm/v3/objects/deals creates successfully (observed HTTP 201); DELETE/archive returns 403 for user-level OAuth tokens, so the full write contract (create + rollback) stays unverified until a private-app token is connected.",
  }),
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-create-contact",
    kind: "automate",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "HubSpot CRM POST /crm/v3/objects/contacts creates successfully (observed HTTP 201); DELETE/archive returns 403 for user-level OAuth tokens, so the full write contract (create + rollback) stays unverified until a private-app token is connected.",
  }),
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-create-company",
    kind: "automate",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "HubSpot CRM POST /crm/v3/objects/companies creates successfully (observed HTTP 201); DELETE/archive returns 403 for user-level OAuth tokens, so the full write contract (create + rollback) stays unverified until a private-app token is connected.",
  }),
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-update-deal-stage",
    kind: "automate",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "HubSpot CRM PATCH /crm/v3/objects/deals/{id} exists; stage enumeration and DELETE both return 403 for user-level OAuth tokens so full write/rollback evidence requires a private-app token.",
  }),
  // ---------------------------------------------------------------- monitor
  defineCapabilityContract({
    employeeId: SALES_OUTREACH_EMPLOYEE_ID,
    capabilityId: "hubspot-monitor-deal-stage-change",
    kind: "monitor",
    status: "unverified",
    providerId: HUBSPOT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "HubSpot webhook subscription deal.propertyChange is defined; live event-receipt evidence is pending.",
  }),
];

export interface SalesOutreachAdapter {
  listContacts(tenantId: string): Promise<unknown>;
  listDeals(tenantId: string): Promise<unknown>;
  listCompanies(tenantId: string): Promise<unknown>;
  listTickets(tenantId: string): Promise<unknown>;
  listPipelineStages(tenantId: string): Promise<unknown>;
  listOwners(tenantId: string): Promise<unknown>;
  createDeal(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  createContact(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  createCompany(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  updateDealStage(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  deleteDeal?(tenantId: string, result: unknown): Promise<void>;
  deleteContact?(tenantId: string, result: unknown): Promise<void>;
  deleteCompany?(tenantId: string, result: unknown): Promise<void>;
  monitorDealStageChange?(tenantId: string, subscription: Record<string, unknown>): Promise<unknown>;
}
export interface SalesOutreachExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}
function requireTenant(options: SalesOutreachExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }

/** Generic bounded-retry read executor that audits success/failure. */
async function readCapability(
  capabilityId: string,
  run: () => Promise<unknown>,
  options: SalesOutreachExecutionOptions,
): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await run();
      await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

/** Generic bounded-retry write executor that requires idempotency and audits. */
async function writeCapability(
  capabilityId: string,
  run: (key: string) => Promise<unknown>,
  idempotencyKey: string,
  options: SalesOutreachExecutionOptions,
): Promise<unknown> {
  requireTenant(options);
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await run(idempotencyKey);
      await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}

export async function readContacts(adapter: SalesOutreachAdapter, options: SalesOutreachExecutionOptions): Promise<unknown> {
  return readCapability("hubspot-read-contacts", () => adapter.listContacts(options.tenantId), options);
}
export async function readDeals(adapter: SalesOutreachAdapter, options: SalesOutreachExecutionOptions): Promise<unknown> {
  return readCapability("hubspot-read-deals", () => adapter.listDeals(options.tenantId), options);
}
export async function readCompanies(adapter: SalesOutreachAdapter, options: SalesOutreachExecutionOptions): Promise<unknown> {
  return readCapability("hubspot-read-companies", () => adapter.listCompanies(options.tenantId), options);
}
export async function readTickets(adapter: SalesOutreachAdapter, options: SalesOutreachExecutionOptions): Promise<unknown> {
  return readCapability("hubspot-read-tickets", () => adapter.listTickets(options.tenantId), options);
}
export async function readPipelineStages(adapter: SalesOutreachAdapter, options: SalesOutreachExecutionOptions): Promise<unknown> {
  return readCapability("hubspot-read-pipeline-stages", () => adapter.listPipelineStages(options.tenantId), options);
}
export async function readOwners(adapter: SalesOutreachAdapter, options: SalesOutreachExecutionOptions): Promise<unknown> {
  return readCapability("hubspot-read-owners", () => adapter.listOwners(options.tenantId), options);
}
export async function createDeal(adapter: SalesOutreachAdapter, input: Record<string, unknown>, options: SalesOutreachExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return writeCapability("hubspot-create-deal", (key) => adapter.createDeal(options.tenantId, input, key), idempotencyKey, options);
}
export async function createContact(adapter: SalesOutreachAdapter, input: Record<string, unknown>, options: SalesOutreachExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return writeCapability("hubspot-create-contact", (key) => adapter.createContact(options.tenantId, input, key), idempotencyKey, options);
}
export async function createCompany(adapter: SalesOutreachAdapter, input: Record<string, unknown>, options: SalesOutreachExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return writeCapability("hubspot-create-company", (key) => adapter.createCompany(options.tenantId, input, key), idempotencyKey, options);
}
export async function updateDealStage(adapter: SalesOutreachAdapter, input: Record<string, unknown>, options: SalesOutreachExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return writeCapability("hubspot-update-deal-stage", (key) => adapter.updateDealStage(options.tenantId, input, key), idempotencyKey, options);
}
