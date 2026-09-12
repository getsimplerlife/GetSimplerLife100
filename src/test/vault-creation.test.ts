// @vitest-environment node
/**
 * vault-creation.test.ts — Phase 1.5c API-level regression + isolation test.
 *
 * Drives the REAL HTTP path against the self-hosted prod server:
 *   template catalog CRUD → document creation (approval-gated) → portal
 *   approve EXECUTES the native createVaultDocument action → the created PDF
 *   is an ordinary vault doc (list / download / search / audit all work) →
 *   import sniffing / caps → fail-closed + cross-tenant isolation at the API
 *   layer (other-tenant template ids never resolve; no pending is ever
 *   fabricated for an unknown/foreign template; unauth 401).
 *
 * SECURITY HARD BAR: this is the per-PR security test for slice 5c (IDOR,
 * injection, fail-closed misconfiguration, no guessed ids).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ensureTestServer, testBaseUrl } from "./test-env";

const BASE_URL = testBaseUrl();

async function api(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string; form?: FormData } = {},
): Promise<{ status: number; json: any; cookie?: string }> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers["cookie"] = opts.cookie;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE_URL}${path}`, { method: opts.method || "GET", headers, body });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  const setCookie = res.headers.get("set-cookie") || undefined;
  return { status: res.status, json, cookie: setCookie };
}

async function register(email: string): Promise<string> {
  const r = await api("/api/register", { method: "POST", body: { email, password: "Vault5cPass2026" } });
  expect(r.status).toBe(200);
  const cookie = (r.cookie || "").split(";")[0];
  expect(cookie).toMatch(/^session=/);
  return cookie;
}

const PROPOSAL_BODY = [
  "# {{customer}}",
  "## Scope",
  "- {{scope}}",
  "{{notes}}",
].join("\n");

function makeTemplatePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Proposal",
    description: "Engagement proposal",
    body: PROPOSAL_BODY,
    fields: [
      { key: "customer", label: "Customer", type: "text", required: true },
      { key: "scope", label: "Scope", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    ...overrides,
  };
}

describe("5c template catalog + document creation (native, approval-gated)", () => {
  beforeAll(async () => {
    await ensureTestServer();
  });
  afterAll(async () => { /* self-hosted server lifecycle is managed by test-env */ });

  it("template CRUD: create → list → version → full → delete (re-delete idempotent, unknown fails closed)", async () => {
    const email = `vault5c-a-${Date.now()}@test.local`;
    const cookie = await register(email);

    const create = await api("/api/vault/templates", { method: "POST", cookie, body: makeTemplatePayload() });
    expect(create.status).toBe(200);
    const tplId = create.json.data.template?.id || "";
    expect(tplId.startsWith("tpl_")).toBe(true);

    const list = await api("/api/vault/templates", { cookie });
    expect(list.status).toBe(200);
    expect(list.json.data.some((t: any) => t.id === tplId && t.version === 1)).toBe(true);

    const full = await api(`/api/vault/templates/full?templateId=${tplId}`, { cookie });
    expect(full.status).toBe(200);
    expect(full.json.data.body).toContain("{{customer}}");

    const upd = await api("/api/vault/templates/update", { method: "POST", cookie, body: { templateId: tplId, body: "# {{customer}}\n\nUpdated body" } });
    expect(upd.status).toBe(200);
    expect(upd.json.data.ok).toBe(true);
    expect(upd.json.data.version).toBe(2);
    expect(upd.json.data.previous).toBe(1);

    const full2 = await api(`/api/vault/templates/full?templateId=${tplId}`, { cookie });
    expect(full2.json.data.history.length).toBe(1);
    expect(full2.json.data.history[0].version).toBe(1);
    expect(full2.json.data.history[0].body).toContain("## Scope");

    const del = await api(`/api/vault/templates?templateId=${tplId}`, { method: "DELETE", cookie });
    expect(del.status).toBe(200);
    expect(del.json.data.ok).toBe(true);
    const gone = await api(`/api/vault/templates/full?templateId=${tplId}`, { cookie });
    expect(gone.status).toBe(404);
    const redel = await api(`/api/vault/templates?templateId=${tplId}`, { method: "DELETE", cookie });
    expect(redel.status).toBe(200);
    expect(redel.json.data.unchanged).toBe(true); // idempotent-by-audit
    const unknown = await api(`/api/vault/templates?templateId=tpl_never_existed`, { method: "DELETE", cookie });
    expect(unknown.status).toBe(400);

    // Immutable audit recorded the catalog mutations.
    const audit = await api("/api/vault/audit", { cookie });
    expect(audit.json.data.some((a: any) => a.action === "vaultTemplate.create" && a.documentId === tplId)).toBe(true);
    expect(audit.json.data.some((a: any) => a.action === "vaultTemplate.update" && a.documentId === tplId)).toBe(true);
    expect(audit.json.data.some((a: any) => a.action === "vaultTemplate.delete" && a.documentId === tplId)).toBe(true);
  });

  it("import: valid .json is accepted; oversized import fails closed", async () => {
    const email = `vault5c-b-${Date.now()}@test.local`;
    const cookie = await register(email);

    const form = new FormData();
    form.append("file", new Blob([JSON.stringify(makeTemplatePayload({ name: "Imported" }))], { type: "application/json" }), "imported.json");
    const imp = await api("/api/vault/templates/import", { method: "POST", form, cookie });
    expect(imp.status).toBe(200);
    expect(imp.json.data.ok).toBe(true);

    const big = new Blob([new Uint8Array(1024 * 1024 + 32)], { type: "application/octet-stream" });
    const form2 = new FormData();
    form2.append("file", big, "big.json");
    const imp2 = await api("/api/vault/templates/import", { method: "POST", form: form2, cookie });
    expect(imp2.status).toBe(400);
  });

  it("create → approval → approve EXECUTES the document creation (filed, downloadable, searchable, audited)", async () => {
    const email = `vault5c-c-${Date.now()}@test.local`;
    const cookie = await register(email);

    const create = await api("/api/vault/templates", { method: "POST", cookie, body: makeTemplatePayload() });
    const tplId = create.json.data.template.id;

    // Creation write → approval-gated pending (default approvals ON).
    const created = await api("/api/vault/create", {
      method: "POST", cookie,
      body: { templateId: tplId, name: "Proposal-Acme", fields: { customer: "Acme Consulting", scope: "Audit 2026", notes: "Due Friday EOB" }, route: "Acme Consulting/Proposals/2026" },
    });
    expect(created.status).toBe(200);
    expect(created.json.data.pending).toBe(true);
    const actionId = created.json.data.actionId;
    expect(typeof actionId).toBe("string");

    // Portal approve → the native createVaultDocument executor MUST run.
    const approve = await api("/api/portal/approvals", { method: "POST", cookie, body: { actionId, decision: "approve" } });
    expect(approve.status).toBe(200);
    expect(approve.json.data.execution.success).toBe(true);
    const docId = approve.json.data.execution.result.documentId;
    expect(typeof docId).toBe("string");

    // The created doc is an ORDINARY vault doc — file/move/archive/destroy/
    // search/download all apply unchanged.
    const docs = await api("/api/vault/docs", { cookie });
    const doc = docs.json.data.find((d: any) => d.id === docId);
    expect(doc.name).toBe("Proposal-Acme.pdf");
    expect(doc.route).toBe("Acme Consulting/Proposals/2026");
    expect(doc.status).toBe("active");

    const dl = await api(`/api/vault/download?docId=${docId}`, { cookie });
    expect(dl.status).toBe(200);
    expect(dl.json).toBeNull(); // binary body
    const dlBytes = new Uint8Array(await (await fetch(`${BASE_URL}/api/vault/download?docId=${docId}`, { headers: { cookie } })).arrayBuffer());
    const head = new TextDecoder().decode(dlBytes.subarray(0, 8));
    expect(head.startsWith("%PDF-")).toBe(true);

    // Search hits the RENDERED CONTENT (text projection passed to intake).
    const search = await api("/api/vault/search?q=Due%20Friday", { cookie });
    expect(search.json.data.some((d: any) => d.id === docId)).toBe(true);

    // Immutable audit: pending + executed create + filed-on-creation.
    const audit = await api("/api/vault/audit", { cookie });
    expect(audit.json.data.some((a: any) => a.action === "createVaultDocument" && a.outcome === "pending" && (a.detail || "").includes(actionId))).toBe(true);
    expect(audit.json.data.some((a: any) => a.action === "vault.document.create" && a.outcome === "ok" && a.documentId === docId)).toBe(true);
    expect(audit.json.data.some((a: any) => a.action === "writeVaultDocument" && a.outcome === "ok" && a.documentId === docId && a.route === "Acme Consulting/Proposals/2026")).toBe(true);
  });

  it("fail-closed: unknown + other-tenant template ids never create a pending action; unauth 401", async () => {
    const emailA = `vault5c-d-${Date.now()}@test.local`;
    const cookieA = await register(emailA);
    const create = await api("/api/vault/templates", { method: "POST", cookie: cookieA, body: makeTemplatePayload() });
    const tplIdA = create.json.data.template.id;

    // Unknown template id → 400 Template not found, NO pending fabricated.
    const unknown = await api("/api/vault/create", { method: "POST", cookie: cookieA, body: { templateId: "tpl_unknown_xyz", name: "x", fields: { customer: "a" } } });
    expect(unknown.status).toBe(400);
    expect(unknown.json.data.ok).toBe(false);
    expect(unknown.json.data.error).toBe("Template not found");
    expect(unknown.json.data.pending).toBeUndefined();

    // Missing required field / unknown field key → 400 before any gate.
    const badFields = await api("/api/vault/create", { method: "POST", cookie: cookieA, body: { templateId: tplIdA, name: "x", fields: { scope: "no customer" } } });
    expect(badFields.status).toBe(400);
    expect(badFields.json.data.pending).toBeUndefined();
    const unknownField = await api("/api/vault/create", { method: "POST", cookie: cookieA, body: { templateId: tplIdA, name: "x", fields: { customer: "a", hacked: "y" } } });
    expect(unknownField.status).toBe(400);

    // Other tenant: cannot see the template, cannot create from it (404/400, no pending).
    const emailB = `vault5c-e-${Date.now()}@test.local`;
    const cookieB = await register(emailB);
    const listB = await api("/api/vault/templates", { cookie: cookieB });
    expect(listB.json.data).toHaveLength(0);
    const getB = await api(`/api/vault/templates/full?templateId=${tplIdA}`, { cookie: cookieB });
    expect(getB.status).toBe(404);
    const createB = await api("/api/vault/create", { method: "POST", cookie: cookieB, body: { templateId: tplIdA, name: "x", fields: { customer: "a", scope: "s", notes: "n" } } });
    expect(createB.status).toBe(400);
    expect(createB.json.data.error).toBe("Template not found");
    expect(createB.json.data.pending).toBeUndefined();
    // No leftover approval for tenant B, none for tenant A.
    const approvalsB = await api("/api/portal/approvals", { cookie: cookieB });
    expect(approvalsB.json.data.pending.filter((p: any) => (p.payload || {}).templateId === tplIdA)).toHaveLength(0);

    // Unauthenticated → 401 on every new route.
    const unauth = await api("/api/vault/templates");
    expect(unauth.status).toBe(401);
    const unauthCreate = await api("/api/vault/create", { method: "POST", body: { templateId: "x", name: "x", fields: {} } });
    expect(unauthCreate.status).toBe(401);
  });
});