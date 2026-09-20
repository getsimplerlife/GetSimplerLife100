/**
 * native-forms.test.ts — Phase 1.3 forms builder v1 (vitest — canonical runner).
 *
 * Coverage: store CRUD + isolation + audit; validation/conditional logic/
 * prefill; public submit (slug-gated, idempotent, fail-closed gates, files);
 * authed CRUD; submissions → typed `native.form.submission` event through the
 * Phase 1.1 webhook publisher (deliveries enqueued / registry validation).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createForm,
  listForms,
  getForm,
  deleteForm,
  saveSubmission,
  deleteSubmission,
  listSubmissions,
  getSubmission,
  countTenantFormFiles,
  countFormAudit,
  registerSlug,
  tenantIdForSlug,
  slugInUse,
  unregisterSlug,
  generateFormEntityId,
  generateFormSlug,
} from "../native/forms/store";
import { validateSubmission, applyPrefill, isFieldVisible, sniffFileKind } from "../native/forms/logic";
import { handleNativeFormSubmit, handleNativeFormsAuthed, registerBuiltinNativeFormEventTypes } from "../native/forms/router";
import { clearNativeEventRegistry, validateNativeEventType } from "../native/webhooks/registry";
import { publishWebhookEvent } from "../native/webhooks/outbound";
import { saveSubscription, listDeliveries } from "../native/webhooks/store";
import type { FormDefinition, FormField } from "../native/forms/types";

let dataDir = "";
let t = 0;
function freshDir(): string {
  t += 1;
  return mkdtempSync(join(tmpdir(), `native-forms-${process.pid}-${t}-`));
}
beforeEach(() => {
  dataDir = freshDir();
});
afterEach(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

function field(over: Partial<FormField> & { key: string; label: string; type: FormField["type"] }): FormField {
  const { key, label, type, ...rest } = over;
  return { key, label, type, ...rest };
}
function makeForm(tenantId: string, over?: Partial<FormDefinition>): FormDefinition {
  return {
    id: over?.id ?? generateFormEntityId("frm"),
    tenantId,
    slug: over?.slug ?? generateFormSlug(),
    name: over?.name ?? "Lead capture",
    description: "",
    steps: over?.steps ?? [
      {
        id: "step_1",
        title: "Contact",
        fields: [
          field({ key: "email", label: "Email", type: "email", required: true }),
          field({ key: "company", label: "Company", type: "text", required: true, validation: { maxLength: 120 } }),
          field({ key: "budget", label: "Budget", type: "select", options: ["<5k", "5k-20k", ">20k"], showWhen: { field: "company", op: "neq", value: "none" } }),
          field({ key: "attachment", label: "Attachment", type: "file", fileTypes: ["pdf", "png"] }),
        ],
      },
    ],
    prefillKeys: over?.prefillKeys ?? ["company"],
    enabled: over?.enabled ?? true,
    createdAt: new Date().toISOString(),
    createdBy: tenantId,
    updatedAt: new Date().toISOString(),
    updatedBy: tenantId,
  };
}
const PDF_B64 = Buffer.from("%PDF-1.4\n%%EOF").toString("base64");

const req = (method: string, path: string, body?: unknown): Request => {
  const init: RequestInit = { method };
  if (body !== undefined) {
    (init.headers as Record<string, string>) = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://x${path}`, init);
};
async function createFormViaApi(tenant: string): Promise<{ id: string; slug: string }> {
  const res = await handleNativeFormsAuthed(
    req("POST", "/api/native/forms", {
      name: "Lead capture",
      steps: [
        {
          title: "Contact",
          fields: [
            { key: "email", label: "Email", type: "email", required: true },
            { key: "company", label: "Company", type: "text", required: true },
            { key: "notes", label: "Notes", type: "textarea" },
            { key: "docs", label: "Attachment", type: "file", fileTypes: ["pdf", "png"] },
          ],
        },
      ],
      prefillKeys: ["company"],
    }),
    { userEmail: tenant, dataDir },
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as any;
  return { id: body.data.id, slug: body.data.slug };
}

// ── Store ────────────────────────────────────────────────────────────────
describe("native forms — store", () => {
  it("form CRUD + audit; delete fails closed while submissions exist", () => {
    const form = makeForm("a@x");
    createForm(dataDir, form);
    registerSlug(dataDir, form.slug, form.tenantId);
    expect(listForms(dataDir, "a@x")).toHaveLength(1);
    expect(getForm(dataDir, "a@x", form.id)?.id).toBe(form.id);
    expect(deleteForm(dataDir, "a@x", form.id, "a@x")).toBe(true);
    expect(listForms(dataDir, "a@x")).toHaveLength(0);
    expect(countFormAudit(dataDir, "a@x")).toBe(2); // create + delete

    const form2 = makeForm("a@x");
    createForm(dataDir, form2);
    saveSubmission(dataDir, { id: generateFormEntityId("sub"), tenantId: "a@x", formId: form2.id, status: "received", answers: { email: "e@x" }, files: [], eventId: null, submittedAt: new Date().toISOString(), submittedBy: "anon", source: "test" }, []);
    expect(deleteForm(dataDir, "a@x", form2.id, "a@x")).toBe(false); // fail-closed
    deleteSubmission(dataDir, "a@x", listSubmissions(dataDir, "a@x", form2.id)[0].id, "a@x");
    expect(deleteForm(dataDir, "a@x", form2.id, "a@x")).toBe(true);
  });

  it("cross-tenant isolation: foreign form/submission ids resolve to nothing", () => {
    const form = makeForm("a@x");
    createForm(dataDir, form);
    saveSubmission(dataDir, { id: "sub_a1", tenantId: "a@x", formId: form.id, status: "received", answers: {}, files: [], eventId: null, submittedAt: new Date().toISOString(), submittedBy: "anon", source: "t" }, []);
    expect(getForm(dataDir, "b@x", form.id)).toBeNull();
    expect(getSubmission(dataDir, "b@x", "sub_a1")).toBeNull();
    expect(listForms(dataDir, "b@x")).toHaveLength(0);
    expect(countTenantFormFiles(dataDir, "b@x")).toBe(0);
    expect(countFormAudit(dataDir, "b@x")).toBe(0);
    expect(countFormAudit(dataDir, "a@x")).toBeGreaterThan(0);
  });

  it("slug index maps slug→tenant globally (nothing else)", () => {
    const form = makeForm("a@x", { slug: "slug_abcdef123456" });
    createForm(dataDir, form);
    registerSlug(dataDir, form.slug, "a@x");
    expect(tenantIdForSlug(dataDir, "slug_abcdef123456")).toBe("a@x");
    expect(slugInUse(dataDir, "slug_abcdef123456")).toBe(true);
    unregisterSlug(dataDir, form.slug);
    expect(tenantIdForSlug(dataDir, "slug_abcdef123456")).toBeNull();
  });
});

// ── Logic: validation / conditional / prefill / files ──────────────────────
describe("native forms — logic", () => {
  it("validates required/email/pattern/number/select; unknown keys fail closed", () => {
    const form = makeForm("a@x");
    const good = validateSubmission(form, { email: "x@y.com", company: "Acme", budget: "5k-20k" }, []);
    expect(good.ok).toBe(true);
    const badEmail = validateSubmission(form, { email: "nope", company: "Acme" }, []);
    expect(badEmail.ok).toBe(false);
    expect((badEmail as any).errors.join()).toContain("email");
    const missing = validateSubmission(form, { email: "x@y.com" }, []);
    expect(missing.ok).toBe(false);
    expect((missing as any).errors.join()).toContain("company");
    const unknown = validateSubmission(form, { email: "x@y.com", company: "Acme", evil: "x" }, []);
    expect(unknown.ok).toBe(false);
    expect((unknown as any).errors.join()).toContain("Unknown field");
    const badOption = validateSubmission(form, { email: "x@y.com", company: "Acme", budget: "100k" }, []);
    expect(badOption.ok).toBe(false);
    expect((badOption as any).errors.join()).toContain("option");
  });

  it("conditional logic hides fields (eq/neq/contains) and ignores hidden answers", () => {
    const form = makeForm("a@x");
    const budget = form.steps[0].fields.find((f) => f.key === "budget")!;
    expect(isFieldVisible(budget, { company: "Acme" })).toBe(true);
    expect(isFieldVisible(budget, { company: "none" })).toBe(false);
    const r = validateSubmission(form, { email: "x@y.com", company: "none", budget: "5k-20k" }, []);
    expect(r.ok).toBe(true); // hidden budget ignored even though provided
    expect((r as any).answers.budget).toBeUndefined();
  });

  it("prefill only apply-listed keys", () => {
    const form = makeForm("a@x");
    const merged = applyPrefill(form, {}, { company: "Prefilled Co", evil: "x" });
    expect(merged.company).toBe("Prefilled Co");
    expect((merged as any).evil).toBeUndefined();
  });

  it("file sniffing: magic bytes must match extension; caps enforced", () => {
    expect(sniffFileKind(new Uint8Array(Buffer.from("%PDF-1.4", "latin1")))).toBe("pdf");
    expect(sniffFileKind(new Uint8Array(Buffer.from("hello world", "latin1")))).toBe("other");
    const form = makeForm("a@x");
    const pdfBytes = new Uint8Array(Buffer.from("%PDF-1.4\n%%EOF"));
    const ok = validateSubmission(form, { email: "x@y.com", company: "Acme" }, [{ key: "attachment", name: "a.pdf", contentType: "application/pdf", bytes: pdfBytes }]);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.files).toHaveLength(1);
    const wrongExt = validateSubmission(form, { email: "x@y.com", company: "Acme" }, [{ key: "attachment", name: "a.png", contentType: "image/png", bytes: pdfBytes }]);
    expect(wrongExt.ok).toBe(false);
    expect((wrongExt as any).errors.join()).toContain("extension");
    const undeclared = validateSubmission(form, { email: "x@y.com", company: "Acme" }, [{ key: "other", name: "a.pdf", contentType: "application/pdf", bytes: pdfBytes }]);
    expect(undeclared.ok).toBe(false);
    const tooMany = validateSubmission(form, { email: "x@y.com", company: "Acme" }, Array.from({ length: 6 }, (_, i) => ({ key: "attachment", name: `a${i}.pdf`, contentType: "application/pdf", bytes: pdfBytes })));
    expect(tooMany.ok).toBe(false);
    expect((tooMany as any).errors.join()).toContain("5 files");
  });
});

// ── Public submit ──────────────────────────────────────────────────────────
describe("native forms — public submit", () => {
  it("happy path: 200 + eventId; submission + audit + file stored", async () => {
    const { slug } = await createFormViaApi("a@x");
    const res = await handleNativeFormSubmit(
      req("POST", `/api/native/forms/${slug}/submit`, {
        id: "sub_ClientSupplied123",
        answers: { email: "lead@acme.com", company: "Acme", notes: "hi" },
        files: { docs: { name: "brief.pdf", contentType: "application/pdf", contentBase64: PDF_B64 } },
        source: "landing-page",
      }),
      { dataDir },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.ok).toBe(true);
    expect(body.data.submissionId).toBe("sub_ClientSupplied123");
    expect(body.data.eventId).toMatch(/^evt_/);
    expect(getSubmission(dataDir, "a@x", "sub_ClientSupplied123")).not.toBeNull();
    expect(countTenantFormFiles(dataDir, "a@x")).toBe(1);
    expect(countFormAudit(dataDir, "a@x")).toBeGreaterThan(0);
  });

  it("idempotent replay returns duplicate — never double-recorded", async () => {
    const { slug } = await createFormViaApi("a@x");
    const payload = { id: "sub_RepeatMe12345", answers: { email: "l@x.com", company: "C" }, files: {} };
    const first = await handleNativeFormSubmit(req("POST", `/api/native/forms/${slug}/submit`, payload), { dataDir });
    expect(first.status).toBe(200);
    const second = await handleNativeFormSubmit(req("POST", `/api/native/forms/${slug}/submit`, payload), { dataDir });
    expect(second.status).toBe(200);
    expect(((await second.json()) as any).data.duplicate).toBe(true);
    expect(listSubmissions(dataDir, "a@x")).toHaveLength(1);
  });

  it("fail-closed gates: unknown slug 404, disabled 404, GET 405, bad id 400", async () => {
    const { slug } = await createFormViaApi("a@x");
    expect((await handleNativeFormSubmit(req("POST", "/api/native/forms/slug_zzz9999999999/submit", { id: "sub_UnknownForm12", answers: {} }), { dataDir })).status).toBe(404);
    await handleNativeFormsAuthed(req("POST", `/api/native/forms/${(await createFormViaApi("a@x")).id}/disable`), { userEmail: "a@x", dataDir });
    // disable a fresh form
    const { id: disabledId } = await createFormViaApi("a@x");
    await handleNativeFormsAuthed(req("POST", `/api/native/forms/${disabledId}/disable`), { userEmail: "a@x", dataDir });
    const f = getForm(dataDir, "a@x", disabledId)!;
    expect((await handleNativeFormSubmit(req("POST", `/api/native/forms/${f.slug}/submit`, { id: "sub_DisabledForm1", answers: {} }), { dataDir })).status).toBe(404);
    expect((await handleNativeFormSubmit(req("GET", `/api/native/forms/${slug}/submit`), { dataDir })).status).toBe(405);
    expect((await handleNativeFormSubmit(req("POST", `/api/native/forms/${slug}/submit`, { id: "tooshort", answers: {} }), { dataDir })).status).toBe(400);
    const badJson = new Request(`http://x/api/native/forms/${slug}/submit`, { method: "POST", body: "{oops" });
    expect((await handleNativeFormSubmit(badJson, { dataDir })).status).toBe(400);
  });

  it("validation failures → 400 with field errors; file limits enforced", async () => {
    const { slug } = await createFormViaApi("a@x");
    const missing = await handleNativeFormSubmit(req("POST", `/api/native/forms/${slug}/submit`, { id: "sub_Missing12345", answers: {} }), { dataDir });
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as any).errors.length).toBeGreaterThan(0);
    const badFile = await handleNativeFormSubmit(
      req("POST", `/api/native/forms/${slug}/submit`, {
        id: "sub_BadFile12345",
        answers: { email: "l@x.com", company: "C" },
        files: { docs: { name: "evil.png", contentType: "image/png", contentBase64: PDF_B64 } },
      }),
      { dataDir },
    );
    expect(badFile.status).toBe(400);
    expect(((await badFile.json()) as any).errors.join()).toContain("extension");
  });
});

// ── Authed router ──────────────────────────────────────────────────────────
describe("native forms — authed API", () => {
  it("create/list/update/enable/disable; definition validation fail-closed", async () => {
    const dup = await handleNativeFormsAuthed(
      req("POST", "/api/native/forms", {
        name: "x",
        steps: [{ fields: [
          { key: "a", label: "A", type: "text" },
          { key: "a", label: "A2", type: "text" },
        ] }],
      }),
      { userEmail: "a@x", dataDir },
    );
    expect(dup.status).toBe(400); // duplicate key
    const badType = await handleNativeFormsAuthed(
      req("POST", "/api/native/forms", { name: "x", steps: [{ fields: [{ key: "a", label: "A", type: "evil" }] }] }),
      { userEmail: "a@x", dataDir },
    );
    expect(badType.status).toBe(400);
    const stripped = await handleNativeFormsAuthed(
      req("POST", "/api/native/forms", { name: "x", steps: [{ fields: [{ key: "a", label: "A", type: "text", validation: { pattern: "(" } }] }] }),
      { userEmail: "a@x", dataDir },
    );
    expect(stripped.status).toBe(400); // invalid pattern regex
    const { id } = await createFormViaApi("a@x");
    const listRes = await handleNativeFormsAuthed(req("GET", "/api/native/forms"), { userEmail: "a@x", dataDir });
    expect(((await listRes.json()) as any).data.forms).toHaveLength(1);
    const upd = await handleNativeFormsAuthed(req("POST", `/api/native/forms/${id}`, { name: "Renamed" }), { userEmail: "a@x", dataDir });
    expect(upd.status).toBe(200);
    expect(getForm(dataDir, "a@x", id)?.name).toBe("Renamed");
    await handleNativeFormsAuthed(req("POST", `/api/native/forms/${id}/disable`), { userEmail: "a@x", dataDir });
    expect(getForm(dataDir, "a@x", id)?.enabled).toBe(false);
  });

  it("submission list + file download; delete form needs empty submissions", async () => {
    const { id, slug } = await createFormViaApi("a@x");
    await handleNativeFormSubmit(req("POST", `/api/native/forms/${slug}/submit`, { id: "sub_List01abc123", answers: { email: "e@x.com", company: "C" }, files: { docs: { name: "b.pdf", contentType: "application/pdf", contentBase64: PDF_B64 } } }), { dataDir });
    const list = await handleNativeFormsAuthed(req("GET", `/api/native/forms/${id}/submissions`), { userEmail: "a@x", dataDir });
    const subs = ((await list.json()) as any).data;
    expect(subs).toHaveLength(1);
    expect(subs[0].files[0].name).toBe("b.pdf");
    const dl = await handleNativeFormsAuthed(req("GET", `/api/native/forms/submissions/${subs[0].id}/download?key=docs`), { userEmail: "a@x", dataDir });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await dl.arrayBuffer());
    expect(bytes[0]).toBe(0x25);
    const delForm = await handleNativeFormsAuthed(req("DELETE", `/api/native/forms/${id}`), { userEmail: "a@x", dataDir });
    expect(delForm.status).toBe(400); // has submissions
    const delSub = await handleNativeFormsAuthed(req("DELETE", `/api/native/forms/submissions/${subs[0].id}`), { userEmail: "a@x", dataDir });
    expect(delSub.status).toBe(200);
    expect(countTenantFormFiles(dataDir, "a@x")).toBe(0);
    expect((await handleNativeFormsAuthed(req("DELETE", `/api/native/forms/${id}`), { userEmail: "a@x", dataDir })).status).toBe(200);
  });

  it("cross-tenant: foreign form id → 404; audit tenant-scoped", async () => {
    const { id } = await createFormViaApi("a@x");
    const res = await handleNativeFormsAuthed(req("GET", `/api/native/forms/${id}`), { userEmail: "b@x", dataDir });
    expect(res.status).toBe(404);
    const audit = await handleNativeFormsAuthed(req("GET", "/api/native/forms/audit"), { userEmail: "b@x", dataDir });
    expect(((await audit.json()) as any).data).toHaveLength(0);
    expect((await handleNativeFormsAuthed(req("GET", "/api/native/forms/nope"), { userEmail: "a@x", dataDir })).status).toBe(404);
  });
});

// ── Typed workflow events ───────────────────────────────────────────────────
describe("native forms — submissions as typed workflow events", () => {
  it("registers native.form.submission with a validating entry", () => {
    clearNativeEventRegistry();
    registerBuiltinNativeFormEventTypes();
    expect(validateNativeEventType("native.form.submission", { formId: "f1", submissionId: "s1", eventId: "e1" })).toEqual({ ok: true, known: true });
    expect(validateNativeEventType("native.form.submission", { formId: "f1" })).toEqual({ ok: false, known: true, reason: expect.any(String) });
  });

  it("publishWebhookEvent enqueues durable deliveries for matching subscriptions", async () => {
    const tenant = "a@x";
    saveSubscription(dataDir, {
      id: "sub_webhook01",
      tenantId: tenant,
      url: "https://example.invalid/hook",
      secretEncrypted: "",
      eventTypes: [],
      enabled: true,
      retry: { maxAttempts: 3, initialBackoffMs: 100 },
      createdBy: tenant,
      createdAt: new Date().toISOString(),
    });
    const published = publishWebhookEvent(dataDir, tenant, "native.form.submission", { formId: "f1", submissionId: "s1", eventId: "e1", answers: {} }, "form-submit");
    expect(published).toBe(1);
    const deliveries = listDeliveries(dataDir, tenant);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].eventType).toBe("native.form.submission");
    expect(deliveries[0].subscriptionId).toBe("sub_webhook01");
  });
});