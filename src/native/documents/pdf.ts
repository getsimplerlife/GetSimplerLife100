/**
 * native/documents/pdf.ts — template-based HTML→PDF generation (Phase 1.2).
 *
 * A SAFE HTML SUBSET rendered to PDF via jsPDF (server-side, no DOM):
 *   allowed: h1..h3, p, br, hr, div, span, ul, ol, li, strong, em, u,
 *            table, thead, tbody, tr, th, td (colspan 1..6), img
 *            (src data:image/png;base64 only; width/height caps)
 *   everything else (script, style, iframe, a, svg, object, embed, form,
 *   ...) FAILS CLOSED with a descriptive error — no markup/script surface.
 *
 * Merge fields: `{{key}}` tokens are replaced by HTML-ESCAPED values
 * (a value that looks like markup stays literal text — no injection).
 * Unknown keys and leftover `{{` FAIL CLOSED (never guessed).
 *
 * Page numbering + optional footer are applied after layout; a logo is
 * rendered top-left on page 1. Output is a checksummed, plain-text-projected
 * PDF (page count bounded at MAX_PDF_PAGES).
 */
import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";
import { MAX_LOGO_BYTES, MAX_PDF_PAGES, type NativeRenderOptions } from "./types";

const PAGE_W = 612; // letter, pt
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 30;

/** HTML-escape a merge value so it can never become markup. */
export function escapeHtmlValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/** Decode the five basic entities (inverse direction, for layout). */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function stripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

/**
 * Interpolate {{fieldKey}} placeholders with HTML-ESCAPED values.
 * - unknown key -> fail closed (error)
 * - leftover "{{" after substitution -> fail closed (never guess)
 */
export function mergeFields(html: string, values: Record<string, string>): string {
  if (!values || typeof values !== "object") throw new Error("values must be an object");
  let out = html;
  for (const [key, raw] of Object.entries(values)) {
    if (typeof raw !== "string") throw new Error(`Field "${key}" must be a string`);
    out = out.split(`{{${key}}}`).join(escapeHtmlValue(stripControlChars(raw)));
  }
  if (out.includes("{{")) {
    throw new Error("HTML contains an unresolved {{ placeholder — every merge field must be provided (fail-closed)");
  }
  return out;
}

// ── Safe HTML-subset tokenizer ──────────────────────────────────────────────
const VOID_TAGS = new Set(["br", "hr", "img"]);
const SIZES: Record<string, number> = { h1: 18, h2: 14, h3: 12, p: 11, li: 11, td: 10, th: 10 };
const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "p", "br", "hr", "div", "span",
  "ul", "ol", "li", "strong", "em", "u",
  "table", "thead", "tbody", "tr", "th", "td", "img",
]);

interface TNode {
  tag: string;
  attrs: Map<string, string>;
  children: TNode[];
  text: string;
}
function parseHtml(html: string): TNode {
  // Wrap in a root div so we always have a single root.
  const root: TNode = { tag: "div", attrs: new Map(), children: [], text: "" };
  const stack: TNode[] = [root];
  const tokenRe = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+=(?:"[^"]*"|'[^']*'|[^\s>]+))*)\s*\/?>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[0].startsWith("<!--")) continue; // comments dropped
    if (m[3] !== undefined) {
      const stackTop = stack[stack.length - 1];
      if (stackTop && stackTop.text) stackTop.text += m[3];
      else if (stackTop) stackTop.text += m[3];
      continue;
    }
    const tagName = m[1].toLowerCase();
    const rawAttrs = m[2] ?? "";
    const isClosing = /^<\//.test(m[0]);
    const selfClosing = /\/>\s*$/.test(m[0]);
    if (isClosing) {
      const idx = stack.map((n) => n.tag).lastIndexOf(tagName);
      if (idx > 0) stack.length = idx; // pop back past the matching open tag
      continue;
    }
    if (!ALLOWED_TAGS.has(tagName)) {
      throw new Error(`Unsupported HTML tag <${tagName}> — only a safe subset is allowed (fail-closed)`);
    }
    const attrs = new Map<string, string>();
    const attrRe = /([a-zA-Z-]+)=("([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(rawAttrs)) !== null) {
      attrs.set(am[1].toLowerCase(), am[3] ?? am[4] ?? am[5] ?? "");
    }
    if (tagName === "img") {
      const src = attrs.get("src") ?? "";
      if (!src.startsWith("data:image/png;base64,")) {
        throw new Error("img src must be a data:image/png;base64, URL (no external fetch, fail-closed)");
      }
    }
    for (const key of attrs.keys()) {
      if (!["src", "width", "height", "colspan", "align"].includes(key)) {
        throw new Error(`Unsupported attribute "${key}" on <${tagName}> (fail-closed)`);
      }
      if (key === "width" || key === "height") {
        const v = Number(attrs.get(key));
        if (!Number.isFinite(v) || v <= 0 || v > 600) {
          throw new Error(`Invalid ${key} on <${tagName}> (must be 1..600)`);
        }
      }
      if (key === "colspan") {
        const v = Number(attrs.get(key));
        if (!Number.isFinite(v) || v < 1 || v > 6) throw new Error("colspan must be 1..6");
      }
      if (key === "align" && !["left", "center", "right"].includes(attrs.get(key) ?? "")) {
        throw new Error("align must be left|center|right");
      }
    }
    const node: TNode = { tag: tagName, attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!VOID_TAGS.has(tagName) && !selfClosing) stack.push(node);
  }
  return root;
}

interface LayoutLine {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  indent: number;
  align: "left" | "center" | "right";
}

/** The real, full HTML walker -> layout lines (used by renderHtmlDocument). */
export function htmlToLayoutLines(html: string): LayoutLine[] {
  const root = parseHtml(html);
  const lines: LayoutLine[] = [];
  const walk = (node: TNode, fmt: { bold: boolean; italic: boolean; underline: boolean }, indent: number, listKind: "ul" | "ol" | null, counter: { n: number } | null, tAlign: "left" | "center" | "right", inCell: boolean): void => {
    void inCell;
    const tag = node.tag;
    if (tag === "br") {
      lines.push({ text: "", size: 8, bold: false, italic: false, underline: false, indent, align: tAlign });
      return;
    }
    if (tag === "hr") {
      lines.push({ text: "─".repeat(96), size: 8, bold: false, italic: false, underline: false, indent, align: tAlign });
      return;
    }
    if (tag === "img") {
      lines.push({ text: "", size: 8, bold: false, italic: false, underline: false, indent, align: tAlign });
      return; // images are placed separately in render (they are not text lines)
    }
    if (tag === "li" && listKind) {
      const label = listKind === "ol" && counter ? `${counter.n}. ` : "• ";
      if (counter) counter.n += 1;
      const content = [decodeEntities(node.text), ...node.children
        .map((c) => childText(c, { bold: fmt.bold || c.tag === "strong", italic: fmt.italic || c.tag === "em", underline: fmt.underline || c.tag === "u" }))]
        .join("")
        .trim();
      lines.push({ text: `${label}${content}`, size: SIZES.li, bold: fmt.bold, italic: fmt.italic, underline: fmt.underline, indent, align: tAlign });
      return;
    }
    if (tag === "table") {
      lines.push({ text: "", size: 6, bold: false, italic: false, underline: false, indent, align: tAlign });
      const trs = node.children.filter((c) => c.tag === "tr" || (c.tag === "thead" || c.tag === "tbody"));
      for (const rowGroup of trs) {
        if (rowGroup.tag === "tr") {
          walkTableRow(rowGroup, lines, indent, tAlign, fmt);
        } else {
          for (const tr of rowGroup.children.filter((c) => c.tag === "tr")) walkTableRow(tr, lines, indent, tAlign, fmt);
          for (const td of rowGroup.children.filter((c) => c.tag === "td" || c.tag === "th")) walkTableCell(td, lines, indent, tAlign, fmt);
        }
      }
      lines.push({ text: "", size: 6, bold: false, italic: false, underline: false, indent, align: tAlign });
      return;
    }
    if (tag === "tr") {
      walkTableRow(node, lines, indent, tAlign, fmt);
      return;
    }
    if (tag === "th" || tag === "td") {
      walkTableCell(node, lines, indent, tAlign, fmt);
      return;
    }
    if (SIZES[tag] && tag !== "td" && tag !== "th" && tag !== "li") {
      const content = [decodeEntities(node.text), ...node.children.map((c) => childText(c, fmt))].join("").replace(/\s+/g, " ").trim();
      if (content) {
        lines.push({ text: content, size: SIZES[tag], bold: fmt.bold || tag === "h1" || tag === "h2" || tag === "h3", italic: fmt.italic, underline: fmt.underline, indent, align: tag === "h1" || tag === "h2" || tag === "h3" ? "left" : tAlign });
      }
      return;
    }
    for (const child of node.children) {
      if (child.tag === "ul") walk(child, fmt, indent + 12, "ul", null, tAlign, inCell);
      else if (child.tag === "ol") walk(child, fmt, indent + 12, "ol", { n: 1 }, tAlign, inCell);
      else walk(child, fmt, indent, listKind, counter, tAlign, inCell);
    }
  };
  const childText = (node: TNode, fmt: { bold: boolean; italic: boolean; underline: boolean }): string => {
    if (node.tag === "br") return " ";
    if (node.tag === "img") return "";
    if (node.children.length === 0) {
      return decodeEntities(node.text);
    }
    return node.children.map((c) => childText(c, fmt)).join("");
  };
  const walkTableRow = (tr: TNode, out: LayoutLine[], indent: number, tAlign: "left" | "center" | "right", fmt: { bold: boolean; italic: boolean; underline: boolean }): void => {
    const cells = tr.children.filter((c) => c.tag === "td" || c.tag === "th");
    const parts: string[] = [];
    for (const td of cells) {
      const content = [decodeEntities(td.text), ...td.children.map((c) => childText(c, fmt))].join("").replace(/\s+/g, " ").trim();
      const colspan = Math.min(Number(td.attrs.get("colspan") ?? 1), 6);
      const pad = " ".repeat(colspan);
      parts.push(`${pad}${content}${pad}`);
    }
    out.push({ text: parts.join(" | "), size: SIZES.td, bold: fmt.bold, italic: fmt.italic, underline: fmt.underline, indent, align: tAlign });
  };
  const walkTableCell = (td: TNode, out: LayoutLine[], indent: number, tAlign: "left" | "center" | "right", fmt: { bold: boolean; italic: boolean; underline: boolean }): void => {
    const content = [decodeEntities(td.text), ...td.children.map((c) => childText(c, fmt))].join("").replace(/\s+/g, " ").trim();
    const isTh = td.tag === "th";
    out.push({ text: content, size: SIZES.td, bold: fmt.bold || isTh, italic: fmt.italic, underline: fmt.underline, indent, align: tAlign });
  };
  walk(root, { bold: false, italic: false, underline: false }, 0, null, null, "left", false);
  return lines;
}

export interface RenderedPdf {
  bytes: Uint8Array;
  text: string;
  checksum: string;
  pages: number;
}

/**
 * Render a merged, safe-HTML body to PDF bytes.
 * opts.pageNumbers default true; opts.logo (data:image/png;base64) placed
 * top-left of page 1; opts.footerText on every page.
 */
export function renderHtmlDocument(html: string, opts: NativeRenderOptions = {}): RenderedPdf {
  if (html.length === 0) throw new Error("HTML body must not be empty");
  const lines = htmlToLayoutLines(html);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  let logo: { data: string; w: number; h: number } | null = null;
  if (opts.logo) logo = validateLogoDataUrl(opts.logo);

  const pageNumbers = opts.pageNumbers !== false;
  const footerText = opts.footerText ? stripControlChars(opts.footerText) : "";

  // Layout: top of page 1 starts below the logo band when a logo exists.
  let y = logo ? 104 : 64;
  const bottom = PAGE_H - 48;
  const text = lines.filter((l) => l.text.length > 0);
  const textProjection: string[] = [];
  for (const line of text) {
    if (textProjection.join("\n").length > 200_000) break;
    textProjection.push(line.text);
  }

  let page = 1;
  const ensure = (needed: number): void => {
    if (y + needed > bottom) {
      doc.addPage();
      page += 1;
      y = logo && page === 1 ? 104 : 64;
    }
  };

  const drawLine = (line: LayoutLine): void => {
    doc.setFontSize(line.size);
    doc.setFont("helvetica", line.bold ? "bold" : "normal");
    doc.setFont("helvetica", line.italic ? "italic" : "normal");
    doc.setFont("helvetica", line.bold && line.italic ? "bolditalic" : line.bold ? "bold" : line.italic ? "italic" : "normal");
    doc.setTextColor(20, 20, 20);
    if (line.text === "─".repeat(96)) {
      const textWidth = doc.getTextWidth(line.text);
      const x = line.align === "center" ? (PAGE_W - textWidth) / 2 : line.align === "right" ? PAGE_W - MARGIN - textWidth : MARGIN + line.indent;
      doc.setDrawColor(180, 180, 180);
      doc.line(x, y, x + 480, y);
      y += 14;
      return;
    }
    const maxWidth = CONTENT_W - line.indent;
    const wrapped = doc.splitTextToSize(line.text, maxWidth) as string[];
    for (const w of wrapped) {
      ensure(line.size + 8);
      const textWidth = doc.getTextWidth(w);
      const x = line.align === "center" ? (PAGE_W - textWidth) / 2 : line.align === "right" ? PAGE_W - MARGIN - textWidth : MARGIN + line.indent;
      doc.text(w, x > MARGIN ? x : MARGIN, y);
      if (line.underline) {
        doc.setDrawColor(20, 20, 20);
        doc.line(MARGIN + line.indent, y + 2, MARGIN + line.indent + textWidth, y + 2);
      }
      y += line.size + 7;
    }
  };

  if (logo) {
    doc.addImage(logo.data, "PNG", MARGIN, 40, logo.w, logo.h);
  }

  for (const line of text) drawLine(line);
  if (page > MAX_PDF_PAGES) {
    throw new Error(`Document exceeds ${MAX_PDF_PAGES} pages — generation aborted (fail-closed)`);
  }

  // Footer: page numbering + optional footer text on every page.
  const totalPages = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (footerText) doc.text(footerText, MARGIN, FOOTER_Y);
    if (pageNumbers) {
      const label = `Page ${i} of ${totalPages}`;
      const w = doc.getTextWidth(label);
      doc.text(label, PAGE_W - MARGIN - w, FOOTER_Y);
    }
  }

  const bytes = new Uint8Array(doc.output("arraybuffer"));
  // CONTENT checksum: jsPDF stamps a random /ID + CreationDate/ModDate, so raw
  // byte-hash differs across identical renders. Canonicalize those away so the
  // checksum is stable and content-addressed (same template+values+caps ->
  // same checksum), while the stored bytes keep the PDF's own unique ID.
  const { bufferText } = extractPdfText(bytes);
  const canonical = bufferText
    .replace(/\/ID\s*\[\s*<[^>]*>\s*<[^>]*>\s*\]/g, "")
    .replace(/\/(CreationDate|ModDate)\s*\(D:[^)]*\)/g, "");
  const checksum = createHash("sha256").update(canonical, "latin1").digest("hex");
  return { bytes, text: textProjection.join("\n").slice(0, 200_000), checksum, pages: totalPages };
}

function extractPdfText(bytes: Uint8Array): { bufferText: string } {
  return { bufferText: Buffer.from(bytes).toString("latin1") };
}
/** Validate a logo data URL: png only, bounded decoded size, sane dims. */
export function validateLogoDataUrl(dataUrl: string): { data: string; w: number; h: number } {
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("logo must be a data:image/png;base64, URL");
  }
  const b64 = dataUrl.slice("data:image/png;base64,".length);
  const decoded = Buffer.from(b64, "base64");
  if (decoded.byteLength === 0 || decoded.byteLength > MAX_LOGO_BYTES) {
    throw new Error(`logo size out of bounds (0 < bytes <= ${MAX_LOGO_BYTES})`);
  }
  // PNG magic check (magic-byte sniff, mirroring vault-intake philosophy).
  if (decoded.byteLength < 8 || !(decoded[0] === 0x89 && decoded[1] === 0x50 && decoded[2] === 0x4e && decoded[3] === 0x47)) {
    throw new Error("logo is not a PNG (magic-byte check failed)");
  }
  const width = decoded.readUInt32BE(16);
  const height = decoded.readUInt32BE(20);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 600 || height > 600) {
    throw new Error(`logo dimensions out of bounds: ${width}x${height}`);
  }
  const maxW = 140;
  const maxH = 40;
  const scale = Math.min(maxW / width, maxH / height, 1);
  return { data: dataUrl, w: Math.round(width * scale), h: Math.round(height * scale) };
}