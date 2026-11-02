/**
 * SLICE 171 — no portal navigation target may point at a URL that does not exist.
 *
 * THE DEFECT THIS PINS (Sweep B, D-B1). `/portal/invoices` rendered its
 * empty-state CTA as `action={{ label: "Open deal rooms", to: "/deal-rooms/" }}`.
 * `/deal-rooms` is not a page: the deal-rooms index lives UNDER the `/portal`
 * layout route, so the real URL is `/portal/deal-rooms`. Every brand-new
 * customer, on the money page, in the "no invoices yet" state, got a button that
 * 404'd — and it was on desktop too, not just mobile.
 *
 * WHY IT SURVIVED. `portal-empty-state.test.tsx` asserted the same wrong string,
 * so the bug was green. A test written from the bug can only ever confirm the
 * bug. This file is the structural guard that could not have been written from
 * one page's mistake: it walks every page and component, pulls out every literal
 * navigation target, and checks each one against the route tree.
 *
 * The count of targets checked is asserted, so the test cannot pass by finding
 * nothing (a refactor that renames `to=` to `destination=` would otherwise turn
 * this whole file into a no-op).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  matchesRoute,
  routePathSource,
  routePaths,
  routePathsFromFiles,
  routePathsFromGeneratedTree,
} from "./helpers/route-tree";

const REPO = process.cwd();

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

type Target = { file: string; line: number; kind: string; raw: string };

/**
 * Literal navigation targets in a source file.
 *
 *   to="/portal/x"                 JSX <Link to=…>
 *   to: "/portal/x"                object form — covers navigate({ to: … }) and
 *                                  PortalEmptyState's action={{ to: … }}
 *   href="/portal/x"               plain anchor
 *
 * Only absolute ("/…") literals are collected: relative router paths and
 * non-route hrefs (mailto:, #anchor, https://) are not route references and are
 * deliberately out of scope. Template literals (`to={`/x/${id}`}`) are dynamic
 * and are not collected either — they are covered by the $param wildcard below
 * only when written as a literal route path.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/\bto\s*=\s*"([^"]*)"/g, "to="],
  [/\bto\s*:\s*"([^"]*)"/g, "to:"],
  [/\bhref\s*=\s*"([^"]*)"/g, "href="],
];

function extractTargets(file: string, src: string): Target[] {
  const out: Target[] = [];
  for (const [re, kind] of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const raw = m[1];
      if (!raw.startsWith("/")) continue; // external / mailto / #anchor / relative
      if (raw.startsWith("//")) continue; // protocol-relative
      const before = src.slice(0, m.index);
      const line = before.split("\n").length;
      out.push({ file: file.replace(REPO + "/", ""), line, kind, raw });
    }
  }
  return out;
}

function collectAll(): { targets: Target[]; files: number } {
  const files: string[] = [];
  walk(join(REPO, "src/lazy"), files);
  walk(join(REPO, "src/routes"), files);
  const targets: Target[] = [];
  for (const f of files) targets.push(...extractTargets(f, readFileSync(f, "utf8")));
  return { targets, files: files.length };
}

describe("slice 171 — the route-path source is real", () => {
  it("resolves a non-trivial set of absolute URLs", () => {
    const routes = routePaths();
    expect(routes.size).toBeGreaterThan(50);
    expect(routes.has("/")).toBe(true);
    // The two facts the whole slice turns on.
    expect(routes.has("/portal/deal-rooms/")).toBe(true);
    expect(routes.has("/deal-rooms/")).toBe(false);
    expect(routes.has("/deal-rooms")).toBe(false);
  });

  it("agrees with the route files when the generated tree is present", () => {
    const generated = routePathsFromGeneratedTree();
    if (generated.size === 0) return; // never built in this checkout
    const fromFiles = routePathsFromFiles();
    expect(fromFiles.size).toBeGreaterThan(50);
    const missing = [...fromFiles].filter((p) => !generated.has(p) && !generated.has(p.replace(/\/$/, "")));
    expect(missing, `route files with no entry in FileRoutesByFullPath: ${missing.join(", ")}`).toEqual([]);
  });

  it("reports where the route set came from", () => {
    // eslint-disable-next-line no-console
    console.log(`[slice 171] route paths read from: ${routePathSource()} (${routePaths().size} paths)`);
    expect(["routeTree.gen.ts", "src/routes files"]).toContain(routePathSource());
  });
});

describe("slice 171 — every literal navigation target is a real route", () => {
  it("finds no dangling target across every portal page and component", () => {
    const routes = routePaths();
    const { targets, files } = collectAll();

    // eslint-disable-next-line no-console
    console.log(
      `[slice 171] checked ${targets.length} literal navigation targets across ${files} files ` +
        `against ${routes.size} route paths`,
    );

    // A parser that stopped matching would otherwise make this file a no-op.
    expect(files).toBeGreaterThan(100);
    expect(targets.length).toBeGreaterThan(100);

    const dangling = targets
      .filter((t) => !matchesRoute(t.raw, routes))
      .map((t) => `${t.file}:${t.line} ${t.kind}"${t.raw}"`);

    expect(dangling, `navigation targets that resolve to no route:\n${dangling.join("\n")}`).toEqual([]);
  });

  it("resolves dynamic segments ($param) instead of failing them", () => {
    const routes = routePaths();
    // Literal route paths with $params resolve to themselves…
    expect(matchesRoute("/portal/proposals/$proposalId", routes)).toBe(true);
    // …and a concrete id resolves through the same route.
    expect(matchesRoute("/portal/proposals/prop_abc123", routes)).toBe(true);
    expect(matchesRoute("/portal/integrations/stripe", routes)).toBe(true);
    // A path that only looks similar does not.
    expect(matchesRoute("/portal/proposals/prop_abc123/nope", routes)).toBe(false);
  });

  it("would have caught the /deal-rooms/ bug", () => {
    const routes = routePaths();
    expect(matchesRoute("/portal/deal-rooms", routes)).toBe(true);
    expect(matchesRoute("/deal-rooms/", routes)).toBe(false);
  });
});
