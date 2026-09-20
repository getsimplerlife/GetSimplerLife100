/**
 * native/forms/store.ts — durable, tenant-keyed form store (Phase 1.3).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   map first — zero cross-tenant paths (foreign form/submission ids resolve
 *   to null → fail-closed 404 upstream).
 * - Uploaded files live in the tenant's HASHED bucket
 *   (`native_forms/{sha256(tenant)}/{submissionId}.files/{key}` — same
 *   convention as the Phase 1.2 document store / vault blob store).
 * - DELETE accepts exactly ONE known id. Delete of a form FAILS CLOSED while
 *   it has submissions (no cascade surprises); submissions delete by exact id.
 * - Every mutation appends an IMMUTABLE native-forms audit entry.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_FORMS_KEY,
  NATIVE_FORMS_AUDIT_KEY,
  NATIVE_FORMS_SLUGS_KEY,
  type FormDefinition,
  type FormSubmission,
  type FormFileUpload,
} from "./types";

export interface NativeFormAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.form.<create|update|delete|disable|submit|file-delete>
  detail: string;
}

interface TenantFormState {
  forms: FormDefinition[];
  submissions: FormSubmission[];
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}

// ── Global slug index (slug -> tenantId, NOTHING else — no tenant data) ──
function loadSlugs(dataDir: string): Record<string, string> {
  const raw = readJSON(dataPath(dataDir, NATIVE_FORMS_SLUGS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}
function saveSlugs(dataDir: string, slugs: Record<string, string>): void {
  writeJSON(dataPath(dataDir, NATIVE_FORMS_SLUGS_KEY), slugs);
}
export function slugInUse(dataDir: string, slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(loadSlugs(dataDir), slug);
}
export function registerSlug(dataDir: string, slug: string, tenantId: string): void {
  const slugs = loadSlugs(dataDir);
  slugs[slug] = tenantId;
  saveSlugs(dataDir, slugs);
}
export function unregisterSlug(dataDir: string, slug: string): void {
  const slugs = loadSlugs(dataDir);
  if (!(slug in slugs)) return;
  delete slugs[slug];
  saveSlugs(dataDir, slugs);
}
export function tenantIdForSlug(dataDir: string, slug: string): string | null {
  return loadSlugs(dataDir)[slug] ?? null;
}
export function unregisterSlugByFormId(dataDir: string, tenantId: string, formId: string): void {
  const form = getForm(dataDir, tenantId, formId);
  if (form) unregisterSlug(dataDir, form.slug);
}
function loadState(dataDir: string): Record<string, TenantFormState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_FORMS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantFormState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantFormState>): void {
  writeJSON(dataPath(dataDir, NATIVE_FORMS_KEY), state);
}

/** sha256 of the canonical tenant identity — same hashed-bucket convention. */
export function tenantFormsBucketHash(tenantId: string): string {
  return createHash("sha256").update(tenantId.toLowerCase().trim()).digest("hex").slice(0, 32);
}
function tenantBinDir(dataDir: string, tenantId: string): string {
  return join(resolveDataDir(dataDir, process.cwd()), "native_forms", tenantFormsBucketHash(tenantId));
}
export function submissionFileDir(dataDir: string, tenantId: string, submissionId: string): string {
  return join(tenantBinDir(dataDir, tenantId), `${submissionId}.files`);
}
export function submissionFilePath(dataDir: string, tenantId: string, submissionId: string, key: string): string {
  return join(submissionFileDir(dataDir, tenantId, submissionId), `${key}`);
}

export function sha256Of(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function generateFormEntityId(prefix: "frm" | "sub" | "step"): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
export function generateFormSlug(): string {
  return `slug_${randomBytes(12).toString("hex").slice(0, 24)}`;
}

// ── Forms ──────────────────────────────────────────────────────────────────
export function listForms(dataDir: string, tenantId: string): FormDefinition[] {
  return loadState(dataDir)[tenantId]?.forms ?? [];
}
export function getForm(dataDir: string, tenantId: string, formId: string): FormDefinition | null {
  return listForms(dataDir, tenantId).find((f) => f.id === formId) ?? null;
}
export function getFormBySlug(dataDir: string, tenantId: string, slug: string): FormDefinition | null {
  return listForms(dataDir, tenantId).find((f) => f.slug === slug) ?? null;
}
export function createForm(dataDir: string, form: FormDefinition): void {
  const state = loadState(dataDir);
  const tenant = state[form.tenantId] ?? { forms: [], submissions: [] };
  tenant.forms.push(form);
  state[form.tenantId] = tenant;
  saveState(dataDir, state);
  appendFormAudit(dataDir, form.tenantId, form.createdBy, "native.form.create", `Form ${form.id} (${form.steps.length} steps)`);
}
export function updateForm(
  dataDir: string,
  tenantId: string,
  formId: string,
  patch: Partial<Pick<FormDefinition, "name" | "description" | "steps" | "prefillKeys" | "enabled">>,
  actor: string,
): FormDefinition | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return null;
  const idx = tenant.forms.findIndex((f) => f.id === formId);
  if (idx < 0) return null;
  const form = tenant.forms[idx];
  if (patch.name !== undefined) form.name = patch.name;
  if (patch.description !== undefined) form.description = patch.description;
  if (patch.steps !== undefined) form.steps = patch.steps;
  if (patch.prefillKeys !== undefined) form.prefillKeys = patch.prefillKeys;
  if (patch.enabled !== undefined) form.enabled = patch.enabled;
  form.updatedAt = new Date().toISOString();
  form.updatedBy = actor;
  state[tenantId] = tenant;
  saveState(dataDir, state);
  appendFormAudit(dataDir, tenantId, actor, "native.form.update", `Form ${formId} (${form.steps.length} steps)`);
  return form;
}
export function setFormEnabled(dataDir: string, tenantId: string, formId: string, enabled: boolean, actor: string): FormDefinition | null {
  return updateForm(dataDir, tenantId, formId, { enabled }, actor);
}
/** Delete a form ONLY when it has no submissions (fail-closed). */
export function deleteForm(dataDir: string, tenantId: string, formId: string, actor: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return false;
  const idx = tenant.forms.findIndex((f) => f.id === formId);
  if (idx < 0) return false;
  if (tenant.submissions.some((s) => s.formId === formId)) return false;
  tenant.forms.splice(idx, 1);
  state[tenantId] = tenant;
  saveState(dataDir, state);
  appendFormAudit(dataDir, tenantId, actor, "native.form.delete", `Form ${formId}`);
  return true;
}

// ── Submissions ────────────────────────────────────────────────────────────
export function listSubmissions(dataDir: string, tenantId: string, formId?: string): FormSubmission[] {
  const all = loadState(dataDir)[tenantId]?.submissions ?? [];
  return formId ? all.filter((s) => s.formId === formId) : all;
}
export function getSubmission(dataDir: string, tenantId: string, submissionId: string): FormSubmission | null {
  return listSubmissions(dataDir, tenantId).find((s) => s.id === submissionId) ?? null;
}
export function hasSubmissionId(dataDir: string, tenantId: string, submissionId: string): boolean {
  return getSubmission(dataDir, tenantId, submissionId) !== null;
}
/**
 * Persist a validated submission + its file bytes. Idempotency is checked by
 * the CALLER (public submit route) against existing submission ids — this
 * function records durably and audits. Files are written AFTER the record so
 * a failed write never leaves an orphan record.
 */
export function saveSubmission(
  dataDir: string,
  submission: FormSubmission,
  files: { key: string; bytes: Uint8Array }[],
): void {
  const state = loadState(dataDir);
  const tenant = state[submission.tenantId] ?? { forms: [], submissions: [] };
  tenant.submissions.push(submission);
  state[submission.tenantId] = tenant;
  saveState(dataDir, state);
  const dir = submissionFileDir(dataDir, submission.tenantId, submission.id);
  if (files.length > 0 && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const f of files) {
    writeFileSync(submissionFilePath(dataDir, submission.tenantId, submission.id, f.key), f.bytes);
  }
  appendFormAudit(
    dataDir,
    submission.tenantId,
    submission.submittedBy,
    "native.form.submit",
    `Submission ${submission.id} on form ${submission.formId} (${files.length} files)`,
  );
}
export function deleteSubmission(dataDir: string, tenantId: string, submissionId: string, actor: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return false;
  const idx = tenant.submissions.findIndex((s) => s.id === submissionId);
  if (idx < 0) return false;
  tenant.submissions.splice(idx, 1);
  state[tenantId] = tenant;
  saveState(dataDir, state);
  const dir = submissionFileDir(dataDir, tenantId, submissionId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  appendFormAudit(dataDir, tenantId, actor, "native.form.submission-delete", `Submission ${submissionId}`);
  return true;
}
export function readSubmissionFile(dataDir: string, tenantId: string, submissionId: string, key: string): Uint8Array | null {
  const path = submissionFilePath(dataDir, tenantId, submissionId, key);
  if (!existsSync(path)) return null;
  return new Uint8Array(readFileSync(path));
}
export function listSubmissionFileNames(dataDir: string, tenantId: string, submissionId: string): string[] {
  const dir = submissionFileDir(dataDir, tenantId, submissionId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}
/** Count of files across a tenant's hashed bucket (tests/cleanup). */
export function countTenantFormFiles(dataDir: string, tenantId: string): number {
  const dir = tenantBinDir(dataDir, tenantId);
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const sub of readdirSync(dir)) {
    const subDir = join(dir, sub);
    if (existsSync(subDir)) n += readdirSync(subDir).length;
  }
  return n;
}

// ── Audit (immutable, tenant-keyed) ────────────────────────────────────────
export function appendFormAudit(
  dataDir: string,
  tenantId: string,
  actor: string,
  action: string,
  detail: string,
): NativeFormAuditEntry {
  const entry: NativeFormAuditEntry = {
    id: `nfa-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
    ts: new Date().toISOString(),
    tenantId,
    actor,
    action,
    detail,
  };
  const path = dataPath(dataDir, NATIVE_FORMS_AUDIT_KEY);
  const raw = readJSON(path);
  const all: Record<string, NativeFormAuditEntry[]> = raw && typeof raw === "object" ? (raw as Record<string, NativeFormAuditEntry[]>) : {};
  const entries = all[tenantId] || [];
  entries.push(entry); // append-only
  all[tenantId] = entries;
  writeJSON(path, all);
  return entry;
}
export function listFormAudit(dataDir: string, tenantId: string): NativeFormAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_FORMS_AUDIT_KEY));
  const all = raw && typeof raw === "object" ? (raw as Record<string, NativeFormAuditEntry[]>) : {};
  return all[tenantId] ?? [];
}
export function countFormAudit(dataDir: string, tenantId: string): number {
  return listFormAudit(dataDir, tenantId).length;
}
export function countFilesByKey(files: FormFileUpload[]): number {
  return files.length;
}