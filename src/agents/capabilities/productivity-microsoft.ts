import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
import { PRODUCTIVITY_EMPLOYEE_ID } from "./productivity";

/**
 * Productivity employee — Microsoft Office capabilities (owner directive
 * 2026-08-12): AI employees create Word/Excel/PowerPoint files on OneDrive and
 * keep them ready in client portals for view/edit/print/download.
 *
 * All contracts are declared unverified until live evidence exists (blocked on
 * Microsoft Entra app registration credentials). Writes are idempotency-gated,
 * bounded-retry, audited, tenant-scoped.
 */
export const ONEDRIVE_PROVIDER_ID = "onedrive";
export const MICROSOFT_WORD_PROVIDER_ID = "microsoft-word";
export const MICROSOFT_EXCEL_PROVIDER_ID = "microsoft-excel";
export const MICROSOFT_POWERPOINT_PROVIDER_ID = "microsoft-powerpoint";

export const microsoftProductivityCapabilities: ReadonlyArray<CapabilityContract> = [
  /* ── onedrive ──────────────────────────────────────────────────────── */
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "onedrive-read-files",
    kind: "understand",
    status: "unverified",
    providerId: ONEDRIVE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "OneDrive module exposes listRootItems/getItem/getItemByPath/searchFiles on graph.microsoft.com (canonical host); authorized tenant read evidence is pending Microsoft Entra credentials.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "onedrive-monitor-changes",
    kind: "monitor",
    status: "unverified",
    providerId: ONEDRIVE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "OneDrive module exposes listChangesSince via the Graph delta endpoint (/me/drive/root/delta) for change monitoring; live push webhooks require a deployed subscription receiver — verification blocked on credentials + receiver.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "onedrive-write-files",
    kind: "automate",
    status: "unverified",
    providerId: ONEDRIVE_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "OneDrive module exposes createFolder/uploadFile/copyFile/moveFile/deleteFile on graph.microsoft.com; authorized write, idempotency (per-call file creation), and rollback (delete) evidence is pending Microsoft Entra credentials.",
  }),
  /* ── microsoft-word ────────────────────────────────────────────────── */
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "microsoft-word-read-content",
    kind: "understand",
    status: "unverified",
    providerId: MICROSOFT_WORD_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Microsoft Word module exposes getWordDocumentMetadata/readWordDocumentText (content download + docx text extraction) on graph.microsoft.com; authorized tenant read evidence is pending Microsoft Entra credentials.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "microsoft-word-create-document",
    kind: "automate",
    status: "unverified",
    providerId: MICROSOFT_WORD_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Microsoft Word module builds a minimal valid .docx (OOXML ZIP, real Word schemas) and PUTs it to /me/drive/root/children/{name}:/content on graph.microsoft.com; authorized write, idempotency, and rollback (delete file) evidence is pending Microsoft Entra credentials.",
  }),
  /* ── microsoft-excel ───────────────────────────────────────────────── */
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "microsoft-excel-read-ranges",
    kind: "understand",
    status: "unverified",
    providerId: MICROSOFT_EXCEL_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Microsoft Excel module reads cell values through the native Graph workbook API (/workbook/worksheets/Sheet1/range(...)/values) on graph.microsoft.com; authorized tenant read evidence is pending Microsoft Entra credentials.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "microsoft-excel-write-values",
    kind: "automate",
    status: "unverified",
    providerId: MICROSOFT_EXCEL_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Microsoft Excel module creates minimal valid .xlsx workbooks and writes values via the Graph workbook range API; authorized write, idempotency, and rollback (clear range / delete file) evidence is pending Microsoft Entra credentials.",
  }),
  /* ── microsoft-powerpoint ──────────────────────────────────────────── */
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "microsoft-powerpoint-read-presentation",
    kind: "understand",
    status: "unverified",
    providerId: MICROSOFT_POWERPOINT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Microsoft PowerPoint module exposes getPresentationMetadata/readPresentationText (content download + pptx text extraction of a:t runs) on graph.microsoft.com; authorized tenant read evidence is pending Microsoft Entra credentials.",
  }),
  defineCapabilityContract({
    employeeId: PRODUCTIVITY_EMPLOYEE_ID,
    capabilityId: "microsoft-powerpoint-create-presentation",
    kind: "automate",
    status: "unverified",
    providerId: MICROSOFT_POWERPOINT_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Microsoft PowerPoint module builds a minimal valid .pptx (presentation + master + layout + theme + slides) and PUTs it to OneDrive on graph.microsoft.com; authorized write, idempotency, and rollback (delete deck) evidence is pending Microsoft Entra credentials.",
  }),
];

/* ── Typed executors (bounded retry + audit) ──────────────────────────────── */

export interface MicrosoftProductivityAdapter {
  createWordDoc(input: { name: string; paragraphs: string[] }, idempotencyKey: string): Promise<unknown>;
  createExcelWorkbook(input: { name: string; rows: unknown[][] }, idempotencyKey: string): Promise<unknown>;
  writeExcelRange(input: { workbookId: string; range: string; values: unknown[][] }, idempotencyKey: string): Promise<unknown>;
  createPowerPoint(input: { name: string; slides: Array<{ title: string; body?: string }> }, idempotencyKey: string): Promise<unknown>;
  uploadOneDriveFile(input: { path: string; content: string | Uint8Array; mimeType?: string }, idempotencyKey: string): Promise<unknown>;
  deleteOneDriveFile(input: { id: string }, idempotencyKey: string): Promise<unknown>;
}

export interface MicrosoftProductivityExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}

function requireMicrosoftTenant(options: MicrosoftProductivityExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}

function boundedMicrosoftAttempts(value?: number): number {
  return Math.max(1, Math.min(value ?? 2, 3));
}

async function executeMicrosoftWithRetry(
  capabilityId: string,
  idempotencyKey: string,
  fn: () => Promise<unknown>,
  options: MicrosoftProductivityExecutionOptions,
): Promise<unknown> {
  requireMicrosoftTenant(options);
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedMicrosoftAttempts(options.maxAttempts); attempt++) {
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

export function createMicrosoftWordDoc(
  adapter: MicrosoftProductivityAdapter,
  input: { name: string; paragraphs: string[] },
  options: MicrosoftProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeMicrosoftWithRetry("microsoft-word-create-document", idempotencyKey, () => adapter.createWordDoc(input, idempotencyKey), options);
}

export function createMicrosoftExcelWorkbook(
  adapter: MicrosoftProductivityAdapter,
  input: { name: string; rows: unknown[][] },
  options: MicrosoftProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeMicrosoftWithRetry("microsoft-excel-write-values", idempotencyKey, () => adapter.createExcelWorkbook(input, idempotencyKey), options);
}

export function writeMicrosoftExcelRange(
  adapter: MicrosoftProductivityAdapter,
  input: { workbookId: string; range: string; values: unknown[][] },
  options: MicrosoftProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeMicrosoftWithRetry("microsoft-excel-write-values", idempotencyKey, () => adapter.writeExcelRange(input, idempotencyKey), options);
}

export function createMicrosoftPowerPoint(
  adapter: MicrosoftProductivityAdapter,
  input: { name: string; slides: Array<{ title: string; body?: string }> },
  options: MicrosoftProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeMicrosoftWithRetry("microsoft-powerpoint-create-presentation", idempotencyKey, () => adapter.createPowerPoint(input, idempotencyKey), options);
}

export function uploadMicrosoftOneDriveFile(
  adapter: MicrosoftProductivityAdapter,
  input: { path: string; content: string | Uint8Array; mimeType?: string },
  options: MicrosoftProductivityExecutionOptions,
  idempotencyKey: string,
): Promise<unknown> {
  return executeMicrosoftWithRetry("onedrive-write-files", idempotencyKey, () => adapter.uploadOneDriveFile(input, idempotencyKey), options);
}
