/**
 * homepage-157-option-b.test.tsx — the rebuild is measured, not asserted by eye.
 *
 * WHY THIS FILE EXISTS: on the 156th publish the homepage was 8,809 px tall,
 * the header carried eight items and two competing CTAs, and the stuck header
 * covered the headings it jumped to. None of that was caught by a test, because
 * the homepage had no test that looked at the page as a page.
 *
 * WHAT THIS FILE PROVES (the five the brief requires, plus the two copy rules
 * the owner cares most about):
 *   1. The nav is at most six primary items and exactly one primary CTA.
 *   2. EVERY link rendered on the homepage resolves to a route the router
 *      declares — read from the router's own tree via `route-table.ts` (slice
 *      156), never a hand-copied list, so the 404 work cannot regress quietly
 *      while the header is being rearranged.
 *   3. The capability tabs really swap visible content when clicked (mounted,
 *      not inspected).
 *   4. The only prices on the page are the three locked ones, and no statistic
 *      of any shape appears.
 *   5. The product panel is a real screenshot file under `public/` — real PNG
 *      magic bytes, non-trivial size, real pixel dimensions, and the `<img>` on
 *      the page declares those exact dimensions (no invented aspect ratio).
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadDeclaredRoutePaths } from "~/lib/route-table";
import { compileRoutePatterns, matchesDeclaredRoute } from "~/lib/route-match";
import { CAPABILITY_TABS, CapabilityTabs } from "~/components/CapabilityTabs";

const REPO = process.cwd();
const ASSET_URL = "/product/portal-quote-to-cash.png";
const ASSET_FILE = join(REPO, "public", "product", "portal-quote-to-cash.png");
const ASSET_STALE_DAYS = 45;

/** The three locked Stripe checkout links (owner 09-27). Nothing else may be linked. */
const CANONICAL_CHECKOUT = [
  "https://buy.stripe.com/eVqbJ0aD29JA3bx6R75os03",
  "https://buy.stripe.com/bJe3cubH6f3U3bxdfv5os04",
  "https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02",
];

let doc: Document;
let pageHtml: string;
let routePatterns: RegExp[];

beforeAll(async () => {
  const { renderPage } = await import("~/entry-server");
  const result = await renderPage("/");
  pageHtml = result.html;
  doc = new DOMParser().parseFromString(pageHtml, "text/html");
  routePatterns = compileRoutePatterns(await loadDeclaredRoutePaths());
}, 180_000);

afterEach(() => {
  cleanup();
});

/** The page's visible words, whitespace-collapsed. */
function pageText(): string {
  return (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
}

// ── 1. The nav is six items with one CTA ──────────────────────────────────
describe("157 — the header carries six primary items and ONE primary CTA", () => {
  it("renders five primary nav destinations plus one CTA, not eight items and three CTA-ish links", () => {
    const navItems = Array.from(doc.querySelectorAll("[data-nav-item]"));
    const navCtas = Array.from(doc.querySelectorAll('[data-cta="nav-primary"]'));
    expect(navItems.length, "five primary destinations").toBe(5);
    expect(navCtas.length, "exactly one CTA in the nav").toBe(1);
    expect(navItems.length + navCtas.length).toBeLessThanOrEqual(6);
  });

  it("has exactly one primary CTA in the page body, and it is the same action as the nav one", () => {
    const bodyCtas = Array.from(doc.querySelectorAll('[data-cta="primary"]'));
    expect(bodyCtas.length, "one primary CTA in the body").toBe(1);

    const allCtas = Array.from(doc.querySelectorAll("[data-cta]"));
    const destinations = new Set(allCtas.map((el) => el.getAttribute("href")));
    const labels = new Set(allCtas.map((el) => (el.textContent || "").trim()));
    // Two placements, one action: any second, different call to action on this
    // page would show up here as a second destination.
    expect(Array.from(destinations)).toEqual(["/register"]);
    expect(Array.from(labels)).toEqual(["Get started"]);
  });

  it("no longer competes with itself: the retired header links are gone from the nav", () => {
    const nav = doc.querySelector('nav[aria-label="Main navigation"]');
    expect(nav).toBeTruthy();
    const navText = (nav!.textContent || "").replace(/\s+/g, " ");
    for (const retired of ["Schedule Demo", "Register"]) {
      expect(navText, `nav must not carry a competing "${retired}" link`).not.toContain(retired);
    }
    // A quiet sign-in destination is not a CTA, but it must still exist.
    expect(doc.querySelector('[data-nav-utility]')?.getAttribute("href")).toBe("/login");
  });
});

// ── 2. Every link on the page resolves — table-driven off the router ──────
describe("157 — every link on the rebuilt homepage resolves to a declared route", () => {
  it("reads a real route table (the guard must not pass vacuously)", () => {
    expect(routePatterns.length).toBeGreaterThan(50);
    expect(matchesDeclaredRoute("/pricing", routePatterns)).toBe(true);
    expect(matchesDeclaredRoute("/definitely-not-a-page-xyz-157", routePatterns)).toBe(false);
  });

  it("every href on the page is a declared route, an in-page anchor that exists, or a checkout link", () => {
    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    // A page this size always has dozens of links; a count of zero means the
    // server render changed shape and the assertion below would prove nothing.
    expect(anchors.length).toBeGreaterThan(25);

    const ids = new Set(Array.from(doc.querySelectorAll("[id]")).map((el) => el.id));
    const problems: string[] = [];

    for (const anchor of anchors) {
      const href = (anchor.getAttribute("href") || "").trim();
      if (href === "") {
        problems.push('an anchor has an empty href');
        continue;
      }
      if (href.startsWith("#")) {
        const id = decodeURIComponent(href.slice(1));
        if (!ids.has(id)) problems.push(`in-page link "${href}" points at no element on the page`);
        continue;
      }
      if (/^(mailto:|tel:)/i.test(href)) continue;
      if (/^https?:/i.test(href)) {
        if (!CANONICAL_CHECKOUT.includes(href)) {
          problems.push(`external link "${href}" is not one of the three locked checkout links`);
        }
        continue;
      }
      const path = href.split("?")[0].split("#")[0];
      if (!matchesDeclaredRoute(path, routePatterns)) {
        problems.push(`"${href}" (${path}) matches no route the router declares`);
      }
    }

    expect(problems).toEqual([]);
    // The pricing links really are on the page — this is the "reachable
    // without a long scroll" requirement, kept honest by the band's position.
    const checkoutLinks = anchors.filter((a) => CANONICAL_CHECKOUT.includes(a.getAttribute("href") || ""));
    expect(checkoutLinks.map((a) => a.getAttribute("href"))).toEqual(CANONICAL_CHECKOUT);
    // The header nav items are among the links checked above, not skipped.
    expect(doc.querySelector('[data-nav-item="pricing"]')?.getAttribute("href")).toBe("/pricing");
  });

  it("puts the price band before the capabilities section (pricing is not below the fold any more)", () => {
    const ids = Array.from(doc.querySelectorAll("[id]")).map((el) => el.id);
    const pricingAt = ids.indexOf("pricing");
    const capabilitiesAt = ids.indexOf("capabilities");
    expect(pricingAt).toBeGreaterThan(-1);
    expect(capabilitiesAt).toBeGreaterThan(-1);
    expect(pricingAt).toBeLessThan(capabilitiesAt);
    // …and the hero offers an in-page jump to it.
    expect(doc.querySelector('a[href="#pricing"]')).toBeTruthy();
  });
});

// ── 3. The tabs actually swap content ─────────────────────────────────────
describe("157 — the capability tabs swap visible content in place", () => {
  it("renders a tablist with the four capabilities on the real page", () => {
    const tablist = doc.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => (t.textContent || "").trim())).toEqual([
      "Proposals",
      "Approvals",
      "Invoicing",
      "Payments",
    ]);
    // Exactly one panel is exposed at a time, so nothing is duplicated below.
    expect(doc.querySelectorAll('[role="tabpanel"]').length).toBe(1);
  });

  it("clicking each tab replaces the panel's text with that tab's own copy", () => {
    render(<CapabilityTabs />);
    const seen = new Set<string>();

    for (const tab of CAPABILITY_TABS) {
      const button = screen.getByRole("tab", { name: tab.label });
      fireEvent.click(button);

      const panel = screen.getByRole("tabpanel");
      expect(panel.getAttribute("data-tab-panel")).toBe(tab.id);
      expect(panel.textContent).toContain(tab.headline);
      expect(button.getAttribute("aria-selected")).toBe("true");
      // No dead tab: the selected tab is the only one selected.
      const selected = screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
      expect(selected.length).toBe(1);
      seen.add((panel.textContent || "").trim());
    }

    // Four tabs, four different bodies of text.
    expect(seen.size).toBe(CAPABILITY_TABS.length);
  });
});

// ── 4. Only the locked prices, and no invented statistics ─────────────────
describe("157 — the page states the three locked prices and invents no numbers", () => {
  it("shows exactly $199/mo, $599/mo and $1,499/mo — and no fourth price anywhere", () => {
    const text = pageText();
    const prices = Array.from(new Set(text.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || []));
    expect(prices.sort()).toEqual(["$1,499", "$199", "$599"]);
    for (const price of ["$199/mo", "$599/mo", "$1,499/mo"]) {
      expect(text, `missing the locked price ${price}`).toContain(price);
    }
    expect(text).toMatch(/no setup fee/i);
  });

  it("carries no percentage and no time-saved claim (owner rule: no fabricated stats)", () => {
    const text = pageText();
    expect(text).not.toMatch(/\d\s?%/);
    expect(text).not.toMatch(/\bpercent\b|per cent/i);
    // The shapes a fake ROI claim takes on a marketing page.
    expect(text).not.toMatch(/\bsave\s+\d/i);
    expect(text).not.toMatch(/\d+\s?(hours?|hrs?|minutes?|x)\s+(per|a|each)\s+(week|month|day)/i);
    expect(text).not.toMatch(/\b\d+(\.\d+)?x\s+(faster|more|less)/i);
  });
});

// ── 5. The product panel is a real screenshot ─────────────────────────────
describe("157 — the product panel is a real screenshot of our own portal", () => {
  it("exists under public/, is a real PNG, and is big enough to be a screenshot", () => {
    expect(existsSync(ASSET_FILE), `${ASSET_FILE} must exist`).toBe(true);
    const bytes = readFileSync(ASSET_FILE);
    expect(bytes.length).toBeGreaterThan(20_000);
    // Real PNG magic: a placeholder or a renamed text file fails here.
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
    const mtimeAgeDays = (Date.now() - statSync(ASSET_FILE).mtimeMs) / 86_400_000;
    expect(mtimeAgeDays).toBeLessThan(ASSET_STALE_DAYS);
  });

  it("is referenced by the page at the exact pixel size the file actually has", () => {
    const bytes = readFileSync(ASSET_FILE);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    expect(width).toBeGreaterThanOrEqual(800);
    expect(height).toBeGreaterThanOrEqual(500);
    // The hero panel is roughly 3:2; a squashed or stretched asset would show up here.
    expect(width / height).toBeGreaterThan(1.3);
    expect(width / height).toBeLessThan(1.9);

    const img = doc.querySelector(`img[src="${ASSET_URL}"]`);
    expect(img, `the page must render ${ASSET_URL}`).toBeTruthy();
    expect(img!.getAttribute("width")).toBe(String(width));
    expect(img!.getAttribute("height")).toBe(String(height));
    // A panel with no honest description is not a claim we can stand behind.
    const alt = (img!.getAttribute("alt") || "").toLowerCase();
    expect(alt.length).toBeGreaterThan(40);
    expect(alt).toContain("portal");
    expect(alt).toMatch(/demo|illustrative/);
  });
});
