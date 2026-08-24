// Split a component-only TanStack Router route into a minimal route file +
// a lazy page file, using lazyRouteComponent. Used for component-only routes:
// the route file keeps createFileRoute (+head, + pageHead import), the heavy
// component + helpers move to <base>.page.tsx (default export).
//
// Usage: node scripts/split-route.mjs <routeFile.tsx>
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/split-route.mjs <file.tsx>");
  process.exit(1);
}
const dir = dirname(file);
const base = basename(file, ".tsx");
const pageFile = join(dir, base + ".page.tsx");

let content = readFileSync(file, "utf8");

// Locate the Route const statement.
const routeMarker = "export const Route = createFileRoute(";
const rStart = content.indexOf(routeMarker);
if (rStart === -1) {
  console.error("SKIP (no createFileRoute): " + file);
  process.exit(0);
}
// find the '{' of the options object that follows createFileRoute("PATH")(
const parenIdx = content.indexOf("(", routeMarker.length + rStart);
const openBrace = content.indexOf("{", parenIdx);
// brace match to find the closing '}' of the options object
let depth = 0;
let closeBrace = -1;
for (let i = openBrace; i < content.length; i++) {
  const ch = content[i];
  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth === 0) {
      closeBrace = i;
      break;
    }
  }
}
if (closeBrace === -1) {
  console.error("FAIL route object close not found: " + file);
  process.exit(1);
}
// statement ends at the ');' after closeBrace
let stmtEnd = closeBrace + 1;
if (content.slice(stmtEnd, stmtEnd + 2) === ");") stmtEnd += 2;
const routeStmt = content.slice(rStart, stmtEnd);

// extract component identifier
const compMatch = routeStmt.match(/component:\s*([A-Za-z_$][\w$]*)/);
if (!compMatch || compMatch[1].startsWith("(")) {
  console.error("SKIP (no identifier component in " + file + "): " + routeStmt.replace(/\s+/g, " ").slice(0, 120));
  process.exit(0);
}
const compName = compMatch[1];
// Refuse to re-split an already-lazy route file (idempotency guard).
if (compName === "lazyRouteComponent") {
  console.error("SKIP (already lazy) " + file);
  process.exit(0);
}

// route path string
const pathMatch = routeStmt.match(/createFileRoute\(\s*["']([^"']+)["']/);
const path = pathMatch ? pathMatch[1] : "";
// head present?
const hasHead = /head:\s*\(\)\s*=>/.test(routeStmt);
// any other option lines we must keep (loader:, beforeLoad:, validateSearch:, etc.)
const otherOpts = routeStmt
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /^(loader|beforeLoad|validateSearch|wrapInSuspense|errorComponent|notFoundComponent|pendingComponent|shouldReload|preSearchFilters|postSearchFilters|headers|pathless|id)\s*:/.test(l));
if (otherOpts.length > 0) {
  console.error("SKIP (has extra route options in " + file + "): " + otherOpts.join(" | "));
  process.exit(0);
}

// ---- Build the page file ----
let pageBody = content.slice(0, rStart) + content.slice(stmtEnd);
// remove an unused createFileRoute binding from react-router import
pageBody = pageBody.replace(
  /import\s*\{\s*createFileRoute\s*,\s*/,
  "import { "
);
pageBody = pageBody.replace(
  /import\s*\{\s*createFileRoute\s*\}\s*from\s*["']@tanstack\/react-router["'];\s*\n?/,
  ""
);
// drop pageHead import if the page body does not reference pageHead
if (!/pageHead/.test(pageBody.split("\nexport default")[0].replace(/import[\s\S]*?pageHead[\s\S]*?\n/, ""))) {
  // only strip if body (non-imports) doesn't use pageHead
  const withoutImports = pageBody.replace(/import[\s\S]*?from\s*["'][^"']+["'];\s*\n?/g, "");
  if (!/pageHead/.test(withoutImports)) {
    pageBody = pageBody.replace(/import[\s\S]*?pageHead[\s\S]*?from\s*["'][^"']+["'];\s*\n?/, "");
  }
}
// ensure default export
if (!/export\s+default\s+/.test(pageBody)) {
  pageBody = pageBody.replace(/\s*$/, "\n\nexport default " + compName + ";\n");
}
writeFileSync(pageFile, pageBody);

// ---- Build the route file ----
const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
let routeFile =
  'import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";' + lineEnding;
if (hasHead) {
  routeFile += 'import { pageHead } from "~/lib/site-meta";' + lineEnding;
}
routeFile += lineEnding;
routeFile +=
  'export const Route = createFileRoute("' + path + '")({' + lineEnding;
if (hasHead) {
  routeFile += '  head: () => pageHead("' + path + '"),' + lineEnding;
}
routeFile += '  component: lazyRouteComponent(() => import("./' + base + '.page")),' + lineEnding;
routeFile += "});" + lineEnding;

writeFileSync(file, routeFile);

// report
const pageSize = Buffer.byteLength(pageBody, "utf8");
console.log(
  `SPLIT ${base}: path=${path} comp=${compName} head=${hasHead} page=${pageSize}B`
);
