/**
 * text-extractor.ts — Phase 1.5b deterministic document → text/payload layer.
 *
 * Formats:
 *   - CSV                          → utf-8 text
 *   - DOCX (zip: word/document.xml)→ stripped XML text
 *   - XLSX (zip: sharedStrings + sheets) → tab/newline grid text
 *   - PDF                          → embedded text-showing operators extracted
 *                                     from (optionally FlateDecode) streams
 *   - PNG / JPEG / WebP / GIF      → raster payload (data URL for vision LLM)
 *
 * Zero new dependencies: fflate (already vendored) does all zlib/zip work.
 * Everything is fail-closed: a zip that won't open, a stream that won't
 * inflate, or binary garbage produces `null` — never guessed text. Scanned
 * PDFs (no text layer) yield an empty result which the runner flags
 * empty-text → human-review lane (never silent garbage).
 */
import { unzipSync, unzlibSync, inflateSync, strFromU8 } from "fflate";
import { EXTRACTION_MAX_VISION_BYTES } from "./extraction-types";

export type ExtractPayload =
  | { kind: "text"; text: string }
  | { kind: "raster"; dataUrl: string; mime: string }
  | { kind: "empty" };

const RASTER_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function utf8(bytes: Uint8Array): string {
  try {
    return strFromU8(bytes);
  } catch {
    return "";
  }
}

// ── XML helpers (dependency-free, lenient) ──────────────────────────────
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

/** Strip XML tags, keeping paragraph/row/tab breaks so the LLM sees layout. */
function xmlToText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── DOCX ────────────────────────────────────────────────────────────────
function extractDocx(bytes: Uint8Array): string | null {
  try {
    const zip = unzipSync(bytes);
    const docXml = zip["word/document.xml"];
    if (!docXml) return null;
    return xmlToText(utf8(docXml));
  } catch {
    return null;
  }
}

// ── XLSX ────────────────────────────────────────────────────────────────
function extractXlsx(bytes: Uint8Array): string | null {
  try {
    const zip = unzipSync(bytes);
    const sharedRaw = zip["xl/sharedStrings.xml"];
    const shared: string[] = [];
    if (sharedRaw) {
      const text = utf8(sharedRaw);
      const siRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
      let m: RegExpExecArray | null;
      while ((m = siRe.exec(text)) !== null) {
        const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
        let t: RegExpExecArray | null;
        const parts: string[] = [];
        while ((t = tRe.exec(m[1])) !== null) parts.push(decodeXmlEntities(t[1].replace(/<[^>]+>/g, "")));
        shared.push(parts.join(""));
      }
    }
    // Walk worksheet files in order (sheet1.xml, sheet2.xml, ...).
    const sheetNames = Object.keys(zip).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();
    const rowsOut: string[] = [];
    for (const sheet of sheetNames.slice(0, 10)) {
      const text = utf8(zip[sheet]);
      const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
      let m: RegExpExecArray | null;
      while ((m = rowRe.exec(text)) !== null) {
        const cells: string[] = [];
        const cRe = /<c(?:\s[^>]*)?>([\s\S]*?)<\/c>|<c(?:\s[^>]*)?\/>/g;
        let c: RegExpExecArray | null;
        while ((c = cRe.exec(m[1])) !== null) {
          const cellInner = c[1] ?? "";
          const tMatch = /t="([^"]+)"/.exec(c[0]);
          const tType = tMatch ? tMatch[1] : "";
          const vRe = /<v>([\s\S]*?)<\/v>/;
          const isRe = /<is>([\s\S]*?)<\/is>/;
          const v = vRe.exec(cellInner);
          const is = isRe.exec(cellInner);
          let cell =
            tType === "s" && v ? (shared[Number(v[1])] ?? "") : tType === "inlineStr" && is ? xmlToText(is[1]) : v ? decodeXmlEntities(v[1]) : "";
          cells.push(cell);
        }
        rowsOut.push(cells.join("\t"));
      }
    }
    return rowsOut.filter((r) => r.trim()).join("\n") || null;
  } catch {
    return null;
  }
}

// ── PDF ─────────────────────────────────────────────────────────────────
/** Minimal WinAnsi → Unicode for the byte range that differs from latin-1
 *  (curly quotes, dashes, €, …, ™). Best-effort; everything else = latin-1. */
const WINANSI_HIGH: Record<number, string> = {
  0x80: "\u20AC", 0x82: "\u201A", 0x83: "\u0192", 0x84: "\u201E", 0x85: "\u2026",
  0x86: "\u2020", 0x87: "\u2021", 0x88: "\u02C6", 0x89: "\u2030", 0x8A: "\u0160",
  0x8B: "\u2039", 0x8C: "\u0152", 0x8E: "\u017D", 0x91: "\u2018", 0x92: "\u2019",
  0x93: "\u201C", 0x94: "\u201D", 0x95: "\u2022", 0x96: "\u2013", 0x97: "\u2014",
  0x98: "\u02DC", 0x99: "\u2122", 0x9A: "\u0161", 0x9B: "\u203A", 0x9C: "\u0153",
  0x9E: "\u017E", 0x9F: "\u0178",
};
function decodePdfString(bytes: Uint8Array): string {
  // UTF-16BE with BOM is the explicit PDF text-encoding marker.
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const cp = (bytes[i] << 8) | bytes[i + 1];
      out += cp >= 0xd800 && cp <= 0xdbff && i + 3 < bytes.length ? "" : String.fromCharCode(cp);
    }
    return out;
  }
  let out = "";
  for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : WINANSI_HIGH[b] || String.fromCharCode(b);
  return out;
}

/** Pull `(literal)` and `[array]` string tokens from a PDF content stream. */
function pdfStreamToText(stream: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < stream.length) {
    const ch = stream[i];
    if (ch === "(") {
      // Balanced-paren string literal with backslash escapes.
      let j = i + 1;
      let depth = 1;
      let buf = "";
      while (j < stream.length && depth > 0) {
        const c = stream[j];
        if (c === "\\") {
          const nxt = stream[j + 1];
          const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
          if (nxt >= "0" && nxt <= "7") {
            const octal = stream.slice(j + 1, j + 4);
            buf += String.fromCharCode(parseInt(octal, 8));
            j += 4;
            continue;
          }
          buf += map[nxt] ?? nxt;
          j += 2;
          continue;
        }
        if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth === 0) break;
        }
        buf += c;
        j++;
      }
      out.push(buf);
      i = j + 1;
      continue;
    }
    // In `[...]` arrays the text elements are also parenthesised and are
    // already captured by the branch above — skip to the closing bracket.
    if (ch === "[") {
      let depth = 1;
      let j = i + 1;
      while (j < stream.length && depth > 0) {
        if (stream[j] === "[") depth++;
        else if (stream[j] === "]") depth--;
        j++;
      }
      i = j;
      continue;
    }
    i++;
  }
  return out.filter((s) => s.trim()).join(" ");
}

function inflatePdfStream(raw: Uint8Array): Uint8Array | null {
  try {
    return unzlibSync(raw); // FlateDecode = zlib container
  } catch {
    try {
      return inflateSync(raw); // raw deflate fallback
    } catch {
      return null;
    }
  }
}

/** True single-byte decode (byte → U+00xx). NOT TextDecoder — the WHATWG
 *  encoding standard maps "latin1"/"iso-8859-1" labels to windows-1252,
 *  which corrupts bytes 0x80–0x9F inside compressed PDF streams. */
function bytesToLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** Byte-level search (no string round-trip, so binary streams stay exact). */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

const STREAM_MARKER = new TextEncoder().encode("stream");
const ENDSTREAM_MARKER = new TextEncoder().encode("endstream");

function extractPdf(bytes: Uint8Array): string | null {
  try {
    const parts: string[] = [];
    let pos = 0;
    while (true) {
      const sIdx = indexOfBytes(bytes, STREAM_MARKER, pos);
      if (sIdx === -1) break;
      // Stream data starts after "stream" + EOL ("\n" or "\r\n").
      let dataStart = sIdx + STREAM_MARKER.length;
      if (bytes[dataStart] === 0x0d) dataStart++; // \r
      if (bytes[dataStart] === 0x0a) dataStart++; // \n
      const eIdx = indexOfBytes(bytes, ENDSTREAM_MARKER, dataStart);
      if (eIdx === -1) break;
      const block = bytes.slice(dataStart, eIdx);
      let text: string | null = null;
      const inflated = inflatePdfStream(block);
      if (inflated) {
        const t = pdfStreamToText(bytesToLatin1(inflated));
        if (t) text = t;
      } else {
        const t = pdfStreamToText(bytesToLatin1(block));
        if (t) text = t;
      }
      if (text) parts.push(text);
      pos = eIdx + ENDSTREAM_MARKER.length;
    }
    return parts.join("\n") || null; // null → scanned/empty PDF
  } catch {
    return null;
  }
}

// ── Public surface ──────────────────────────────────────────────────────
/** Format-appropriate payload for a $VaultFileExtension + canonical mime. */
export function buildExtractPayload(mime: string, ext: string, bytes: Uint8Array): ExtractPayload {
  if (RASTER_MIMES.has(mime)) {
    if (bytes.byteLength > EXTRACTION_MAX_VISION_BYTES) return { kind: "empty" }; // oversize flagged by caller
    const b64 = Buffer.from(bytes).toString("base64");
    return { kind: "raster", dataUrl: `data:${mime};base64,${b64}`, mime };
  }
  if (mime === "text/csv" || ext === "csv") {
    const text = utf8(bytes);
    return { kind: "text", text };
  }
  if (mime.includes("officedocument.wordprocessingml") || ext === "docx") {
    const text = extractDocx(bytes);
    return text === null ? { kind: "empty" } : { kind: "text", text };
  }
  if (mime.includes("spreadsheetml") || ext === "xlsx") {
    const text = extractXlsx(bytes);
    return text === null ? { kind: "empty" } : { kind: "text", text };
  }
  if (mime === "application/pdf" || ext === "pdf") {
    const text = extractPdf(bytes);
    return text === null ? { kind: "empty" } : { kind: "text", text };
  }
  return { kind: "empty" };
}

/** Direct text extraction (used by tests + downstream consumers). */
export function extractDocumentText(mime: string, ext: string, bytes: Uint8Array): string | null {
  const payload = buildExtractPayload(mime, ext, bytes);
  return payload.kind === "text" ? payload.text : null;
}