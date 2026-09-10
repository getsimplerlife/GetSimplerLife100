/**
 * extraction-core.test.ts — Phase 1.5b Document & File Intelligence: LLM
 * extraction pipeline.
 *
 * Coverage:
 *   - deterministic text extraction (CSV / DOCX / XLSX / PDF raw + flate /
 *     scanned → empty; PNG → raster data URL; oversize)
 *   - LLM wire serialization (multimodal content blocks — backward compatible)
 *   - model-output parsing: normalization (money/date), confidence clamps,
 *     unknown-category fallback, hostile flag strings dropped
 *   - pipeline orchestration: per-type extractors via mocked model, quality
 *     flags → human-review lane (NO model call when deterministically broken),
 *     not-configured / model-error / unparseable → durable error records
 *   - SAFETY: output NEVER writes; apply rides the Approval Queue (default →
 *     pending + audit), autonomy allow-list auto-applies only clean results,
 *     review-required results can NEVER auto-apply, tenant isolation,
 *     immutable audit per extraction, reject lane.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { zipSync, strToU8, zlibSync } from "fflate";
import { createVaultDocument, getVaultDocument } from "../lib/vault-store";
import { appendVaultAudit, listVaultAudit } from "../lib/vault-audit";
import { extractDocumentText, buildExtractPayload } from "../lib/extraction/text-extractor";
import { parseModelOutput, normalizeAmount, normalizeDate, buildQuality } from "../lib/extraction/extraction-parse";
import { runExtraction } from "../lib/extraction/extraction-runner";
import { applyExtractedMetadata, rejectExtraction } from "../lib/extraction/extraction-gate";
import { getExtraction, listExtractions } from "../lib/extraction/extraction-store";
import { serializeMessagesForWire, type LlmMessage, type ModelClient, type LlmCompleteResult, type LlmCompleteRequest } from "../lib/llm/modelClient";
import { setAutonomyWorkflow } from "../lib/autonomy";
import { MockModelClient, type MockScript } from "../lib/llm/MockModelClient";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "extract-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});
const T1 = "tenant-a@example.com";
const T2 = "tenant-b@example.com";

// ── Fixtures ─────────────────────────────────────────────────────────────
const CSV = new TextEncoder().encode("vendor,amount,date\nAcme Corp,1250.00,2026-01-02\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x01, 0x02, 0x03, 0x04]);

function makeDocx(text: string): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${text
  .split("\n")
  .map((line) => `<w:p><w:r><w:t>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`)
  .join("")}
</w:body></w:document>`;
  return zipSync({ "word/document.xml": strToU8(xml) });
}

function makeXlsx(): Uint8Array {
  const shared = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<si><t>Item</t></si><si><t>Qty</t></si><si><t>Amount</t></si><si><t>Setup fee</t></si><si><t>2</t></si><si><t>1250</t></si>
</sst>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>
</sheetData>
</worksheet>`;
  return zipSync({ "xl/sharedStrings.xml": strToU8(shared), "xl/worksheets/sheet1.xml": strToU8(sheet) });
}

function makePdf(lines: string[], flate = false): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td\n${lines.map((l) => `(${l}) Tj 0 -16 Td`).join("\n")}\nET`;
  const streamBytes = flate ? zlibSync(strToU8(content)) : strToU8(content);
  // Binary-safe assembly: the deflate stream must NOT round-trip through a
  // latin1 string (TextEncoder would mangle bytes >0x7F) — concat raw bytes.
  const head = strToU8(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n` +
      `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n` +
      `4 0 obj << /Length ${streamBytes.length}${flate ? " /Filter /FlateDecode" : ""} >>\nstream\n`,
  );
  const tail = strToU8(`\nendstream endobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF`);
  const out = new Uint8Array(head.length + streamBytes.length + tail.length);
  out.set(head, 0);
  out.set(streamBytes, head.length);
  out.set(tail, head.length + streamBytes.length);
  return out;
}

function seedDoc(tenant: string, name: string, bytes: Uint8Array, mime: string, ext: any): string {
  const r = createVaultDocument({ tenantEmail: tenant, fileName: name, bytes, mime, ext, actor: "user@x", dataDir: dir });
  return r.doc.id;
}

/** ModelClient wrapper that records the last request (asserts vision path). */
class RecordingClient implements ModelClient {
  readonly provider = "mock";
  readonly model = "mock-model";
  readonly tier = "strong" as const;
  lastRequest: LlmCompleteRequest | null = null;
  callCount = 0;
  constructor(private inner: MockModelClient) {}
  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResult> {
    this.callCount++;
    this.lastRequest = req;
    return this.inner.complete(req);
  }
}

// ── 1. Deterministic text extraction ─────────────────────────────────────
describe("text-extractor (deterministic, dependency-free)", () => {
  it("extracts CSV text", async () => {
    const t = extractDocumentText("text/csv", "csv", CSV);
    expect(t).toContain("Acme Corp");
    expect(t).toContain("1250.00");
  });
  it("extracts DOCX text (zip → document.xml stripped)", async () => {
    const t = extractDocumentText("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx", makeDocx("Service Agreement\nParties: Acme & Partner"));
    expect(t).toContain("Service Agreement");
    expect(t).toContain("Acme & Partner");
  });
  it("extracts XLSX grid text incl. shared strings", async () => {
    const t = extractDocumentText("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx", makeXlsx());
    expect(t).toContain("Item");
    expect(t).toContain("Setup fee");
    expect(t).toContain("1250");
  });
  it("extracts PDF text from a raw content stream", async () => {
    const t = extractDocumentText("application/pdf", "pdf", makePdf(["INVOICE 2026-001", "Acme Corp"]));
    expect(t).toContain("INVOICE 2026-001");
    expect(t).toContain("Acme Corp");
  });
  it("extracts PDF text from a FlateDecode(zlib) stream", async () => {
    const t = extractDocumentText("application/pdf", "pdf", makePdf(["SERVICE CONTRACT"], true));
    expect(t).toContain("SERVICE CONTRACT");
  });
  it("returns empty (not garbage) for a scanned PDF with no text layer", async () => {
    const t = extractDocumentText("application/pdf", "pdf", makePdf([], false));
    expect(t).toBeNull();
  });
  it("builds a raster data URL for PNG and reports empty for oversize", async () => {
    const p = buildExtractPayload("image/png", "png", PNG);
    expect(p.kind).toBe("raster");
    if (p.kind === "raster") expect(p.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});

// ── 2. LLM wire serialization (vision, backward compatible) ──────────────
describe("serializeMessagesForWire", () => {
  it("keeps plain messages exactly as before (no images)", async () => {
    const msgs: LlmMessage[] = [{ role: "user", content: "hello" }];
    expect(serializeMessagesForWire(msgs)).toEqual([{ role: "user", content: "hello" }]);
  });
  it("emits multimodal content blocks when images are present", async () => {
    const msgs: LlmMessage[] = [{ role: "user", content: "read this", images: [{ dataUrl: "data:image/png;base64,AAAA" }] }];
    const wire = serializeMessagesForWire(msgs);
    expect(wire[0].content).toEqual([
      { type: "text", text: "read this" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });
});

// ── 3. Model-output parsing ──────────────────────────────────────────────
describe("parseModelOutput (hostile-input-safe)", () => {
  it("normalizes money and date fields from an invoice result", async () => {
    const out = parseModelOutput(
      JSON.stringify({
        category: "invoice",
        categoryConfidence: 0.97,
        quality: { readable: true, flags: [] },
        fields: { vendor: { value: "Acme Corp", confidence: 0.99 }, amount: { value: "$1,250.00", confidence: 0.92 }, date: { value: "01/02/2026", confidence: 0.9 } },
        lineItems: [{ description: "Setup fee", amount: "1250.00", confidence: 0.95 }],
        suggestedRoute: "Acme Corp/Invoices/2026",
        suggestedTags: ["AP", "q1"],
      }),
      "invoice",
    );
    expect(out.category).toBe("invoice");
    const amount = out.fields.find((f) => f.key === "amount")!;
    expect(amount.numberValue).toBe(1250);
    const date = out.fields.find((f) => f.key === "date")!;
    expect(date.dateValue).toBe("2026-01-02");
    expect(out.lineItems[0].amount).toBe(1250);
    expect(out.suggestedRoute).toBe("Acme Corp/Invoices/2026");
  });
  it("falls back to the expected category on an unknown category string", async () => {
    const out = parseModelOutput(JSON.stringify({ category: "delete-everything", categoryConfidence: 1, fields: {} }), "letter");
    expect(out.category).toBe("letter");
  });
  it("drops hostile flag strings that are not in the allow-list", async () => {
    const out = parseModelOutput(JSON.stringify({ category: "other", categoryConfidence: 0.9, quality: { flags: ["delete-everything", "blurry"] }, fields: {} }), "other");
    expect(out.flags.map((f) => f.code)).toEqual(["blurry"]);
  });
  it("marks unparseable output as unreadable with zero confidence", async () => {
    const out = parseModelOutput("sorry i couldnt read that", "other");
    expect(out.flags.some((f) => f.code === "unreadable")).toBe(true);
    expect(out.categoryConfidence).toBe(0);
  });
  it("normalizeAmount rejects junk silently", async () => {
    expect(normalizeAmount("$ 1,250.00")).toBe(1250);
    expect(normalizeAmount("(25.50)")).toBe(-25.5);
    expect(normalizeAmount("N/A")).toBeNull();
    expect(normalizeDate("2026-03-01")).toBe("2026-03-01");
    expect(normalizeDate("03/01/2026")).toBe("2026-03-01");
    expect(normalizeDate("not a date")).toBeNull();
  });
});

// ── 4. Pipeline orchestration ────────────────────────────────────────────
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

describe("runExtraction", () => {
  it("fails closed on an unknown document id", async () => {
    const out = await runExtraction({ tenantEmail: T1, documentId: "nope", actor: "u", dataDir: dir });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("unknown-document");
  });
  it("extracts an invoice from CSV text via the model (no direct write)", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const client = new RecordingClient(new MockModelClient({ content: INVOICE_JSON }));
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client, forceEnabled: true });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.category).toBe("invoice");
    expect(out.result.categoryConfidence).toBeCloseTo(0.97);
    expect(out.result.quality.requiresReview).toBe(false);
    expect(out.result.fields.find((f) => f.key === "amount")?.numberValue).toBe(1250);
    expect(out.result.status).toBe("pending_review"); // never auto-applied
    // audit appended
    const audit = listVaultAudit(dir, T1);
    expect(audit.some((e) => e.action === "vault.extraction" && e.outcome === "ok")).toBe(true);
    // document metadata untouched
    const doc = getVaultDocument(dir, T1, docId)!;
    expect(doc.docType).toBeUndefined();
    expect(doc.tags).toEqual([]);
  });
  it("feeds raster images to the vision path (data URL) and extracts", async () => {
    const docId = seedDoc(T1, "receipt.png", PNG, "image/png", "png");
    const receipt = JSON.stringify({
      category: "receipt",
      categoryConfidence: 0.9,
      quality: { readable: true, flags: [] },
      fields: { merchant: { value: "Corner Cafe", confidence: 0.95 }, amount: { value: "24.50", confidence: 0.93 }, date: { value: "2026-02-14", confidence: 0.9 } },
    });
    const client = new RecordingClient(new MockModelClient({ content: receipt }));
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.category).toBe("receipt");
    const userMsg = client.lastRequest?.messages.find((m) => m.role === "user");
    expect(userMsg?.images?.length).toBe(1);
    expect(userMsg?.images?.[0].dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
  it("flags oversize raster → human-review lane WITHOUT calling the model", async () => {
    const docId = seedDoc(T1, "big.png", PNG, "image/png", "png");
    const client = new RecordingClient(new MockModelClient({ content: INVOICE_JSON }));
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client, maxVisionBytes: 8 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe("quality-blocked");
      expect(out.resultId).toBeTruthy();
    }
    expect(client.callCount).toBe(0); // never spent tokens on an oversize scan
    const audit = listVaultAudit(dir, T1);
    expect(audit.some((e) => e.action === "vault.extraction" && e.outcome === "pending")).toBe(true);
  });
  it("flags a scanned/empty PDF → human-review lane WITHOUT calling the model", async () => {
    const docId = seedDoc(T1, "scan.pdf", makePdf([], false), "application/pdf", "pdf");
    const client = new RecordingClient(new MockModelClient({ content: INVOICE_JSON }));
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe("quality-blocked");
      expect(out.detail).toContain("text");
    }
    expect(client.callCount).toBe(0);
  });
  it("reports not-configured when the LLM layer is disabled (no key), no crash", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client: new MockModelClient({ result: "notConfigured" }) });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("not-configured");
  });
  it("records a durable error entry on model failure (audit outcome error)", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client: new MockModelClient({ result: "error" }) });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe("model-error");
      expect(out.resultId).toBeTruthy();
    }
    expect(listVaultAudit(dir, T1).some((e) => e.action === "vault.extraction" && e.outcome === "error")).toBe(true);
  });
  it("routes unparseable model output to the review lane as an error record", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client: new MockModelClient({ content: "```json { broken" }) });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("unparseable-output");
  });
  it("marks low-confidence results as requiresReview (human lane)", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const low = INVOICE_JSON.replace("0.97", "0.3");
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client: new MockModelClient({ content: low }) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.quality.requiresReview).toBe(true);
  });
  it("extracts contracts with parties/dates (per-doc-type extractor)", async () => {
    const docId = seedDoc(T1, "contract.pdf", makePdf(["Master Services Agreement", "Between Acme Corp and Partner LLC"], true), "application/pdf", "pdf");
    const contract = JSON.stringify({
      category: "contract",
      categoryConfidence: 0.92,
      quality: { readable: true, flags: [] },
      fields: {
        partyA: { value: "Acme Corp", confidence: 0.9 },
        partyB: { value: "Partner LLC", confidence: 0.9 },
        effectiveDate: { value: "2026-04-01", confidence: 0.85 },
        obligations: { value: "Deliver services; monthly invoices", confidence: 0.7 },
      },
    });
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client: new MockModelClient({ content: contract }) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.category).toBe("contract");
    expect(out.result.fields.find((f) => f.key === "partyA")?.value).toBe("Acme Corp");
    expect(out.result.fields.find((f) => f.key === "effectiveDate")?.dateValue).toBe("2026-04-01");
  });
  it("keeps extraction records tenant-scoped (zero cross-tenant)", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    const out = await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client: new MockModelClient({ content: INVOICE_JSON }) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(getExtraction(dir, T2, out.result.id)).toBeNull();
    expect(listExtractions(dir, T2)).toHaveLength(0);
    expect(listExtractions(dir, T1)).toHaveLength(1);
  });
});

// ── 5. Gated apply (the safety floor) ────────────────────────────────────
async function seededExtraction(tenant: string = T1, content: string = INVOICE_JSON): Promise<{ docId: string; resultId: string }> {
  const docId = seedDoc(tenant, "invoice.csv", CSV, "text/csv", "csv");
  const out = await runExtraction({ tenantEmail: tenant, documentId: docId, actor: "u", dataDir: dir, client: new MockModelClient({ content }) });
  if (!out.ok) throw new Error("seed extraction failed: " + out.error);
  return { docId, resultId: out.result.id };
}

describe("applyExtractedMetadata (Approval-Queue gated)", () => {
  it("default mode: apply → pending PendingAction + audit; nothing written yet", async () => {
    const { docId, resultId } = await seededExtraction();
    const out = applyExtractedMetadata({ tenantEmail: T1, documentId: docId, resultId, actor: "u", dataDir: dir });
    expect(out.ok).toBe(false);
    expect(out.pending).toBe(true);
    expect(out.actionId).toBeTruthy();
    const doc = getVaultDocument(dir, T1, docId)!;
    expect(doc.docType).toBeUndefined(); // NOT written before approval
    const audit = listVaultAudit(dir, T1);
    expect(audit.filter((e) => e.action === "updateVaultDocument").some((e) => e.outcome === "pending")).toBe(true);
    expect(getExtraction(dir, T1, resultId)!.status).toBe("pending_review");
  });
  it("fails closed: result from another tenant or mismatched doc", async () => {
    const { docId, resultId } = await seededExtraction(T1);
    const otherDoc = seedDoc(T2, "x.csv", CSV, "text/csv", "csv");
    expect(applyExtractedMetadata({ tenantEmail: T2, documentId: otherDoc, resultId, actor: "u", dataDir: dir }).ok).toBe(false);
    expect(applyExtractedMetadata({ tenantEmail: T1, documentId: otherDoc, resultId, actor: "u", dataDir: dir }).ok).toBe(false);
  });
  it("reject lane: flips the record, mutates nothing, audited", async () => {
    const { docId, resultId } = await seededExtraction();
    const out = rejectExtraction({ tenantEmail: T1, documentId: docId, resultId, actor: "u", dataDir: dir });
    expect(out.ok).toBe(true);
    expect(getExtraction(dir, T1, resultId)!.status).toBe("rejected");
    expect(listVaultAudit(dir, T1).some((e) => e.action === "vault.extraction" && e.detail?.includes("rejected"))).toBe(true);
    expect(getVaultDocument(dir, T1, docId)!.docType).toBeUndefined();
  });
  it("autonomy + explicit allow-list + clean result → executes with audit", async () => {
    setAutonomyWorkflow(T1, "wf-1", { enabled: true, allowList: [{ id: "al-1", action: "updateVaultDocument", label: "apply extraction metadata" }] }, dir);
    const { docId, resultId } = await seededExtraction();
    const out = applyExtractedMetadata({ tenantEmail: T1, documentId: docId, resultId, actor: "u", dataDir: dir, workflowId: "wf-1" });
    expect(out.ok).toBe(true);
    expect(out.autonomy).toBe(true);
    const doc = getVaultDocument(dir, T1, docId)!;
    expect(doc.docType).toBe("invoice");
    expect(doc.tags).toContain("AP");
    expect(getExtraction(dir, T1, resultId)!.status).toBe("applied");
    expect(listVaultAudit(dir, T1).some((e) => e.action === "updateVaultDocument" && e.outcome === "ok" && e.detail?.includes("allow-list"))).toBe(true);
  });
  it("autonomy allow-list but review-required result → NEVER auto-applies", async () => {
    setAutonomyWorkflow(T1, "wf-1", { enabled: true, allowList: [{ id: "al-1", action: "updateVaultDocument" }] }, dir);
    const low = INVOICE_JSON.replace("0.97", "0.3");
    const { docId, resultId } = await seededExtraction(T1, low);
    expect(getExtraction(dir, T1, resultId)!.quality.requiresReview).toBe(true);
    const out = applyExtractedMetadata({ tenantEmail: T1, documentId: docId, resultId, actor: "u", dataDir: dir, workflowId: "wf-1" });
    expect(out.ok).toBe(false);
    expect(out.error).toContain("human review");
    expect(getVaultDocument(dir, T1, docId)!.docType).toBeUndefined();
  });
  it("autonomy enabled but NO allow-list entry → stays pending (fail-closed)", async () => {
    setAutonomyWorkflow(T1, "wf-1", { enabled: true, allowList: [] }, dir);
    const { docId, resultId } = await seededExtraction();
    const out = applyExtractedMetadata({ tenantEmail: T1, documentId: docId, resultId, actor: "u", dataDir: dir, workflowId: "wf-1" });
    expect(out.pending).toBe(true);
    expect(out.autonomy).toBeUndefined();
  });
  it("applying twice is an idempotent no-op after autonomy executed", async () => {
    setAutonomyWorkflow(T1, "wf-1", { enabled: true, allowList: [{ id: "al-1", action: "updateVaultDocument" }] }, dir);
    const { docId, resultId } = await seededExtraction();
    applyExtractedMetadata({ tenantEmail: T1, documentId: docId, resultId, actor: "u", dataDir: dir, workflowId: "wf-1" });
    const second = applyExtractedMetadata({ tenantEmail: T1, documentId: docId, resultId, actor: "u", dataDir: dir, workflowId: "wf-1" });
    expect(second.ok).toBe(true);
    expect(second.unchanged).toBe(true);
  });
});

// ── 6. buildQuality / audit helpers sanity ───────────────────────────────
describe("quality + audit", () => {
  it("requiresReview is true when any flag exists (empty-text → review)", async () => {
    expect(buildQuality([], [{ code: "empty-text", source: "deterministic" }], 1).requiresReview).toBe(true);
  });
  it("requiresReview is true on low confidence even with zero flags", async () => {
    expect(buildQuality([], [], 1, true).requiresReview).toBe(true);
  });
  it("appends an immutable audit trail (append-only, count grows)", async () => {
    const docId = seedDoc(T1, "invoice.csv", CSV, "text/csv", "csv");
    for (let i = 0; i < 3; i++) {
      await runExtraction({ tenantEmail: T1, documentId: docId, actor: "u", dataDir: dir, client: new MockModelClient({ content: INVOICE_JSON }) });
    }
    const audit = listVaultAudit(dir, T1);
    expect(audit.filter((e) => e.action === "vault.extraction")).toHaveLength(3);
    const before = audit.length;
    appendVaultAudit(dir, T1, { actor: "u", action: "vault.extraction", outcome: "ok", detail: "append-only check" });
    expect(listVaultAudit(dir, T1)).toHaveLength(before + 1);
  });
});