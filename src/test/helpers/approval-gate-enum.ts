/**
 * Static enumerator for Approval Queue action names (slice 153).
 *
 * WHY THIS EXISTS: `approvalGate` classifies an action by VERB PREFIX
 * (`WRITE_VERB` / `READ_VERB` in src/lib/approval-queue.ts). A name that
 * matches neither is treated as a READ and passes straight through the queue
 * (`if (!isWriteAction(actionName)) return { allowed: true }`). Slice 152 found
 * two live instances of that fail-open class (`revokeInvoiceShare`,
 * `rotateInvoiceShare`). Nothing guaranteed the *next* action name was
 * classified — so this module turns "someone remembers to check" into a set
 * the test suite can assert on.
 *
 * WHAT IT DOES: walks `src/**` (excluding `src/test`, where fixture names are
 * deliberately constructed), strips comments so doc-string pseudo-calls do not
 * count, finds every real `approvalGate(...)` call, and resolves the SECOND
 * argument to the actual action-name strings — following `const` initialisers,
 * object tables (`VAULT_ACTIONS`, `ACTION_NAME`, `FILE_IMPORT_ACTION`), table
 * lookups (`ACTION_NAME[op]`), small helper functions (`opVerb(op)`), and one
 * level of function-parameter pass-through into that function's own callers.
 *
 * Anything it cannot resolve is reported as `unresolved` rather than silently
 * dropped: a new call site we cannot follow must be made resolvable (or
 * declared with a reason in the test) instead of quietly escaping the guard.
 *
 * Run it standalone to see the enumeration:
 *   bun src/test/helpers/approval-gate-enum.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Action names are camelCase provider verbs, e.g. "createXeroInvoice". */
const ACTION_NAME_SHAPE = /^[a-z][A-Za-z0-9]{2,}$/;
const MAX_DEPTH = 6;

export interface GateCallSite {
  /** path relative to the repo root, e.g. "src/native/invoice/gate.ts" */
  file: string;
  line: number;
  /** the second argument exactly as written in the source */
  expr: string;
  /** action names this argument can evaluate to */
  names: string[];
  /** how they were found — for the report, not for assertions */
  how: string;
}

export interface GateEnumeration {
  sites: GateCallSite[];
  /** name -> the call sites that can pass it */
  names: Map<string, string[]>;
  /** call sites whose second argument could not be resolved to any name */
  unresolved: { file: string; line: number; expr: string; why: string }[];
  filesScanned: number;
}

// ── source walking ──────────────────────────────────────────────────────
export function sourceFiles(root = "src"): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // `src/test` is excluded on purpose: tests construct fixture action names
      // to exercise the classifier itself. The guard is about PRODUCTION code.
      if (entry.name === "node_modules" || entry.name === "test") continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(p);
    }
  };
  walk(root);
  return out;
}

/**
 * Replace every comment with spaces, keeping newlines and byte offsets intact so
 * reported line numbers stay true. Handles strings and template literals so a
 * `//` inside a URL is not mistaken for a comment.
 */
export function stripComments(src: string): string {
  const out = src.split("");
  let i = 0;
  let prevSignificant = "";
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === quote) { j++; break; }
        j++;
      }
      i = j;
      prevSignificant = quote;
      continue;
    }
    // Regex literal vs division: only a handful of chars can precede a regex.
    if (c === "/" && (prevSignificant === "" || "(,=:[!&|?{};+-*%~^".includes(prevSignificant))) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) { j++; break; }
        else if (d === "\n") break;
        j++;
      }
      i = j;
      prevSignificant = "/";
      continue;
    }
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return out.join("");
}

/** Split the argument list of a call whose "(" ends at `openParen`. */
function callArgs(code: string, openParen: number): { args: string[]; end: number } {
  const args: string[] = [];
  let depth = 1;
  let start = openParen + 1;
  let i = openParen + 1;
  while (i < code.length && depth > 0) {
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === quote) { j++; break; }
        j++;
      }
      i = j;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) { args.push(code.slice(start, i)); return { args, end: i }; }
    } else if (c === "," && depth === 1) {
      args.push(code.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  args.push(code.slice(start, i));
  return { args, end: i };
}

interface FnScope { name: string; params: string[]; bodyStart: number; bodyEnd: number }

/** Nearest `function name(...) { ... }` that encloses `pos`. */
function enclosingFunction(code: string, pos: number): FnScope | null {
  const re = /(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  let best: FnScope | null = null;
  while ((m = re.exec(code))) {
    const openParen = m.index + m[0].length - 1;
    const { end: closeParen } = callArgs(code, openParen);
    const rawParams = code.slice(openParen + 1, closeParen);
    const brace = code.indexOf("{", closeParen);
    if (brace === -1) continue;
    let depth = 1;
    let j = brace + 1;
    while (j < code.length && depth > 0) {
      const c = code[j];
      if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        let k = j + 1;
        while (k < code.length) {
          if (code[k] === "\\") { k += 2; continue; }
          if (code[k] === quote) { k++; break; }
          k++;
        }
        j = k;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      j++;
    }
    if (pos > brace && pos < j) {
      best = {
        name: m[1],
        params: rawParams.split(",").map((p) => p.trim().split(/[?:\s]/)[0]).filter(Boolean),
        bodyStart: brace,
        bodyEnd: j,
      };
    }
  }
  return best;
}

/** Everything in `text` that looks like an action name. */
function actionNamesIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/"([^"\\\n]+)"|'([^'\\\n]+)'|`([^`\\$\n]+)`/g)) {
    const value = m[1] ?? m[2] ?? m[3] ?? "";
    if (ACTION_NAME_SHAPE.test(value)) found.add(value);
  }
  return [...found];
}

/**
 * Action names a helper FUNCTION can RETURN. `case "insert":` labels are the
 * op being switched on, not the action being gated (`opVerb("insert")` returns
 * "createTableRow"), so only literals in `return` expressions count. Falls back
 * to every literal in the body when the function has no `return <literal>`.
 */
function returnedNamesIn(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/return\s+([^;{}]*);/g)) {
    for (const name of actionNamesIn(m[1])) found.add(name);
  }
  return found.size ? [...found] : actionNamesIn(body);
}

/** The value of `key:` (or `"key":`) inside an object literal body. */
function objectProperty(body: string, key: string): string | null {
  const re = new RegExp(`(?:^|[{,\\s])(?:${key}|["']${key}["'])\\s*:\\s*["'\`]([^"'\`\\n]+)["'\`]`);
  const m = body.match(re);
  return m ? m[1] : null;
}

/** Read the initialiser that follows `=` at `eq`. */
function initializerAt(code: string, eq: number): string {
  let i = eq + 1;
  while (i < code.length && /\s/.test(code[i])) i++;
  if (code[i] === "{" || code[i] === "[") {
    const open = code[i];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let j = i;
    while (j < code.length) {
      const c = code[j];
      if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        let k = j + 1;
        while (k < code.length) {
          if (code[k] === "\\") { k += 2; continue; }
          if (code[k] === quote) { k++; break; }
          k++;
        }
        j = k;
        continue;
      }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) return code.slice(i, j + 1); }
      j++;
    }
    return code.slice(i);
  }
  const end = code.slice(i).search(/[;\n]/);
  return code.slice(i, end === -1 ? undefined : i + end);
}

interface ResolveCtx {
  codeByFile: Map<string, string>;
  /** every file's stripped source, for cross-file lookups */
  files: string[];
}

function findLocalConst(code: string, name: string, before: number, after = 0): string | null {
  const re = new RegExp(`(?:export\\s+)?(?:const|let)\\s+${name}\\b\\s*(?::[^=]+)?=`, "g");
  let m: RegExpExecArray | null;
  let found: string | null = null;
  while ((m = re.exec(code))) {
    if (m.index < after) continue;
    if (m.index > before) break;
    const eq = m.index + m[0].length - 1;
    found = initializerAt(code, eq);
  }
  return found;
}

function findFunctionBody(code: string, name: string): string | null {
  const re = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, "g");
  const m = re.exec(code);
  if (!m) return null;
  const openParen = m.index + m[0].length - 1;
  const { end: closeParen } = callArgs(code, openParen);
  const brace = code.indexOf("{", closeParen);
  if (brace === -1) return null;
  let depth = 1;
  let j = brace + 1;
  while (j < code.length && depth > 0) {
    if (code[j] === "{") depth++;
    else if (code[j] === "}") depth--;
    j++;
  }
  return code.slice(brace, j);
}

function findConstAnywhere(ctx: ResolveCtx, name: string, fromFile: string): string | null {
  const local = findLocalConst(ctx.codeByFile.get(fromFile) ?? "", name, Infinity);
  if (local !== null) return local;
  for (const f of ctx.files) {
    if (f === fromFile) continue;
    const code = ctx.codeByFile.get(f) ?? "";
    const re = new RegExp(`(?:export\\s+)?(?:const|let)\\s+${name}\\b\\s*(?::[^=]+)?=`);
    const m = re.exec(code);
    if (m) {
      const eq = m.index + m[0].length - 1;
      return initializerAt(code, eq);
    }
  }
  return null;
}

function findFunctionAnywhere(ctx: ResolveCtx, name: string, fromFile: string): string | null {
  const local = findFunctionBody(ctx.codeByFile.get(fromFile) ?? "", name);
  if (local !== null) return local;
  for (const f of ctx.files) {
    if (f === fromFile) continue;
    const body = findFunctionBody(ctx.codeByFile.get(f) ?? "", name);
    if (body !== null) return body;
  }
  return null;
}

/** Callers of `fnName` across the tree, with the argument at `index`. */
function callerArgs(ctx: ResolveCtx, fnName: string, index: number): { file: string; arg: string; pos: number }[] {
  const out: { file: string; arg: string; pos: number }[] = [];
  for (const f of ctx.files) {
    const code = ctx.codeByFile.get(f) ?? "";
    const re = new RegExp(`(?<![\\w$.])${fnName}\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const before = code.slice(Math.max(0, m.index - 40), m.index);
      if (/function\s+$/.test(before)) continue; // the declaration itself
      const openParen = m.index + m[0].length - 1;
      const { args } = callArgs(code, openParen);
      if (args.length > index) out.push({ file: f, arg: args[index].trim(), pos: m.index });
    }
  }
  return out;
}

function resolveExpr(
  ctx: ResolveCtx,
  file: string,
  expr: string,
  pos: number,
  depth: number,
  seen: Set<string>,
): { names: string[]; how: string; partial?: string[] } | { names: []; how: string; why: string } {
  const raw = expr.trim();
  const fail = (why: string) => ({ names: [] as [], how: raw, why });
  if (!raw) return fail("empty second argument");
  if (depth > MAX_DEPTH) return fail("resolution depth exceeded");

  // 1. plain string literal
  const lit = raw.match(/^["'`]([^"'`\\$]*)["'`]$/);
  if (lit) return { names: [lit[1]], how: "string literal" };

  const code = ctx.codeByFile.get(file) ?? "";

  // 2. member access: OBJ.prop
  const member = raw.match(/^([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)$/);
  if (member) {
    const [, base, prop] = member;
    const table = findConstAnywhere(ctx, base, file);
    if (table) {
      const exact = objectProperty(table, prop);
      if (exact) return { names: [exact], how: `${base}.${prop}` };
      const all = actionNamesIn(table);
      if (all.length) return { names: all, how: `all values of ${base}` };
    }
    return fail(`could not resolve table ${base}`);
  }

  // 3. table lookup / function call: OBJ[...] / fn(...)
  const call = raw.match(/^([A-Za-z_$][\w$]*)\s*([[(])/);
  if (call) {
    const [, base, bracket] = call;
    if (bracket === "[") {
      const table = findConstAnywhere(ctx, base, file);
      const all = table ? actionNamesIn(table) : [];
      if (all.length) return { names: all, how: `all values of ${base}` };
      return fail(`could not resolve table ${base}`);
    }
    const body = findFunctionAnywhere(ctx, base, file);
    const names = body ? returnedNamesIn(body) : [];
    if (names.length) return { names, how: `returns of ${base}()` };
    return fail(`could not resolve helper ${base}()`);
  }

  // 4. bare identifier
  const ident = raw.match(/^([A-Za-z_$][\w$]*)$/);
  if (ident) {
    const name = ident[1];
    const scope = enclosingFunction(code, pos);
    if (scope && scope.params.includes(name)) {
      const key = `${file}:${scope.name}:${name}`;
      if (seen.has(key)) return fail(`circular pass-through ${key}`);
      const next = new Set(seen).add(key);
      const callers = callerArgs(ctx, scope.name, scope.params.indexOf(name));
      const collected = new Set<string>();
      const unresolvedWhy: string[] = [];
      for (const c of callers) {
        const r = resolveExpr(ctx, c.file, c.arg, c.pos, depth + 1, next);
        if (r.names.length) r.names.forEach((nm) => collected.add(nm));
        else unresolvedWhy.push(`${c.file}: ${(r as { why: string }).why}`);
      }
      if (collected.size) {
        return {
          names: [...collected],
          how: `parameter "${name}" of ${scope.name}() via its callers`,
          // A caller we could not follow is a HOLE in the enumeration, not a
          // pass: report it so the test can refuse to claim coverage.
          ...(unresolvedWhy.length ? { partial: unresolvedWhy } : {}),
        };
      }
      return fail(
        `parameter "${name}" of ${scope.name}() could not be resolved` +
          (unresolvedWhy.length ? ` (${unresolvedWhy.join("; ")})` : " (no callers found)"),
      );
    }
    const local = findLocalConst(code, name, pos, scope ? scope.bodyStart : 0) ?? findLocalConst(code, name, pos);
    if (local !== null) {
      const r = resolveExpr(ctx, file, local, pos, depth + 1, seen);
      return { ...r, how: r.names.length ? `const ${name} → ${r.how}` : r.how } as ReturnType<typeof resolveExpr>;
    }
    const fnBody = findFunctionAnywhere(ctx, name, file);
    if (fnBody) {
      const names = actionNamesIn(fnBody);
      if (names.length) return { names, how: `returns of ${name}()` };
    }
    return fail(`no definition found for "${name}"`);
  }

  // 5. anything else (ternary, ??) — every action-shaped literal in it
  const names = actionNamesIn(raw);
  if (names.length) return { names, how: "literal(s) in the expression" };
  return fail("no action-shaped literal in the expression");
}

/** Enumerate every action name that can reach `approvalGate`'s 2nd argument. */
export function enumerateApprovalGateActions(root = "src"): GateEnumeration {
  const files = sourceFiles(root);
  const codeByFile = new Map<string, string>();
  for (const f of files) codeByFile.set(f, stripComments(readFileSync(f, "utf8")));
  const ctx: ResolveCtx = { codeByFile, files };

  const sites: GateCallSite[] = [];
  const unresolved: GateEnumeration["unresolved"] = [];
  const names = new Map<string, string[]>();

  for (const file of files) {
    const code = codeByFile.get(file) ?? "";
    const re = /(?<![\w$.])approvalGate\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const before = code.slice(Math.max(0, m.index - 40), m.index);
      if (/function\s+$/.test(before)) continue; // the definition
      const openParen = m.index + m[0].length - 1;
      const { args } = callArgs(code, openParen);
      const expr = (args[1] ?? "").trim();
      const line = code.slice(0, m.index).split("\n").length;
      const r = resolveExpr(ctx, file, expr, m.index, 0, new Set());
      if (r.names.length === 0) {
        unresolved.push({ file, line, expr, why: (r as { why: string }).why });
        continue;
      }
      const partial = (r as { partial?: string[] }).partial;
      if (partial?.length) {
        // Names found, but at least one path into this argument is still a
        // blind spot — refuse to call that covered.
        unresolved.push({ file, line, expr, why: `partially resolved: ${partial.join("; ")}` });
      }
      sites.push({ file, line, expr, names: r.names, how: r.how });
      for (const n of r.names) {
        const at = names.get(n) ?? [];
        at.push(`${file}:${line}`);
        names.set(n, at);
      }
    }
  }
  return { sites, names, unresolved, filesScanned: files.length };
}

// ── standalone report ───────────────────────────────────────────────────
if (import.meta.main) {
  const e = enumerateApprovalGateActions();
  console.log(`files scanned: ${e.filesScanned}`);
  console.log(`call sites resolved: ${e.sites.length}`);
  for (const s of e.sites) console.log(`  ${s.file}:${s.line}  ${s.expr}  →  ${s.names.join(", ")}   [${s.how}]`);
  console.log(`\nUNRESOLVED: ${e.unresolved.length}`);
  for (const u of e.unresolved) console.log(`  ${u.file}:${u.line}  ${u.expr}  — ${u.why}`);
  console.log(`\ndistinct action names: ${e.names.size}`);
  for (const n of [...e.names.keys()].sort()) console.log(`  ${n}  (${e.names.get(n)!.length} site(s))`);
}
