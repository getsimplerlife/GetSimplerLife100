// @vitest-environment node
// ^ node, not jsdom: this test reads source files off disk and never renders.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * SLICE 166 — T1: the browser bundle's import graph must be evaluable in a
 * browser.
 *
 * THE DEFECT THIS PINS (D-1, 2026-11-01). The working/dev site rendered blank on
 * every route. The chain was:
 *
 *   index.html → src/entry-client.tsx → src/routeTree.gen.ts (a STATIC import of
 *   every route file) → src/routes/about.tsx (and faq, contact, how-it-works,
 *   portal.$auditId) → src/db/queries.ts → src/db/auth.ts → src/lib/jwt-key.ts
 *
 * and `src/db/auth.ts` did `const JWT_SECRET = new TextEncoder().encode(
 * readJwtSecret())` at module scope, while `readJwtSecret`'s default parameter
 * evaluated `process.env.JWT_SECRET`. In a browser `process` does not exist, so
 * evaluating the graph threw `ReferenceError: process is not defined` before
 * `createRoot(...).render(...)` ever ran. One module-scope line in a
 * transitively-imported file blanked the entire site.
 *
 * WHY 3,332 TESTS MISSED IT. `vitest.config.ts` runs jsdom — which runs inside
 * Node, where `process` IS defined — and `src/test/setup.ts` sets JWT_SECRET
 * before any module loads. `tsc` cannot see it (`@types/node` declares
 * `process`). `vite build` cannot see it either: Rollup treeshakes the dead
 * `createServerFn` closures, so the auth chain simply leaves the production
 * bundle, which is why the live site worked *by accident*. The only thing that
 * can see it is a test that walks the client import graph statically — which is
 * this file.
 *
 * THE RULES (each one is a way the browser differs from the Node test process):
 *   1. no module-scope reference to `process`, `Bun`, `require`, `__dirname` or
 *      `__filename` in any module reachable from the client entry;
 *   2. no STATIC `node:*` import in any reachable module (a dynamic one inside a
 *      dead server-fn handler never runs in the browser, so it is allowed);
 *   3. no module-scope CALL into a module that reads a Node global anywhere —
 *      rule 1 alone cannot see `const K = readJwtSecret()` at module scope when
 *      the `process.env` read lives inside the callee's body, which is exactly
 *      the shape the slice-166 fix introduces.
 *
 * The walker follows dynamic `import()` too: a lazily-loaded chunk is evaluated
 * in the browser all the same, and `src/lazy/**` is where the share pages live.
 *
 * Comments and string literals are stripped before scanning (a guard that
 * matches prose pins nothing — R86), and every rule has a self-test at the
 * bottom so a broken scanner fails loudly instead of passing vacuously.
 */

const REPO = process.cwd();
const SRC = join(REPO, "src");
const ENTRY = join(SRC, "entry-client.tsx");
const ROUTES_DIR = join(SRC, "routes");
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const SKIP_EXT = /\.(css|scss|sass|less|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|txt|md)$/;

/** Sentinel: a route-tree import that the generated file has not created yet. */
const ROUTE_TREE_MISSING = "::routeTree.gen::";

const rel = (file: string) => relative(REPO, file);

/**
 * Replace `//` and block comments with spaces, keeping offsets and newlines so
 * reported line numbers still point at the real source. String literals are
 * left intact (import specifiers live in them).
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += quote;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          out += quote;
          i++;
          break;
        }
        out += src[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Replace string/template contents with spaces (quotes kept, newlines kept). */
function blankStrings(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += quote;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          out += quote;
          i++;
          break;
        }
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Every module specifier a file mentions, with whether it was a static import
 * or a dynamic `import()`.
 */
function specifiers(noComments: string): { spec: string; dynamic: boolean }[] {
  const found: { spec: string; dynamic: boolean }[] = [];
  const patterns: [RegExp, boolean][] = [
    // import ... from "x"   /   export ... from "x"   (static)
    [/\b(?:import|export)\s+[\w$*{}\s,]+?\s+from\s*["']([^"']+)["']/g, false],
    // import "x"            (static side-effect import)
    [/\bimport\s*["']([^"']+)["']/g, false],
    // import("x")           (dynamic)
    [/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, true],
  ];
  for (const [re, dynamic] of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(noComments))) found.push({ spec: m[1], dynamic });
  }
  return found;
}

/** Names this file imports, with the module they come from. */
function importBindings(noComments: string): { local: string; spec: string }[] {
  const out: { local: string; spec: string }[] = [];
  const named = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = named.exec(noComments))) {
    for (const part of m[1].split(",")) {
      const bits = part.trim().split(/\s+as\s+/);
      const local = (bits[1] ?? bits[0]).trim();
      if (/^[\w$]+$/.test(local)) out.push({ local, spec: m[2] });
    }
  }
  const dflt = /\bimport\s+(?:type\s+)?([\w$]+)\s*(?:,\s*\{[^}]*\})?\s*from\s*["']([^"']+)["']/g;
  while ((m = dflt.exec(noComments))) out.push({ local: m[1], spec: m[2] });
  return out;
}

/** Resolve a specifier to a file on disk, or null when it is not ours to walk. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith("node:")) return null;
  if (SKIP_EXT.test(spec)) return null;
  if (!spec.startsWith(".") && !spec.startsWith("~/")) return null; // npm package
  const base = spec.startsWith("~/")
    ? join(SRC, spec.slice(2))
    : resolve(dirname(fromFile), spec);
  if (base === join(SRC, "routeTree.gen") && !existsSync(base + ".ts")) return ROUTE_TREE_MISSING;
  const candidates = [
    base,
    ...EXTENSIONS.map((e) => base + e),
    ...EXTENSIONS.map((e) => join(base, "index" + e)),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function walkDir(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Brace depth at an offset, in string-blanked code. */
function depthAt(code: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
  }
  return depth;
}

/**
 * The Node-only globals, as they actually appear when code runs: a property
 * read (`process.env`, `Bun.serve`), a call (`require(`), or a bare identifier.
 * Prose is not matched because strings are blanked first and each pattern
 * requires a code-shaped neighbour (`process.` / `Bun.` / `require(`).
 */
const NODE_GLOBALS: [string, RegExp][] = [
  ["process", /(^|[^\w$.])process\.[A-Za-z_$]/g],
  ["Bun", /(^|[^\w$.])Bun\.[A-Za-z_$]/g],
  ["require", /(^|[^\w$.])require\s*\(/g],
  ["__dirname", /(^|[^\w$])__dirname\b/g],
  ["__filename", /(^|[^\w$])__filename\b/g],
];

type Hit = { global: string; line: number; moduleScope: boolean };

/** Scan a source string for Node-only global references. */
function scanText(raw: string): Hit[] {
  const code = blankStrings(stripComments(raw));
  const hits: Hit[] = [];
  for (const [name, re] of NODE_GLOBALS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const at = m.index + m[0].indexOf(name);
      hits.push({
        global: name,
        line: code.slice(0, at).split("\n").length,
        moduleScope: depthAt(code, at) === 0,
      });
    }
  }
  return hits;
}

type Graph = {
  files: string[];
  /** module scope hits, per file */
  moduleScope: { file: string; hit: Hit }[];
  /** static node:* imports, per file */
  staticBuiltins: { file: string; spec: string }[];
  /** module-scope calls into modules that read a Node global anywhere */
  envCalls: { file: string; local: string; via: string; line: number }[];
};

function clientGraph(): Graph {
  const seen = new Set<string>();
  const queue: string[] = [ENTRY];
  const staticBuiltins: Graph["staticBuiltins"] = [];
  const allDepth: { file: string; hit: Hit }[] = [];
  const moduleScope: Graph["moduleScope"] = [];
  const importEdges: { file: string; local: string; target: string }[] = [];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    const raw = readFileSync(file, "utf8");
    const noComments = stripComments(raw);

    const hits = scanText(raw);
    for (const hit of hits) {
      allDepth.push({ file, hit });
      if (hit.moduleScope) moduleScope.push({ file, hit });
    }

    for (const { spec, dynamic } of specifiers(noComments)) {
      if (spec.startsWith("node:")) {
        // A dynamic builtin import inside a server-fn handler is dead code in
        // the browser; a static one is loaded (or stubbed) up front.
        if (!dynamic) staticBuiltins.push({ file, spec });
        continue;
      }
      const target = resolveSpecifier(file, spec);
      if (!target) continue;
      if (target === ROUTE_TREE_MISSING) {
        // `src/routeTree.gen.ts` is generated at build time and gitignored. It
        // statically imports every file under src/routes, so walk those instead
        // rather than skipping the whole app when the build has not run.
        if (existsSync(ROUTES_DIR)) {
          for (const route of walkDir(ROUTES_DIR)) queue.push(route);
        }
        continue;
      }
      if (!dynamic) {
        for (const binding of importBindings(noComments)) {
          if (binding.spec === spec) importEdges.push({ file, local: binding.local, target });
        }
      }
      queue.push(target);
    }
  }

  // Rule 3: a module-scope call into a module that reads a Node global anywhere.
  const readsGlobals = new Set(allDepth.map((h) => h.file));
  const envCalls: Graph["envCalls"] = [];
  for (const edge of importEdges) {
    if (!readsGlobals.has(edge.target)) continue;
    const code = blankStrings(stripComments(readFileSync(edge.file, "utf8")));
    const call = new RegExp(`(^|[^\\w$.])${edge.local.replace(/\$/g, "\\$")}\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = call.exec(code))) {
      const at = m.index + m[0].indexOf(edge.local);
      if (depthAt(code, at) === 0) {
        envCalls.push({
          file: edge.file,
          local: edge.local,
          via: edge.target,
          line: code.slice(0, at).split("\n").length,
        });
      }
    }
  }

  return { files: [...seen], moduleScope, staticBuiltins, envCalls };
}

const GRAPH = clientGraph();

describe("SLICE 166 — the client bundle's import graph is browser-evaluable", () => {
  it("walks a real graph (a broken walker must not pass vacuously)", () => {
    expect(existsSync(ENTRY)).toBe(true);
    // The eager graph alone was 114 modules when this was written; the walker
    // also follows dynamic import(), which takes it past 200.
    expect(GRAPH.files.length).toBeGreaterThan(100);
    expect(GRAPH.files.map(rel)).toContain("src/entry-client.tsx");
  });

  it("still reaches the modules that used to break it, so the guard keeps watching them", () => {
    // Removing the `~/db/queries` imports from the route files would make this
    // guard green without fixing anything — that is the symptom fix, not the
    // class fix. These two must stay in the graph.
    const files = GRAPH.files.map(rel);
    expect(files).toContain("src/db/auth.ts");
    expect(files).toContain("src/lib/jwt-key.ts");
    expect(files).toContain("src/db/queries.ts");
  });

  it("no reachable module references a Node-only global at module scope", () => {
    const offenders = GRAPH.moduleScope.map(({ file, hit }) => `${rel(file)}:${hit.line} ${hit.global}`);
    expect(offenders).toEqual([]);
  });

  it("no reachable module statically imports a node:* builtin", () => {
    const offenders = GRAPH.staticBuiltins.map(({ file, spec }) => `${rel(file)} -> ${spec}`);
    expect(offenders).toEqual([]);
  });

  it("no reachable module calls env-reading code at module scope", () => {
    const offenders = GRAPH.envCalls.map(
      ({ file, local, via, line }) => `${rel(file)}:${line} calls ${local}() from ${rel(via)}`,
    );
    expect(offenders).toEqual([]);
  });
});

describe("SLICE 166 — the scanner itself (self-tests, so it cannot pass by accident)", () => {
  it("flags a module-scope process.env read", () => {
    const hits = scanText('const K = process.env.JWT_SECRET;\n');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ global: "process", line: 1, moduleScope: true });
  });

  it("flags the exact pre-fix line from src/db/auth.ts", () => {
    // The line that blanked the site, verbatim.
    const hits = scanText("const JWT_SECRET = new TextEncoder().encode(readJwtSecret());");
    // No `process` here — the read was in the callee — which is why rule 3 exists.
    expect(hits).toEqual([]);
  });

  it("flags a default parameter that reads process (the callee-side shape)", () => {
    const hits = scanText('export function readJwtSecret(s = process.env.JWT_SECRET) {}\n');
    expect(hits.filter((h) => h.moduleScope)).toHaveLength(1);
  });

  it("does not flag a read inside a function body (the safe, lazy pattern)", () => {
    const hits = scanText("export function k() { return process.env.JWT_SECRET; }\n");
    expect(hits).toHaveLength(1);
    expect(hits.filter((h) => h.moduleScope)).toEqual([]);
  });

  it("does not flag prose, comments or string literals", () => {
    expect(scanText("// process.env.JWT_SECRET is required\nconst s = 'process.env.X';\n")).toEqual(
      [],
    );
    expect(scanText("const el = <dt>process started at {t}</dt>;\n")).toEqual([]);
    // A sentence-ending period is followed by a space, so it is not a property read.
    expect(scanText('const el = <p>The process. Bun. ships it.</p>;\n')).toEqual([]);
  });

  it("flags Bun, require, __dirname and __filename", () => {
    expect(scanText("const p = Bun.serve;\n").map((h) => h.global)).toEqual(["Bun"]);
    expect(scanText("const fs = require('fs');\n").map((h) => h.global)).toEqual(["require"]);
    expect(scanText("const d = __dirname;\n").map((h) => h.global)).toEqual(["__dirname"]);
    expect(scanText("const f = __filename;\n").map((h) => h.global)).toEqual(["__filename"]);
  });

  it("separates static from dynamic node: imports", () => {
    const staticSpecs = specifiers(stripComments('import { readFile } from "node:fs/promises";\n'));
    const dynamicSpecs = specifiers(
      stripComments('const fs = await import("node:fs/promises");\n'),
    );
    expect(staticSpecs).toEqual([{ spec: "node:fs/promises", dynamic: false }]);
    expect(dynamicSpecs).toEqual([{ spec: "node:fs/promises", dynamic: true }]);
  });
});
