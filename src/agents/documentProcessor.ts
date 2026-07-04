import { spawnSync } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

export interface ProcessDocumentInput {
  filePath: string;
  mimeType?: string;
  filename?: string;
  userId: string;
}

export interface DocumentPage {
  page_number: number;
  text: string;
  tables?: any[];
  [key: string]: any;
}

export interface DocumentResult {
  success: boolean;
  text: string;
  extractedText: string;
  documentType: string;
  metadata: Record<string, any>;
  keyInfo: Record<string, any>;
  fileName: string;
  fileSize: number;
  pageCount: number;
  pages: DocumentPage[];
  error?: string;
}

/**
 * Overloaded processDocument function to handle both the frontend's object input
 * and the agent runtime's string-based arguments format.
 */
export async function processDocument(
  input: ProcessDocumentInput | string,
  fileNameParam?: string
): Promise<DocumentResult> {
  let filePath: string = "";
  let fileName: string = "unknown";
  let userId: string = "system";

  try {
    if (typeof input === "object" && input !== null) {
      filePath = input.filePath;
      fileName = input.filename || "unknown";
      userId = input.userId || "system";
    } else {
      filePath = input;
      fileName = fileNameParam || "unknown";
    }

    const absPath = path.resolve(filePath);
    
    // Check file existence
    try {
      await fs.access(absPath);
    } catch {
      return {
        success: false,
        text: "",
        extractedText: "",
        documentType: "unknown",
        metadata: {},
        keyInfo: {},
        fileName,
        fileSize: 0,
        pageCount: 0,
        pages: [],
        error: `File not found at: ${absPath}`
      };
    }
    
    // Get file stats
    const stats = await fs.stat(absPath);
    const fileSize = stats.size;
    
    // Execute a short Python script to invoke the AdvancedDocumentProcessor
    const pyCode = `
import sys, json
from pathlib import Path
sys.path.insert(0, "/home/team/shared/agents")
from document_processor import AdvancedDocumentProcessor

try:
    processor = AdvancedDocumentProcessor()
    res = processor.process_document(sys.argv[1])
    print(json.dumps(res))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

    const result = spawnSync("python3", ["-c", pyCode, absPath], { encoding: "utf-8" });
    if (result.status !== 0 || !result.stdout) {
      return {
        success: false,
        text: "",
        extractedText: "",
        documentType: "unknown",
        metadata: {},
        keyInfo: {},
        fileName,
        fileSize,
        pageCount: 0,
        pages: [],
        error: result.stderr || "Failed to execute python processor"
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.stdout.trim());
    } catch (e: any) {
      return {
        success: false,
        text: "",
        extractedText: "",
        documentType: "unknown",
        metadata: {},
        keyInfo: {},
        fileName,
        fileSize,
        pageCount: 0,
        pages: [],
        error: `Failed to parse python JSON output: ${result.stdout}`
      };
    }

    if (!parsed.success) {
      return {
        success: false,
        text: "",
        extractedText: "",
        documentType: "unknown",
        metadata: {},
        keyInfo: {},
        fileName,
        fileSize,
        pageCount: 0,
        pages: [],
        error: parsed.error || "Document processing failed"
      };
    }

    // Extract type and pages from parsed output
    const documentType = parsed.classification?.classified_type || "generic_document";
    const text = parsed.text || "";
    
    // Map pages
    let pages: DocumentPage[] = [];
    let pageCount = 1;
    if (parsed.pdf_parsing?.pages && Array.isArray(parsed.pdf_parsing.pages)) {
      pages = parsed.pdf_parsing.pages.map((p: any) => ({
        page_number: p.page_number,
        text: p.text || "",
        tables: p.tables || []
      }));
      pageCount = parsed.pdf_parsing.page_count || pages.length;
    } else {
      pages = [{ page_number: 1, text }];
    }

    // Extract key fields for the front-end layout or the generic schema
    const keyInfo = parsed.forms?.extracted_fields || {};

    // Assemble metadata
    const metadata: Record<string, any> = {
      file_name: parsed.file_name,
      file_size_bytes: parsed.file_size_bytes,
      file_extension: parsed.file_extension,
      processed_at: parsed.processed_at,
      capabilities_run: parsed.capabilities_run,
      classification: parsed.classification,
      signatures: parsed.signatures,
      forms: parsed.forms,
      tables: parsed.tables,
    };

    // Notify user of completion if a real userId was specified
    if (userId && userId !== "system") {
      try {
        const { createNotification } = await import("./schema");
        await createNotification(
          userId,
          `📄 Document Processed: ${documentType}`,
          `Document "${fileName || "unknown"}" has been classified as "${documentType}".`,
          "success"
        );
      } catch (notifyErr: any) {
        console.error("Failed to trigger completion notification:", notifyErr);
      }
    }

    return {
      success: true,
      text,
      extractedText: text,
      documentType,
      metadata,
      keyInfo,
      fileName,
      fileSize,
      pageCount,
      pages
    };
  } catch (err: any) {
    return {
      success: false,
      text: "",
      extractedText: "",
      documentType: "unknown",
      metadata: {},
      keyInfo: {},
      fileName,
      fileSize: 0,
      pageCount: 0,
      pages: [],
      error: err.message
    };
  }
}
