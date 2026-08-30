/**
 * lazy-route-loader.test.ts — regression guardrail for the /industries crash
 * (task 236a62be). The live /industries page crashed at runtime with:
 *   "h(...).then(...) is not a function"
 * and rendered only "Something went wrong / Reload Page".
 *
 * ROOT CAUSE: in src/routes/industries.index.tsx the loader was
 *   loader: () => import("~/lazy/industries.index.page").then(m => m.getPageData)(),
 * Due to operator precedence this is
 *   ( import(...).then(m => m.getPageData) )()
 * i.e. the trailing `()` invokes the PROMISE returned by `.then()`, not the
 * `getPageData` server fn → TypeError on a live route.
 *
 * FIX: call the server fn inside the .then callback:
 *   loader: () => import("~/lazy/industries.index.page").then(m => m.getPageData()),
 *
 * These assertions statically verify the pattern so a regression (a `)...()`-on-a-promise
 * loader) fails CI. It also asserts the route still lazy-loads its component so the
 * code-split behavior is preserved.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ROUTE = readFileSync("src/routes/industries.index.tsx", "utf8");

describe("lazy route /industries loader (h(...).then(...) crash guard)", () => {
  it("the loader calls getPageData() (not the .then() promise) for the lazy page", () => {
    // Correct pattern: `.then(m => m.getPageData())` — getPageData is invoked.
    expect(ROUTE).toContain(".then(m => m.getPageData())");
    // The BUGGY pattern calls the promise: `.then(m => m.getPageData)()` with no
    // invocation inside .then and a trailing call outside. Assert it is absent.
    expect(ROUTE).not.toMatch(/\.then\(m\s*=>\s*m\.getPageData\)\s*\(/);
  });

  it("still lazy-loads both the component and the server-fn data source", () => {
    expect(ROUTE).toContain('lazyRouteComponent(() => import("~/lazy/industries.index.page"))');
    expect(ROUTE).toContain('import("~/lazy/industries.index.page")');
  });

  it("the lazy page still exports getPageData as a server fn", () => {
    const page = readFileSync("src/lazy/industries.index.page.tsx", "utf8");
    expect(page).toMatch(/export const getPageData = createServerFn/);
  });
});
