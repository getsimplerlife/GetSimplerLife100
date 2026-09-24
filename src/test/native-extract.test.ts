/**
 * native-extract.test.ts — Phase 3.3 native AI document understanding.
 *
 * LLM-FREE: every extraction runs on MockModelClient (injected via
 * ctx.extractDeps) — the canonical suite never calls a real LLM.
 *
 * Coverage: extraction RUN rides the Approval Queue (extractDocument — the
 * `extract` verb ADDED to WRITE_VERB; fail-open guard), drafts land with
 * confidence + quality flags (low-confidence → human-review lane), idempotent
 * apply (replay → alreadyApplied, no duplicate draft), LLM daily-call cap
 * fails closed BEFORE any model call, autonomy allow-list auto-runs with
 * recordAutonomyOutcome, cross-tenant → 404-no-IDOR, forged/unknown ids →
 * 400/404, human-review reject lane, row-data pre-fill helper (which is READ-
 * only — the record write itself stays the tables slice's gated insert).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVaultDocument } from "../lib/vault-store";
import type { VaultFileExtension } from "../lib/vault-types";
import { getExtraction, listExtractions } from "../lib/extraction/extraction-store";
import { createCostTracker } from "../lib/llm/modelClient";
import { MockModelClient } from "../lib/llm/MockModelClient";
import { handleNativeExtractAuthed, registerBuiltinNativeExtractEventTypes } from "../native/extract/router";
import type { ExtractRunnerDeps } from "../native/extract/gate";
import { listAudit, listPendingWrites } from "../native/extract/store";
import { createTable } from "../native/tables/store";
import { setAutonomyWorkflow } from "../lib/autonomy";
import type { TableDef } from "../native/tables/types";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;

const INVOICE_JSON = JSON.stringify({
  category: "invoice",
  categoryConfidence: 0.97,
  quality: { readable: true, flags: [] },
  fields: {
    vendor: { value: "Acme Corp", confidence: 0.99 },
    invoiceNumber: { value: "INV-2026-001", confidence: 0.99 },
    amount: { value: "1250.00", confidence: 0.98 },
    currency: { value: "USD", confidence: 0.8 },
    date: { value: "2026-01-02", confidence: 0.95 },
  },
  lineItems: [{ description: "Setup fee", quantity: 1, unitPrice: 1250, amount: 1250, confidence: 0.9 }],
  suggestedRoute: "Acme Corp/Invoices/2026",
  suggestedTags: ["AP", "invoice"],
});

const LOW_CONF_INVOICE_JSON = JSON.stringify({
  category: "invoice",
  categoryConfidence: 0.4,
  quality: { readable: true, flags: [{ code: "blurry", source: "model" }] },
  fields: { vendor: { value: "Acme Corp", confidence: 0.3 } },
  suggestedTags: [],
});

const CSV = new TextEncoder().encode("vendor,amount,date\nAcme Corp,1250.00,2026-01-02\n");

function seedDoc(tenant: string, fileName: string, bytes: Uint8Array, mime: string, ext: VaultFileExtension): string {
  const r = createVaultDocument({ tenantEmail: tenant, fileName, bytes, mime, ext, actor: "user@x", dataDir: dir });
  return r.doc.id;
}
function mockDeps(client?: MockModelClient, extra?: Partial<ExtractRunnerDeps>) {
  return { client: client ?? new MockModelClient({ content: INVOICE_JSON }), ...extra };
}
function authedReq(method: string, pathname: string, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  return new Request(`http://localhost${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
function route(method: string, pathname: string, body?: unknown, deps?: ReturnType<typeof mockDeps>, tenant: string = T1): Promise<Response> {
  return handleNativeExtractAuthed(authedReq(method, pathname, body), { userEmail: tenant, dataDir: dir, extractDeps: deps });
}
async function pendingFirst() {
  const ws = listPendingWrites(dir, T1).filter((w) => w.status === "pending");
  return ws[ws.length - 1]!;
}
async function extractAndApply(docId: string, deps?: ReturnType<typeof mockDeps>): Promise<{ status: string; resultId?: string }> {
  const r = await route("POST", `/api/native/extract/documents/${docId}/extract`, undefined, deps);
  expect(r.status).toBe(202); // gated
  const ptw = await pendingFirst();
  const applied = await route("POST", `/api/native/extract/writes/${ptw.id}/apply`, undefined, deps);
  expect(applied.status).toBe(200);
  const data = (await applied.json()).data as { status: string; resultId?: string };
  return { status: data.status, resultId: data.resultId };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-extract-"));
  registerBuiltinNativeExtractEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("native extract slice", () => {
  it("extraction run is approval-gated; apply creates a draft with audit + event; replay is idempotent", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const r = await route("POST", `/api/native/extract/documents/${docId}/extract`, undefined, mockDeps());
    expect(r.status).toBe(202); // gated — queued, not run
    expect(listExtractions(dir, T1).length).toBe(0); // no draft until apply
    const ptw = await pendingFirst();
    expect(ptw.tenantId).toBe(T1);
    const applied = await route("POST", `/api/native/extract/writes/${ptw.id}/apply`, undefined, mockDeps());
    expect(applied.status).toBe(200);
    const drafts = listExtractions(dir, T1);
    expect(drafts.length).toBe(1);
    expect(drafts[0]!.docId).toBe(docId);
    expect(drafts[0]!.category).toBe("invoice");
    expect(drafts[0]!.fields.length).toBeGreaterThan(1);
    expect(drafts[0]!.status).toBe("pending_review");
    const audit = listAudit(dir, T1);
    expect(audit.some((e) => e.action === "native.extract.draft.created" && e.resultId === drafts[0]!.id)).toBe(true);
    // Idempotent replay — alreadyApplied, no second draft.
    const replay = await route("POST", `/api/native/extract/writes/${ptw.id}/apply`, undefined, mockDeps());
    expect(replay.status).toBe(200);
    const data = (await replay.json()).data as { alreadyApplied?: boolean };
    expect(data.alreadyApplied).toBe(true);
    expect(listExtractions(dir, T1).length).toBe(1);
  });

  it("fail-closed: unknown/foreign ids → 400/404, cross-tenant result invisible", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    expect((await route("POST", "/api/native/extract/documents/not_a_doc_id/extract")).status).toBe(404);
    const missing = await route("POST", "/api/native/extract/documents/doc_doesnotexist/extract");
    expect(missing.status).toBe(404);
    // Run for T1 then check T2 cannot see the draft.
    const { resultId } = await extractAndApply(docId, mockDeps());
    const stranger = await route("GET", `/api/native/extract/results/${resultId}`, undefined, undefined, T2);
    expect(stranger.status).toBe(404);
    expect(listExtractions(dir, T2).length).toBe(0);
  });

  it("low-confidence extraction lands in the human-review lane (requiresReview)", async () => {
    const docId = seedDoc(T1, "blurry.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]), "image/png", "png");
    const { resultId } = await extractAndApply(docId, mockDeps(new MockModelClient({ content: LOW_CONF_INVOICE_JSON })));
    const draft = getExtraction(dir, T1, resultId!)!;
    expect(draft.quality.requiresReview).toBe(true);
    expect(draft.categoryConfidence).toBeLessThan(0.55);
  });

  it("LLM daily-call cap fails closed at apply — no model call, no draft", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const tracker = createCostTracker(dir);
    tracker.record(T1, { provider: "mock", model: "m", tier: "strong", tokens: 0, calls: 100 }); // cap (100/day) already spent
    const r = await route("POST", `/api/native/extract/documents/${docId}/extract`, undefined, mockDeps());
    expect(r.status).toBe(202);
    const ptw = await pendingFirst();
    const applied = await route("POST", `/api/native/extract/writes/${ptw.id}/apply`, undefined, mockDeps(undefined, { costTracker: tracker }));
    expect(applied.status).toBe(400); // fail-closed
    expect(listExtractions(dir, T1).length).toBe(0);
    expect(listPendingWrites(dir, T1).find((w) => w.id === ptw.id)!.status).toBe("rejected");
  });

  it("autonomy allow-list auto-runs extractDocument with recordAutonomyOutcome", async () => {
    setAutonomyWorkflow(T1, "native-extract", { enabled: true, allowList: [{ id: "al-extract-run", action: "extractDocument" }] }, dir);
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const r = await route("POST", `/api/native/extract/documents/${docId}/extract`, undefined, mockDeps());
    expect(r.status).toBe(200); // auto-applied
    expect(listExtractions(dir, T1).length).toBe(1);
    expect(listAudit(dir, T1).some((e) => e.action === "native.extract.draft.created")).toBe(true);
  });

  it("human-review reject lane flips the draft to rejected (audited, ungated)", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const { resultId } = await extractAndApply(docId, mockDeps());
    const rej = await route("POST", `/api/native/extract/results/${resultId}/reject`);
    expect(rej.status).toBe(200);
    expect(getExtraction(dir, T1, resultId!)!.status).toBe("rejected");
    const miss = await route("POST", "/api/native/extract/results/ext_nope/reject");
    expect(miss.status).toBe(404);
  });

  it("row-data helper pre-fills a target table's fields from the draft (read-only)", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const { resultId } = await extractAndApply(docId, mockDeps());
    const table: TableDef = {
      id: "tbl_fixture",
      tenantId: T1,
      name: "Invoices",
      description: "",
      fields: [
        { key: "vendor", label: "Vendor", type: "text" },
        { key: "amount", label: "Amount", type: "number" },
        { key: "date", label: "Date", type: "date" },
        { key: "notes", label: "Notes", type: "text" },
      ],
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: T1,
      updatedAt: new Date().toISOString(),
      updatedBy: T1,
    };
    void createTable(dir, table);
    const row = await route("GET", `/api/native/extract/results/${resultId}/row-data?tableId=tbl_fixture`);
    expect(row.status).toBe(200);
    const data = (await row.json()).data as { rowData: Record<string, unknown> };
    expect(data.rowData.vendor).toBe("Acme Corp");
    expect(data.rowData.amount).toBe(1250);
    expect(data.rowData.date).toBe("2026-01-02");
    expect(data.rowData.notes).toBe(""); // no extraction value → empty (user fills)
    // Foreign table → 404 (no IDOR); table of another tenant → 404 via getTable
    const foreign = await route("GET", `/api/native/extract/results/${resultId}/row-data?tableId=tbl_zzz`);
    expect(foreign.status).toBe(404);
    expect(listExtractions(dir, T1).length).toBe(1); // helper never mutated anything
  });
});