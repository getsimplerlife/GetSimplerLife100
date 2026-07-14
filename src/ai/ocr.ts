/**
 * Simpler Life 100 — OCR & Document Text Extraction Service
 *
 * Real document text extraction using:
 * - pdftotext (poppler-utils) for PDFs
 * - tesseract for images
 * - xlsx/csv parsing for spreadsheets
 * - Native text for plain text files
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export interface OCRResult {
  success: boolean;
  text: string;
  textLength: number;
  method: string;
  pages?: number;
  error?: string;
}

// ── Text Extraction ────────────────────────────────────────────────────────

/**
 * Extract text from a file using the best available method.
 */
export async function extractText(filePath: string, mimeType?: string): Promise<OCRResult> {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const mime = mimeType || guessMimeFromExt(ext);

  try {
    // Plain text files
    if (mime.includes("text") || ["txt", "json", "md", "xml", "yaml", "yml", "log", "ini", "cfg", "env"].includes(ext)) {
      const content = await readFile(filePath, "utf-8");
      return {
        success: true,
        text: content,
        textLength: content.length,
        method: "text",
      };
    }

    // CSV
    if (ext === "csv") {
      const content = await readFile(filePath, "utf-8");
      return {
        success: true,
        text: content,
        textLength: content.length,
        method: "csv",
      };
    }

    // PDF
    if (ext === "pdf") {
      return await extractPDFText(filePath);
    }

    // Images (tesseract)
    if (["png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "webp"].includes(ext)) {
      return await extractImageText(filePath);
    }

    // Excel
    if (["xlsx", "xls"].includes(ext)) {
      return await extractExcelText(filePath);
    }

    // Word docs
    if (ext === "docx") {
      return await extractDocxText(filePath);
    }

    // Fallback: try reading as text
    const content = await readFile(filePath, "utf-8");
    return {
      success: true,
      text: content.slice(0, 5000),
      textLength: Math.min(content.length, 5000),
      method: "fallback_text",
    };
  } catch (err: any) {
    return {
      success: false,
      text: "",
      textLength: 0,
      method: "error",
      error: `Extraction failed: ${err.message}`,
    };
  }
}

// ── PDF Extraction ─────────────────────────────────────────────────────────

async function extractPDFText(filePath: string): Promise<OCRResult> {
  // Try pdftotext first
  try {
    const text = await spawnCapture("pdftotext", [filePath, "-"], 30000);
    if (text.trim().length > 10) {
      return {
        success: true,
        text: text,
        textLength: text.length,
        method: "pdftotext",
        pages: text.split("\f").length,
      };
    }
  } catch {
    // pdftotext not available or failed
  }

  // Fallback: try tesseract on PDF (convert to images first)
  try {
    // Use pdftoppm to convert to images, then tesseract
    const imageDir = filePath + "_images";
    const { mkdir, rm } = await import("node:fs/promises");
    await mkdir(imageDir, { recursive: true }).catch(() => {});

    await spawnCapture("pdftoppm", [filePath, `${imageDir}/page`, "-png", "-r", "300"], 60000);

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(imageDir);
    const pngFiles = files.filter(f => f.endsWith(".png")).sort();

    if (pngFiles.length > 0) {
      let fullText = "";
      for (const pngFile of pngFiles) {
        const pageText = await tesseractOCR(`${imageDir}/${pngFile}`);
        fullText += pageText + "\n\n";
      }

      // Clean up temp images
      await rm(imageDir, { recursive: true, force: true }).catch(() => {});

      if (fullText.trim().length > 0) {
        return {
          success: true,
          text: fullText.trim(),
          textLength: fullText.trim().length,
          method: "pdftoppm+tesseract",
          pages: pngFiles.length,
        };
      }
    }
  } catch {
    // Cleanup on failure
    const { rm } = await import("node:fs/promises");
    await rm(imageDir, { recursive: true, force: true }).catch(() => {});
  }

  // Ultimate fallback: return raw bytes as text
  const content = await readFile(filePath);
  const text = content.toString("utf-8").replace(/\0/g, " ").slice(0, 2000);
  return {
    success: true,
    text: `[PDF file] Unable to extract structured text. Raw content preview:\n${text}`,
    textLength: text.length,
    method: "raw_fallback",
  };
}

// ── Image OCR (Tesseract) ──────────────────────────────────────────────────

async function extractImageText(filePath: string): Promise<OCRResult> {
  try {
    const text = await tesseractOCR(filePath);
    if (text.trim().length > 0) {
      return {
        success: true,
        text: text,
        textLength: text.length,
        method: "tesseract",
      };
    }
  } catch {
    // tesseract not available
  }

  return {
    success: false,
    text: "",
    textLength: 0,
    method: "error",
    error: "Tesseract OCR not available. Install tesseract-ocr to enable image text extraction.",
  };
}

async function tesseractOCR(imagePath: string): Promise<string> {
  return spawnCapture("tesseract", [imagePath, "stdout", "-l", "eng"], 30000);
}

// ── Excel Extraction ───────────────────────────────────────────────────────

async function extractExcelText(filePath: string): Promise<OCRResult> {
  // Try using Python xlsx parser if available
  try {
    const text = await spawnCapture("python3", ["-c", `
import sys
try:
    import openpyxl
    wb = openpyxl.load_workbook("${filePath.replace(/"/g, '\\"')}", data_only=True)
    for sheet in wb.sheetnames:
        ws = wb[sheet]
        print(f"=== Sheet: {sheet} ===")
        for row in ws.iter_rows(values_only=True):
            print("\\t".join(str(c) if c is not None else "" for c in row))
except ImportError:
    import csv
    import io
    # fallback
    print("[openpyxl not available]")
`], 30000);
    if (text.trim().length > 10 && !text.includes("[openpyxl not available]")) {
      return {
        success: true,
        text: text,
        textLength: text.length,
        method: "openpyxl",
      };
    }
  } catch {
    // python not available
  }

  // Fallback: read as binary and note it
  const content = await readFile(filePath);
  const hash = createHash("md5").update(content).digest("hex").slice(0, 8);
  return {
    success: true,
    text: `[Excel file: ${filePath.split("/").pop()}] Size: ${content.length} bytes. MD5: ${hash}. Install openpyxl (pip install openpyxl) for full extraction.`,
    textLength: 0,
    method: "metadata",
  };
}

// ── DOCX Extraction ────────────────────────────────────────────────────────

async function extractDocxText(filePath: string): Promise<OCRResult> {
  // DOCX is a ZIP file with XML inside
  try {
    // Try using python3 docx parser
    const text = await spawnCapture("python3", ["-c", `
import sys
try:
    import docx
    doc = docx.Document("${filePath.replace(/"/g, '\\"')}")
    for para in doc.paragraphs:
        print(para.text)
except ImportError:
    print("[python-docx not available]")
`], 30000);
    if (text.trim().length > 10 && !text.includes("[python-docx not available]")) {
      return {
        success: true,
        text: text,
        textLength: text.length,
        method: "python-docx",
      };
    }
  } catch {
    // python not available
  }

  // Fallback: try unzip and read XML
  try {
    const text = await spawnCapture("unzip", ["-p", filePath, "word/document.xml"], 10000);
    // Strip XML tags
    const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length > 10) {
      return {
        success: true,
        text: stripped.slice(0, 10000),
        textLength: Math.min(stripped.length, 10000),
        method: "unzip+xml",
      };
    }
  } catch {
    // unzip not available
  }

  const content = await readFile(filePath);
  return {
    success: true,
    text: `[DOCX file: ${filePath.split("/").pop()}] Size: ${content.length} bytes. Install python-docx (pip install python-docx) for full extraction.`,
    textLength: 0,
    method: "metadata",
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function spawnCapture(cmd: string, args: string[], timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 200)}`));
    });

    proc.on("error", (err) => reject(err));

    // Timeout handling
    setTimeout(() => {
      proc.kill();
      reject(new Error(`${cmd} timed out after ${timeout}ms`));
    }, timeout);
  });
}

function guessMimeFromExt(ext: string): string {
  const mimeMap: Record<string, string> = {
    txt: "text/plain", json: "application/json", md: "text/markdown",
    csv: "text/csv", xml: "application/xml", yaml: "text/yaml", yml: "text/yaml",
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff", tif: "image/tiff",
    webp: "image/webp", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return mimeMap[ext] || "application/octet-stream";
}

export default { extractText };