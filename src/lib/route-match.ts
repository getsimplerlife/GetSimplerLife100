/**
 * SLICE 156 — route-table matching for the SPA fallback.
 *
 * WHY THIS FILE EXISTS: the server used to answer **200** for every path it had
 * no handler for, including paths that match no route at all. A mistyped link
 * looked like a working page, search engines could index junk URLs, and no
 * broken link anywhere ever reported a problem to us. The API namespace already
 * told the truth (404 JSON); the page side did not.
 *
 * THE DECISION MUST COME FROM THE ROUTE TABLE, NOT FROM THE FILESYSTEM. Several
 * routes are rendered client-side and have no file of their own, and a route's
 * file name is not its URL (index routes, pathless layouts, `$param` segments).
 * So the matcher consumes the paths the router itself declares
 * (`router.routesByPath`, loaded in `route-table.ts`) and answers one question:
 * does any declared route match this pathname?
 *
 * The matching rules mirror the router's own defaults, deliberately:
 *   - `$param` matches exactly one non-empty segment (`$` alone matches the rest);
 *   - matching is case-insensitive (TanStack Router's default);
 *   - a single trailing slash is ignored (`/pricing/` is `/pricing`).
 *
 * Pure functions only — no imports, no I/O — so the tests can drive them
 * directly and the server can cache the compiled result.
 */

/** Collapse a pathname to the form the router matches against. */
export function normalizeRoutePath(pathname: string): string {
  let path = (pathname || "/").split("?")[0].split("#")[0];
  if (!path.startsWith("/")) path = "/" + path;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (!path) path = "/";
  return path.toLowerCase();
}

/** Escape everything regex-special in a literal path segment. */
function escapeSegment(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile one declared route path into an anchored regex.
 * `/portal/integrations/$id` → /^\/portal\/integrations\/[^/]+$/
 */
export function compileRoutePattern(declaredPath: string): RegExp {
  const normalized = normalizeRoutePath(declaredPath);
  const source = normalized
    .split("/")
    .map((segment) => {
      if (segment === "") return "";
      if (segment === "$") return ".*"; // splat route — matches the rest of the path
      if (segment.startsWith("$")) return "[^/]+"; // $param — exactly one segment
      return escapeSegment(segment);
    })
    .join("/");
  return new RegExp("^" + (source || "/") + "$");
}

/** Compile every declared path once; the server caches the result. */
export function compileRoutePatterns(declaredPaths: readonly string[]): RegExp[] {
  const patterns: RegExp[] = [];
  for (const declared of declaredPaths) {
    if (typeof declared !== "string" || declared.length === 0) continue;
    patterns.push(compileRoutePattern(declared));
  }
  return patterns;
}

/** True when at least one declared route matches this pathname. */
export function matchesDeclaredRoute(pathname: string, patterns: readonly RegExp[]): boolean {
  const normalized = normalizeRoutePath(pathname);
  for (const pattern of patterns) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

/**
 * True when the pathname looks like a static file request rather than a page.
 * A missing file must answer 404 too — but with a plain body, never the HTML
 * shell (a browser asking for a script must not be handed a document).
 */
export function looksLikeStaticFile(pathname: string): boolean {
  const last = (pathname || "").split("/").pop() || "";
  return /\.[A-Za-z0-9]{1,8}$/.test(last);
}
