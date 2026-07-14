/**
 * Document Processor — Real Implementation
 *
 * Uses real OCR (Tesseract/pdftotext) for text extraction and
 * LLM (OpenAI) for document classification and key info extraction.
 */

import { extractText } from "../ai/ocr";
import { classifyDocumentLLM, extractInfoLLM } from "../ai/llm";
import { createNotification } from "./schema";

export interface ProcessDocumentInput {
  filePath: string;
  mimeType?: string;
  filename?: string;
  userId: string;
}

export interface ProcessDocumentResult {
  success: boolean;
  documentType?: string;
  extractedText?: string;
  keyInfo?: Record<string, any>;
  error?: string;
}

/**
 * Process an uploaded document through the real pipeline:
 * OCR extract → LLM classify → LLM extract info → store → notify
 */
export async function processDocument(input: ProcessDocumentInput): Promise<ProcessDocumentResult> {
  const { filePath, mimeType, filename, userId } = input;

  try {
    // Step 1: Extract text using real OCR
    const ocrResult = await extractText(filePath, mimeType);

    if (!ocrResult.success) {
      return {
        success: false,
        error: ocrResult.error || "Failed to extract text from document",
      };
    }

    const text = ocrResult.text;
    if (!text || text.trim().length < 3) {
      return {
        success: false,
        error: "No text content found in document",
      };
    }

    // Step 2: Classify document using LLM
    let docType = "other";
    let keyInfo: Record<string, any> = {};

    try {
      const classification = await classifyDocumentLLM(text, filename);
      docType = classification.documentType;

      // Step 3: Extract key info using LLM
      try {
        const extracted = await extractInfoLLM(text, docType);
        keyInfo = extracted as Record<string, any>;
      } catch (err: any) {
        console.warn("[documentProcessor] LLM extraction failed, using regex fallback:", err.message);
        keyInfo = extractInfoFallback(text);
      }
    } catch (err: any) {
      console.warn("[documentProcessor] LLM classification failed, using rule fallback:", err.message);
      docType = classifyFallback(text, filename);
      keyInfo = extractInfoFallback(text);
    }

    // Step 4: Notify user
    try {
      await createNotification(
        userId,
        `📄 Document Processed: ${docType}`,
        `Document "${filename || "unknown"}" has been classified as "${docType}". Extracted ${Object.keys(keyInfo).length} data fields.`,
        "success"
      );
    } catch {}

    return {
      success: true,
      documentType: docType,
      extractedText: text.slice(0, 500),
      keyInfo,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Fallback Regex-based Classification (when LLM is unavailable) ──────────

function classifyFallback(text: string, filename?: string): string {
  const lower = (text + " " + (filename || "")).toLowerCase();

  const patterns: [string, string, number][] = [
    ["invoice", "invoice", 0.9], ["receipt", "receipt", 0.8],
    ["bill", "invoice", 0.7], ["payment", "invoice", 0.6],
    ["contract", "contract", 0.9], ["agreement", "contract", 0.8],
    ["lease", "contract", 0.7], ["purchase order", "purchase_order", 0.9],
    ["po number", "purchase_order", 0.8], ["po#", "purchase_order", 0.7],
    ["report", "report", 0.8], ["summary", "report", 0.7],
    ["email", "email", 0.8], ["from:", "email", 0.7],
    ["subject:", "email", 0.7], ["application", "form", 0.7],
    ["registration", "form", 0.7],
  ];

  let bestType = "other";
  let bestScore = 0;

  for (const [keyword, type, score] of patterns) {
    if (lower.includes(keyword) && score > bestScore) {
      bestType = type;
      bestScore = score;
    }
  }

  return bestType;
}

function extractInfoFallback(text: string): Record<string, any> {
  const extracted: Record<string, any> = {};

  // Dollar amounts
  const amounts = text.match(/\$[\d,]+(?:\.\d{2})?/g);
  if (amounts) extracted.amounts = amounts;

  // Email addresses
  const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emails) extracted.emails = emails;

  // Dates
  const dates = text.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},?\s*\d{4}\b/g);
  if (dates) extracted.dates = dates;

  // Phone numbers
  const phones = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
  if (phones) extracted.phones = phones;

  // Invoice/PO numbers
  const ids = text.match(/(?:INV|PO|ORD|REF|#)\s*[-]?\s*[A-Z0-9]{4,}/gi);
  if (ids) extracted.identifiers = ids;

  return extracted;
}

export default { processDocument };