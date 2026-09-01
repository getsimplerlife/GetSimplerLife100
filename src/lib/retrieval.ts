/**
 * src/lib/retrieval.ts — SERVER-SIDE ONLY. Do NOT import in any .tsx file.
 *
 * RETRIEVAL / RAG-LITE (capability upgrade #4): a lightweight per-tenant keyword
 * index over documents already filed (Google Drive / Microsoft 365 / OneDrive)
 * plus newly ingested uploads. Deterministic BM25-lite — NO model, NO embedding
 * API, NO external vector DB — so it works with LLM off and no provider creds.
 *
 * Design (matches the established durable single-index JSON pattern):
 *   - `retrieval_index.json` is a single durable store keyed by tenant email
 *     (`{ [tenantEmail]: TenantRetrievalIndex }`). STRICTLY per-tenant — there is
 *     no global/blended index and no read path that returns another tenant's
 *     docs (isolation hard guarantee).
 *   - Each tenant index holds chunked documents + a small inverted keyword index.
 *   - Size-capped (per-tenant doc count + byte budget); oldest doc evicted when
 *     a new one would exceed the cap.
 *   - Query = tokenize → score chunks by BM25-lite (term frequency, document
 *     frequency, IDF, length normalization) → return top-K ATTRIBUTED excerpts
 *     (document id, source, filename, excerpt).
 *
 * SAFETY: this is a PURE READ path. Indexing writes are internal metadata only —
 * never provider writes, never destructive. Any retrieval/indexing failure is a
 * soft no-op that still returns the deterministic empty result; it never blocks
 * or fails an agent run. Proposed provider writes are still gated ONLY by the
 * unchanged Approval Queue.
 */
import { join } from "path";
import { readJSON, writeJSON, resolveDataDir } from "./data-store";

export const RETRIEVAL_INDEX_KEY = "retrieval_index.json";

/** Size caps — explicit, per-tenant. */
export const MAX_DOCS_PER_TENANT = 200;
export const MAX_INDEX_BYTES = 2 * 1024 * 1024; // 2 MB of stored text per tenant
export const MAX_CHUNK_CHARS = 500;             // each chunk in chars
export const DEFAULT_TOP_K = 5;

/** A single chunked + indexed document. */
export interface IndexedDoc {
  /** Stable id of the source document (Drive file id / Graph item id / upload id). */
  docId: string;
  /** Human label of the source (provider display name, e.g. "Google Drive"). */
  source: string;
  /** Original filename when available. */
  filename?: string;
  /** When the document was indexed. */
  indexedAt: number;
  /** Total raw text length at index time (for byte accounting). */
  bytes: number;
  /** Chunked text. */
  chunks: string[];
}

/** Per-tenant retrieval index. */
export interface TenantRetrievalIndex {
  docs: IndexedDoc[];
  /** Inverted: token → postings of {docIndex, chunkIndex, tf}. */
  inverted: Record<string, { d: number; c: number; tf: number }[]>;
  totalBytes: number;
  updatedAt: number;
}

export type RetrievalIndexStore = Record<string, TenantRetrievalIndex>;

/** One retrieved attributed excerpt. */
export interface RetrievalHit {
  docId: string;
  source: string;
  filename?: string;
  excerpt: string;
  score: number;
}

export interface RetrieveOptions {
  /** Number of top results (default DEFAULT_TOP_K). */
  k?: number;
}

// ── Index plumbing (single-index durable JSON keyed by tenant) ──────────────

function defaultDataDir(): string {
  return resolveDataDir(
    process.env.DATA_DIR,
    typeof import.meta?.dir !== "undefined" ? import.meta.dir : process.cwd(),
  );
}

export function retrievalIndexPath(dataDir?: string): string {
  return join(dataDir ?? defaultDataDir(), RETRIEVAL_INDEX_KEY);
}

function readStore(dataDir?: string): RetrievalIndexStore {
  const raw = readJSON(retrievalIndexPath(dataDir));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as RetrievalIndexStore;
  return {};
}

function writeStore(store: RetrievalIndexStore, dataDir?: string): void {
  writeJSON(retrievalIndexPath(dataDir), store);
}

function emptyIndex(): TenantRetrievalIndex {
  return { docs: [], inverted: {}, totalBytes: 0, updatedAt: 0 };
}

function readTenantIndex(tenantEmail: string, dataDir?: string): TenantRetrievalIndex {
  if (!tenantEmail?.trim()) return emptyIndex();
  const idx = readStore(dataDir)[tenantEmail];
  if (!idx || typeof idx !== "object") return emptyIndex();
  return {
    docs: Array.isArray(idx.docs) ? idx.docs : [],
    inverted: idx.inverted && typeof idx.inverted === "object" ? idx.inverted : {},
    totalBytes: typeof idx.totalBytes === "number" ? idx.totalBytes : 0,
    updatedAt: typeof idx.updatedAt === "number" ? idx.updatedAt : 0,
  };
}

// ── Tokenization / chunking (deterministic, bounded) ────────────────────────

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","in","for","on","with","is","are","was","were",
  "be","been","it","at","by","from","as","that","this","these","those","we","our","you",
  "your","they","their","not","no","if","then","so","but","can","will","shall","may",
  "have","has","had","do","does","did","i","me","my","about","into","per","via","etc",
]);

/** Lowercase, strip non-word tokens, drop stopwords/short words. */
export function tokenize(text: string): string[] {
  const words = String(text ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return words;
}

/** Chunk text into bounded overlapping-lite segments (newest-K by position). */
export function chunkText(text: string, maxChars: number = MAX_CHUNK_CHARS): string[] {
  const s = String(text ?? "");
  if (!s.trim()) return [];
  const trimmed = s.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxChars) return [trimmed];
  const chunks: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    let end = Math.min(i + maxChars, trimmed.length);
    // prefer a word boundary just before end (not at the very end)
    if (end < trimmed.length) {
      const space = trimmed.lastIndexOf(" ", end);
      if (space > i + maxChars * 0.5) end = space;
    }
    chunks.push(trimmed.slice(i, end).trim());
    i = Math.max(end - 1, i + 1); // advance; small overlap to avoid splitting words
  }
  return chunks.filter((c) => c.length > 0);
}

// ── Indexing (internal metadata write, size-capped) ────────────────────────

function buildInverted(docs: IndexedDoc[]): TenantRetrievalIndex["inverted"] {
  const inverted: Record<string, { d: number; c: number; tf: number }[]> = { __len: [] as any };
  for (let d = 0; d < docs.length; d++) {
    for (let c = 0; c < docs[d].chunks.length; c++) {
      const tfMap = new Map<string, number>();
      for (const w of tokenize(docs[d].chunks[c])) tfMap.set(w, (tfMap.get(w) || 0) + 1);
      for (const [w, tf] of tfMap) {
        (inverted[w] ??= []).push({ d, c, tf });
      }
    }
  }
  delete (inverted as any).__len;
  return inverted;
}

function countBytes(docs: IndexedDoc[]): number {
  let n = 0;
  for (const doc of docs) for (const ch of doc.chunks) n += Buffer.byteLength(ch, "utf8");
  return n;
}

function rebuildIndex(docs: IndexedDoc[], totalBytes: number): TenantRetrievalIndex {
  return { docs, inverted: buildInverted(docs), totalBytes, updatedAt: Date.now() };
}

/**
 * Index a document's extracted text for a tenant. Best-effort: bounds input,
 * evicts oldest docs to stay within cap, and rebuilds the inverted index.
 * Fail-soft — a storage failure is swallowed (caller never blocks).
 */
export function indexDocument(
  tenantEmail: string,
  input: { docId: string; source: string; filename?: string; text: string },
  dataDir?: string,
): boolean {
  if (!tenantEmail?.trim() || !input.docId?.trim()) return false;
  try {
    const text = String(input.text ?? "");
    const chunks = chunkText(text);
    if (chunks.length === 0) return true; // nothing to index — still "success"
    const store = readStore(dataDir);
    const idx = readTenantIndex(tenantEmail, dataDir);

    let docs = idx.docs.filter((d) => d.docId !== input.docId); // upsert
    const doc: IndexedDoc = {
      docId: input.docId,
      source: input.source || "unknown",
      filename: input.filename,
      indexedAt: Date.now(),
      bytes: Buffer.byteLength(text, "utf8"),
      chunks,
    };
    docs = [...docs, doc];

    // Size cap: evict oldest doc(s) by indexedAt until under by doc-count + bytes.
    let totalBytes = countBytes(docs);
    while (docs.length > MAX_DOCS_PER_TENANT || totalBytes > MAX_INDEX_BYTES) {
      if (docs.length <= 1 && totalBytes <= MAX_INDEX_BYTES) break;
      // evict the oldest (non-just-added) doc
      const oldest = docs
        .filter((d) => d.docId !== input.docId)
        .sort((a, b) => a.indexedAt - b.indexedAt)[0];
      if (!oldest) break;
      docs = docs.filter((d) => d.docId !== oldest.docId);
      totalBytes = countBytes(docs);
    }

    store[tenantEmail] = rebuildIndex(docs, totalBytes);
    writeStore(store, dataDir);
    return true;
  } catch {
    return false; // fail-soft
  }
}

/** Everything indexed for a tenant (debug/size verification). Strictly per-tenant. */
export function getIndexStats(tenantEmail: string, dataDir?: string): { docs: number; bytes: number } {
  const idx = readTenantIndex(tenantEmail, dataDir);
  return { docs: idx.docs.length, bytes: idx.totalBytes };
}

// ── Retrieval (pure READ — never a provider write) ─────────────────────────

/** BM25-lite score for a single chunk given query tokens. */
function scoreChunk(docs: IndexedDoc[], inverted: TenantRetrievalIndex["inverted"], docIdx: number, chunkIdx: number, queryTokens: string[]): number {
  const chunkTokens = tokenize(docs[docIdx].chunks[chunkIdx] || "");
  const chunkLen = chunkTokens.length || 1;
  const avgLen = Math.max(1, docs.reduce((s, d) => s + d.chunks.reduce((a, c) => a + tokenize(c).length, 0), 0) / Math.max(1, docs.length));
  const N = docs.length;
  const k1 = 1.2, b = 0.75;
  let score = 0;
  for (const tok of queryTokens) {
    const postings = inverted[tok] ?? [];
    const df = postings.length;
    const idf = df === 0 ? 0 : Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const tf = postings.find((p) => p.d === docIdx && p.c === chunkIdx)?.tf || 0;
    if (tf === 0) continue;
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (chunkLen / avgLen))));
  }
  return score;
}

/**
 * Retrieve the top-K attributed excerpts for a query against a tenant's index.
 * PURE READ — never executes a provider write. Deterministic. Fail-soft: any
 * error returns [] (never throws, never blocks a run).
 */
export function retrieveDocs(
  tenantEmail: string,
  query: string,
  opts: RetrieveOptions = {},
  dataDir?: string,
): RetrievalHit[] {
  try {
    if (!tenantEmail?.trim()) return [];
    const tokens = tokenize(query ?? "");
    if (tokens.length === 0) return [];
    const idx = readTenantIndex(tenantEmail, dataDir);
    if (idx.docs.length === 0) return [];

    const scored: { docIdx: number; chunkIdx: number; score: number }[] = [];
    for (let d = 0; d < idx.docs.length; d++) {
      for (let c = 0; c < idx.docs[d].chunks.length; c++) {
        const s = scoreChunk(idx.docs, idx.inverted, d, c, tokens);
        if (s > 0) scored.push({ docIdx: d, chunkIdx: c, score: s });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const k = Math.max(1, Math.min(opts.k ?? DEFAULT_TOP_K, 20));
    return scored.slice(0, k).map(({ docIdx, chunkIdx, score }) => {
      const doc = idx.docs[docIdx];
      return {
        docId: doc.docId,
        source: doc.source,
        filename: doc.filename,
        excerpt: doc.chunks[chunkIdx],
        score: Math.round(score * 1000) / 1000,
      };
    });
  } catch {
    return []; // fail-soft no-op
  }
}
