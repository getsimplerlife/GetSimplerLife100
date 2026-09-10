/**
 * extraction-prompts.ts — Phase 1.5b per-doc-type extractor prompts.
 *
 * ONE model pass per document does classification + type-specific extraction
 * + quality judgement, returning STRICT JSON (no markdown fences). The runner
 * parses and validates before anything is offered to the human lane — a
 * malformed or low-confidence result never writes and never auto-files.
 *
 * Field schemas (spec: invoices → vendor/amount/date/line items; receipts →
 * merchant/amount/category; contracts → parties/dates/obligations; IDs/forms
 * → key fields; else generic).
 */
import type { DocCategory } from "./extraction-types";

export interface ExtractionFieldSpec {
  key: string;
  label: string;
  kind: "text" | "money" | "date" | "qty";
  required: boolean;
  /** Prompt hint so the model knows what to look for. */
  hint: string;
}

/** Field schemas per category. "other" gets generic metadata fields. */
export const EXTRACTION_FIELD_SCHEMAS: Record<DocCategory, ExtractionFieldSpec[]> = {
  invoice: [
    { key: "vendor", label: "Vendor / supplier", kind: "text", required: true, hint: "issuing company name" },
    { key: "invoiceNumber", label: "Invoice number", kind: "text", required: true, hint: "invoice/reference number" },
    { key: "amount", label: "Total amount", kind: "money", required: true, hint: "final total incl. tax" },
    { key: "currency", label: "Currency", kind: "text", required: false, hint: "ISO code (USD, EUR, ...)" },
    { key: "date", label: "Invoice date", kind: "date", required: true, hint: "issue date" },
    { key: "dueDate", label: "Due date", kind: "date", required: false, hint: "payment due date, if present" },
    { key: "taxAmount", label: "Tax amount", kind: "money", required: false, hint: "tax/VAT portion" },
    { key: "poNumber", label: "PO number", kind: "text", required: false, hint: "purchase order reference, if present" },
  ],
  receipt: [
    { key: "merchant", label: "Merchant", kind: "text", required: true, hint: "store/merchant name" },
    { key: "amount", label: "Total amount", kind: "money", required: true, hint: "total paid" },
    { key: "currency", label: "Currency", kind: "text", required: false, hint: "ISO code" },
    { key: "date", label: "Receipt date", kind: "date", required: true, hint: "transaction date" },
    { key: "category", label: "Category", kind: "text", required: false, hint: "expense category (meals, travel, office...)" },
    { key: "paymentMethod", label: "Payment method", kind: "text", required: false, hint: "card/cash/terminal id if shown" },
  ],
  contract: [
    { key: "contractTitle", label: "Contract title", kind: "text", required: false, hint: "title/header of the agreement" },
    { key: "partyA", label: "Party A", kind: "text", required: true, hint: "first contracting party" },
    { key: "partyB", label: "Party B", kind: "text", required: true, hint: "second contracting party" },
    { key: "effectiveDate", label: "Effective date", kind: "date", required: false, hint: "start/effective date" },
    { key: "expiryDate", label: "Expiry date", kind: "date", required: false, hint: "term/end date, if present" },
    { key: "renewal", label: "Renewal terms", kind: "text", required: false, hint: "auto-renewal or notice period, if stated" },
    { key: "obligations", label: "Key obligations", kind: "text", required: false, hint: "2-3 line summary of material obligations" },
  ],
  id: [
    { key: "documentType", label: "Document type", kind: "text", required: true, hint: "passport, license, tax id, certificate..." },
    { key: "holderName", label: "Holder name", kind: "text", required: false, hint: "person/entity the document belongs to" },
    { key: "idNumber", label: "ID / license number", kind: "text", required: false, hint: "number field" },
    { key: "issueDate", label: "Issue date", kind: "date", required: false, hint: "date of issue" },
    { key: "expiryDate", label: "Expiry date", kind: "date", required: false, hint: "valid-until date, if present" },
    { key: "issuer", label: "Issuer / authority", kind: "text", required: false, hint: "issuing authority" },
  ],
  letter: [
    { key: "sender", label: "Sender", kind: "text", required: false, hint: "company/individual sending" },
    { key: "recipient", label: "Recipient", kind: "text", required: false, hint: "company/individual addressed" },
    { key: "date", label: "Date", kind: "date", required: false, hint: "letter date" },
    { key: "subject", label: "Subject", kind: "text", required: false, hint: "re: line / subject" },
    { key: "summary", label: "Summary", kind: "text", required: false, hint: "1-2 line summary of the letter's point" },
  ],
  report: [
    { key: "reportTitle", label: "Report title", kind: "text", required: false, hint: "title/header" },
    { key: "author", label: "Author", kind: "text", required: false, hint: "author/prepared-by" },
    { key: "date", label: "Report date", kind: "date", required: false, hint: "issue/period date" },
    { key: "summary", label: "Summary", kind: "text", required: false, hint: "1-2 line summary of findings" },
  ],
  photo: [
    { key: "subject", label: "Subject", kind: "text", required: false, hint: "what the photo shows" },
    { key: "dateTaken", label: "Date taken", kind: "date", required: false, hint: "date visible in metadata/caption, if any" },
  ],
  other: [
    { key: "title", label: "Title", kind: "text", required: false, hint: "document title/header if any" },
    { key: "date", label: "Date", kind: "date", required: false, hint: "any prominent date" },
    { key: "summary", label: "Summary", kind: "text", required: false, hint: "1-2 line description of what this document is" },
  ],
};

const CATEGORY_LIST = `"invoice" | "receipt" | "contract" | "id" | "letter" | "report" | "photo" | "other"`;

export const EXTRACTION_JSON_CONTRACT = `Respond with ONLY a single JSON object, no markdown fences, no commentary. Shape:

{
  "category": ${CATEGORY_LIST},
  "categoryConfidence": 0.0-1.0,
  "quality": {
    "readable": true|false,
    "flags": ["blurry"|"unreadable"|"wrong-orientation"|"handwritten" or omit],
    "note": "one short sentence"
  },
  "fields": { "<fieldKey>": { "value": "string or null", "confidence": 0.0-1.0 } },
  "lineItems": [ { "description": "...", "quantity": number|null, "unitPrice": number|null, "amount": number|null, "confidence": 0.0-1.0 } ],
  "suggestedRoute": "Vendor or sender name / <Category> / <YYYY> — or null",
  "suggestedTags": ["tag1", "tag2"]
}`;

export interface ExtractionPromptInput {
  fileName: string;
  size: number;
  /** Text content for text formats (CSV/DOCX/XLSX/PDF-with-layer). */
  text?: string;
  /** Raster data URL for image formats (vision models). */
  dataUrl?: string;
  /** Known document type hint from intake metadata, if any (e.g. "invoice"). */
  docTypeHint?: string;
}

function schemaToPrompt(category: DocCategory): string {
  const spec = EXTRACTION_FIELD_SCHEMAS[category];
  return spec.map((f) => `  "${f.key}" → ${f.label} (${f.kind}${f.required ? ", REQUIRED" : ""}) — ${f.hint}`).join("\n");
}

/** Build the system prompt describing the extraction contract for a category. */
export function buildSystemPrompt(category: DocCategory): string {
  return [
    "You are the Simpler Life 100 document intelligence extractor. You read a document the customer uploaded and return structured data.",
    "",
    "Rules:",
    "1. NEVER invent data — if a field is not present in the document, value MUST be null.",
    "2. money fields: numeric value only (no currency symbols, no commas) — put the iso code in the currency field.",
    "3. date fields: ISO format YYYY-MM-DD when a date is readable, else null.",
    "4. If the document is blurred, rotated, or mostly unreadable, say so in quality AND lower categoryConfidence — never guess content.",
    "5. Handwriting: transcribe only what you can read with confidence; leave the rest null.",
    "6. classification rule: choose the category that best matches what the document IS. The field schema shown below is for the EXPECTED category — if the document is actually a different type, still report the REAL category in \"category\" and populate only the fields that apply to it (using the closest-matching schema; leave the rest null/omitted).",
    `7. Field schema for expected category "${category}":\n${schemaToPrompt(category)}`,
    "",
    EXTRACTION_JSON_CONTRACT,
  ].join("\n");
}

/** For the first pass the runner classifies in the SAME call; this prompt
 *  covers every category and instructs the model to extract per-type once the
 *  category is chosen — one vision/text call per document. */
export function buildExtractionUserPrompt(input: ExtractionPromptInput): string {
  const lines: string[] = [];
  if (input.docTypeHint) lines.push(`Known document type hint (from upload metadata): ${input.docTypeHint}`);
  lines.push(`File: ${input.fileName}`);
  lines.push(`Size: ${input.size} bytes`);
  if (input.text) {
    lines.push("");
    lines.push("DOCUMENT TEXT (extracted server-side; preserve fields/layout understanding):");
    lines.push("-----");
    lines.push(input.text);
    lines.push("-----");
  }
  if (input.dataUrl) {
    lines.push("The image is attached to this message (see image content) — read it like a scanner.");
  }
  lines.push("");
  lines.push("Return the JSON object described in the system prompt.");
  return lines.join("\n");
}