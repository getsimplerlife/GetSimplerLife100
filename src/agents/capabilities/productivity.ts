import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";

/**
 * Productivity employee — Google Workspace file capabilities (owner directive
 * 2026-08-12): AI employees create Google Docs/Sheets/Slides/Drive files and
 * keep them ready in client portals for view/edit/print/download.
 *
 * All contracts are declared unverified until live evidence exists. Writes are
 * idempotency-gated (each create produces a distinct file; each content write
 * carries an idempotency key), bounded-retry, audited, tenant-scoped.
 */
export const PRODUCTIVITY_EMPLOYEE_ID = "productivity";
export const GOOGLE_DRIVE_PROVIDER_ID = "google-drive";
export const GOOGLE_DOCS_PROVIDER_ID = "google-docs";
export const GOOGLE_SHEETS_PROVIDER_ID = "google-sheets";
export const GOOGLE_SLIDES_PROVIDER_ID = "google-slides";

export const productivityCapabilities: ReadonlyArray<CapabilityContract> = [
  /* ── google-drive ─────────────────────────────────────────────────── */
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "google-drive-read-files",
    kind: "understand",
    status: "unverified",
    providerId: GOOGLE_DRIVE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Google Drive provider module exposes listFiles/getFile metadata reads on drive.googleapis.com; authorized tenant read evidence is pending Google OAuth credentials.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "google-drive-monitor-folder-changes",
    kind: "monitor",
    status: "unverified",
    providerId: GOOGLE_DRIVE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Google Drive module exposes listChangesSince (modifiedTime polling) for change monitoring; live webhook push requires a deployed watch channel receiver — verification blocked on credentials + receiver.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "google-drive-write-files",
    kind: "automate",
    status: "unverified",
    providerId: GOOGLE_DRIVE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Google Drive module exposes createFolder/uploadFile/copyFile/moveFile/deleteFile on googleapis.com upload+drive hosts; authorized write, idempotency (per-call file creation), and rollback (delete/trash) evidence is pending Google OAuth credentials.",
  }),
  /* ── google-docs ──────────────────────────────────────────────────── */
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "google-docs-read-content",
    kind: "understand",
    status: "unverified",
    providerId: GOOGLE_DOCS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Google Docs module exposes getDocument/getDocumentText on docs.googleapis.com; authorized tenant read evidence is pending Google OAuth credentials.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "google-docs-create-from-template",
    kind: "automate",
    status: "unverified",
    providerId: GOOGLE_DOCS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Google Docs module exposes createDocument/createDocumentFromTemplate (Drive copy + batchUpdate replaceAllText) and insertText/replaceAllText updates; authorized write, idempotency, and rollback (delete copy) evidence is pending Google OAuth credentials.",
  }),
  /* ── google-sheets ────────────────────────────────────────────────── */
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "google-sheets-read-ranges",
    kind: "understand",
    status: "unverified",
    providerId: GOOGLE_SHEETS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Google Sheets module exposes readRange on sheets.googleapis.com (same values.get path as the legacy queryGoogleSheets read); authorized tenant read evidence is pending Google OAuth credentials.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "google-sheets-write-values",
    kind: "automate",
    status: "unverified",
    providerId: GOOGLE_SHEETS_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Google Sheets module exposes createSpreadsheet/writeRange/appendRows/batchUpdate on sheets.googleapis.com; authorized write, idempotency (value writes are server-committed per call), and rollback (clear values) evidence is pending Google OAuth credentials.",
  }),
  /* ── google-slides ────────────────────────────────────────────────── */
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "google-slides-read-presentation",
    kind: "understand",
    status: "unverified",
    providerId: GOOGLE_SLIDES_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Google Slides module exposes getPresentation on slides.googleapis.com; authorized tenant read evidence is pending Google OAuth credentials.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "google-slides-create-presentation",
    kind: "automate",
    status: "unverified",
    providerId: GOOGLE_SLIDES_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Google Slides module exposes createPresentation/createPresentationFromOutline/addSlides with client-generated objectIds on slides.googleapis.com; authorized write, idempotency, and rollback (delete presentation) evidence is pending Google OAuth credentials.",
  }),
];

/* ── Typed executors (bounded retry + audit, mirroring finance/procurement) ── */

export interface ProductivityAdapter {
  createDoc(input: { title: string; content?: string; parentFolderId?: string }, idempotencyKey: string): Promise<unknown>;
  createDocFromTemplate(input: { templateId: string; title: string; replacements?: Record<string, string> }, idempotencyKey: string): Promise<unknown>;
  createSheet(input: { title: string; sheets?: string[] }, idempotencyKey: string): Promise<unknown>;
  writeSheetRange(input: { spreadsheetId: string; range: string; values: unknown[][] }, idempotencyKey: string): Promise<unknown>;
  createSlides(input: { title: string; slides?: Array<{ title: string; body?: string }> }, idempotencyKey: string): Promise<unknown>;
}

export interface ProductivityExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}

function requireTenant(options: ProductivityExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}

function boundedAttempts(value?: number): number {
  return Math.max(1, Math.min(value ?? 2, 3));
}

async function executeWithRetry(
  capabilityId: string,
  idempotencyKey: string,
  fn: () => Promise<unknown>,
  options: ProductivityExecutionOptions,
): Promise<unknown> {
  requireTenant(options);
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await fn();
      await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}

export function createGoogleDoc(
  adapter: ProductivityAdapter,
  input: { title: string; content?: string; parentFolderId?: string },
  options: ProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeWithRetry("google-docs-create-from-template", idempotencyKey, () => adapter.createDoc(input, idempotencyKey), options);
}

export function createGoogleDocFromTemplate(
  adapter: ProductivityAdapter,
  input: { templateId: string; title: string; replacements?: Record<string, string> },
  options: ProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeWithRetry("google-docs-create-from-template", idempotencyKey, () => adapter.createDocFromTemplate(input, idempotencyKey), options);
}

export function createGoogleSheet(
  adapter: ProductivityAdapter,
  input: { title: string; sheets?: string[] },
  options: ProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeWithRetry("google-sheets-write-values", idempotencyKey, () => adapter.createSheet(input, idempotencyKey), options);
}

export function writeGoogleSheetRange(
  adapter: ProductivityAdapter,
  input: { spreadsheetId: string; range: string; values: unknown[][] },
  options: ProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeWithRetry("google-sheets-write-values", idempotencyKey, () => adapter.writeSheetRange(input, idempotencyKey), options);
}

export function createGoogleSlides(
  adapter: ProductivityAdapter,
  input: { title: string; slides?: Array<{ title: string; body?: string }> },
  options: ProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeWithRetry("google-slides-create-presentation", idempotencyKey, () => adapter.createSlides(input, idempotencyKey), options);
}
