/**
 * SLICE 171 — the mobile portal's controls stay tappable.
 *
 * Sweep B measured all eight quote-to-cash pages at a real 390 px viewport. The
 * worst offender was the one that mattered most: the MENU trigger — the only
 * way to reach any other page on a phone — was 20 px tall, and the back links,
 * empty-state CTAs, `Remove` buttons and the form-field checkbox were 13–20 px.
 *
 * The fix is one shared primitive, `.tap-target` (44 × 44 CSS px — WCAG 2.5.5 /
 * Apple HIG), applied at each measured control so the hit area grows without
 * growing the glyph. This file pins the primitive and its call sites: a
 * className that drifts back to `p-1` fails here instead of on someone's phone.
 *
 * Geometry itself (real 44 px boxes at 390 px) is verified in the browser; this
 * is the static half, which is what can run in CI.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

describe("slice 171 — tap-target primitive", () => {
  it("is defined once, in the global stylesheet, at 44 px", () => {
    const css = read("src/styles/app.css");
    const blocks = css.match(/@utility tap-target\s*\{[^}]*\}/g) ?? [];
    expect(blocks, "the .tap-target utility must exist exactly once").toHaveLength(1);
    expect(blocks[0]).toContain("min-width: 44px");
    expect(blocks[0]).toContain("min-height: 44px");
    // A hit area only grows if the box is a flex container — inline elements
    // ignore min-height.
    expect(blocks[0]).toContain("display: inline-flex");
  });

  it("covers the mobile MENU trigger — the only way off the page on a phone", () => {
    const src = read("src/lazy/portal.page.tsx");
    const menu = src.slice(src.indexOf("aria-label=\"Toggle navigation menu\"") - 400);
    const button = menu.slice(menu.indexOf("<button"), menu.indexOf("aria-label=\"Toggle navigation menu\""));
    expect(button).toContain("tap-target");
    // The old 20 px recipe must be gone.
    expect(button).not.toContain("flex items-center gap-1.5");
  });

  it("covers the mobile header icons (search, notifications)", () => {
    const src = read("src/lazy/portal.page.tsx");
    for (const label of ["Search workspace", "Notifications"]) {
      const i = src.indexOf(`aria-label="${label}"`);
      expect(i, `${label} control not found`).toBeGreaterThan(0);
      const before = src.slice(Math.max(0, i - 400), i);
      expect(before, `${label} is not a tap-target`).toContain("tap-target");
    }
  });

  it("covers the empty-state CTA used by every portal page", () => {
    const src = read("src/components/PortalEmptyState.tsx");
    expect(src).toContain("tap-target");
    expect(src).not.toContain('"inline-block mt-3');
  });

  it("covers the back links, the Remove buttons and the field checkbox", () => {
    const files = [
      "src/lazy/portal.proposals.$proposalId.page.tsx", // ← Back to proposals (16 px)
      "src/lazy/portal.$auditId.page.tsx", // ← Back to Dashboard
      "src/lazy/portal.integrations.$id.page.tsx", // ← Back to the catalog
      "src/lazy/portal.workflows.builder.page.tsx", // ← Back to Registry
      "src/lazy/portal.forms.index.page.tsx", // Remove + checkbox
      "src/lazy/portal.tables.index.page.tsx", // Remove + checkbox
      "src/lazy/portal.admin.credentials.page.tsx", // Remove
      "src/lazy/portal.admin.workflow-builder.page.tsx", // Remove
    ];
    const missing = files.filter((f) => !read(f).includes("tap-target"));
    expect(missing, `controls still below 44 px in: ${missing.join(", ")}`).toEqual([]);
  });

  it("grows the hit area, not the glyph — no font-size was bumped", () => {
    // The visible type sizes at these controls are unchanged; only the box grew.
    const src = read("src/components/PortalEmptyState.tsx");
    expect(src).toContain("text-sm"); // CTA label size preserved
    expect(src).toContain("tap-target");
  });
});
