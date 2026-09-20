/**
 * native/documents/types.ts — Phase 1.2 native capability: per-tenant
 * document store (attachment buckets with ACLs) + template-based PDF
 * generation (safe HTML→PDF, merge fields, logo, page numbering).
 *
 * Model: every tenant owns buckets (attachment buckets, e.g. "proposals",
 * "invoices") containing document RECORDS. Each document carries an owner
 * (creator email) + optional readers (ACL), add-only version history, a
 * checksum, and its rendered PDF bytes stored in the tenant's HASHED bucket
 * (sha256 of tenant email — same convention as the vault blob store). Every
 * mutation is audited to an immutable per-tenant native-documents trail.
 *
 * Isolation: ALL tenant maps are `{ [tenantId]: ... }` — there is no
 * cross-tenant read/write path; a document id resolves ONLY under its owning
 * tenant (unknown id → fail-closed 404 upstream).
 *
 * Safety: HTML input is a SAFE SUBset (no script/style/iframes/links; unknown
 * tags fail closed); merge-field values are HTML-escaped before interpolation
 * (no markup injection); leftover {{ placeholders fail closed; PDF bytes are
 * produced entirely from escaped text + images.
 */

/** Per-tenant attachment bucket (a named container for documents). */
export interface NativeDocBucket {
  id: string; // bkt_<random> — never user-supplied
  tenantId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
}

/** Document ACL: owner (full control) + readers (read-only). */
export interface NativeDocAcl {
  owner: string;
  readers: string[];
}

/** One add-only version of a document. */
export interface NativeDocVersion {
  version: number;
  checksum: string;
  sizeBytes: number;
  pages: number;
  createdAt: string;
  createdBy: string;
}

/** A stored native document record (bytes live in the tenant hashed bucket). */
export interface NativeDocRecord {
  id: string; // doc_<random> — never user-supplied
  tenantId: string;
  bucketId: string | null;
  name: string;
  kind: string; // proposal | invoice | letter | bol | manifest | report | other
  /** Plain-text projection of the rendered PDF (bounded, searchable later). */
  textProjection: string;
  acl: NativeDocAcl;
  version: number;
  checksum: string;
  sizeBytes: number;
  pages: number;
  history: NativeDocVersion[]; // add-only (capped); version 1..n
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/** Options for PDF rendering (generation). */
export interface NativeRenderOptions {
  pageNumbers?: boolean; // default true
  /** data:image/png;base64,... — logo shown top-left on page 1. Bounded size. */
  logo?: string;
  /** Optional footer line rendered on every page (plain text). */
  footerText?: string;
}

export const NATIVE_DOCS_KEY = "native_documents.json";
export const NATIVE_DOCS_AUDIT_KEY = "native_documents_audit.json";
export const MAX_BUCKETS_PER_TENANT = 20;
export const MAX_DOCS_PER_TENANT = 500;
export const MAX_BUCKET_NAME = 80;
export const MAX_DOCS_NAME = 120;
export const MAX_READERS = 25;
export const MAX_HISTORY_VERSIONS = 24;
export const MAX_HTML_BYTES = 256 * 1024; // 256 KiB template HTML
export const MAX_LOGO_BYTES = 512 * 1024; // 512 KiB logo (data-URL decoded)
export const MAX_TEXT_PROJECTION = 200 * 1024; // 200 KiB text projection bound
export const MAX_PDF_PAGES = 200;
export const DOC_KINDS = ["proposal", "invoice", "letter", "bol", "manifest", "report", "other"] as const;