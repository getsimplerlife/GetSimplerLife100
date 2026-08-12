import { describe, expect, it } from "vitest";
import {
  buildZip,
  crc32,
  extractZipEntry,
  buildMinimalDocx,
  buildMinimalXlsx,
  buildMinimalPptx,
  extractDocxText,
  extractPptxText,
} from "../integrations/providers/microsoft-office/ooxml";

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("OOXML zip container (hand-rolled, no deps)", () => {
  it("buildZip produces a valid ZIP with PK local + central + EOCD signatures", () => {
    const zip = buildZip([
      { name: "a.txt", content: "hello" },
      { name: "dir/b.txt", content: "world" },
    ]);
    const s = text(zip);
    expect(s.startsWith("PK\u0003\u0004")).toBe(true); // local file header
    expect(s.includes("PK\u0001\u0002")).toBe(true); // central directory
    expect(s.includes("PK\u0005\u0006")).toBe(true); // EOCD (record ends with comment-length zeros)
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
  });

  it("extractZipEntry reads back stored entries by name", async () => {
    const zip = buildZip([
      { name: "a.txt", content: "hello" },
      { name: "dir/b.txt", content: "world" },
    ]);
    expect(await extractZipEntry(zip, "a.txt")).toBe("hello");
    expect(await extractZipEntry(zip, "dir/b.txt")).toBe("world");
    expect(await extractZipEntry(zip, "missing.txt")).toBeUndefined();
  });

  it("extractZipEntry handles DEFLATED entries (re-saved by Office)", async () => {
    // Build a real deflated zip by deflating "hello world payload" with CompressionStream.
    const payload = new TextEncoder().encode("hello world payload");
    const cs = new CompressionStream("deflate-raw");
    const stream = new Blob([payload]).stream().pipeThrough(cs);
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());

    // Hand-assemble one local entry with method=8 (deflate).
    const nameBytes = new TextEncoder().encode("word/document.xml");
    const crc = crc32(payload);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 8, true); // deflate
    dv.setUint32(14, crc, true);
    dv.setUint32(18, compressed.length, true);
    dv.setUint32(22, payload.length, true);
    dv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, 1, true);
    edv.setUint16(10, 1, true);
    edv.setUint32(16, local.length + compressed.length, true);
    const zip = new Uint8Array(local.length + compressed.length + eocd.length);
    zip.set(local, 0);
    zip.set(compressed, local.length);
    zip.set(eocd, local.length + compressed.length);

    expect(await extractZipEntry(zip, "word/document.xml")).toBe("hello world payload");
  });

  it("crc32 matches known vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("buildMinimalDocx", () => {
  it("produces a zip containing word/document.xml with w:t runs", async () => {
    const zip = buildMinimalDocx(["Line one", "Line two"]);
    const doc = await extractZipEntry(zip, "word/document.xml");
    expect(doc).toContain("Line one");
    expect(doc).toContain("Line two");
    expect(doc).toContain("xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"");
  });

  it("extractDocxText round-trips paragraphs", async () => {
    const zip = buildMinimalDocx(["Alpha", "Beta <Gamma>"]);
    const textOut = await extractDocxText(zip);
    expect(textOut).toContain("Alpha");
    expect(textOut).toContain("Beta <Gamma>"); // XML-escaped then decoded
  });
});

describe("buildMinimalXlsx", () => {
  it("produces a zip with workbook.xml + sheet1.xml inline strings", async () => {
    const zip = buildMinimalXlsx([
      ["Name", "Amount"],
      ["Widget", 42],
    ]);
    const sheet = await extractZipEntry(zip, "xl/worksheets/sheet1.xml");
    expect(sheet).toContain("Name");
    expect(sheet).toContain("Widget");
    expect(sheet).toContain("t=\"inlineStr\"");
    const wb = await extractZipEntry(zip, "xl/workbook.xml");
    expect(wb).toContain("Sheet1");
  });
});

describe("buildMinimalPptx", () => {
  it("produces a zip with presentation + master + layout + theme + slides", async () => {
    const zip = buildMinimalPptx([
      { title: "Deck Title", body: "Body text" },
      { title: "Second Slide" },
    ]);
    expect(await extractZipEntry(zip, "ppt/presentation.xml")).toContain("<p:sldIdLst>");
    expect(await extractZipEntry(zip, "ppt/slideMasters/slideMaster1.xml")).toContain("sldLayoutIdLst");
    expect(await extractZipEntry(zip, "ppt/slideLayouts/slideLayout1.xml")).toContain("sldLayout");
    expect(await extractZipEntry(zip, "ppt/theme/theme1.xml")).toContain("a:theme");
    const s1 = await extractZipEntry(zip, "ppt/slides/slide1.xml");
    expect(s1).toContain("Deck Title");
    expect(s1).toContain("Body text");
    const s2 = await extractZipEntry(zip, "ppt/slides/slide2.xml");
    expect(s2).toContain("Second Slide");
    expect(await extractZipEntry(zip, "ppt/slides/_rels/slide1.xml.rels")).toContain("slideLayout");
  });

  it("extractPptxText round-trips slide titles", async () => {
    const zip = buildMinimalPptx([
      { title: "First", body: "one" },
      { title: "Second" },
    ]);
    const out = await extractPptxText(zip);
    expect(out).toContain("First");
    expect(out).toContain("Second");
  });
});
