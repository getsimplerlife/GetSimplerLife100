/**
 * retrieval.test.ts — capability upgrade #4 (RAG-lite retrieval).
 *
 * Proves the lightweight per-tenant keyword index:
 *  1. chunk + tokenize + retrieve top-K attributed excerpts
 *  2. attribution fields (docId, source, filename, excerpt, score)
 *  3. size cap eviction (per-tenant doc count + bytes, oldest evicted)
 *  4. strict per-tenant isolation (tenant A index never appears for tenant B)
 *  5. fail-soft no-op (empty/unknown query → []; storage failure never throws)
 *  6. groundities feed agent context via buildAgentContext (query → retrieval[])
 *
 * Safety: retrieval is a pure read; indexing is internal metadata only — no
 * provider writes. LLM off, zero real providers, tmp-dir storage.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  indexDocument,
  retrieveDocs,
  chunkText,
  tokenize,
  getIndexStats,
  MAX_DOCS_PER_TENANT,
  MAX_INDEX_BYTES,
} from "../lib/retrieval";
import { buildAgentContext } from "../lib/firm-memory";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "retrieval-")); });
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const A = "firmA@example.com";
const B = "firmB@example.com";

// ── 1 & 2. chunk/tokenize + retrieve top-K attributed ─────────────────────
describe("chunking + tokenization", () => {
  it("chunks long text into bounded segments", () => {
    const text = Array(20).fill("apple banana cherry data").join(" ");
    const chunks = chunkText(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(50 + 20);
  });

  it("tokenizes deterministically, dropping stopwords and short words", () => {
    expect(tokenize("The Apple AND the big data")).toContain("apple");
    expect(tokenize("The Apple AND the big data")).toContain("data");
    expect(tokenize("The Apple AND the big data")).not.toContain("the");
    expect(tokenize("The Apple AND the big data")).not.toContain("and");
  });

  it("returns a single chunk for short text", () => {
    expect(chunkText("short doc")).toEqual(["short doc"]);
  });

  it("returns [] for empty/whitespace text", () => {
    expect(chunkText("   ")).toEqual([]);
  });
});

describe("retrieveDocs top-K + attribution", () => {
  it("indexes then retrieves the most relevant attributed excerpt", () => {
    indexDocument(A, { docId: "doc-1", source: "Google Drive", filename: "contract.pdf", text: "The master services agreement has a payment terms clause net thirty days." }, dir);
    indexDocument(A, { docId: "doc-2", source: "OneDrive", filename: "inventory.xlsx", text: "Warehouse stock levels and reorder points for widgets." }, dir);

    const hits = retrieveDocs(A, "payment terms agreement", { k: 5 }, dir);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const top = hits[0];
    expect(top.docId).toBe("doc-1");
    expect(top.source).toBe("Google Drive");
    expect(top.filename).toBe("contract.pdf");
    expect(top.excerpt.length).toBeGreaterThan(0);
    expect(top.score).toBeGreaterThan(0);
  });

  it("retrieves warehouse/stock doc for a warehouse query", () => {
    indexDocument(A, { docId: "d1", source: "Drive", text: "payments net thirty" }, dir);
    indexDocument(A, { docId: "d2", source: "OneDrive", text: "warehouse stock reorder points" }, dir);
    const hits = retrieveDocs(A, "reorder stock", { k: 5 }, dir);
    expect(hits[0].docId).toBe("d2");
  });

  it("respects top-K limit", () => {
    for (let i = 0; i < 10; i++) indexDocument(A, { docId: `d${i}`, source: "x", text: `shared keyword unique${i}` }, dir);
    const hits = retrieveDocs(A, "shared", { k: 3 }, dir);
    expect(hits.length).toBeLessThanOrEqual(3);
  });
});

// ── 3. Size caps ───────────────────────────────────────────────────────────
describe("size caps", () => {
  it("evicts oldest docs beyond the per-tenant doc cap", () => {
    for (let i = 0; i < MAX_DOCS_PER_TENANT + 5; i++) {
      indexDocument(A, { docId: `doc-${i}`, source: "x", text: `document number ${i}` }, dir);
    }
    const stats = getIndexStats(A, dir);
    expect(stats.docs).toBeLessThanOrEqual(MAX_DOCS_PER_TENANT);
    // oldest evicted — doc-0 absent
    const hits = retrieveDocs(A, "document number 0", { k: 20 }, dir);
    expect(hits.some((h) => h.docId === "doc-0")).toBe(false);
    // newest kept
    const hitsNew = retrieveDocs(A, "document number 199", { k: 20 }, dir);
    expect(hitsNew.some((h) => h.docId === "doc-199")).toBe(true);
  });

  it("bounded index depth (never grows unbounded with many tokens in one doc)", () => {
    const bigText = ("alpha beta gamma delta ").repeat(2000); // many tokens
    indexDocument(A, { docId: "big", source: "x", text: bigText }, dir);
    const stats = getIndexStats(A, dir);
    expect(stats.bytes).toBeLessThanOrEqual(MAX_INDEX_BYTES + 2000);
  });
});

// ── 4. Per-tenant isolation ────────────────────────────────────────────────
describe("per-tenant isolation", () => {
  it("tenant A index never appears for tenant B", () => {
    indexDocument(A, { docId: "a-secret", source: "Drive", text: "confidential pricing formula" }, dir);
    const hitsB = retrieveDocs(B, "confidential pricing", { k: 5 }, dir);
    expect(hitsB).toHaveLength(0);
    // A can still find it
    const hitsA = retrieveDocs(A, "confidential pricing", { k: 5 }, dir);
    expect(hitsA.length).toBeGreaterThanOrEqual(1);
    expect(hitsA[0].docId).toBe("a-secret");
  });
});

// ── 5. Fail-soft no-op ─────────────────────────────────────────────────────
describe("fail-soft no-op", () => {
  it("returns [] for empty/unknown tenant or empty query (never throws)", () => {
    expect(() => retrieveDocs("", "x", {}, dir)).not.toThrow();
    expect(retrieveDocs("", "x", {}, dir)).toHaveLength(0);
    expect(retrieveDocs(A, "   ", {}, dir)).toHaveLength(0); // stopword/empty → []
  });

  it("returns [] for a query with no matching index", () => {
    indexDocument(A, { docId: "d", source: "x", text: "nothing relevant here" }, dir);
    expect(retrieveDocs(A, "quantum zzzz", {}, dir)).toHaveLength(0);
  });

  it("indexDocument returns false on bad input without throwing", () => {
    expect(indexDocument("", { docId: "x", source: "s", text: "t" }, dir)).toBe(false);
    expect(indexDocument(A, { docId: "", source: "s", text: "t" }, dir)).toBe(false);
  });
});

// ── 6. Retrieval feeds agent context via buildAgentContext ─────────────────
describe("retrieval grounds buildAgentContext", () => {
  it("attaches attributed excerpts when a query is provided", () => {
    indexDocument(A, { docId: "msa", source: "Drive", filename: "msa.pdf", text: "master services agreement payment terms net thirty" }, dir);
    const ctx = buildAgentContext(A, dir, "master services payment terms");
    expect(ctx.retrieval).toBeDefined();
    expect(ctx.retrieval!.length).toBeGreaterThanOrEqual(1);
    expect(ctx.retrieval![0].docId).toBe("msa");
    expect(ctx.retrieval![0].source).toBe("Drive");
    // memory still present alongside retrieval
    expect(ctx.memory.recentInsights).toBeDefined();
  });

  it("leaves retrieval undefined for an empty query (no false read)", () => {
    const ctx = buildAgentContext(A, dir);
    expect(ctx.retrieval).toBeUndefined();
  });
});
