/**
 * Microsoft Office OOXML helpers — minimal but valid .docx / .xlsx / .pptx
 * ZIP containers, built with no external dependencies.
 *
 * Every Office file is a ZIP archive of XML parts. This module:
 *   1. buildZip(entries) — creates a STORED (uncompressed) ZIP from name→content
 *      entries (deterministic timestamps, correct CRC32 + central directory).
 *   2. extractZipEntry(bytes, name) — reads one entry back out of an existing
 *      ZIP, handling both STORED (0) and DEFLATED (8) entries via
 *      DecompressionStream('deflate-raw') so files re-saved by Office/Word can
 *      be read back.
 *   3. buildMinimalDocx / buildMinimalXlsx / buildMinimalPptx — assemble the
 *      OOXML part sets for each file type with the real Microsoft schemas.
 *   4. extractDocxText / extractPptxText — pull plain text out of a document
 *      for the read-back slice (w:t / a:t runs).
 *
 * The ZIP layout follows the PKWARE APPNOTE; the OOXML parts use the standard
 * openxmlformats schemas. No URLs are involved — this is pure local encoding.
 */

// ── CRC32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  name: string;
  content: string;
}

function dosDateTime(): { time: number; date: number } {
  // Fixed 2026-01-01 00:00:00 for deterministic output.
  return { time: (0 << 11) | (0 << 5) | 0, date: ((2026 - 1980) << 9) | (1 << 5) | 1 };
}

/**
 * Build a STORED ZIP archive from name→text entries.
 * Returns a Uint8Array of the complete archive.
 */
export function buildZip(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); // local file header signature
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0x0800, true); // flags (UTF-8)
    dv.setUint16(8, 0, true); // method: stored
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    chunks.push(local, data);
    offset += local.length + data.length;

    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true); // central directory signature
    cdv.setUint16(4, 20, true); // version made by
    cdv.setUint16(6, 20, true); // version needed
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, time, true);
    cdv.setUint16(14, date, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true); // extra length
    cdv.setUint16(32, 0, true); // comment length
    cdv.setUint16(34, 0, true); // disk number start
    cdv.setUint16(36, 0, true); // internal attrs
    cdv.setUint32(38, 0, true); // external attrs
    cdv.setUint32(42, offset - (local.length + data.length), true); // local header offset
    cd.set(nameBytes, 46);
    central.push(cd);
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);
  edv.setUint16(20, 0, true);

  const total = chunks.reduce((n, c) => n + c.length, 0) + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  for (const c of central) {
    out.set(c, pos);
    pos += c.length;
  }
  out.set(eocd, pos);
  return out;
}

/** Inflate a DEFLATED (raw deflate) buffer using DecompressionStream. */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Extract one entry by name from a ZIP archive (works for STORED and DEFLATED
 * entries). Returns the text content (UTF-8 decoded) or undefined if missing.
 */
export async function extractZipEntry(bytes: Uint8Array, entryName: string): Promise<string | undefined> {
  // Walk local file headers from the start (they appear in order; central
  // directory lives at the end after all entries).
  let pos = 0;
  while (pos + 30 <= bytes.length) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + pos, Math.min(30, bytes.length - pos));
    if (dv.getUint32(0, true) !== 0x04034b50) break;
    const method = dv.getUint16(8, true);
    const compressedSize = dv.getUint32(18, true);
    const nameLen = dv.getUint16(26, true);
    const extraLen = dv.getUint16(28, true);
    const nameBytes = bytes.slice(pos + 30, pos + 30 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    const dataStart = pos + 30 + nameLen + extraLen;
    const dataBytes = bytes.slice(dataStart, dataStart + compressedSize);
    if (name === entryName || name === `/${entryName}` || name.endsWith(`/${entryName}`)) {
      const raw = method === 8 ? await inflateRaw(dataBytes) : dataBytes;
      return new TextDecoder().decode(raw);
    }
    pos = dataStart + compressedSize;
  }
  return undefined;
}

// ── OOXML part builders ───────────────────────────────────────────────────────

/** Escape XML text (quotes/ampersands are legal in text nodes but escape for safety). */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build a minimal but valid .docx from paragraphs of text. */
export function buildMinimalDocx(paragraphs: string[]): Uint8Array {
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`)
    .join("");
  return buildZip([
    {
      name: "[Content_Types].xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "word/document.xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body>${body}<w:sectPr/></w:body></w:document>`,
    },
  ]);
}

/** Build a minimal but valid .xlsx with a single "Sheet1" tab of rows (A1-relative columns). */
export function buildMinimalXlsx(rows: unknown[][]): Uint8Array {
  const rowXml = rows
    .map((row, i) => {
      const cells = row
        .map((v, j) => {
          const col = String.fromCharCode(65 + j);
          const value = v === null || v === undefined ? "" : String(v);
          return `<c r="${col}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${i + 1}">${cells}</row>`;
    })
    .join("");
  return buildZip([
    {
      name: "[Content_Types].xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`,
    },
  ]);
}

/** Build a minimal but valid .pptx with one slide per outline item (title + body). */
export function buildMinimalPptx(slides: Array<{ title: string; body?: string }>): Uint8Array {
  const slideCount = Math.max(1, slides.length);
  const contentTypes = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`,
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`,
    ...Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`),
    `</Types>`,
  ].join("");

  const rootRels = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>`,
    `</Relationships>`,
  ].join("");

  const presentationRels = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
    ...Array.from({ length: slideCount }, (_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`),
    `<Relationship Id="rId${slideCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
    `</Relationships>`,
  ].join("");

  const presentationXml = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>`,
    `<p:sldIdLst>`,
    ...Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`),
    `</p:sldIdLst>`,
    `<p:sldSz cx="9144000" cy="6858000"/>`,
    `<p:notesSz cx="6858000" cy="9144000"/>`,
    `</p:presentation>`,
  ].join("");

  const masterXml = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>`,
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`,
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>`,
    `<p:txStyles>`,
    `<p:titleStyle><a:lvl1pPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>`,
    `<p:bodyStyle><a:lvl1pPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:defRPr sz="2400"/></a:lvl1pPr></p:bodyStyle>`,
    `<p:otherStyle/>`,
    `</p:txStyles>`,
    `</p:sldMaster>`,
  ].join("");

  const masterRels = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`,
    `</Relationships>`,
  ].join("");

  const layoutXml = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">`,
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>`,
    `</p:sldLayout>`,
  ].join("");

  const layoutRels = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>`,
    `</Relationships>`,
  ].join("");

  const themeXml = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">`,
    `<a:themeElements>`,
    `<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme>`,
    `<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>`,
    `<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>`,
    `</a:themeElements>`,
    `</a:theme>`,
  ].join("");

  const slideParts = slides.map((slide, i) => {
    const titleSp =
      `<p:sp><p:nvSpPr><p:cNvPr id="${i * 2 + 2}" name="Title ${i + 1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="4400"/><a:t>${esc(slide.title)}</a:t></a:r></a:p></p:txBody></p:sp>`;
    const bodySp = slide.body
      ? `<p:sp><p:nvSpPr><p:cNvPr id="${i * 2 + 3}" name="Body ${i + 1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
        `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2400"/><a:t>${esc(slide.body)}</a:t></a:r></a:p></p:txBody></p:sp>`
      : "";
    return [
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`,
      `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${titleSp}${bodySp}</p:spTree></p:cSld>`,
      `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>`,
      `</p:sld>`,
    ].join("");
  });

  const slideRels = slides.map(
    (_, i) =>
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
      `</Relationships>`,
  );

  const entries: ZipEntryInput[] = [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "ppt/presentation.xml", content: presentationXml },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRels },
    { name: "ppt/slideMasters/slideMaster1.xml", content: masterXml },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", content: masterRels },
    { name: "ppt/slideLayouts/slideLayout1.xml", content: layoutXml },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", content: layoutRels },
    { name: "ppt/theme/theme1.xml", content: themeXml },
  ];
  slides.forEach((_, i) => {
    entries.push({ name: `ppt/slides/slide${i + 1}.xml`, content: slideParts[i] });
    entries.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, content: slideRels[i] });
  });
  return buildZip(entries);
}

/** Extract plain text from a .docx (all <w:t> runs joined by paragraph). */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const docXml = await extractZipEntry(bytes, "word/document.xml");
  if (!docXml) return "";
  const runs = [...docXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXml(m[1]));
  return runs.join("");
}

/** Extract plain text from a .pptx (all <a:t> runs). */
export async function extractPptxText(bytes: Uint8Array): Promise<string> {
  const parts: string[] = [];
  // Extract from every slide part we can find.
  let i = 1;
  for (;;) {
    const slideXml = await extractZipEntry(bytes, `ppt/slides/slide${i}.xml`);
    if (!slideXml) break;
    const runs = [...slideXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    parts.push(runs.join(" "));
    i++;
  }
  return parts.join("\n");
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
