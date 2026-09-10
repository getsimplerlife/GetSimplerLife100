/**
 * extraction-bomb-guard.test.ts — Phase 1.5b security tests (owner security
 * hard bar 09-10): unbounded decompression (zip-bomb / PDF-bomb) must be
 * refused BEFORE inflation — no crash, no hang, bounded memory — and routed
 * to the human-review lane via the `oversize` payload kind.
 */
import { describe, expect, it } from "vitest";
import { zipSync, zlibSync, strToU8 } from "fflate";
import {
  buildExtractPayload,
  extractDocumentText,
  ZIP_MAX_TOTAL_UNCOMPRESSED,
  PDF_MAX_STREAM_UNCOMPRESSED,
} from "../lib/extraction/text-extractor";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("zip-bomb guard (DOCX/XLSX)", () => {
  it("refuses a zip whose declared total uncompressed size exceeds the cap, without inflating", () => {
    // Fabricate a real bomb: one highly-compressible entry whose DECLARED
    // uncompressed size is 100 MiB of zeros. zipSync compresses it to a tiny
    // archive (~100 KB), so the fixture is cheap, but inflating it would
    // materialize 100 MiB — exactly what the guard must prevent.
    const bombEntry = new Uint8Array(100 * 1024 * 1024); // zeros compress ~1000x
    const zip = zipSync({ "word/document.xml": bombEntry });
    expect(zip.byteLength).toBeLessThan(5 * 1024 * 1024); // sanity: fixture itself is small
    expect(zip.byteLength).toBeLessThan(ZIP_MAX_TOTAL_UNCOMPRESSED); // bomb rides inside a small upload

    const started = Date.now();
    const payload = buildExtractPayload(DOCX_MIME, "docx", zip);
    const elapsed = Date.now() - started;

    expect(payload.kind).toBe("oversize"); // → runner routes to review lane with `oversize` flag
    expect(extractDocumentText(DOCX_MIME, "docx", zip)).toBeNull();
    expect(elapsed).toBeLessThan(2000); // no hang: manifest check is O(entries), never inflates
  });

  it("refuses a zip when a single entry declares more than the per-entry cap", () => {
    const bombEntry = new Uint8Array(9 * 1024 * 1024);
    const zip = zipSync({ "xl/sharedStrings.xml": bombEntry });
    const payload = buildExtractPayload(XLSX_MIME, "xlsx", zip);
    expect(payload.kind).toBe("oversize");
  });

  it("fails closed when the central directory is absent (truncated/garbage zip)", () => {
    const garbage = new Uint8Array(4096).fill(0x61); // 'a' * 4096, no EOCD
    const payload = buildExtractPayload(DOCX_MIME, "docx", garbage);
    expect(payload.kind).toBe("oversize"); // fail-closed: uncertain manifest → review lane, never inflate, never garbage
  });

  it("still extracts a normal DOCX (no false positive)", () => {
    const zip = zipSync({
      "word/document.xml": strToU8(`<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Hello from a normal docx</w:t></w:r></w:p></w:body></w:document>`),
    });
    const payload = buildExtractPayload(DOCX_MIME, "docx", zip);
    expect(payload.kind).toBe("text");
    if (payload.kind === "text") expect(payload.text).toContain("Hello from a normal docx");
  });
});

describe("PDF-bomb guard", () => {
  it("refuses a PDF stream whose declared /Length exceeds the cap, before inflating", () => {
    // A stream of 4 MiB of 'A's compresses to tens of KB; its object dict
    // LIES and declares /Length = 200 MB (a PDF could also truncate the
    // stream so the declared length is the only signal).
    const compressed = zlibSync(new Uint8Array(4 * 1024 * 1024).fill(0x41));
    const pdf = concatBytes([
      strToU8("%PDF-1.4\n1 0 obj\n<< /Length " + (PDF_MAX_STREAM_UNCOMPRESSED * 2) + " >>\nstream\n"),
      compressed,
      strToU8("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"),
    ]);
    const payload = buildExtractPayload("application/pdf", "pdf", pdf);
    expect(payload.kind).toBe("oversize"); // declared length bound trips BEFORE inflate
    expect(extractDocumentText("application/pdf", "pdf", pdf)).toBeNull();
  });

  it("refuses a PDF stream whose COMPRESSED size exceeds the cap", () => {
    // Incompressible-ish data (urandom) > 8 MiB compressed — inflating it is
    // pointless and could be the start of a bomb; the compressed-size bound
    // refuses it outright.
    const blob = new Uint8Array(PDF_MAX_STREAM_UNCOMPRESSED + 1024);
    for (let i = 0; i < blob.length; i++) blob[i] = (i * 2654435761) & 0xff; // psuedo-random, low compression
    const pdf = concatBytes([
      strToU8("%PDF-1.4\n1 0 obj\n<< /Length 16777220 /Filter /FlateDecode >>\nstream\n"),
      blob,
      strToU8("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"),
    ]);
    const payload = buildExtractPayload("application/pdf", "pdf", pdf);
    expect(payload.kind).toBe("oversize");
  });

  it("still extracts a plain-text PDF (no false positive)", () => {
    const pdf = strToU8("%PDF-1.4\n1 0 obj\n<< >>\nstream\n(Plain text works) Tj\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    const payload = buildExtractPayload("application/pdf", "pdf", pdf);
    expect(payload.kind).toBe("text");
    if (payload.kind === "text") expect(payload.text).toContain("Plain text works");
  });
});

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}