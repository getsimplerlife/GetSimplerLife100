// @vitest-environment node
/**
 * vault-approval-execution.test.ts — API-level regression + isolation test.
 *
 * WHY: the 09-10 live smoke found that approving a vault write in the portal
 * recorded the DECISION but never EXECUTED it: executeAction answered
 * "Unknown action: writeVaultDocument" because the native vault executors were
 * never registered in the engine action registry. This test drives the real
 * HTTP path (register → upload → file → portal approve) against the
 * self-hosted prod server and asserts the document actually lands at its
 * route with an immutable audit trail.
 *
 * Also covers (security hard bar §34-45): destroy idempotent-by-audit replay
 * through the REAL approve path, unknown-id fail-closed, and per-tenant
 * isolation at the API layer (docs / audit / download / move cross-tenant).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ensureTestServer, testBaseUrl } from "./test-env";

const BASE_URL = testBaseUrl();
let serverHandle: any;

// ── tiny helpers ─────────────────────────────────────────────────────────
async function api(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string; form?: FormData } = {},
): Promise<{ status: number; json: any; cookie?: string }> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers["cookie"] = opts.cookie;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // multipart — no content-type header (boundary auto)
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
  const r = await api("/api/register", { method: "POST", body: { email, password: "VaultSmokePass2026" } });
  expect(r.status).toBe(200);
  const cookie = (r.cookie || "").split(";")[0];
  expect(cookie).toMatch(/^session=/);
  return cookie;
}

function pdfBytes(): Uint8Array {
  // Minimal REAL PDF (magic %PDF-, exercises magic-byte sniffing).
  const text =
    "BT /F1 12 Tf 72 720 Td (INVOICE SL-100-2049) Tj ET";
  const content = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  const body = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    content,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ].map((o, i) => `${i + 1} 0 obj\n${o}\nendobj`).join("\n");
  const pdf = `%PDF-1.4\n${body}\nxref\n0 6\n0000000000 65535 f \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n1\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe("vault approval-gated write execution (native vault actions)", () => {
  beforeAll(async () => {
    serverHandle = await ensureTestServer();
  });
  afterAll(async () => { /* self-hosted server lifecycle is managed by test-env */ });

  it("upload → file → portal approve EXECUTES the filed write with an immutable audit trail", async () => {
    const cookie = await register(`vault-e2e-a-${Date.now()}@test.local`);

    // Upload a real PDF via the multipart intake path (magic-byte sniffing).
    const form = new FormData();
    form.append("file", new Blob([pdfBytes() as any], { type: "application/pdf" }), "invoice-e2e.pdf");
    const up = await api("/api/vault/upload", { method: "POST", form, cookie });
    expect(up.status).toBe(200);
    const docId: string = up.json.data.documentId;
    expect(up.json.data.mime).toBe("application/pdf");
    expect(up.json.data.tenantEmail).toMatch(/^vault-e2e-a-/);

    // File action → gated pending (approvals default ON).
    const fileReq = await api("/api/vault/file", {
      method: "POST",
      cookie,
      body: { documentId: docId, route: "Acme Consulting/Invoices/2026" },
    });
    expect(fileReq.status).toBe(200);
    expect(fileReq.json.data.pending).toBe(true);
    const actionId: string = fileReq.json.data.actionId;

    // Portal approve → the write must EXECUTE (regression: was "Unknown action").
    const approve = await api("/api/portal/approvals", {
      method: "POST",
      cookie,
      body: { actionId, decision: "approve" },
    });
    expect(approve.status).toBe(200);
    expect(approve.json.data.execution.success).toBe(true);
    // Document now filed at the canonical route.
    const docs = await api(`/api/vault/docs`, { cookie });
    const doc = docs.json.data.find((d: any) => d.id === docId);
    expect(doc.route).toBe("Acme Consulting/Invoices/2026");
    expect(doc.status).toBe("active");

    // Immutable audit shows intake(ok) + pending + executed-ok with route/sha.
    const auditRes = await api("/api/vault/audit", { cookie });
    const audit = auditRes.json.data;
    expect(audit.some((a: any) => a.action === "writeVaultDocument" && a.outcome === "ok" && a.documentId === docId && a.route === "Acme Consulting/Invoices/2026")).toBe(true);
    expect(audit.some((a: any) => a.action === "writeVaultDocument" && a.outcome === "pending" && (a.detail || "").includes(actionId))).toBe(true);
  });

  it("destroy is idempotent-by-audit through the REAL approve path; unknown ids fail closed", async () => {
    const cookie = await register(`vault-e2e-b-${Date.now()}@test.local`);
    const form = new FormData();
    form.append("file", new Blob([pdfBytes() as any], { type: "application/pdf" }), "destroy-e2e.pdf");
    const up = await api("/api/vault/upload", { method: "POST", form, cookie });
    const docId: string = up.json.data.documentId;

    const destroy = await api("/api/vault/destroy", { method: "POST", cookie, body: { documentId: docId } });
    expect(destroy.json.data.pending).toBe(true);
    const approve1 = await api("/api/portal/approvals", {
      method: "POST", cookie, body: { actionId: destroy.json.data.actionId, decision: "approve" },
    });
    expect(approve1.json.data.execution.success).toBe(true);
    expect(approve1.json.data.execution.result.ok).toBe(true);

    // Re-destroy SAME exact id → approve → audited success no-op (unchanged:true).
    const destroy2 = await api("/api/vault/destroy", { method: "POST", cookie, body: { documentId: docId } });
    expect(destroy2.json.data.pending).toBe(true);
    const approve2 = await api("/api/portal/approvals", {
      method: "POST", cookie, body: { actionId: destroy2.json.data.actionId, decision: "approve" },
    });
    expect(approve2.json.data.execution.success).toBe(true);
    expect(approve2.json.data.execution.result.unchanged).toBe(true);
    const auditRes = await api("/api/vault/audit", { cookie });
    const destroyOk = auditRes.json.data.filter((a: any) => a.action === "deleteVaultDocument" && a.outcome === "ok");
    expect(destroyOk.length).toBe(2);
    expect(destroyOk.some((a: any) => (a.detail || "").includes("idempotent replay"))).toBe(true);

    // NEVER-seen id → gate → approve executes → fail-closed "Document not found" (no fabrication).
    const never = await api("/api/vault/destroy", { method: "POST", cookie, body: { documentId: "doc_never_existed_xyz" } });
    expect(never.json.data.pending).toBe(true);
    const approve3 = await api("/api/portal/approvals", {
      method: "POST", cookie, body: { actionId: never.json.data.actionId, decision: "approve" },
    });
    expect(approve3.json.data.execution.success).toBe(false);
    expect(JSON.stringify(approve3.json.data.execution.result || approve3.json.data).toLowerCase()).toContain("document not found");
  });

  it("cross-tenant isolation at the API layer: tenant B cannot read/write tenant A vault state", async () => {
    const cookieA = await register(`vault-iso-a-${Date.now()}@test.local`);
    const form = new FormData();
    form.append("file", new Blob([pdfBytes() as any], { type: "application/pdf" }), "iso-a.pdf");
    const up = await api("/api/vault/upload", { method: "POST", form, cookie: cookieA });
    const docIdA: string = up.json.data.documentId;
    await api("/api/vault/file", { method: "POST", cookie: cookieA, body: { documentId: docIdA, route: "A/Routes/2026" } });

    const cookieB = await register(`vault-iso-b-${Date.now()}@test.local`);
    const docsB = await api("/api/vault/docs", { cookie: cookieB });
    expect(docsB.json.data).toHaveLength(0);
    const auditB = await api("/api/vault/audit", { cookie: cookieB });
    expect(auditB.json.data).toHaveLength(0);
    const dlB = await api(`/api/vault/download?docId=${docIdA}`, { cookie: cookieB });
    expect(dlB.status).toBe(404);
    const moveB = await api("/api/vault/move", { method: "POST", cookie: cookieB, body: { documentId: docIdA, route: "Hacked/2026" } });
    expect(moveB.json.data.ok).toBe(false);
    expect(moveB.json.data.error).toBe("Document not found");
    const searchB = await api("/api/vault/search?q=Routes", { cookie: cookieB });
    expect(searchB.json.data).toHaveLength(0);

    // Unauthenticated access is fail-closed 401.
    const unauth = await api("/api/vault/docs");
    expect(unauth.status).toBe(401);
  });
});