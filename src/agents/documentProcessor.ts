/**
 * Document Processor — placeholder module
 * Processes uploaded documents: text extraction, classification, and storage.
 * Used by the Document Intake Agent at runtime, not directly from serve.ts.
 */

import { registry } from "./tools";
import { createNotification, extractTextFromUpload } from "./schema";

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
 * Process an uploaded document through the full pipeline:
 * extract → classify → extract info → store → notify
 */
export async function processDocument(input: ProcessDocumentInput): Promise<ProcessDocumentResult> {
  const { filePath, mimeType, filename, userId } = input;
  const ctx = { userId, agentId: "system", executionId: crypto.randomUUID(), db: null as any };

  try {
    // Step 1: Extract text
    const text = await extractTextFromUpload(filePath, mimeType || "application/octet-stream");

    // Step 2: Classify document
    const classifyResult = await registry.execute("classify_document", {
      text: text.slice(0, 3000),
      filename: filename || "",
    }, ctx);

    const docType = classifyResult.data?.documentType || "unknown";

    // Step 3: Extract key info
    const infoResult = await registry.execute("extract_key_info", {
      text: text.slice(0, 5000),
    }, ctx);

    // Step 4: Notify user
    await createNotification(
      userId,
      `📄 Document Processed: ${docType}`,
      `Document "${filename || "unknown"}" has been classified as "${docType}".`,
      "success"
    );

    return {
      success: true,
      documentType: docType,
      extractedText: text.slice(0, 500),
      keyInfo: infoResult.data || {},
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}