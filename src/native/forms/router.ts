/**
 * native/forms/router.ts — forms builder v1 API (Phase 1.3).
 *
 * Authed (tenant session):
 *   GET    /api/native/forms                       list forms + submission counts
 *   POST   /api/native/forms                       create form (slug auto-gen)
 *   GET    /api/native/forms/:id                   form definition
 *   POST   /api/native/forms/:id                   update form
 *   POST   /api/native/forms/:id/enable|disable    enable/disable (public submit
 *                                                  fails closed while disabled)
 *   DELETE /api/native/forms/:id                   delete (only when no submissions)
 *   GET    /api/native/forms/:id/submissions       list submissions (no bytes)
 *   GET    /api/native/forms/submissions/:sid/download?key=   file bytes
 *   DELETE /api/native/forms/submissions/:sid      delete submission + files
 *   GET    /api/native/forms/audit                 immutable tenant audit trail
 *
 * Public (NO session — the embedded/published form target):
 *   POST   /api/native/forms/:slug/submit          submit a form
 *     - slug-gated: unknown slug → 404; disabled → 404 (fail-closed)
 *     - idempotency: caller-supplied submission id `id` (bounded token);
 *       replay returns {duplicate:true, submissionId} — never double-recorded
 *     - validation + prefill + file sniffing per logic.ts (fail-closed)
 *     - on success: durable submission + files, immutable audit, and the
 *       submission is published as a TYPED WORKFLOW EVENT
 *       `native.form.submission` (Phase 1.1 outbound subscriptions; flush
 *       attempts immediately).
 */
import { createHash, randomBytes } from "node:crypto";
import {
  MAX_FORMS_PER_TENANT,
  MAX_SUBMISSIONS_PER_TENANT,
  MAX_STEPS,
  MAX_FIELDS_PER_STEP,
  MAX_FIELD_KEY,
  MAX_FIELD_LABEL,
  MAX_FORM_NAME,
  MAX_FORM_DESCRIPTION,
  MAX_OPTIONS,
  MAX_OPTION_LEN,
  MAX_PREFILL_KEYS,
  type FormDefinition,
  type FormField,
  type FormStep,
  type FormSubmission,
  type FormFileUpload,
} from "./types";
import {
  listForms,
  getForm,
  getFormBySlug,
  createForm,
  updateForm,
  deleteForm,
  listSubmissions,
  listFormAudit,
  appendFormAudit,
  generateFormEntityId,
  generateFormSlug,
  hasSubmissionId,
  getSubmission,
  saveSubmission,
  deleteSubmission,
  readSubmissionFile,
  registerSlug,
  tenantIdForSlug,
  unregisterSlugByFormId,
  slugInUse,
} from "./store";
import { validateSubmission, applyPrefill, type RawAnswer } from "./logic";
import { registerNativeEventType } from "../webhooks/registry";

export interface NativeFormsCtx {
  userEmail: string;
  dataDir: string;
}
export interface NativeFormsPublicCtx {
  dataDir: string;
}
export interface NativeFormSubmitResult {
  ok: boolean;
  duplicate?: boolean;
  submissionId?: string;
  eventId?: string | null;
  errors?: string[];
}

const SUBMIT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const FIELD_KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;
const FILE_KEY_RE = /^[A-Za-z0-9_-]{1,60}$/;
const FILE_TYPES_ALLOWED = ["pdf", "png", "jpg", "jpeg", "txt", "csv", "docx"];

function parseJsonObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Body must be a JSON object");
  return parsed as Record<string, unknown>;
}

// ── Definition validation (create/update) ─────────────────────────────────
function validateFormDef(input: {
  name: unknown;
  description?: unknown;
  steps: unknown;
  prefillKeys?: unknown;
}): { ok: true; name: string; description: string; steps: FormStep[]; prefillKeys: string[] } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, MAX_FORM_NAME) : "";
  if (!name) return { ok: false, error: "name is required" };
  const description = typeof input.description === "string" ? input.description.slice(0, MAX_FORM_DESCRIPTION) : "";
  if (!Array.isArray(input.steps) || input.steps.length === 0) return { ok: false, error: "steps must be a non-empty array" };
  if (input.steps.length > MAX_STEPS) return { ok: false, error: `No more than ${MAX_STEPS} steps` };
  const steps: FormStep[] = [];
  const seenKeys = new Set<string>();
  for (let si = 0; si < input.steps.length; si++) {
    const rawStep = input.steps[si] as { id?: unknown; title?: unknown; fields?: unknown };
    if (!rawStep || typeof rawStep !== "object" || !Array.isArray(rawStep.fields)) {
      return { ok: false, error: `Step ${si + 1} must have a fields array` };
    }
    if (rawStep.fields.length > MAX_FIELDS_PER_STEP) return { ok: false, error: `Step ${si + 1} exceeds ${MAX_FIELDS_PER_STEP} fields` };
    const fields: FormField[] = [];
    for (const rawField of rawStep.fields as unknown[]) {
      const f = rawField as { key?: unknown; label?: unknown; type?: unknown; required?: unknown; placeholder?: unknown; options?: unknown; validation?: unknown; showWhen?: unknown; fileTypes?: unknown; maxFileBytes?: unknown };
      if (!f || typeof f !== "object") return { ok: false, error: "field must be an object" };
      const key = typeof f.key === "string" ? f.key : "";
      if (!FIELD_KEY_RE.test(key) || key.length > MAX_FIELD_KEY) return { ok: false, error: `field key "${key}" must be a slug [A-Za-z0-9_-]{1,40}` };
      if (seenKeys.has(key)) return { ok: false, error: `duplicate field key "${key}"` };
      seenKeys.add(key);
      const label = typeof f.label === "string" ? f.label.trim().slice(0, MAX_FIELD_LABEL) : "";
      if (!label) return { ok: false, error: `field "${key}" label is required` };
      const type = typeof f.type === "string" ? f.type : "";
      const TYPES = ["text", "textarea", "email", "number", "date", "select", "checkbox", "file"];
      if (!TYPES.includes(type)) return { ok: false, error: `field "${key}" has invalid type "${type}"` };
      const options: string[] = [];
      if (Array.isArray(f.options)) {
        if (f.options.length > MAX_OPTIONS) return { ok: false, error: `field "${key}" exceeds ${MAX_OPTIONS} options` };
        for (const o of f.options) {
          if (typeof o !== "string" || o.length === 0 || o.length > MAX_OPTION_LEN) return { ok: false, error: `field "${key}" has an invalid option` };
          if (!options.includes(o)) options.push(o);
        }
      }
      const validation: FormField["validation"] = {};
      if (f.validation && typeof f.validation === "object") {
        const v = f.validation as Record<string, unknown>;
        if (typeof v.minLength === "number" && v.minLength >= 0 && v.minLength <= 10000) validation.minLength = v.minLength;
        if (typeof v.maxLength === "number" && v.maxLength >= 0 && v.maxLength <= 10000) validation.maxLength = v.maxLength;
        if (typeof v.min === "number" && Number.isFinite(v.min)) validation.min = v.min;
        if (typeof v.max === "number" && Number.isFinite(v.max)) validation.max = v.max;
        if (typeof v.pattern === "string" && v.pattern.length > 0 && v.pattern.length <= 500) {
          try {
            new RegExp(v.pattern);
            validation.pattern = v.pattern;
          } catch {
            return { ok: false, error: `field "${key}" pattern is not a valid regex` };
          }
        }
      }
      const showWhen =
        f.showWhen && typeof f.showWhen === "object"
          ? (() => {
              const r = f.showWhen as { field?: unknown; op?: unknown; value?: unknown };
              const ops = ["eq", "neq", "contains"];
              if (typeof r.field === "string" && typeof r.op === "string" && ops.includes(r.op) && typeof r.value === "string" && r.value.length <= 200) {
                return { field: r.field, op: r.op as "eq" | "neq" | "contains", value: r.value };
              }
              return null;
            })()
          : null;
      const fileTypes: string[] | undefined = Array.isArray(f.fileTypes)
        ? f.fileTypes
            .map((e) => (typeof e === "string" ? e.toLowerCase() : ""))
            .filter((e) => FILE_TYPES_ALLOWED.includes(e))
        : undefined;
      const maxFileBytes = typeof f.maxFileBytes === "number" && Number.isFinite(f.maxFileBytes) && f.maxFileBytes >= 1024 && f.maxFileBytes <= 5 * 1024 * 1024 ? f.maxFileBytes : undefined;
      const field: FormField = { key, label, type: type as FormField["type"], options, validation };
      if (f.required === true) field.required = true;
      if (typeof f.placeholder === "string" && f.placeholder.length > 0 && f.placeholder.length <= 200) field.placeholder = f.placeholder;
      if (showWhen) field.showWhen = showWhen;
      if (fileTypes) field.fileTypes = fileTypes;
      if (maxFileBytes) field.maxFileBytes = maxFileBytes;
      fields.push(field);
    }
    steps.push({ id: typeof rawStep.id === "string" && /^step_[A-Za-z0-9_-]+$/.test(rawStep.id) ? rawStep.id : generateFormEntityId("step"), title: typeof rawStep.title === "string" ? rawStep.title.slice(0, 200) : undefined, fields });
  }
  const prefillKeys: string[] = Array.isArray(input.prefillKeys)
    ? input.prefillKeys.filter((k): k is string => typeof k === "string" && seenKeys.has(k) && k.length <= MAX_FIELD_KEY).slice(0, MAX_PREFILL_KEYS)
    : [];
  return { ok: true, name, description, steps, prefillKeys };
}

function makeFormSubmission(tenantId: string, form: FormDefinition, answers: Record<string, string | string[]>, files: FormFileUpload[], submittedBy: string, source: string, eventId: string): FormSubmission {
  return {
    id: generateFormEntityId("sub"),
    tenantId,
    formId: form.id,
    status: "received",
    answers,
    files,
    eventId,
    submittedAt: new Date().toISOString(),
    submittedBy,
    source,
  };
}

// ── Public submit (slug-gated, idempotent) ────────────────────────────────
export async function handleNativeFormSubmit(req: Request, ctx: NativeFormsPublicCtx): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  let parsed: ReturnType<typeof parseJsonObject>;
  try {
    parsed = parseJsonObject(await req.text());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Bad request" }, { status: 400 });
  }
  const slug = new URL(req.url).pathname.match(/^\/api\/native\/forms\/([a-zA-Z0-9_-]+)\/submit$/)?.[1] ?? "";
  const tenantId = tenantIdForSlug(ctx.dataDir, slug);
  if (!tenantId) return Response.json({ error: "Form not found" }, { status: 404 });
  const form = getFormBySlug(ctx.dataDir, tenantId, slug);
  if (!form || !form.enabled) return Response.json({ error: "Form not found" }, { status: 404 });

  const submitId = typeof parsed.id === "string" ? parsed.id.trim() : "";
  if (submitId && !SUBMIT_ID_RE.test(submitId)) {
    return Response.json({ error: "id must be [A-Za-z0-9_-]{8,64}" }, { status: 400 });
  }
  if (submitId && hasSubmissionId(ctx.dataDir, tenantId, submitId)) {
    return Response.json({ data: { duplicate: true, submissionId: submitId } });
  }
  if (listSubmissions(ctx.dataDir, tenantId).length >= MAX_SUBMISSIONS_PER_TENANT) {
    return Response.json({ error: `Submission limit reached (${MAX_SUBMISSIONS_PER_TENANT})` }, { status: 400 });
  }

  const answers = (parsed.answers && typeof parsed.answers === "object" ? parsed.answers : {}) as Record<string, RawAnswer>;
  const prefilled = applyPrefill(form, answers, (parsed.prefill as Record<string, RawAnswer> | undefined) ?? undefined);
  const uploads: { key: string; name: string; contentType: string; bytes: Uint8Array; checksum: string }[] = [];
  const rawFiles = parsed.files && typeof parsed.files === "object" ? (parsed.files as Record<string, unknown>) : {};
  for (const [key, raw] of Object.entries(rawFiles)) {
    if (!FILE_KEY_RE.test(key)) return Response.json({ error: `file key "${key}" invalid` }, { status: 400 });
    const f = raw as { name?: unknown; contentType?: unknown; contentBase64?: unknown } | undefined;
    if (!f || typeof f !== "object") return Response.json({ error: `file "${key}" must be an object` }, { status: 400 });
    const name = typeof f.name === "string" ? f.name.slice(0, 200) : "";
    const contentType = typeof f.contentType === "string" ? f.contentType.slice(0, 120) : "application/octet-stream";
    const b64 = typeof f.contentBase64 === "string" ? f.contentBase64 : "";
    if (!name || !b64) return Response.json({ error: `file "${key}" needs name + contentBase64` }, { status: 400 });
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(b64, "base64"));
    } catch {
      return Response.json({ error: `file "${key}" base64 invalid` }, { status: 400 });
    }
    if (bytes.byteLength === 0) return Response.json({ error: `file "${key}" is empty` }, { status: 400 });
    uploads.push({ key, name, contentType, bytes, checksum: createHash("sha256").update(bytes).digest("hex") });
  }
  const result = validateSubmission(form, prefilled, uploads);
  if (!result.ok) {
    return Response.json({ error: "Validation failed", errors: result.errors }, { status: 400 });
  }
  const eventId = `evt_${randomBytes(8).toString("hex")}`;
  const finalSubId = submitId || generateFormEntityId("sub");
  const submission = makeFormSubmission(tenantId, form, result.answers, result.files.map((f) => ({ key: f.key, name: f.name, contentType: f.contentType, sizeBytes: f.bytes.byteLength, checksum: f.checksum })), (parsed.sentBy as string) || "anonymous", (parsed.source as string) || "native-form", eventId);
  submission.id = finalSubId;
  saveSubmission(ctx.dataDir, submission, result.files.map((f) => ({ key: f.key, bytes: f.bytes })));
  // TYPED WORKFLOW EVENT → outbound subscriptions (Phase 1.1 machinery).
  try {
    const outbound = await import("../webhooks");
    const published = outbound.publishWebhookEvent(
      ctx.dataDir,
      tenantId,
      "native.form.submission",
      {
        formId: form.id,
        formSlug: form.slug,
        formName: form.name,
        submissionId: submission.id,
        eventId,
        answers: result.answers,
        files: result.files.map((f) => ({ key: f.key, name: f.name, sizeBytes: f.bytes.byteLength, checksum: f.checksum })),
      },
      "form-submit",
    );
    if (published > 0) {
      await outbound.flushTenantDeliveries(ctx.dataDir, tenantId).catch(() => undefined);
    }
  } catch { /* event publish is best-effort after the durable record */ }
  return Response.json({
    data: { ok: true, submissionId: submission.id, eventId, status: submission.status },
  });
}

// ── Authed (tenant) router ────────────────────────────────────────────────
export function handleNativeFormsAuthed(req: Request, ctx: NativeFormsCtx): Promise<Response> {
  return handleNativeFormsAuthedAsync(req, ctx);
}
async function handleNativeFormsAuthedAsync(req: Request, ctx: NativeFormsCtx): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const tenantId = ctx.userEmail;
  const P = (name: string) => url.searchParams.get(name);
  try {
    if (pathname === "/api/native/forms" && req.method === "GET") {
      const forms = listForms(ctx.dataDir, tenantId).map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        description: f.description,
        steps: f.steps.length,
        fields: f.steps.reduce((n, s) => n + s.fields.length, 0),
        prefillKeys: f.prefillKeys,
        enabled: f.enabled,
        submissions: listSubmissions(ctx.dataDir, tenantId, f.id).length,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));
      return Response.json({ data: { forms } });
    }
    if (pathname === "/api/native/forms/audit" && req.method === "GET") {
      return Response.json({ data: listFormAudit(ctx.dataDir, tenantId) });
    }
    if (pathname === "/api/native/forms" && req.method === "POST") {
      const b = parseJsonObject(await req.text());
      if (listForms(ctx.dataDir, tenantId).length >= MAX_FORMS_PER_TENANT) {
        return Response.json({ error: `Form limit reached (${MAX_FORMS_PER_TENANT})` }, { status: 400 });
      }
      const def = validateFormDef({ name: b.name, description: b.description, steps: b.steps, prefillKeys: b.prefillKeys });
      if (!def.ok) return Response.json({ error: def.error }, { status: 400 });
      let slug = generateFormSlug();
      for (let attempt = 0; attempt < 3 && slugInUse(ctx.dataDir, slug); attempt++) slug = generateFormSlug();
      if (slugInUse(ctx.dataDir, slug)) return Response.json({ error: "Could not allocate a unique slug" }, { status: 500 });
      const now = new Date().toISOString();
      const form: FormDefinition = {
        id: generateFormEntityId("frm"),
        tenantId,
        slug,
        name: def.name,
        description: def.description,
        steps: def.steps,
        prefillKeys: def.prefillKeys,
        enabled: true,
        createdAt: now,
        createdBy: tenantId,
        updatedAt: now,
        updatedBy: tenantId,
      };
      createForm(ctx.dataDir, form);
      registerSlug(ctx.dataDir, slug, tenantId);
      return Response.json({ data: { id: form.id, slug: form.slug } });
    }
    // /api/native/forms/submissions/:sid/...
    const subMatch = pathname.match(/^\/api\/native\/forms\/submissions\/([A-Za-z0-9_-]+)(\/download)?$/);
    if (subMatch) {
      const sid = subMatch[1];
      const isDownload = subMatch[2] === "/download";
      if (isDownload && req.method === "GET") {
        const key = P("key") || "";
        if (!FILE_KEY_RE.test(key)) return Response.json({ error: "key invalid" }, { status: 400 });
        const submission = getSubmission(ctx.dataDir, tenantId, sid);
        if (!submission) return Response.json({ error: "Submission not found" }, { status: 404 });
        const meta = submission.files.find((f) => f.key === key);
        if (!meta) return Response.json({ error: "File not found" }, { status: 404 });
        const bytes = readSubmissionFile(ctx.dataDir, tenantId, sid, key);
        if (!bytes) return Response.json({ error: "File bytes missing" }, { status: 404 });
        appendFormAudit(ctx.dataDir, tenantId, tenantId, "native.form.file-download", `Submission ${sid} file ${key}`);
        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "content-type": meta.contentType || "application/octet-stream",
            "content-disposition": `attachment; filename="${key}.bin"`,
            "cache-control": "no-store",
          },
        });
      }
      if (!isDownload && req.method === "DELETE") {
        const removed = deleteSubmission(ctx.dataDir, tenantId, sid, tenantId);
        if (!removed) return Response.json({ error: "Submission not found" }, { status: 404 });
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    const formMatch = pathname.match(/^\/api\/native\/forms\/([A-Za-z0-9_-]+)(\/[a-z-]+)?$/);
    if (!formMatch) return Response.json({ error: "Unknown native forms endpoint" }, { status: 404 });
    const formId = formMatch[1];
    const action = formMatch[2] ?? "";
    const form = getForm(ctx.dataDir, tenantId, formId);
    if (!form) return Response.json({ error: "Form not found" }, { status: 404 });
    if (action === "/submissions" && req.method === "GET") {
      return Response.json({
        data: listSubmissions(ctx.dataDir, tenantId, formId).map((s) => ({
          id: s.id,
          formId: s.formId,
          status: s.status,
          eventId: s.eventId,
          answers: s.answers,
          files: s.files,
          submittedAt: s.submittedAt,
          submittedBy: s.submittedBy,
          source: s.source,
        })),
      });
    }
    if (action === "" && req.method === "GET") {
      return Response.json({ data: form });
    }
    if (action === "" && req.method === "POST") {
      const b = parseJsonObject(await req.text());
      const def = validateFormDef({ name: b.name ?? form.name, description: b.description ?? form.description, steps: b.steps ?? form.steps, prefillKeys: b.prefillKeys ?? form.prefillKeys });
      if (!def.ok) return Response.json({ error: def.error }, { status: 400 });
      const updated = updateForm(ctx.dataDir, tenantId, formId, { name: def.name, description: def.description, steps: def.steps, prefillKeys: def.prefillKeys }, tenantId);
      return Response.json({ data: { id: updated!.id, updated: true } });
    }
    if (action === "/enable" && req.method === "POST") {
      updateForm(ctx.dataDir, tenantId, formId, { enabled: true }, tenantId);
      return Response.json({ ok: true });
    }
    if (action === "/disable" && req.method === "POST") {
      updateForm(ctx.dataDir, tenantId, formId, { enabled: false }, tenantId);
      return Response.json({ ok: true });
    }
    if (action === "" && req.method === "DELETE") {
      const removed = deleteForm(ctx.dataDir, tenantId, formId, tenantId);
      if (!removed) return Response.json({ error: "Form has submissions or not found — delete submissions first" }, { status: 400 });
      unregisterSlugByFormId(ctx.dataDir, tenantId, formId);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 400 });
  }
}

/** Register the built-in typed event `native.form.submission`. */
export function registerBuiltinNativeFormEventTypes(): void {
  registerNativeEventType("native.form.submission", {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.formId !== "string" || typeof p.submissionId !== "string" || typeof p.eventId !== "string") {
        return { ok: false, reason: "payload needs formId, submissionId and eventId" };
      }
      return { ok: true };
    },
  });
}