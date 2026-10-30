/**
 * setup-fee-removal guard (slice 140, owner decision 2026-10-30: "Drop the set
 * up fee like you suggested.").
 *
 * Why the owner dropped it: with the old Stripe links the day-one cost ladder
 * was INVERTED — Starter $199+$500 = $699, Growth $599+$1,500 = $2,099, but
 * Enterprise $1,499+$0 = $1,499, so the middle tier cost $600 more up front
 * than the top one.
 *
 * Stripe will not let you edit `line_items` on an existing payment link, so new
 * monthly-only links were created and the site now serves them:
 *   Starter     https://buy.stripe.com/eVqbJ0aD29JA3bx6R75os03
 *   Growth      https://buy.stripe.com/bJe3cubH6f3U3bxdfv5os04
 *   Enterprise  https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02  (unchanged)
 *
 * This guard pins two things at the source:
 *   1. NO setup/onboarding fee claim survives anywhere under src/ (outside
 *      src/test) — no "$500", no "$1,500", no "one-time onboarding", no
 *      "setup included" — so the price a buyer sees is the price they pay;
 *   2. the ONLY Stripe buy links in src/ are the three canonical tier links,
 *      plus the two pre-10-30 links kept as RECOGNISED ALIASES in
 *      src/lib/stripe-webhook.ts (an old link in an inbox must still provision
 *      its tier instead of resolving to nothing).
 *
 * Non-fee $500 figures are explicitly allowed and enumerated below (assessment
 * budget bands, an industry savings range). They are budget/customer-savings
 * numbers, not our price, so they must stay — and because the allow-list is
 * exact, a real fee claim cannot hide behind it.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO = existsSync(join(process.cwd(), "prod-server.ts"))
  ? process.cwd()
  : join(process.cwd(), "..", "..");

const CANONICAL = {
  starter: "https://buy.stripe.com/eVqbJ0aD29JA3bx6R75os03",
  growth: "https://buy.stripe.com/bJe3cubH6f3U3bxdfv5os04",
  enterprise: "https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02",
};
/** Pre-10-30 links: recognised aliases only, and only in the webhook module. */
const LEGACY = {
  starter: "https://buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00",
  growth: "https://buy.stripe.com/fZubJ0h1qbRI5jFcbr5os01",
};
const LEGACY_ALIAS_FILE = join("src", "lib", "stripe-webhook.ts");

/** Every .ts/.tsx under src/, excluding src/test (tests name these on purpose). */
function srcOutsideTests(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === "test") continue;
        walk(abs);
      } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
        out.push(abs);
      }
    }
  };
  walk(join(REPO, "src"));
  return out;
}

/**
 * Legitimate non-fee uses of the literal "$500" in customer copy. Enumerated so
 * they are the ONLY ones permitted; anything else is a fee claim.
 */
const ALLOWED_NON_FEE = [
  "Under $500/mo", // assessment: the buyer's current spend band
  "$500 - $2,000/mo", // assessment: the next spend band
  "$280,000\u2013$500,000", // industry page: estimated annual savings
];

/** Strip the enumerated non-fee figures, leaving only real price claims. */
function stripAllowed(text: string): string {
  let out = text;
  for (const allowed of ALLOWED_NON_FEE) out = out.split(allowed).join("");
  return out;
}

const BANNED_FEE_TOKENS = [
  "$500",
  "$1,500",
  "1,500 one-time",
  "one-time onboarding",
  "setup included",
];

describe("setup-fee removal (owner 10-30) — no fee claim survives in src/", () => {
  it("no source file outside src/test contains a setup/onboarding fee claim", () => {
    const violations: string[] = [];
    for (const file of srcOutsideTests()) {
      const text = stripAllowed(readFileSync(file, "utf8"));
      for (const token of BANNED_FEE_TOKENS) {
        if (text.includes(token)) {
          violations.push(`${file.replace(REPO + "/", "")} contains "${token}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("the allow-listed non-fee figures are the ONLY $500 literals left (a fee claim cannot hide)", () => {
    // Count every "$500" occurrence and prove each one is one of the enumerated
    // budget/savings figures — i.e. removing them leaves zero.
    const offenders: string[] = [];
    for (const file of srcOutsideTests()) {
      const text = readFileSync(file, "utf8");
      const before = (text.match(/\$500/g) || []).length;
      const after = (stripAllowed(text).match(/\$500/g) || []).length;
      if (after !== 0) {
        offenders.push(`${file.replace(REPO + "/", "")}: ${before - after} allowed of ${before}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the pricing, homepage and support surfaces state the onboarding that IS included, and no fee", () => {
    for (const rel of ["src/routes/pricing.tsx", "src/routes/index.tsx", "src/routes/support.tsx"]) {
      const text = readFileSync(join(REPO, rel), "utf8");
      for (const token of BANNED_FEE_TOKENS) {
        expect(text, `${rel} must not contain "${token}"`).not.toContain(token);
      }
    }
    // The approved tier contents (owner 10-30) still give each tier its
    // onboarding, described as included rather than priced.
    const pricing = readFileSync(join(REPO, "src/routes/pricing.tsx"), "utf8");
    expect(pricing).toContain("Self-serve onboarding included");
    expect(pricing).toContain("Guided onboarding included");
    expect(pricing).toContain("Named onboarding included");
  });

  it("the /pricing meta description carries no fee", () => {
    const meta = readFileSync(join(REPO, "src/lib/site-meta.ts"), "utf8");
    for (const token of BANNED_FEE_TOKENS) {
      expect(meta, `site-meta.ts must not contain "${token}"`).not.toContain(token);
    }
    expect(meta).toContain("no setup fee");
  });
});

describe("buy links — the site serves exactly the three canonical tier links", () => {
  it("no buy.stripe.com URL in src/ is anything but a canonical tier link (legacy aliases only in the webhook module)", () => {
    const canonical = new Set(Object.values(CANONICAL));
    const legacy = new Set(Object.values(LEGACY));
    const violations: string[] = [];
    for (const file of srcOutsideTests()) {
      const rel = file.replace(REPO + "/", "");
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/https?:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/g)) {
        const url = m[0];
        if (canonical.has(url)) continue;
        if (legacy.has(url) && rel === LEGACY_ALIAS_FILE) continue;
        violations.push(`${rel} carries ${url}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("every customer-facing tier surface points at the canonical link, not the retired one", () => {
    const surfaces: Array<[string, string, string]> = [
      ["src/routes/pricing.tsx", CANONICAL.starter, CANONICAL.growth],
      ["src/routes/index.tsx", CANONICAL.starter, CANONICAL.growth],
      ["src/routes/support.tsx", CANONICAL.starter, CANONICAL.growth],
      ["src/content/workflow-tiers.ts", CANONICAL.starter, CANONICAL.growth],
    ];
    for (const [rel, starter, growth] of surfaces) {
      const text = readFileSync(join(REPO, rel), "utf8");
      expect(text, `${rel} must serve the current Starter link`).toContain(starter);
      expect(text, `${rel} must serve the current Growth link`).toContain(growth);
      expect(text, `${rel} must not serve the retired Starter link`).not.toContain(LEGACY.starter);
      expect(text, `${rel} must not serve the retired Growth link`).not.toContain(LEGACY.growth);
      expect(text, `${rel} must keep Enterprise`).toContain(CANONICAL.enterprise);
    }
  });

  it("the webhook module maps both the current and the retired links, so no purchase resolves to nothing", () => {
    const webhook = readFileSync(join(REPO, LEGACY_ALIAS_FILE), "utf8");
    for (const url of [...Object.values(CANONICAL), ...Object.values(LEGACY)]) {
      expect(webhook, `stripe-webhook.ts must map ${url}`).toContain(url);
    }
  });
});
