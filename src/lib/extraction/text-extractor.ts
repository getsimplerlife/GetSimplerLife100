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
 * inflate, or binary garbage produces `null` — never guessed text.
 *
 * Zip-bomb / PDF-bomb DoS guard (owner security hard bar 09-10): decompression
 * is BOUNDED BEFORE IT HAPPENS. ZIP inputs are checked against the central
 * directory's declared uncompressed sizes (never inflated when the manifest
 * exceeds the cap or is structurally uncertain — data-descriptor entries whose
 * sizes are unknown fail closed). PDF streams are inflated into a
 * pre-allocated output buffer capped at PDF_MAX_STREAM_UNCOMPRESSED, and
 * streams with a declared /Length or compressed size above the cap are refused
 * without inflation. Any doc that trips a bound returns `{ kind: "oversize" }`
 * which the runner routes to the human-review lane with an `oversize` flag —
 * never garbage, never a crash, never an unbounded allocation.
 */
import { unzipSync, unzlibSync, inflateSync, strFromU8 } from "fflate";
import { EXTRACTION_MAX_VISION_BYTES } from "./extraction-types";

export type ExtractPayload =
  | { kind: "text"; text: string }
  | { kind: "raster"; dataUrl: string; mime: string }
  | { kind: "oversize" }
  | { kind: "empty" };

// ── Decompression bounds (memory safety, not post-hoc checks) ────────────
export const ZIP_MAX_TOTAL_UNCOMPRESSED = 16 * 1024 * 1024; // 16 MiB total across all entries
export const ZIP_MAX_ENTRY_UNCOMPRESSED = 8 * 1024 * 1024; //  8 MiB per entry
export const PDF_MAX_STREAM_COMPRESSED = 8 * 1024 * 1024; //    8 MiB compressed block
export const PDF_MAX_STREAM_UNCOMPRESSED = 8 * 1024 * 1024; //  8 MiB inflated stream

const RASTER_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function utf8(bytes: Uint8Array): string {
  try {
    return strFromU8(bytes);
  } catch {
    return "";
  }
}

// ── ZIP central-directory manifest scan (zip-bomb guard) ────────────────
const ZIP_CD_SIG = 0x02014b50;
const ZIP_EOCD_SIG = 0x06054b50;

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** True when the ZIP central directory declares in-bounds decompressed sizes.
 *  Runs BEFORE any inflation so a zip-bomb can never allocate memory here.
 *  Fail-closed: no EOCD, an unknown-size entry (data-descriptor bit 3), a
 *  truncated CD walk, or any single entry / total above the cap → false. */
function scanZipManifest(bytes: Uint8Array): boolean {
  if (bytes.length < 22) return false;
  const floor = Math.max(0, bytes.length - 22 - 65535);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (u32(bytes, i) === ZIP_EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return false;
  const cdCount = u16(bytes, eocd + 10);
  let off = u32(bytes, eocd + 16);
  if (off >= eocd || cdCount === 0) return false;
  let total = 0;
  for (let i = 0; i < cdCount; i++) {
    if (off + 46 > eocd || u32(bytes, off) !== ZIP_CD_SIG) return false;
    const gpFlags = u16(bytes, off + 8);
    if (gpFlags & 0x0008) return false; // data descriptor → sizes unknown → fail closed
    const uSize = u32(bytes, off + 24);
    if (uSize > ZIP_MAX_ENTRY_UNCOMPRESSED) return false;
    total += uSize;
    if (total > ZIP_MAX_TOTAL_UNCOMPRESSED) return false;
    const nameLen = u16(bytes, off + 28);
    const extraLen = u16(bytes, off + 30);
    const commentLen = u16(bytes, off + 32);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return true;
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
function extractDocx(bytes: Uint8Array): { ok: true; text: string } | { ok: false; oversize: boolean } {
  if (!scanZipManifest(bytes)) return { ok: false, oversize: true };
  try {
    const zip = unzipSync(bytes);
    const docXml = zip["word/document.xml"];
    if (!docXml) return { ok: false, oversize: false };
    return { ok: true, text: xmlToText(utf8(docXml)) };
  } catch {
    return { ok: false, oversize: false };
  }
}

// ── XLSX ────────────────────────────────────────────────────────────────
function extractXlsx(bytes: Uint8Array): { ok: true; text: string } | { ok: false; oversize: boolean } {
  if (!scanZipManifest(bytes)) return { ok: false, oversize: true };
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
    return { ok: true, text: rowsOut.filter((r) => r.trim()).join("\n") || "" };
  } catch {
    return { ok: false, oversize: false };
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

/** Inflate a FlateDecode stream INTO A PRE-ALLOCATED CAPACITY (never grows).
 *  fflate writes into the provided buffer and throws when output exceeds it,
 *  so memory is hard-bounded at PDF_MAX_STREAM_UNCOMPRESSED before inflation. */
function inflatePdfStream(raw: Uint8Array): Uint8Array | null {
  const out = new Uint8Array(PDF_MAX_STREAM_UNCOMPRESSED);
  try {
    return unzlibSync(raw, out); // FlateDecode = zlib container
  } catch {
    try {
      return inflateSync(raw, out); // raw deflate fallback
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

/** Declared `/Length N` of the object dict immediately preceding a PDF stream
 *  (searched backwards from the `stream` keyword). Indirect references
 *  (`/Length 5 0 R`) return null — the pre-allocated inflate cap still bounds
 *  those, so uncertainty never means unbounded allocation. */
function declaredPdfStreamLength(bytes: Uint8Array, streamIdx: number, from: number): number | null {
  const start = Math.max(from, streamIdx - 4096);
  const window_ = bytesToLatin1(bytes.subarray(start, streamIdx));
  const re = /\/Length\s*(\d+)/g;
  let m: RegExpExecArray | null;
  let found: number | null = null;
  while ((m = re.exec(window_)) !== null) {
    if (/\/Length\s*\d+\s+\d+\s+R/.test(window_.slice(Math.max(0, m.index - 8), m.index + m[0].length + 12))) continue; // indirect ref
    found = Number(m[1]);
  }
  return found;
}

function extractPdf(bytes: Uint8Array): { ok: true; text: string } | { ok: false; oversize: boolean } {
  try {
    const parts: string[] = [];
    let pos = 0;
    let oversizeStream = false;
    while (true) {
      const sIdx = indexOfBytes(bytes, STREAM_MARKER, pos);
      if (sIdx === -1) break;
      // Stream data starts after "stream" + EOL ("\n" or "\r\n").
      let dataStart = sIdx + STREAM_MARKER.length;
      if (bytes[dataStart] === 0x0d) dataStart++; // \r
      if (bytes[dataStart] === 0x0a) dataStart++; // \n
      const eIdx = indexOfBytes(bytes, ENDSTREAM_MARKER, dataStart);
      if (eIdx === -1) break;
      // Bounds BEFORE inflating: declared length and compressed size.
      const declared = declaredPdfStreamLength(bytes, sIdx, pos);
      const block = bytes.slice(dataStart, eIdx);
      if ((declared !== null && declared > PDF_MAX_STREAM_UNCOMPRESSED) || block.length > PDF_MAX_STREAM_COMPRESSED) {
        oversizeStream = true; // refuse to inflate — bomb guard
        pos = eIdx + ENDSTREAM_MARKER.length;
        continue;
      }
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
    if (oversizeStream) return { ok: false, oversize: true }; // never trust partial text around a bomb stream
    return { ok: true, text: parts.join("\n") } as { ok: true; text: string }; // null text caller handles
  } catch {
    return { ok: false, oversize: false };
  }
}

// ── Public surface ──────────────────────────────────────────────────────
/** Format-appropriate payload for a $VaultFileExtension + canonical mime. */
export function buildExtractPayload(mime: string, ext: string, bytes: Uint8Array): ExtractPayload {
  if (RASTER_MIMES.has(mime)) {
    if (bytes.byteLength > EXTRACTION_MAX_VISION_BYTES) return { kind: "oversize" }; // oversize flagged by caller
    const b64 = Buffer.from(bytes).toString("base64");
    return { kind: "raster", dataUrl: `data:${mime};base64,${b64}`, mime };
  }
  if (mime === "text/csv" || ext === "csv") {
    const text = utf8(bytes);
    return { kind: "text", text };
  }
  if (mime.includes("officedocument.wordprocessingml") || ext === "docx") {
    const r = extractDocx(bytes);
    if (!r.ok) return r.oversize ? { kind: "oversize" } : { kind: "empty" };
    return r.text ? { kind: "text", text: r.text } : { kind: "empty" };
  }
  if (mime.includes("spreadsheetml") || ext === "xlsx") {
    const r = extractXlsx(bytes);
    if (!r.ok) return r.oversize ? { kind: "oversize" } : { kind: "empty" };
    return r.text ? { kind: "text", text: r.text } : { kind: "empty" };
  }
  if (mime === "application/pdf" || ext === "pdf") {
    const r = extractPdf(bytes);
    if (!r.ok) return r.oversize ? { kind: "oversize" } : { kind: "empty" };
    return r.text ? { kind: "text", text: r.text } : { kind: "empty" };
  }
  return { kind: "empty" };
}

/** Direct text extraction (used by tests + downstream consumers). */
export function extractDocumentText(mime: string, ext: string, bytes: Uint8Array): string | null {
  const payload = buildExtractPayload(mime, ext, bytes);
  return payload.kind === "text" ? payload.text : null;
}