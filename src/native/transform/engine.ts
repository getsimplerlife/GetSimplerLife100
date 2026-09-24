/**
 * native/transform/engine.ts — Phase 3.5 deterministic PURE computation core.
 *
 * NO LLM, NO I/O, NO randomness inside the engine (control numbers are a
 * deterministic hash of the seed; envelope dates come from the caller's
 * `now`). Every function throws a descriptive Error on bad input and the
 * gate turns those into 400s BEFORE the Approval Queue; apply re-validates.
 *
 * Parser scope (documented honestly):
 *   - JSON: any JSON document.
 *   - XML: minimal tokenizer (comments/CDATA/entities/attributes/self-closing
 *     elements; DOCTYPE/ENTITY are REJECTED — XXE guard).
 *   - CSV: RFC-4180-style quote handling, configurable delimiter, optional
 *     header row.
 *   - EDI X12: ISA 106-char envelope (real element/term separators read from
 *     ISA), GS/GE groups, ST/SE transaction grouping.
 *   - EDIFACT: optional UNA (composite/element/release/term), UNB/UNH/UNT/UNZ.
 *   - XSLT is NOT shipped (a full XSLT engine is a later B-lane; the shipped
 *     mapping UI evaluates the documented XPath-subset below).
 *
 * Path languages (documented in the portal mapping UI + tests):
 *   - json:  dot-path "a.b.0.c", "a.b.*" (array elements), "." (root)
 *   - xml:   xpath-subset "/a/b[2]/@id", "b/c", "text()", "@attr", "*"
 *   - csv:   column name or "#n" (1-based)
 *   - edi:   "SEG", "SEG.elem", "SEG[n].elem" (nth repeat)
 */
import type { ArtifactKind, CoerceKind, FieldMapping, GenerationConfig, MappedRow, TransformRecord } from "./types";
import { MAX_ARTIFACT_TEXT_BYTES, MAX_OUTPUT_ROWS, MAX_PARSED_RECORDS } from "./types";

// ── Shapes ──────────────────────────────────────────────────────────────────
export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlNode[];
}
export interface EdiSegment {
  id: string; // e.g. PO1 / UNH
  elements: string[];
}
export interface EdiTransaction {
  id: string; // control/ref number ("" for raw)
  segments: EdiSegment[];
}
export type ParsedDoc =
  | { kind: "json"; root: unknown }
  | { kind: "xml"; root: XmlNode }
  | { kind: "csv"; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: "edi_x12"; segments: EdiSegment[]; transactions: EdiTransaction[] }
  | { kind: "edifact"; segments: EdiSegment[]; transactions: EdiTransaction[] };

// ── JSON ────────────────────────────────────────────────────────────────────
function parseJson(text: string): unknown {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error("source is not valid JSON");
  }
  return root;
}

// ── XML (minimal tokenizer; DOCTYPE/ENTITY rejected — XXE guard) ────────────
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const n = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });
}
function parseXml(text: string): XmlNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("DOCTYPE/ENTITY declarations are not allowed (XXE guard)");
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  const attach = (n: XmlNode) => {
    if (stack.length > 0) stack[stack.length - 1].children.push(n);
    else if (!root) root = n;
    else throw new Error("XML document has multiple root elements");
  };
  const pushText = (t: string) => {
    if (t.length === 0) return;
    if (stack.length > 0) stack[stack.length - 1].text += t;
    else if (t.trim().length > 0) throw new Error("text outside the root element");
  };
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt < 0) {
      pushText(text.slice(i));
      break;
    }
    if (lt > i) pushText(text.slice(i, lt));
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      if (end < 0) throw new Error("unterminated XML comment");
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const end = text.indexOf("]]>", lt + 9);
      if (end < 0) throw new Error("unterminated CDATA section");
      pushText(text.slice(lt + 9, end));
      i = end + 3;
      continue;
    }
    if (text.startsWith("</", lt)) {
      const gt = text.indexOf(">", lt + 2);
      if (gt < 0) throw new Error("unterminated closing tag");
      if (stack.length === 0) throw new Error("unexpected closing tag");
      stack.pop();
      i = gt + 1;
      continue;
    }
    const gt = text.indexOf(">", lt);
    if (gt < 0) throw new Error("unterminated tag");
    const raw = text.slice(lt + 1, gt);
    const selfClose = raw.endsWith("/");
    const tagBody = selfClose ? raw.slice(0, -1) : raw;
    const m = /^([A-Za-z_][A-Za-z0-9_.-]*)([\s\S]*)$/.exec(tagBody);
    if (!m) throw new Error(`malformed tag near offset ${lt}`);
    const node: XmlNode = { tag: m[1], attrs: {}, text: "", children: [] };
    const attrSrc = m[2] ?? "";
    const re = /([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let am: RegExpExecArray | null;
    let consumed = 0;
    while ((am = re.exec(attrSrc)) !== null) {
      if (am.index !== consumed) throw new Error(`malformed attributes near offset ${lt}`);
      node.attrs[am[1]] = decodeEntities(am[3] ?? am[4] ?? "");
      consumed = am.index + am[0].length;
    }
    if (attrSrc.trim().length > 0 && consumed < attrSrc.length) throw new Error(`malformed attributes near offset ${lt}`);
    attach(node);
    if (selfClose) {
      // self-closing node already attached
    } else {
      stack.push(node);
    }
    i = gt + 1;
  }
  if (stack.length > 0) throw new Error("unclosed XML element");
  if (!root) throw new Error("XML document is empty");
  return root;
}

// ── CSV (RFC-4180-style, configurable delimiter, optional header) ───────────
function parseCsv(text: string, delimiter: string): { columns: string[]; rows: Record<string, unknown>[] } {
  if (delimiter.length !== 1) throw new Error("CSV delimiter must be a single character");
  const cells: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell.length === 0) {
      inQ = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      cells.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  row.push(cell);
  cells.push(row);
  while (cells.length > 0 && cells[cells.length - 1].every((c) => c.trim() === "")) cells.pop();
  if (cells.length === 0) return { columns: [], rows: [] };
  const width = Math.max(...cells.map((r) => r.length));
  const columnsIn: string[] = cells.length > 0 && !cells[0].every((c) => c.trim() === "") ? cells[0] : [];
  // Header is present by default; a caller-provided mapping decides which
  // columns exist. We keep BOTH: columns[] = header names (or colN) and the
  // rows as objects keyed by them.
  const hasHeader = columnsIn.length > 0 && columnsIn.some((c) => c.trim() !== "");
  const columns = hasHeader ? columnsIn.map((c, idx) => (c.trim() === "" ? `column${idx + 1}` : c.trim())) : Array.from({ length: width }, (_, idx) => `column${idx + 1}`);
  const dataStart = hasHeader ? 1 : 0;
  const rows: Record<string, unknown>[] = [];
  for (let r = dataStart; r < cells.length; r++) {
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < width; c += 1) obj[columns[c] ?? `column${c + 1}`] = cells[r][c] ?? "";
    rows.push(obj);
  }
  return { columns, rows };
}

// ── EDI X12 ─────────────────────────────────────────────────────────────────
function tokenizeX12(text: string): { segments: EdiSegment[] } {
  let body = text.trim();
  let elementSep = "*";
  let term = "~";
  if (body.startsWith("ISA")) {
    if (body.length < 106) throw new Error("malformed ISA envelope (expects the standard 106-char control segment)");
    const isaL = body.slice(0, 106);
    if (isaL[105] !== "~" && isaL[105] !== "'" && isaL[105] !== "|" && isaL[105] !== "^" && isaL[105] !== "!") {
      throw new Error("malformed ISA envelope (unrecognized segment terminator)");
    }
    elementSep = isaL[3];
    term = isaL[105] || "~";
    body = body.slice(106);
  }
  const segments: EdiSegment[] = body
    .split(term)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const els = s.split(elementSep).map((e) => e.trim());
      const id = els[0] ?? "";
      if (!/^[A-Z0-9]{2,3}$/.test(id)) throw new Error(`invalid X12 segment id: "${id}"`);
      return { id, elements: els.slice(1) };
    });
  return { segments };
}
function groupTransactions(segments: EdiSegment[], startId: string, endId: string): EdiTransaction[] {
  const out: EdiTransaction[] = [];
  let current: EdiSegment[] | null = null;
  for (const seg of segments) {
    if (seg.id === startId) {
      if (current) out.push({ id: "", segments: current }); // unclosed previous
      current = [seg];
      continue;
    }
    if (!current) continue;
    current.push(seg);
    if (seg.id === endId) {
      out.push({ id: current[0]?.elements[1] ?? "", segments: current });
      current = null;
    }
  }
  if (current) out.push({ id: "", segments: current });
  return out;
}

// ── EDIFACT ─────────────────────────────────────────────────────────────────
function tokenizeEdifact(text: string): { segments: EdiSegment[] } {
  let body = text.trim();
  let composite = ":";
  let element = "+";
  let release = "?";
  let term = "'";
  if (body.startsWith("UNA")) {
    const una = body.slice(0, 9);
    composite = una[3] || ":";
    element = una[4] || "+";
    release = una[6] || "?";
    term = una[8] || "'";
    body = body.slice(9);
  }
  const raws: string[] = [];
  let cur = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === release && i + 1 < body.length) {
      cur += body[i + 1];
      i += 1;
      continue;
    }
    if (ch === term) {
      if (cur.trim().length > 0) raws.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim().length > 0) raws.push(cur.trim());
  const segments: EdiSegment[] = raws.map((s) => {
    const els = s.split(element);
    const comps = els.slice(1).map((e) => e.split(composite).join(":"));
    return { id: els[0] ?? "", elements: comps };
  });
  return { segments };
}

// ── Parse entry ─────────────────────────────────────────────────────────────
export function parseSource(kind: TransformRecord["sourceKind"], text: string, delimiter?: string): ParsedDoc {
  if (typeof text !== "string") throw new Error("source text is required");
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > 512 * 1024) throw new Error("source is too large (max 512KB)");
  switch (kind) {
    case "json":
      return { kind: "json", root: parseJson(text) };
    case "xml":
      return { kind: "xml", root: parseXml(text) };
    case "csv": {
      const { columns, rows } = parseCsv(text, delimiter ?? ",");
      return { kind: "csv", columns, rows };
    }
    case "edi_x12": {
      const { segments } = tokenizeX12(text);
      const noEnv = segments.filter((s) => s.id !== "ISA" && s.id !== "IEA" && s.id !== "GS" && s.id !== "GE");
      return { kind: "edi_x12", segments: noEnv, transactions: groupTransactions(segments, "ST", "SE") };
    }
    case "edifact": {
      const { segments } = tokenizeEdifact(text);
      const noEnv = segments.filter((s) => s.id !== "UNB" && s.id !== "UNZ");
      return { kind: "edifact", segments: noEnv, transactions: groupTransactions(segments, "UNH", "UNT") };
    }
  }
}

// ── Path language (kind-specific selectors, documented subset) ──────────────
export function validateRecordPath(kind: TransformRecord["sourceKind"], path: string): void {
  if (typeof path !== "string" || path.trim().length === 0) throw new Error("recordPath is required");
  if (kind === "json") {
    if (path === ".") return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_*]+)*$/.test(path)) throw new Error("json recordPath must be a dot-path (e.g. orders.*)");
    if (path.includes("*") && !path.endsWith(".*")) throw new Error("json * wildcard must end the recordPath (e.g. orders.*)");
    return;
  }
  if (kind === "xml") {
    const steps = path.split("/").filter(Boolean);
    if (steps.length === 0) throw new Error("xml recordPath must name element steps (e.g. /orders/order)");
    for (const s of steps) {
      if (!/^([A-Za-z_][A-Za-z0-9_.-]*(\[\d+\])?|\*)$/.test(s)) throw new Error(`invalid xml step "${s}"`);
    }
    return;
  }
  if (kind === "csv") {
    if (path !== "rows") throw new Error("csv recordPath must be \"rows\"");
    return;
  }
  // edi
  if (path === "segments" || path === "transactions" || path === "transactions.*") return;
  throw new Error("edi recordPath must be segments | transactions | transactions.*");
}
export function validateFieldSource(kind: TransformRecord["sourceKind"], source: string): void {
  if (typeof source !== "string" || source.trim().length === 0 || source.length > 200) throw new Error("each mapping needs a source path (1..200 chars)");
  const s = source.trim();
  if (kind === "json") {
    if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_*]+)*$/.test(s)) throw new Error(`invalid json source path "${s}"`);
    return;
  }
  if (kind === "xml") {
    const steps = s.split("/").filter(Boolean);
    if (steps.length === 0) throw new Error(`invalid xml source path "${s}"`);
    for (const st of steps) {
      if (st === "*" || st === "text()") continue;
      if (!/^@?[A-Za-z_][A-Za-z0-9_.-]*(\[\d+\])?$/.test(st)) throw new Error(`invalid xml step "${st}"`);
    }
    return;
  }
  if (kind === "csv") {
    if (/^#[1-9]\d*$/.test(s)) return; // 1-based column index
    if (/^[A-Za-z0-9 _.-]{1,200}$/.test(s)) return;
    throw new Error(`invalid csv column selector "${s}"`);
  }
  // edi
  if (!/^(ISA|IEA|GS|GE|ST|SE|UNB|UNH|UNT|UNZ|[A-Z0-9]{2,3})(\[\d+\])?(\.\d{1,2})?$/.test(s)) {
    throw new Error(`invalid edi source selector "${s}" (expected SEG or SEG.elem)`);
  }
}

// ── Selectors (pure) ────────────────────────────────────────────────────────
function jsonGet(node: unknown, key: string): unknown {
  if (key === "*") return node;
  if (Array.isArray(node)) {
    if (/^\d+$/.test(key)) return node[Number(key)];
    return undefined;
  }
  if (node && typeof node === "object") return (node as Record<string, unknown>)[key];
  return undefined;
}
function xmlChild(node: XmlNode, step: string): XmlNode | null {
  const m = /^([A-Za-z_][A-Za-z0-9_.-]*)(\[(\d+)\])?$/.exec(step);
  if (!m) return null;
  const matches = node.children.filter((c) => c.tag === m[1]);
  if (m[3]) {
    const idx = Number(m[3]) - 1;
    return matches[idx] ?? null;
  }
  return matches[0] ?? null;
}
function xmlChildren(node: XmlNode, step: string): XmlNode[] {
  if (step === "*") return node.children;
  return node.children.filter((c) => c.tag === step);
}
export function selectRecords(doc: ParsedDoc, kind: TransformRecord["sourceKind"], recordPath: string): unknown[] {
  if (kind === "json" && doc.kind === "json") {
    if (recordPath === ".") return [doc.root];
    const steps = recordPath.split(".");
    let cur: unknown = doc.root;
    for (let i = 0; i < steps.length; i += 1) {
      const st = steps[i];
      if (st === "*") {
        if (!Array.isArray(cur)) throw new Error("recordPath matched no records");
        return cur;
      }
      const next = jsonGet(cur, st);
      if (next === undefined) throw new Error("recordPath matched no records");
      cur = next;
      if (i === steps.length - 1 && Array.isArray(cur)) return cur;
    }
    return [cur];
  }
  if (kind === "xml" && doc.kind === "xml") {
    const steps = recordPath.split("/").filter(Boolean);
    let nodes: XmlNode[] = [doc.root];
    for (const st of steps) {
      const next: XmlNode[] = [];
      for (const nd of nodes) next.push(...xmlChildren(nd, st));
      if (next.length === 0 && !recordPath.endsWith("*")) throw new Error("recordPath matched no records");
      nodes = next;
    }
    return nodes;
  }
  if (kind === "csv" && doc.kind === "csv") return doc.rows;
  if ((kind === "edi_x12" && doc.kind === "edi_x12") || (kind === "edifact" && doc.kind === "edifact")) {
    if (recordPath === "segments") return doc.segments;
    if (recordPath === "transactions" || recordPath === "transactions.*") return doc.transactions;
  }
  throw new Error("recordPath matched no records");
}
function xmlValue(node: XmlNode, step: string): unknown {
  if (step === "text()" || step === "*") {
    const text = node.children.length > 0 ? node.children.map((c) => xmlText(c)).join("") : node.text;
    const t = (text ?? "").trim();
    return t.length > 0 ? t : null;
  }
  if (step.startsWith("@")) return node.attrs[step.slice(1)] ?? null;
  const m = /^([A-Za-z_][A-Za-z0-9_.-]*)(\[(\d+)\])?$/.exec(step);
  if (!m) return null;
  const matches = node.children.filter((c) => c.tag === m[1]);
  const hit = m[3] ? matches[Number(m[3]) - 1] : matches[0];
  if (!hit) return null;
  return xmlText(hit);
}
function xmlText(node: XmlNode): unknown {
  const t = (node.text ?? "").trim();
  if (t.length > 0) return t;
  if (node.children.length === 0) return null;
  return node.children.map((c) => xmlText(c)).filter((x) => x !== null && x !== "").join(" ") || null;
}
export function selectField(record: unknown, kind: TransformRecord["sourceKind"], source: string): unknown {
  const s = source.trim();
  if (kind === "json") {
    const steps = s.split(".");
    let cur = record;
    for (const st of steps) {
      if (st === "*") {
        cur = Array.isArray(cur) ? cur[0] : undefined;
        continue;
      }
      cur = jsonGet(cur, st);
    }
    return cur;
  }
  if (kind === "xml" && record && typeof record === "object" && "tag" in (record as XmlNode)) {
    const node = record as XmlNode;
    const steps = s.split("/").filter(Boolean);
    let cur: XmlNode | null = node;
    for (let i = 0; i < steps.length; i += 1) {
      const st = steps[i];
      if (!cur) return null;
      if (i === steps.length - 1) return xmlValue(cur, st);
      cur = xmlChild(cur, st);
    }
    return null;
  }
  if (kind === "csv" && record && typeof record === "object") {
    const row = record as Record<string, unknown>;
    if (/^#[1-9]\d*$/.test(s)) {
      // 1-based index over the column list — resolved from the record keys
      const keys = Object.keys(row);
      const idx = Number(s.slice(1)) - 1;
      const key = keys[idx];
      return key === undefined ? undefined : row[key];
    }
    return row[s];
  }
  if ((kind === "edi_x12" || kind === "edifact") && record && typeof record === "object") {
    const r = record as EdiSegment | EdiTransaction;
    const segList: EdiSegment[] = "segments" in r ? (r as EdiTransaction).segments : [r as EdiSegment];
    const m = /^([A-Z0-9]{2,3})(?:\[(\d+)\])?(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    const id = m[1];
    const occ = m[2] ? Number(m[2]) : 1;
    const elem = m[3] ? Number(m[3]) : 0;
    const hits = segList.filter((x) => x.id === id);
    const hit = hits[occ - 1];
    if (!hit) return null;
    if (elem === 0) return `${hit.id}*${hit.elements.join("*")}`;
    return hit.elements[elem - 1] ?? "";
  }
  return undefined;
}

// ── Coercion (deterministic) ────────────────────────────────────────────────
export function coerceValue(v: unknown, coerce?: CoerceKind | null): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  switch (coerce) {
    case "string":
      return String(v);
    case "number": {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case "int": {
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "bool": {
      const s = String(v).trim().toLowerCase();
      if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
      if (s === "false" || s === "0" || s === "no" || s === "n") return false;
      return null;
    }
    case "trim":
      return String(v).trim();
    case "upper":
      return String(v).toUpperCase();
    case "lower":
      return String(v).toLowerCase();
    default:
      // no coercion: keep JSON scalars as-is; anything else stringified
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      return String(v);
  }
}

// ── Mapping ─────────────────────────────────────────────────────────────────
export function mapDocument(doc: ParsedDoc, kind: TransformRecord["sourceKind"], recordPath: string, fields: FieldMapping[]): MappedRow[] {
  const records = selectRecords(doc, kind, recordPath);
  if (records.length > MAX_PARSED_RECORDS) throw new Error(`record count cap reached (${MAX_PARSED_RECORDS})`);
  const rows: MappedRow[] = [];
  for (const rec of records) {
    const values: Record<string, string | number | boolean | null> = {};
    for (const f of fields) {
      const raw = selectField(rec, kind, f.source);
      if (raw === undefined || raw === null || raw === "") {
        if (f.required) throw new Error(`required field "${f.target}" did not resolve from source "${f.source}"`);
        values[f.target] = null;
        continue;
      }
      values[f.target] = coerceValue(raw, f.coerce ?? null);
    }
    rows.push({ values });
    if (rows.length > MAX_OUTPUT_ROWS) throw new Error(`output row cap reached (${MAX_OUTPUT_ROWS}) — narrow the recordPath or filter the source`);
  }
  return rows;
}

// ── Generation (deterministic; control numbers = fnv1a(seed)) ───────────────
function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function pad(n: number, len: number): string {
  return String(Math.abs(n) % 10 ** len).padStart(len, "0");
}
function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function csvCell(v: string | number | boolean | null, delimiter: string): string {
  if (v === null) return "";
  const s = String(v);
  if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function resolveTemplate(tpl: string, row: MappedRow, fields: FieldMapping[]): string {
  return tpl.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => {
    const hit = fields.find((f) => f.target === name);
    if (!hit) throw new Error(`segment template references unknown field "${name}" (not in the field map)`);
    const v = row.values[name];
    if (v === null || v === undefined) throw new Error(`segment template field "${name}" is empty for this row`);
    return String(v);
  });
}
export function generateArtifact(
  outputKind: ArtifactKind,
  rows: MappedRow[],
  fields: FieldMapping[],
  gen: GenerationConfig,
  seed: string,
  now: Date,
): { mime: string; text: string } {
  let text = "";
  let mime = "text/plain";
  const delimiter = gen.delimiter ?? ",";
  if (outputKind === "csv") {
    mime = "text/csv";
    const header = gen.hasHeader === false ? [] : fields.map((f) => f.target);
    const lines: string[] = [];
    if (header.length > 0) lines.push(header.join(delimiter));
    for (const r of rows) lines.push(fields.map((f) => csvCell(r.values[f.target] ?? null, delimiter)).join(delimiter));
    text = lines.join("\n") + (lines.length > 0 ? "\n" : "");
  } else if (outputKind === "json") {
    mime = "application/json";
    text = JSON.stringify({ records: rows.map((r) => r.values) }, null, 2);
  } else if (outputKind === "xml") {
    mime = "application/xml";
    const rootTag = gen.rootTag ?? "records";
    const rowTag = gen.rowTag ?? "row";
    const body = rows
      .map((r) => `<${rowTag}>${fields.map((f) => `<${f.target}>${r.values[f.target] === null ? "" : xmlEscape(String(r.values[f.target]))}</${f.target}>`).join("")}</${rowTag}>`)
      .join("");
    text = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>${body}</${rootTag}>`;
  } else if (outputKind === "edi_x12") {
    mime = "application/edi-x12";
    const sender = (gen.senderId ?? "").padEnd(15, " ");
    const receiver = (gen.receiverId ?? "").padEnd(15, " ");
    const date = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1, 2)}${pad(now.getUTCDate(), 2)}`;
    const time = `${pad(now.getUTCHours(), 2)}${pad(now.getUTCMinutes(), 2)}`;
    const isaCtrl = pad(fnv1a32(`isa:${seed}`), 9);
    const gsCtrl = pad(fnv1a32(`gs:${seed}`), 9);
    const segs = gen.segments ?? [];
    const txnLines: string[] = [];
    let stSeq = 1;
    for (const r of rows) {
      const st = pad(fnv1a32(`st:${seed}:${stSeq}`), 4);
      const stSeg = `ST*850*${st}`;
      const bodySegs = segs.map((t) => resolveTemplate(t, r, fields));
      txnLines.push(stSeg, ...bodySegs, `SE*${String(bodySegs.length + 2)}*${st}`);
      stSeq += 1;
    }
    const el = "*";
    const sub = ">";
    const isa = `ISA${el}00${el}          ${el}00${el}          ${el}ZZ${el}${sender}${el}ZZ${el}${receiver}${el}${date}${el}${time}${el}U${el}00401${el}${isaCtrl}${el}0${el}P${el}${sub}~`;
    const gs = `GS${el}PO${el}${sender}${el}${receiver}${el}${date}${el}${time}${el}${gsCtrl}${el}X${el}004010~`;
    text = [isa, gs, ...txnLines.map((l) => `${l}~`), `GE*${String(Math.max(rows.length, 1))}*${gsCtrl}~`, `IEA*1*${isaCtrl}~`].join("");
  } else {
    // edifact
    mime = "application/edifact";
    const sender = gen.senderId ?? "";
    const receiver = gen.receiverId ?? "";
    const date = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1, 2)}${pad(now.getUTCDate(), 2)}:${pad(now.getUTCHours(), 2)}${pad(now.getUTCMinutes(), 2)}`;
    const ic = pad(fnv1a32(`ic:${seed}`), 14);
    const segs = gen.segments ?? [];
    const lines: string[] = [];
    let msgRef = 1;
    for (const r of rows) {
      const ref = pad(fnv1a32(`ref:${seed}:${msgRef}`), 6);
      const bodySegs = segs.map((t) => resolveTemplate(t, r, fields));
      lines.push(`UNH+${ref}+ORDERS:D:96A:UN'`, ...bodySegs.map((t) => `${t}'`), `UNT+${String(bodySegs.length + 2)}+${ref}'`);
      msgRef += 1;
    }
    text = [
      "UNA:+.? '",
      `UNB+UNOA:2+${sender}+${receiver}+${date}+${ic}'`,
      ...lines,
      `UNZ+${String(Math.max(rows.length, 1))}+${ic}'`,
    ].join("");
  }
  if (Buffer.byteLength(text, "utf8") > MAX_ARTIFACT_TEXT_BYTES) throw new Error("generated artifact exceeds the 1MB text cap");
  return { mime, text };
}

// ── Whole-transform execution (pure) ────────────────────────────────────────
export interface TransformExecution {
  rows: MappedRow[];
  artifact: { mime: string; text: string } | null;
  rowCount: number;
}
export function executeTransform(
  def: Pick<TransformRecord, "sourceKind" | "recordPath" | "fields" | "outputMode" | "artifactKind" | "generation">,
  sourceText: string,
  seed: string,
  now: Date,
): TransformExecution {
  const doc = parseSource(def.sourceKind, sourceText, def.generation?.delimiter);
  const rows = mapDocument(doc, def.sourceKind, def.recordPath, def.fields);
  if (def.outputMode === "records") return { rows, artifact: null, rowCount: rows.length };
  return { rows, artifact: generateArtifact(def.artifactKind ?? "json", rows, def.fields, def.generation ?? { envelope: "none" }, seed, now), rowCount: rows.length };
}