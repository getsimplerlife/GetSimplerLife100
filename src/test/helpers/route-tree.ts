/**
 * Route-path helper — the single source of truth for "does this URL exist?".
 *
 * WHY THIS EXISTS (slice 171). Sweep B found `/portal/invoices` rendering its
 * empty-state CTA as `to: "/deal-rooms/"`, which 404s. The deal-rooms page is a
 * CHILD of the `/portal` layout route, so its real URL is `/portal/deal-rooms`;
 * the generated tree carries `path: '/deal-rooms/'` *relative to its parent*,
 * which is why a naive grep of `routeTree.gen.ts` still "found" the bad path.
 *
 * So we read `FileRoutesByFullPath` — the only block in the generated tree that
 * holds composed, absolute URLs — and never the per-route `path:` literals.
 *
 * `routeTree.gen.ts` is gitignored and produced by the build, so a checkout that
 * has never been built has no tree to read. In that case we fall back to the
 * route FILES, whose names are the input TanStack derives those URLs from. Both
 * sources are asserted non-empty by the tests that use this helper, so a broken
 * parser fails loudly instead of silently matching nothing.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();

/** Absolute URLs from the generated tree's `FileRoutesByFullPath` block. */
export function routePathsFromGeneratedTree(): Set<string> {
  const file = join(REPO, "src/routeTree.gen.ts");
  const out = new Set<string>();
  if (!existsSync(file)) return out;
  const src = readFileSync(file, "utf8");
  const start = src.indexOf("export interface FileRoutesByFullPath {");
  if (start < 0) return out;
  const end = src.indexOf("\n}", start);
  if (end < 0) return out;
  const block = src.slice(start, end);
  const re = /^\s*'(\/[^']*)':/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.add(m[1]);
  return out;
}

/** The URL a flat TanStack route file name maps to, or null if it is not a route. */
export function pathFromRouteFile(fileName: string, source: string): string | null {
  const base = fileName.replace(/\.(tsx?|jsx?)$/, "");
  // __root.tsx is the root LAYOUT (createRootRoute), not a URL.
  if (base === "__root") return null;
  // Files under src/routes that are not routes (e.g. portal.context.tsx, a
  // plain module that happens to live there) never call createFileRoute.
  if (!source.includes("createFileRoute(")) return null;
  const segs = base.split(".");
  const last = segs[segs.length - 1];
  const parent = last === "index" ? segs.slice(0, -1) : segs;
  if (parent.length === 0) return "/";
  return "/" + parent.join("/") + (last === "index" ? "/" : "");
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e)) out.push(p);
  }
}

/** Absolute URLs derived from the files under `src/routes`. */
export function routePathsFromFiles(): Set<string> {
  const files: string[] = [];
  walk(join(REPO, "src/routes"), files);
  const out = new Set<string>();
  for (const f of files) {
    const p = pathFromRouteFile(f.split("/").pop() as string, readFileSync(f, "utf8"));
    if (p) out.add(p);
  }
  return out;
}

/**
 * Every absolute URL the router can actually serve.
 * Generated tree when the project has been built, route files otherwise.
 */
export function routePaths(): Set<string> {
  const generated = routePathsFromGeneratedTree();
  return generated.size > 0 ? generated : routePathsFromFiles();
}

/** Which source `routePaths()` used — reported by the tests. */
export function routePathSource(): "routeTree.gen.ts" | "src/routes files" {
  return routePathsFromGeneratedTree().size > 0 ? "routeTree.gen.ts" : "src/routes files";
}

function normalize(target: string): string {
  let t = target.split("#")[0].split("?")[0];
  if (t.length > 1 && t.endsWith("/")) t = t.slice(0, -1);
  return t;
}

/** True when `target` is served by one of `routes` ($param segments are wildcards). */
export function matchesRoute(target: string, routes: Set<string>): boolean {
  const t = normalize(target);
  if (routes.has(t) || routes.has(t + "/")) return true;
  const tSegs = t.split("/");
  for (const r of routes) {
    const rSegs = normalize(r).split("/");
    if (rSegs.length !== tSegs.length) continue;
    let ok = true;
    for (let i = 0; i < rSegs.length; i++) {
      const rs = rSegs[i];
      if (rs.startsWith("$")) continue; // dynamic segment — any value matches
      if (rs !== tSegs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}
