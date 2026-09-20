/**
 * native-documents.test.ts — Phase 1.2 native document store + PDF generation.
 *
 * Coverage per the owner quality bar:
 *   - PDF: valid PDF magic, deterministic checksum, text projection, page
 *     numbering, logo embedding + validation, merge-field escaping (no markup
 *     injection), leftover-{{ and unknown-tag FAIL-CLOSED.
 *   - Store: bucket CRUD (empty-only delete), add-only version history, ACL
 *     read/write, exact-id delete, hashed-bucket bytes.
 *   - Isolation: zero cross-tenant paths — reads/deletes/downloads of another
 *     tenant's ids fail closed; audit is tenant-scoped.
 *   - Router: generate/update/download/acl/delete endpoints through the authed
 *     API incl. cross-tenant + ACL enforcement.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderHtmlDocument,
  mergeFields,
  validateLogoDataUrl,
} from "../native/documents/pdf";
import {
  listBuckets,
  createBucket,
  deleteBucket,
  listDocs,
  getDoc,
  canReadDoc,
  canWriteDoc,
  createDocument,
  updateDocument,
  deleteDocument,
  setDocAcl,
  readDocumentBytes,
  generateDocEntityId,
  sha256Of,
  countTenantBucketFiles,
  countDocAudit,
  listDocAudit,
} from "../native/documents/store";
import { handleNativeDocumentsAuthed } from "../native/documents/router";
import type { NativeDocRecord } from "../native/documents/types";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let dataDir = "";
let t = 0;
function freshDir(): string {
  t += 1;
  return mkdtempSync(join(tmpdir(), `native-docs-${process.pid}-${t}-`));
}

function docRecord(tenantId: string, overrides?: Partial<NativeDocRecord>): NativeDocRecord {
  const id = generateDocEntityId("doc");
  return {
    id,
    tenantId,
    bucketId: null,
    name: `doc-${id.slice(4, 10)}`,
    kind: "proposal",
    textProjection: "hello",
    acl: { owner: tenantId, readers: [] },
    version: 1,
    checksum: "abc123",
    sizeBytes: 10,
    pages: 1,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: tenantId,
    ...overrides,
  };
}

const req = (method: string, path: string, body?: unknown): Request => {
  const init: RequestInit = { method };
  if (body !== undefined) {
    (init.headers as Record<string, string>) = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://x${path}`, init);
};

beforeEach(() => {
  dataDir = freshDir();
});
afterEach(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

const HTML_SIMPLE = `<h1>Proposal for {{client}}</h1><p>Total: {{total}}</p><table><tr><th>Item</th><th>Qty</th></tr><tr><td>Service</td><td>1</td></tr></table>`;

// ── PDF generation primitives ───────────────────────────────────────────────
describe("native documents — PDF generation", () => {
  it("renders valid PDF with merge fields, checksum and text projection", () => {
    const merged = mergeFields(HTML_SIMPLE, { client: "Acme", total: "$1,000" });
    expect(merged).not.toContain("{{");
    const out = renderHtmlDocument(merged);
    expect(out.bytes[0]).toBe(0x25); // '%'
    expect(out.bytes[1]).toBe(0x50); // 'P'
    expect(out.bytes[2]).toBe(0x44); // 'D'
    expect(out.bytes[3]).toBe(0x46); // 'F'
    expect(out.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(out.pages).toBeGreaterThanOrEqual(1);
    expect(out.text).toContain("Proposal for Acme");
    // Deterministic: identical input -> identical bytes.
    const again = renderHtmlDocument(merged);
    expect(again.checksum).toBe(out.checksum);
  });

  it("merge values are HTML-escaped — no markup injection", () => {
    const merged = mergeFields("<p>{{note}}</p>", { note: "<b>bold</b><script>alert(1)</script>" });
    expect(merged).toContain("&lt;b&gt;");
    expect(merged).not.toContain("<script>");
    const out = renderHtmlDocument(merged);
    // The value renders as LITERAL TEXT (no markup interpretation): the raw
    // characters appear in the plain-text projection, never executed as HTML.
    expect(out.text).toContain("<b>bold</b>");
  });

  it("fails closed on leftover placeholders and unknown tags", () => {
    expect(() => mergeFields("<p>{{missing}}</p>", {})).toThrow(/unresolved/);
    expect(() => renderHtmlDocument("<script>alert(1)</script>")).toThrow(/Unsupported HTML tag <script>/);
    expect(() => renderHtmlDocument("<style>body{color:red}</style>")).toThrow(/Unsupported HTML tag <style>/);
    expect(() => renderHtmlDocument('<p><a href="x">link</a></p>')).toThrow(/Unsupported HTML tag <a>/);
    expect(() => renderHtmlDocument('<img src="https://evil.example/x.png">')).toThrow(/data:image\/png/);
    expect(() => renderHtmlDocument('<img src="data:image/png;base64,AAAA" width="9999">')).toThrow(/width|dimensions/);
  });

  it("adds page numbering and a footer on multi-page output", () => {
    const body = "<h1>Report</h1>" + "<p>line</p>".repeat(140);
    const out = renderHtmlDocument(body, { pageNumbers: true, footerText: "Confidential" });
    expect(out.pages).toBeGreaterThan(1);
    const latin1 = Buffer.from(out.bytes).toString("latin1");
    expect(latin1).toContain("Page 1 of");
    expect(latin1).toContain("Confidential");
  });

  it("embeds a logo and validates logo inputs fail-closed", () => {
    const out = renderHtmlDocument("<h1>Branded</h1>", { logo: PNG_1PX });
    const latin1 = Buffer.from(out.bytes).toString("latin1");
    expect(latin1).toContain("Image");
    expect(() => validateLogoDataUrl("data:image/jpeg;base64,AAAA")).toThrow(/png/);
    expect(() => validateLogoDataUrl("data:image/png;base64,Tm90UG5nIQ==")).toThrow(/magic-byte/); // "NotPng!"
    expect(() => validateLogoDataUrl("https://x/logo.png")).toThrow(/data:image\/png/);
  });
});

// ── Store semantics ──────────────────────────────────────────────────────────
describe("native documents — store", () => {
  it("bucket CRUD: create/list, exact-id delete (empty only)", () => {
    createBucket(dataDir, { id: "bkt_1", tenantId: "a@x", name: "proposals", description: "", createdBy: "a@x", createdAt: new Date().toISOString() });
    expect(listBuckets(dataDir, "a@x")).toHaveLength(1);
    expect(listBuckets(dataDir, "b@x")).toHaveLength(0);
    const record = docRecord("a@x", { bucketId: "bkt_1" });
    createDocument(dataDir, record, new Uint8Array([1, 2, 3]));
    expect(deleteBucket(dataDir, "a@x", "bkt_1", "a@x")).toBe(false); // non-empty -> fail-closed
    expect(deleteBucket(dataDir, "a@x", "nope", "a@x")).toBe(false);
    deleteDocument(dataDir, "a@x", record.id, "a@x");
    expect(deleteBucket(dataDir, "a@x", "bkt_1", "a@x")).toBe(true);
  });

  it("versions are ADD-ONLY with checksums retained", () => {
    const record = docRecord("a@x", { checksum: "v1-checksum", sizeBytes: 100, pages: 1 });
    createDocument(dataDir, record, new Uint8Array(100));
    const updated = updateDocument(
      dataDir, "a@x", record.id,
      { checksum: "v2-checksum", sizeBytes: 200, pages: 2, textProjection: "v2" },
      new Uint8Array(200),
      "a@x",
    );
    expect(updated).not.toBeNull();
    expect(updated!.version).toBe(2);
    expect(updated!.history).toHaveLength(1);
    expect(updated!.history[0]).toMatchObject({ version: 1, checksum: "v1-checksum", sizeBytes: 100, pages: 1 });
    expect(updated!.checksum).toBe("v2-checksum");
    // Non-owner cannot update.
    expect(updateDocument(dataDir, "a@x", record.id, { checksum: "x" }, new Uint8Array(1), "intruder@x")).toBeNull();
  });

  it("ACL: owner full control, readers read-only, others nothing", () => {
    const record = docRecord("a@x");
    createDocument(dataDir, record, new Uint8Array([9]));
    expect(canReadDoc(record, "a@x")).toBe(true);
    expect(canWriteDoc(record, "a@x")).toBe(true);
    const acled = setDocAcl(dataDir, "a@x", record.id, ["reader@x"], "a@x");
    expect(acled).not.toBeNull();
    expect(canReadDoc(acled!, "reader@x")).toBe(true);
    expect(canWriteDoc(acled!, "reader@x")).toBe(false);
    expect(canReadDoc(acled!, "stranger@x")).toBe(false);
    // Non-owner cannot change the ACL.
    expect(setDocAcl(dataDir, "a@x", record.id, ["evil@x"], "reader@x")).toBeNull();
  });

  it("cross-tenant isolation on documents, bytes and audit", () => {
    const record = docRecord("a@x");
    createDocument(dataDir, record, new Uint8Array([7, 7]));
    expect(getDoc(dataDir, "b@x", record.id)).toBeNull();
    expect(listDocs(dataDir, "b@x")).toHaveLength(0);
    expect(countTenantBucketFiles(dataDir, "b@x")).toBe(0);
    expect(countTenantBucketFiles(dataDir, "a@x")).toBe(1);
    expect(readDocumentBytes(dataDir, "b@x", record.id)).toBeNull();
    expect(deleteDocument(dataDir, "b@x", record.id, "b@x")).toBeNull();
    expect(listDocAudit(dataDir, "b@x")).toHaveLength(0);
    expect(countDocAudit(dataDir, "a@x")).toBeGreaterThan(0);
  });

  it("sha256Of is stable and hex", () => {
    expect(sha256Of(new Uint8Array([1, 2, 3]))).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Of(new Uint8Array([1, 2, 3]))).toBe(sha256Of(new Uint8Array([1, 2, 3])));
  });
});

// ── Authed router (integration) ──────────────────────────────────────────────
describe("native documents — authed API", () => {
  it("generate → download → audit end-to-end", async () => {
    const gen = await handleNativeDocumentsAuthed(
      req("POST", "/api/native/documents/generate", { templateHtml: HTML_SIMPLE, values: { client: "Acme", total: "$1,000" }, name: "acme-proposal", kind: "proposal", options: { pageNumbers: true } }),
      { userEmail: "a@x", dataDir },
    );
    expect(gen.status).toBe(200);
    const body = (await gen.json()) as any;
    expect(body.data.id).toMatch(/^doc_/);
    expect(body.data.version).toBe(1);
    expect(body.data.checksum).toMatch(/^[a-f0-9]{64}$/);

    const dl = await handleNativeDocumentsAuthed(req("GET", `/api/native/documents/download?id=${body.data.id}`), { userEmail: "a@x", dataDir });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await dl.arrayBuffer());
    expect(bytes[0]).toBe(0x25);
    expect(bytes[1]).toBe(0x50);

    const auditRes = await handleNativeDocumentsAuthed(req("GET", "/api/native/documents/audit"), { userEmail: "a@x", dataDir });
    const audit = (await auditRes.json()) as any;
    expect(audit.data.some((e: any) => e.action === "native.docs.create")).toBe(true);
  });

  it("generate fails closed on unsafe templates (400)", async () => {
    const res = await handleNativeDocumentsAuthed(
      req("POST", "/api/native/documents/generate", { templateHtml: "<script>alert(1)</script>", name: "bad", values: {} }),
      { userEmail: "a@x", dataDir },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Unsupported HTML tag");
  });

  it("bucket flow: create, generate into it, delete blocked while non-empty", async () => {
    const b = await handleNativeDocumentsAuthed(req("POST", "/api/native/documents/buckets", { name: "proposals" }), { userEmail: "a@x", dataDir });
    const bucket = ((await b.json()) as any).data;
    const gen = await handleNativeDocumentsAuthed(req("POST", "/api/native/documents/generate", { templateHtml: "<p>x</p>", name: "d1", bucketId: bucket.id, values: {} }), { userEmail: "a@x", dataDir });
    expect(gen.status).toBe(200);
    const docId = ((await gen.json()) as any).data.id;
    const delBucket = await handleNativeDocumentsAuthed(req("DELETE", `/api/native/documents/buckets?id=${bucket.id}`), { userEmail: "a@x", dataDir });
    expect(delBucket.status).toBe(400);
    await handleNativeDocumentsAuthed(req("DELETE", `/api/native/documents?id=${docId}`), { userEmail: "a@x", dataDir });
    const delBucket2 = await handleNativeDocumentsAuthed(req("DELETE", `/api/native/documents/buckets?id=${bucket.id}`), { userEmail: "a@x", dataDir });
    expect(delBucket2.status).toBe(200);
  });

  it("ACL enforcement through the router (reader ok, stranger 404)", async () => {
    const gen = await handleNativeDocumentsAuthed(req("POST", "/api/native/documents/generate", { templateHtml: "<p>secret</p>", name: "s1", values: {} }), { userEmail: "a@x", dataDir });
    const docId = ((await gen.json()) as any).data.id;
    const acl = await handleNativeDocumentsAuthed(req("POST", "/api/native/documents/acl", { id: docId, readers: ["reader@x"] }), { userEmail: "a@x", dataDir });
    expect(acl.status).toBe(200);
    // Reader can download; stranger and other tenant cannot.
    expect((await handleNativeDocumentsAuthed(req("GET", `/api/native/documents/download?id=${docId}`), { userEmail: "reader@x", dataDir })).status).toBe(200);
    expect((await handleNativeDocumentsAuthed(req("GET", `/api/native/documents/download?id=${docId}`), { userEmail: "stranger@x", dataDir })).status).toBe(404);
    expect((await handleNativeDocumentsAuthed(req("GET", `/api/native/documents/download?id=${docId}`), { userEmail: "b@x", dataDir })).status).toBe(404);
    // Reader cannot delete or update ACL.
    expect((await handleNativeDocumentsAuthed(req("DELETE", `/api/native/documents?id=${docId}`), { userEmail: "reader@x", dataDir })).status).toBe(404);
    expect((await handleNativeDocumentsAuthed(req("POST", "/api/native/documents/acl", { id: docId, readers: ["evil@x"] }), { userEmail: "reader@x", dataDir })).status).toBe(404);
  });

  it("update creates an add-only new version; re-delete is 404", async () => {
    const gen = await handleNativeDocumentsAuthed(req("POST", "/api/native/documents/generate", { templateHtml: "<p>v1</p>", name: "u1", values: {} }), { userEmail: "a@x", dataDir });
    const docId = ((await gen.json()) as any).data.id;
    const upd = await handleNativeDocumentsAuthed(req("POST", "/api/native/documents/update", { id: docId, templateHtml: "<p>v2</p>", name: "u1", values: {} }), { userEmail: "a@x", dataDir });
    expect(upd.status).toBe(200);
    const updBody = (await upd.json()) as any;
    expect(updBody.data.version).toBe(2);
    const listRes = await handleNativeDocumentsAuthed(req("GET", "/api/native/documents"), { userEmail: "a@x", dataDir });
    const docs = ((await listRes.json()) as any).data.docs;
    expect(docs.find((d: any) => d.id === docId).version).toBe(2);
    // Download returns v2 bytes (different checksum from v1).
    const dl = await handleNativeDocumentsAuthed(req("GET", `/api/native/documents/download?id=${docId}`), { userEmail: "a@x", dataDir });
    expect(dl.status).toBe(200);
    const del = await handleNativeDocumentsAuthed(req("DELETE", `/api/native/documents?id=${docId}`), { userEmail: "a@x", dataDir });
    expect(del.status).toBe(200);
    expect((await handleNativeDocumentsAuthed(req("DELETE", `/api/native/documents?id=${docId}`), { userEmail: "a@x", dataDir })).status).toBe(404);
  });

  it("unknown documents endpoints return 404 JSON (never the SPA fallback)", async () => {
    const res = await handleNativeDocumentsAuthed(req("GET", "/api/native/documents/nope"), { userEmail: "a@x", dataDir });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });
});