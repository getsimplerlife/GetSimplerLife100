/**
 * automation-sprint-retirement.test.ts — OWNER 10-21 regression guardrail.
 * The $2,500 Automation Sprint / "Industry Blueprint Assessment" / "Deep-Dive AI
 * Opportunity Audit" one-time SKU is RETIRED (plan rev 381): the free assessment
 * is the single low-risk entry and the three locked platform tiers are the ONLY
 * SKUs. This test fails loudly if any retired SKU surface (product name, price,
 * legacy Stripe link, or Connection-Pack language) reappears in a user-facing
 * source file, if any link still targets the deleted /audit or
 * /demos/audit-portal routes, or if the free assessment entry points disappear.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const USER_DIRS = ["src/routes", "src/lazy", "src/components"];
// Case-insensitive product/phrase surface (lowercased here).
const BANNED = [
  "automation sprint",
  "industry blueprint",
  "deep-dive ai opportunity audit",
  "deep-dive audit",
  "14abj",
  "connection pack",
];
const RETIRED_PRICES = ["$2,500", "$2,000", "$3,500", "$99+/mo"];
const TIER_LINKS = [
  "buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00",
  "buy.stripe.com/fZubJ0h1qbRI5jFcbr5os01",
  "buy.stripe.com/fZu28qfXmaNEdQb2AR5os02",
];

function userFiles(): string[] {
  const out: string[] = [];
  for (const d of USER_DIRS) {
    const abs = join(process.cwd(), d);
    for (const f of readdirSync(abs)) {
      if (/\.(ts|tsx)$/.test(f) && statSync(join(abs, f)).isFile() && !f.includes(".test.")) {
        out.push(join(d, f));
      }
    }
  }
  return out;
}

describe("Automation Sprint / paid-audit retirement (owner 10-21)", () => {
  it("no retired SKU phrase appears in any user-facing source file (case-insensitive)", () => {
    for (const file of userFiles()) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const b of BANNED) {
        expect(text, `${file} must not contain "${b}"`).not.toContain(b);
      }
    }
  });
  it("no retired price literals appear in the user-facing surface", () => {
    for (const file of userFiles()) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const p of RETIRED_PRICES) {
        expect(text, `${file} must not contain "${p}"`).not.toContain(p);
      }
    }
  });
  it("every buy.stripe.com link in the user-facing surface is one of the three tier links", () => {
    for (const file of userFiles()) {
      const text = readFileSync(file, "utf8").toLowerCase();
      const links = [...text.matchAll(/buy\.stripe\.com\/[a-z0-9]+/g)].map((m) => m[0]);
      for (const l of links) {
        expect(TIER_LINKS, `${file} contains non-tier buy link ${l}`).toContain(l);
      }
    }
  });
  it("no link targets the deleted /audit or /demos/audit-portal routes", () => {
    for (const file of userFiles()) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must not link the retired /audit route`).not.toContain(`to="/audit"`);
      expect(text, `${file} must not link the retired demo route`).not.toContain(`to="/demos/audit-portal"`);
      expect(text, `${file} must not mention the legacy audit link`).not.toContain("4gMfZ");
    }
  });
  it("the deleted routes/pages no longer exist as files", () => {
    for (const f of [
      "src/routes/audit.tsx",
      "src/lazy/audit.page.tsx",
      "src/routes/demos.audit-portal.tsx",
      "src/lazy/demos.audit-portal.page.tsx",
    ]) {
      expect(existsSync(f), `${f} should have been deleted`).toBe(false);
    }
  });
  it("free assessment entry points stay live and stay free", () => {
    expect(existsSync("src/routes/assessment.tsx")).toBe(true);
    expect(existsSync("src/lazy/assessment.page.tsx")).toBe(true);
    expect(existsSync("src/lazy/tools.assessment.page.tsx")).toBe(true);
    for (const f of ["src/lazy/assessment.page.tsx", "src/lazy/tools.assessment.page.tsx"]) {
      const t = readFileSync(f, "utf8").toLowerCase();
      expect(t).not.toContain("$2,500");
      expect(t).not.toContain("buy.stripe.com");
    }
  });
  it("built output (dist) carries none of the retired SKU surface", () => {
    const dist = join(process.cwd(), "dist");
    if (!existsSync(dist)) return; // unit-only runs before build; the gate builds first
    const scanFile = (f: string, label: string) => {
      const t = readFileSync(f, "utf8").toLowerCase();
      for (const b of BANNED) expect(t, `${label} must not contain "${b}"`).not.toContain(b);
      for (const p of RETIRED_PRICES) expect(t, `${label} must not contain "${p}"`).not.toContain(p);
    };
    if (existsSync(join(dist, "index.html"))) scanFile(join(dist, "index.html"), "dist/index.html");
    const assets = join(dist, "assets");
    if (existsSync(assets)) {
      for (const f of readdirSync(assets)) {
        if (/\.(js|css)$/.test(f)) scanFile(join(assets, f), `dist/assets/${f}`);
      }
    }
  });
});