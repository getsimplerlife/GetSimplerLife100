// @vitest-environment node
/**
 * vault-filing-api.test.ts — Phase 1.5d FILING LAYER at the HTTP layer.
 *
 * Drives the REAL self-hosted prod server (test-env, port 3999) over:
 *   - GET /api/vault/folders returning the {folders, rules} taxonomy shape
 *     the portal already renders (regression: the route used to return a bare
 *     array, so the portal's rules panel was always empty),
 *   - folder create / rename / labels / delete (exact id) + idempotent-by-audit
 *     re-delete replay,
 *   - auto-folder rule create/list/delete over the API,
 *   - a REAL gated filing (upload → file pending → portal approve) creating +
 *     auditing the route's folder nodes end to end,
 *   - DATA ISOLATION re-proof at the API layer: tenant B sees none of tenant
 *     A's taxonomy, and B mutating A's folder/rule ids fails closed,
 *   - unauthenticated access is fail-closed 401 on every new route.
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
  return { status: res.status, json, cookie: res.headers.get("set-cookie") || undefined };
}

async function register(email: string): Promise<string> {
  const r = await api("/api/register", { method: "POST", body: { email, password: "Vault5dPass2026" } });
  expect(r.status).toBe(200);
  const cookie = (r.cookie || "").split(";")[0];
  expect(cookie).toMatch(/^session=/);
  return cookie;
}

function pdfBytes(): Uint8Array {
  const text = "BT /F1 12 Tf 72 720 Td (FILING 5D-SMOKE) Tj ET";
  const content = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  const body = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    content,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ].map((o, i) => `${i + 1} 0 obj\n${o}\nendobj`).join("\n");
  return new TextEncoder().encode(`%PDF-1.4\n${body}\nxref\n0 6\n0000000000 65535 f \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n1\n%%EOF\n`);
}

describe("vault 5d filing layer (API)", () => {
  beforeAll(async () => {
    await ensureTestServer();
  });
  afterAll(async () => { /* lifecycle managed by test-env */ });

  it("GET /api/vault/folders returns the {folders, rules} taxonomy shape the portal renders", async () => {
    const cookie = await register(`vault5d-shape-${Date.now()}@test.local`);
    const res = await api("/api/vault/folders", { cookie });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.data.folders)).toBe(true); // NOT a bare array
    expect(Array.isArray(res.json.data.rules)).toBe(true);
  });

  it("folder CRUD round-trip: create (labels) → rename → labels → delete + idempotent re-delete", async () => {
    const cookie = await register(`vault5d-crud-${Date.now()}@test.local`);

    const create = await api("/api/vault/folders", { method: "POST", cookie, body: { path: "Acme Consulting/Contracts/2026", labels: ["client", "legal"] } });
    expect(create.status).toBe(200);
    expect(create.json.data.ok).toBe(true);
    const folderId: string = create.json.data.folder.id;
    expect(folderId).toMatch(/^fol_/);
    expect(create.json.data.created).toHaveLength(3);

    const list = await api("/api/vault/folders", { cookie });
    expect(list.json.data.folders.map((f: any) => f.path)).toEqual(["Acme Consulting", "Acme Consulting/Contracts", "Acme Consulting/Contracts/2026"]);
    expect(list.json.data.folders.find((f: any) => f.id === folderId).labels).toEqual(["client", "legal"]);

    // Duplicate + invalid paths fail closed.
    const dup = await api("/api/vault/folders", { method: "POST", cookie, body: { path: "Acme Consulting/Contracts/2026" } });
    expect(dup.status).toBe(400);
    const traversal = await api("/api/vault/folders", { method: "POST", cookie, body: { path: "../escape" } });
    expect(traversal.status).toBe(400);

    const rename = await api("/api/vault/folders/rename", { method: "POST", cookie, body: { id: folderId, name: "Agreements" } });
    expect(rename.status).toBe(200);
    expect(rename.json.data.folder.path).toBe("Acme Consulting/Contracts/Agreements");

    const labels = await api("/api/vault/folders/labels", { method: "POST", cookie, body: { id: folderId, labels: ["signed", "fy2026"] } });
    expect(labels.status).toBe(200);
    expect(labels.json.data.folder.labels).toEqual(["signed", "fy2026"]);

    const del = await api(`/api/vault/folders?id=${encodeURIComponent(folderId)}`, { method: "DELETE", cookie });
    expect(del.status).toBe(200);
    expect(del.json.data.ok).toBe(true);

    // Idempotent-by-audit re-delete of the SAME exact id → audited no-op.
    const replay = await api(`/api/vault/folders?id=${encodeURIComponent(folderId)}`, { method: "DELETE", cookie });
    expect(replay.status).toBe(200);
    expect(replay.json.data.unchanged).toBe(true);
    expect(replay.json.data.ok).toBe(true);

    // Unknown id → fail closed, never fabricated success.
    const never = await api("/api/vault/folders?id=fol_never_seen", { method: "DELETE", cookie });
    expect(never.status).toBe(400);

    // Immutable audit shows create/rename/labels/delete + replay.
    const audit = await api("/api/vault/audit", { cookie });
    const actions = audit.json.data.map((a: any) => a.action);
    expect(actions).toContain("vault.folder.create");
    expect(actions).toContain("vault.folder.rename");
    expect(actions).toContain("vault.folder.labels");
    const deletes = audit.json.data.filter((a: any) => a.action === "vault.folder.delete" && a.documentId === folderId);
    expect(deletes).toHaveLength(2);
    expect(deletes.at(-1).detail).toContain("Idempotent replay");
  });

  it("rule CRUD over the API: create → listed → delete", async () => {
    const cookie = await register(`vault5d-rules-${Date.now()}@test.local`);
    const create = await api("/api/vault/folders/rules", {
      method: "POST", cookie,
      body: {
        name: "By customer/type/year", enabled: true,
        dimensions: [
          { kind: "customer", source: "doc.customer" },
          { kind: "type", source: "doc.docType" },
          { kind: "date", source: "doc.createdAt", format: "YYYY" },
        ],
        target: "{customer}/{type}/{YYYY}", priority: 100,
      },
    });
    expect(create.status).toBe(200);
    expect(create.json.data.ok).toBe(true);
    const ruleId: string = create.json.data.rule.id;

    const list = await api("/api/vault/folders", { cookie });
    expect(list.json.data.rules.some((r: any) => r.id === ruleId)).toBe(true);

    const del = await api(`/api/vault/folders/rules?id=${encodeURIComponent(ruleId)}`, { method: "DELETE", cookie });
    expect(del.status).toBe(200);
    expect(del.json.data.ok).toBe(true);
    const list2 = await api("/api/vault/folders", { cookie });
    expect(list2.json.data.rules.some((r: any) => r.id === ruleId)).toBe(false);

    const audit = await api("/api/vault/audit", { cookie });
    const ruleActions = audit.json.data.filter((a: any) => a.documentId === ruleId).map((a: any) => a.action);
    expect(ruleActions).toContain("vault.folder.rule.create");
    expect(ruleActions).toContain("vault.folder.rule.delete");
  });

  it("a REAL gated filing (upload → file pending → approve) creates + audits the route's folder nodes", async () => {
    const cookie = await register(`vault5d-e2e-${Date.now()}@test.local`);
    const form = new FormData();
    form.append("file", new Blob([pdfBytes() as any], { type: "application/pdf" }), "filing-5d.pdf");
    const up = await api("/api/vault/upload", { method: "POST", form, cookie });
    expect(up.status).toBe(200);
    const docId: string = up.json.data.documentId;

    const fileReq = await api("/api/vault/file", { method: "POST", cookie, body: { documentId: docId, route: "Acme Consulting/Invoices/2026" } });
    expect(fileReq.json.data.pending).toBe(true);
    const actionId: string = fileReq.json.data.actionId;

    const approve = await api("/api/portal/approvals", { method: "POST", cookie, body: { actionId, decision: "approve" } });
    expect(approve.status).toBe(200);
    expect(approve.json.data.execution.success).toBe(true);

    // The executed filing created the route's folder nodes (metadata provenance).
    const folders = await api("/api/vault/folders", { cookie });
    expect(folders.json.data.folders.map((f: any) => f.path)).toEqual(["Acme Consulting", "Acme Consulting/Invoices", "Acme Consulting/Invoices/2026"]);
    const audit = await api("/api/vault/audit", { cookie });
    expect(audit.json.data.some((a: any) => a.action === "vault.folder.create" && a.detail?.includes("Acme Consulting/Invoices/2026"))).toBe(true);
    expect(audit.json.data.some((a: any) => a.action === "writeVaultDocument" && a.outcome === "ok" && a.documentId === docId)).toBe(true);
  });

  it("cross-tenant isolation: tenant B sees none of A's taxonomy and cannot mutate A's ids", async () => {
    const cookieA = await register(`vault5d-iso-a-${Date.now()}@test.local`);
    const created = await api("/api/vault/folders", { method: "POST", cookie: cookieA, body: { path: "A-Secret/Contracts", labels: ["private"] } });
    const folderId: string = created.json.data.folder.id;
    const ruleRes = await api("/api/vault/folders/rules", {
      method: "POST", cookie: cookieA,
      body: { name: "A rule", enabled: true, dimensions: [{ kind: "customer", source: "doc.customer" }], target: "{customer}/Docs", priority: 1 },
    });
    const ruleId: string = ruleRes.json.data.rule.id;

    const cookieB = await register(`vault5d-iso-b-${Date.now()}@test.local`);
    const foldersB = await api("/api/vault/folders", { cookie: cookieB });
    expect(foldersB.json.data.folders).toHaveLength(0);
    expect(foldersB.json.data.rules).toHaveLength(0);
    const auditB = await api("/api/vault/audit", { cookie: cookieB });
    expect(auditB.json.data).toHaveLength(0);

    // B cannot rename/label/delete A's folder; cannot delete A's rule.
    const rn = await api("/api/vault/folders/rename", { method: "POST", cookie: cookieB, body: { id: folderId, name: "Hacked" } });
    expect(rn.status).toBe(400);
    expect(rn.json.data.error).toContain("not found");
    const lb = await api("/api/vault/folders/labels", { method: "POST", cookie: cookieB, body: { id: folderId, labels: ["x"] } });
    expect(lb.status).toBe(400);
    const del = await api(`/api/vault/folders?id=${encodeURIComponent(folderId)}`, { method: "DELETE", cookie: cookieB });
    expect(del.status).toBe(400);
    const delRule = await api(`/api/vault/folders/rules?id=${encodeURIComponent(ruleId)}`, { method: "DELETE", cookie: cookieB });
    expect(delRule.status).toBe(404);

    // A's taxonomy intact; A's audit has B's attempts nowhere.
    const foldersA = await api("/api/vault/folders", { cookie: cookieA });
    expect(foldersA.json.data.folders.map((f: any) => f.path)).toContain("A-Secret/Contracts");
    expect(foldersA.json.data.rules).toHaveLength(1);
    const auditA = await api("/api/vault/audit", { cookie: cookieA });
    expect(auditA.json.data.filter((a: any) => a.actor === cookieB ? a : false)).toHaveLength(0);
  });

  it("unauthenticated access is fail-closed 401 on every new 5d route", async () => {
    expect((await api("/api/vault/folders", { method: "POST", body: { path: "X" } })).status).toBe(401);
    expect((await api("/api/vault/folders/rename", { method: "POST", body: { id: "fol_x", name: "Y" } })).status).toBe(401);
    expect((await api("/api/vault/folders/labels", { method: "POST", body: { id: "fol_x", labels: [] } })).status).toBe(401);
    expect((await api("/api/vault/folders?id=fol_x", { method: "DELETE" })).status).toBe(401);
    expect((await api("/api/vault/folders", { method: "GET" })).status).toBe(401);
  });
});