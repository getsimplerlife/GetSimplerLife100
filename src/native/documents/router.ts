/**
 * native/documents/router.ts — authenticated tenant-facing API for the native
 * document store (Phase 1.2):
 *   GET    /api/native/documents               buckets + documents (tenant scope)
 *   POST   /api/native/documents/buckets       create bucket
 *   DELETE /api/native/documents/buckets?id=   delete EMPTY bucket (exact id)
 *   POST   /api/native/documents/generate      render a safe-HTML template →
 *                                              merged PDF stored in the tenant
 *   POST   /api/native/documents/update        re-render → add-only new version
 *   POST   /api/native/documents/acl           set readers (owner-only)
 *   GET    /api/native/documents/download?id=  PDF bytes (owner OR reader)
 *   DELETE /api/native/documents?id=           delete exact id (owner-only)
 *   GET    /api/native/documents/audit         immutable audit trail (tenant)
 *
 * Every route is tenant-scoped by the session identity; another tenant's id
 * resolves to 404 (fail-closed). Writes are owner-scoped via the doc ACL and
 * every mutation is audited. HTML is the SAFE SUBSET from pdf.ts — never raw
 * markup execution; merge values are escaped; no script surface.
 */
import {
  MAX_BUCKETS_PER_TENANT,
  MAX_DOCS_PER_TENANT,
  MAX_BUCKET_NAME,
  MAX_DOCS_NAME,
  MAX_READERS,
  MAX_HTML_BYTES,
  DOC_KINDS,
  type NativeDocRecord,
  type NativeRenderOptions,
} from "./types";
import {
  listBuckets,
  getBucket,
  createBucket,
  deleteBucket,
  listDocs,
  getDoc,
  canReadDoc,
  createDocument,
  updateDocument,
  deleteDocument,
  setDocAcl,
  readDocumentBytes,
  generateDocEntityId,
  listDocAudit,
  listSharedDocs,
  getSharedRef,
  appendDocAudit,
} from "./store";
import { mergeFields, renderHtmlDocument } from "./pdf";

export interface NativeDocumentsCtx {
  userEmail: string;
  dataDir: string;
}

interface GenInput {
  templateHtml: string;
  values: Record<string, string>;
  name: string;
  kind?: string;
  bucketId?: string | null;
  options?: NativeRenderOptions;
}
interface RenderedGen {
  record: NativeDocRecord;
  bytes: Uint8Array;
}

function parseJsonBody(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Validate + merge + render ONCE, returning the record AND its PDF bytes. */
function renderGen(input: GenInput, tenantId: string): RenderedGen {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, MAX_DOCS_NAME) : "";
  if (!name) throw new Error("name is required");
  const kind = typeof input.kind === "string" ? input.kind : "other";
  if (!(DOC_KINDS as readonly string[]).includes(kind)) throw new Error(`kind must be one of ${DOC_KINDS.join(", ")}`);
  const html = typeof input.templateHtml === "string" ? input.templateHtml : "";
  if (!html) throw new Error("templateHtml is required");
  if (html.length > MAX_HTML_BYTES) throw new Error(`templateHtml exceeds ${MAX_HTML_BYTES} bytes`);
  const values: Record<string, string> = {};
  if (input.values && typeof input.values === "object") {
    for (const [k, v] of Object.entries(input.values)) {
      if (typeof v !== "string") throw new Error(`value for "${k}" must be a string`);
      values[k] = v;
    }
  }
  const bucketId = input.bucketId == null ? null : input.bucketId;
  const merged = mergeFields(html, values);
  const rendered = renderHtmlDocument(merged, input.options ?? {});
  const record: NativeDocRecord = {
    id: generateDocEntityId("doc"),
    tenantId,
    bucketId,
    name,
    kind,
    textProjection: rendered.text,
    acl: { owner: tenantId, readers: [] },
    version: 1,
    checksum: rendered.checksum,
    sizeBytes: rendered.bytes.byteLength,
    pages: rendered.pages,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: tenantId,
  };
  return { record, bytes: rendered.bytes };
}

/** Dispatch an authenticated /api/native/documents* request. */
export async function handleNativeDocumentsAuthed(req: Request, ctx: NativeDocumentsCtx): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const tenantId = ctx.userEmail;
  const P = (name: string) => url.searchParams.get(name);
  const body = async (): Promise<Record<string, unknown>> => {
    try {
      return parseJsonBody(await req.text());
    } catch (error) {
      throw error;
    }
  };
  try {
    // ── Read ────────────────────────────────────────────────────────────
    if (pathname === "/api/native/documents" && req.method === "GET") {
      const docs = listDocs(ctx.dataDir, tenantId).map((d) => ({
        id: d.id,
        bucketId: d.bucketId,
        name: d.name,
        kind: d.kind,
        version: d.version,
        checksum: d.checksum,
        sizeBytes: d.sizeBytes,
        pages: d.pages,
        readers: d.acl.readers,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));
      return Response.json({ data: { buckets: listBuckets(ctx.dataDir, tenantId), docs, shared: listSharedDocs(ctx.dataDir, tenantId) } });
    }
    if (pathname === "/api/native/documents/audit" && req.method === "GET") {
      return Response.json({ data: listDocAudit(ctx.dataDir, tenantId) });
    }
    if (pathname === "/api/native/documents/download" && req.method === "GET") {
      const id = P("id") || "";
      // Owner path: doc resolves under this tenant.
      const record = getDoc(ctx.dataDir, tenantId, id);
      const bytes =
        record && canReadDoc(record, tenantId)
          ? readDocumentBytes(ctx.dataDir, tenantId, id)
          : null;
      // Shared path: an owner-granted, audited read-only ref under this tenant.
      const shared = !bytes ? getSharedRef(ctx.dataDir, tenantId, id) : null;
      const ownerTenant = shared ? shared.tenantId : "";
      const sharedBytes = shared && ownerTenant ? readDocumentBytes(ctx.dataDir, ownerTenant, id) : null;
      const finalBytes = bytes ?? sharedBytes;
      const name = record?.name ?? shared?.name ?? "";
      if (!finalBytes) return Response.json({ error: "Document not found" }, { status: 404 });
      appendDocAudit(ctx.dataDir, tenantId, tenantId, "native.docs.download", `Document ${id}`);
      return new Response(finalBytes as unknown as BodyInit, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${name.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf"`,
          "cache-control": "no-store",
        },
      });
    }
    // ── Buckets ──────────────────────────────────────────────────────────
    if (pathname === "/api/native/documents/buckets" && req.method === "POST") {
      const b = await body();
      const name = typeof b.name === "string" ? b.name.trim().slice(0, MAX_BUCKET_NAME) : "";
      if (!name) return Response.json({ error: "name is required" }, { status: 400 });
      if (listBuckets(ctx.dataDir, tenantId).length >= MAX_BUCKETS_PER_TENANT) {
        return Response.json({ error: `Bucket limit reached (${MAX_BUCKETS_PER_TENANT})` }, { status: 400 });
      }
      const bucket = {
        id: generateDocEntityId("bkt"),
        tenantId,
        name,
        description: typeof b.description === "string" ? b.description.slice(0, 500) : "",
        createdBy: tenantId,
        createdAt: new Date().toISOString(),
      };
      createBucket(ctx.dataDir, bucket);
      return Response.json({ data: bucket });
    }
    if (pathname === "/api/native/documents/buckets" && req.method === "DELETE") {
      const id = P("id") || "";
      if (!getBucket(ctx.dataDir, tenantId, id)) return Response.json({ error: "Bucket not found" }, { status: 404 });
      const removed = deleteBucket(ctx.dataDir, tenantId, id, tenantId);
      if (!removed) return Response.json({ error: "Bucket is not empty or not found" }, { status: 400 });
      return Response.json({ ok: true });
    }
    // ── Generate / update / acl / delete ────────────────────────────────
    if (pathname === "/api/native/documents/generate" && req.method === "POST") {
      const b = await body();
      if (listDocs(ctx.dataDir, tenantId).length >= MAX_DOCS_PER_TENANT) {
        return Response.json({ error: `Document limit reached (${MAX_DOCS_PER_TENANT})` }, { status: 400 });
      }
      const bucketId = b.bucketId == null ? null : String(b.bucketId);
      if (bucketId && !getBucket(ctx.dataDir, tenantId, bucketId)) {
        return Response.json({ error: "Bucket not found" }, { status: 404 });
      }
      const { record, bytes } = renderGen(
        {
          templateHtml: String(b.templateHtml ?? ""),
          values: (b.values as Record<string, string>) ?? {},
          name: String(b.name ?? ""),
          kind: b.kind == null ? "other" : String(b.kind),
          bucketId,
          options: b.options && typeof b.options === "object" ? (b.options as NativeRenderOptions) : {},
        },
        tenantId,
      );
      createDocument(ctx.dataDir, record, bytes);
      return Response.json({
        data: { id: record.id, name: record.name, kind: record.kind, version: record.version, checksum: record.checksum, pages: record.pages, sizeBytes: record.sizeBytes },
      });
    }
    if (pathname === "/api/native/documents/update" && req.method === "POST") {
      const b = await body();
      const id = String(b.id ?? "");
      if (!getDoc(ctx.dataDir, tenantId, id)) return Response.json({ error: "Document not found" }, { status: 404 });
      const { record: nextRecord, bytes } = renderGen(
        {
          templateHtml: String(b.templateHtml ?? ""),
          values: (b.values as Record<string, string>) ?? {},
          name: String(b.name ?? ""),
          kind: b.kind == null ? "other" : String(b.kind),
          bucketId: b.bucketId == null ? null : String(b.bucketId),
          options: (b.options as NativeRenderOptions) ?? {},
        },
        tenantId,
      );
      const updated = updateDocument(
        ctx.dataDir,
        tenantId,
        id,
        {
          name: nextRecord.name,
          kind: nextRecord.kind,
          textProjection: nextRecord.textProjection,
          checksum: nextRecord.checksum,
          sizeBytes: nextRecord.sizeBytes,
          pages: nextRecord.pages,
        },
        bytes,
        tenantId,
      );
      if (!updated) return Response.json({ error: "Cannot update document" }, { status: 403 });
      return Response.json({ data: { id: updated.id, version: updated.version, checksum: updated.checksum, pages: updated.pages, sizeBytes: updated.sizeBytes } });
    }
    if (pathname === "/api/native/documents/acl" && req.method === "POST") {
      const b = await body();
      const id = String(b.id ?? "");
      if (!getDoc(ctx.dataDir, tenantId, id)) return Response.json({ error: "Document not found" }, { status: 404 });
      const readers = Array.isArray(b.readers) ? b.readers.map(String).slice(0, MAX_READERS) : [];
      const updated = setDocAcl(ctx.dataDir, tenantId, id, readers, tenantId);
      if (!updated) return Response.json({ error: "Cannot update ACL" }, { status: 403 });
      return Response.json({ data: { id: updated.id, readers: updated.acl.readers } });
    }
    if (pathname === "/api/native/documents" && req.method === "DELETE") {
      const id = P("id") || "";
      if (!getDoc(ctx.dataDir, tenantId, id)) return Response.json({ error: "Document not found" }, { status: 404 });
      const removed = deleteDocument(ctx.dataDir, tenantId, id, tenantId);
      if (!removed) return Response.json({ error: "Cannot delete document" }, { status: 403 });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown native documents endpoint" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 400 });
  }
}

