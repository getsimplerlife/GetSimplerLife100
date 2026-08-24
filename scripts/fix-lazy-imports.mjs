#!/usr/bin/env node
// Fix PR #196 regression: lazy pages lost their imports during the split.
// For each src/lazy/*.page.tsx, merge the imports that existed in the original
// (parent-commit) route file back in, minus the ones the new minimal route file
// handles (createFileRoute/lazyRouteComponent/pageHead), preserving any imports
// the page already has (e.g. corrected `~/routes/X` Route imports, aliased paths).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";

const P = "d3b3f2de1f11ee5ef8abf689f3e6205b828bbef7"; // parent of the split commit
const LAZY_DIR = join(process.cwd(), "src/lazy");

// ---- parsing helpers ----
// Extract all `import ... ;` statements (handles multiline braces).
function importStatements(src) {
  const out = [];
  const re = /import\s+(?:type\s+)?[\s\S]*?;/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[0]);
  return out;
}

// Normalize a module specifier to a canonical key.
function normMod(spec) {
  let p = spec.trim().replace(/['"]/g, "");
  if (p === "@tanstack/react-router") return "react-router";
  if (p === "react" ) return "react";
  if (p.startsWith("~/")) return p.slice(2);           // already aliased
  if (p.startsWith("./")) return "routes/" + p.slice(2); // old same-dir route import
  if (p.startsWith("../routes/")) return "routes/" + p.slice(10);
  if (p.startsWith("../")) return p.slice(3);          // ../content/X -> content/X
  return p;                                            // node_modules / react etc
}

// Parse one import statement -> { isTypeOnly, defaultName, names:[{name,type}], moduleKey, moduleSpec }
function parseImport(stmt) {
  const isTypeOnly = /^import\s+type\s/.test(stmt);
  let mod = stmt.replace(/^import\s+(?:type\s+)?/, "");
  // module is the last quoted string
  const fromMatch = mod.match(/from\s+["']([^"']+)["']\s*;?\s*$/);
  const sideMatch = mod.match(/^["']([^"']+)["']\s*;?\s*$/);
  let moduleSpec, body;
  if (fromMatch) { moduleSpec = fromMatch[1]; body = mod.slice(0, mod.indexOf("from")); }
  else if (sideMatch) { moduleSpec = sideMatch[1]; body = ""; }
  else { return null; }
  body = body.trim();
  let defaultName = "", names = [];
  const brace = body.match(/^\{\s*([\s\S]*?)\s*\}$/);
  if (brace) {
    names = brace[1].split(",").map(s => s.trim()).filter(Boolean).map(n => {
      const t = n.startsWith("type ");
      return { name: t ? n.slice(5).trim() : n, type: t };
    });
  } else if (body) {
    defaultName = body.split(/\s+/)[0];
  }
  return { isTypeOnly, defaultName, names, moduleKey: normMod(moduleSpec), moduleSpec };
}

// Build an import statement string from parsed parts.
function buildImport({ defaultName, names, moduleKey }) {
  let inner = "";
  if (defaultName) inner += defaultName;
  if (names.length) {
    const parts = names.map(n => (n.type ? "type " : "") + n.name);
    if (inner) inner += ", { " + parts.join(", ") + " }";
    else inner += "{ " + parts.join(", ") + " }";
  }
  const SRC_DIRS = ["routes","content","components","lib","db","tools","agents","api",
    "data","engine","integrations","monitoring","orchestration","server","styles","test","verification"];
  const spec = moduleKey === "react-router" ? "@tanstack/react-router"
    : moduleKey === "react" ? "react"
    : SRC_DIRS.some(d => moduleKey === d || moduleKey.startsWith(d + "/"))
    ? "~/" + moduleKey
    : moduleKey;
  return `import ${inner} from "${spec}";`;
}

// ---- main ----
let fixed = 0, unchanged = 0;
for (const f of readdirSync(LAZY_DIR).filter(x => x.endsWith(".page.tsx"))) {
  const base = f.replace(/\.page\.tsx$/, "");
  const pagePath = join(LAZY_DIR, f);
  const pageSrc = readFileSync(pagePath, "utf8");

  let parentSrc;
  try {
    parentSrc = execFileSync("git", ["show", `${P}:src/routes/${base}.tsx`], { encoding: "utf8" });
  } catch {
    console.log(`SKIP (no parent) ${base}`);
    continue;
  }

  const parentImports = importStatements(parentSrc);
  const pageImports = importStatements(pageSrc);

  // index of page imports by name within module
  const pageHas = new Map(); // moduleKey -> Set(names)
  for (const st of pageImports) {
    const pi = parseImport(st);
    if (!pi) continue;
    if (!pageHas.has(pi.moduleKey)) pageHas.set(pi.moduleKey, new Set());
    for (const n of pi.names) pageHas.get(pi.moduleKey).add(n.name);
    if (pi.defaultName) pageHas.get(pi.moduleKey).add(pi.defaultName);
  }

  // Build missing import lines.
  const toAdd = [];
  for (const st of parentImports) {
    const pi = parseImport(st);
    if (!pi) continue;
    // skip what the new route file now owns
    if (pi.moduleSpec.includes("@tanstack/react-router") ||
        pi.moduleSpec === "@tanstack/react-router") {
      // handled below; we filter names createFileRoute/lazyRouteComponent
    }
    if (pi.moduleSpec === "~/lib/site-meta" && pi.names.some(n => n.name === "pageHead")) {
      continue; // pageHead now lives in the route file
    }
    if (pi.isTypeOnly) {
      // type-only import: only add if module not already present with same names
      const have = pageHas.get(pi.moduleKey) || new Set();
      const missing = pi.names.filter(n => !have.has(n.name));
      if (missing.length === 0) continue;
      toAdd.push(buildImport({ defaultName: "", names: missing, moduleKey: pi.moduleKey }));
      for (const n of missing) have.add(n.name);
      pageHas.set(pi.moduleKey, have);
      continue;
    }
    if (pi.moduleSpec === "@tanstack/react-router") {
      const have = pageHas.get("react-router") || new Set();
      const missing = pi.names
        .filter(n => n.name !== "createFileRoute" && n.name !== "lazyRouteComponent")
        .filter(n => !have.has(n.name));
      if (missing.length === 0) continue;
      toAdd.push(buildImport({ defaultName: "", names: missing, moduleKey: "react-router" }));
      for (const n of missing) have.add(n.name);
      pageHas.set("react-router", have);
      continue;
    }
    if (pi.moduleSpec === "react") {
      const have = pageHas.get("react") || new Set();
      const missing = pi.names.filter(n => !have.has(n.name));
      if (missing.length === 0) continue;
      toAdd.push(buildImport({ defaultName: "", names: missing, moduleKey: "react" }));
      for (const n of missing) have.add(n.name);
      pageHas.set("react", have);
      continue;
    }
    // generic named/default import from real module
    const have = pageHas.get(pi.moduleKey) || new Set();
    const missing = pi.names.filter(n => !have.has(n.name));
    const needDefault = pi.defaultName && !have.has(pi.defaultName);
    if (missing.length === 0 && !needDefault) continue;
    toAdd.push(buildImport({
      defaultName: needDefault ? pi.defaultName : "",
      names: missing,
      moduleKey: pi.moduleKey,
    }));
    for (const n of missing) have.add(n.name);
    if (needDefault) have.add(pi.defaultName);
    pageHas.set(pi.moduleKey, have);
  }

  if (toAdd.length === 0) {
    unchanged++;
    continue;
  }

  // Insert new imports after the last existing import line (or at top).
  let insertAt = 0;
  if (pageImports.length) {
    const lastIdx = pageSrc.lastIndexOf(pageImports[pageImports.length - 1]);
    insertAt = lastIdx + pageImports[pageImports.length - 1].length;
  }
  const block = "\n" + toAdd.join("\n");
  const newSrc = pageSrc.slice(0, insertAt) + block + pageSrc.slice(insertAt);
  writeFileSync(pagePath, newSrc);
  console.log(`FIXED ${base} (+${toAdd.length} import lines)`);
  fixed++;
}
console.log(`\nDone: fixed=${fixed} unchanged=${unchanged}`);
