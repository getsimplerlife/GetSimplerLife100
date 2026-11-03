/**
 * public-stats-guard.test.ts — no fabricated statistic in PUBLIC MARKETING copy.
 *
 * Why this exists (slice 186): `honesty-copy-guardrail.test.ts` guards portal and
 * server fabrication, and `setup-fee-removal.test.ts` guards the price ladder.
 * Neither looked at marketing prose, which is exactly why 27 ungrounded numbers
 * ("Firms lose 15+ billable hours a week", "10–15% of billable time", "85-95%
 * MATCH CONFIDENCE", "review contracts 10x faster") sat on 8 public routes
 * through a green suite for weeks.
 *
 * The owner's standing rule: **no fabricated statistics anywhere public.** We
 * have zero customers and $0.00 revenue, so there is no measurement behind an
 * outcome number. The rule for copy is therefore: state what the system DOES
 * (the mechanism), never what it SAVED (the result).
 *
 * This guard scans the enumerated public copy and fails on a numeric claim that
 * is not in `ALLOWED` with a written reason.
 *
 * ── SLICE 187 CLOSED THE DEFERRALS ──────────────────────────────────────────
 * Slice 186 exempted four files (`content/industries.ts`, the recommendation
 * engine, `assessment.page.tsx`, `roi-calculator.page.tsx`) because their
 * engines still invented their numbers. Slice 187 rebuilt those engines around
 * the visitor's own inputs, so the exemption list is GONE — all four are scanned
 * like every other public page, and the test below pins that they stay scanned.
 *
 * ── WHAT THIS GUARD DOES NOT COVER (deliberately, and not silently) ──────────
 * 1. Portal pages (`src/lazy/portal.*.page.tsx`, `src/routes/portal.*.tsx`), the
 *    per-customer share pages (`invoices.share`, `deal-rooms.share`,
 *    `bookings.share`), `login`, and `after-purchase` — not marketing copy. They
 *    render tenant data, and portal/server fabrication is `honesty-copy-guardrail`.
 * 3. Non-page modules (`src/tools/*`, `src/lib/*`, `prod-server.ts`) — server and
 *    engine sources. Slice 187 emptied the last invented tables out of
 *    `src/tools/assessment-engine.ts` and `src/tools/automation-analyzer.ts`;
 *    `src/test/slice-187-honest-numbers.test.ts` guards those two by name, since
 *    this guard only walks the enumerated copy.
 * 4. Rendered output. A number assembled from a variable is invisible to a
 *    source regex. Slices 186 and 187 removed every such interpolation they
 *    found by hand, and the numbers those pages now interpolate are the
 *    visitor's own inputs (see `SavingsAssumptions`); a future one needs a human
 *    read, not this test.
 * 5. CSS. Tailwind width utilities such as `max-w-[80%]` match `\d+%`; they are
 *    allow-listed with that reason rather than by a cleverer regex that would
 *    also miss a real claim.
 *
 * An ALLOWED entry needs a reason, and an entry that no longer matches anything
 * FAILS — an allow-list that silently stops applying is the same bug in a
 * different costume.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const REPO = process.cwd();
const P = (rel: string) => join(REPO, rel);

// ── The numeric-claim patterns ───────────────────────────────────────────────
// A match is not automatically a lie; it is a claim that must be justified.
const PATTERNS: { name: string; rx: RegExp }[] = [
  { name: "percent", rx: /\d+(?:\.\d+)?\s*%/g },
  { name: "multiplier", rx: /\d+(?:\.\d+)?x\b/g },
  { name: "hours-per-week", rx: /hours?\s*(?:\/|per\s+)\s*(?:week|wk)/gi },
  { name: "saves-dollar", rx: /saves?\s*\$/gi },
  { name: "dollar-per-period", rx: /\$\d[\d,]*\s*(?:per|\/)\s*(?:month|week|year|mo\b)/gi },
  // Beyond the briefed set: `$25/hr` was a real fabrication presented as a basis
  // ("blended labor rate of $25/hr"), and none of the patterns above caught it.
  { name: "dollar-per-hour", rx: /\$\d[\d,]*\s*(?:\/|per\s+)\s*(?:hr|hour)/gi },
];

// ── No exemptions remain ────────────────────────────────────────────────────
// Slice 186 exempted four files here. Slice 187 made them honest, so the list is
// deleted rather than emptied: there is no mechanism left to defer a file, and
// `PREVIOUSLY_DEFERRED` below asserts each one is inside the scan.
const PREVIOUSLY_DEFERRED = [
  "src/content/industries.ts",
  "src/components/IndustryRecommendationEngine.tsx",
  "src/lazy/assessment.page.tsx",
  "src/lazy/roi-calculator.page.tsx",
];

// ── Individual survivors, each with a written reason ─────────────────────────
const ALLOWED: { file: string; text: string; reason: string }[] = [
  // Locked price ladder (owner 09-27, LOCKED; setup fees dropped 10-30).
  { file: "src/routes/index.tsx", text: "$199/mo", reason: "locked Starter price" },
  { file: "src/routes/index.tsx", text: "$599/mo", reason: "locked Growth price" },
  { file: "src/routes/index.tsx", text: "$1,499/mo", reason: "locked Enterprise price" },
  { file: "src/routes/contact.tsx", text: "$199/mo", reason: "locked Starter price" },
  { file: "src/routes/contact.tsx", text: "$599/mo", reason: "locked Growth price" },
  { file: "src/content/workflow-tiers.ts", text: "$199/mo", reason: "locked Starter price" },
  { file: "src/content/workflow-tiers.ts", text: "$599/mo", reason: "locked Growth price" },
  { file: "src/content/workflow-tiers.ts", text: "$1,499/mo", reason: "locked Enterprise price" },

  // "100% of native capabilities" is a scope statement, not a measured outcome:
  // it says every tier includes the whole native layer, which the plan states.
  { file: "src/routes/pricing.tsx", text: "100%", reason: "scope statement: every tier includes the full native layer" },
  { file: "src/lazy/build.page.tsx", text: "100%", reason: "scope statement: every tier includes the full native layer" },
  { file: "src/lazy/workflows.index.page.tsx", text: "100%", reason: "source comment describing the same scope statement; never rendered" },

  // CSS, not a claim.
  { file: "src/lazy/tools.ai-advisor.page.tsx", text: "80%", reason: "Tailwind width utility (max-w-[80%]), not a claim" },

  // Labelled simulations: the page states in its own body that every figure is
  // illustrative sample data (demo.page.tsx:91-95, demos.workflows.page.tsx intro).
  { file: "src/lazy/demo.page.tsx", text: "12%", reason: "sample dashboard metric; page-level simulation disclosure at :91-95" },
  { file: "src/lazy/demo.page.tsx", text: "$12,400/mo", reason: "sample workflow saving; page-level simulation disclosure at :91-95" },
  { file: "src/lazy/demo.page.tsx", text: "99.2%", reason: "sample success rate; page-level simulation disclosure at :91-95" },
  { file: "src/lazy/demo.page.tsx", text: "$8,200/mo", reason: "sample workflow saving; page-level simulation disclosure at :91-95" },
  { file: "src/lazy/demo.page.tsx", text: "97.8%", reason: "sample success rate; page-level simulation disclosure at :91-95" },
  { file: "src/lazy/demo.page.tsx", text: "$15,600/mo", reason: "sample workflow saving; page-level simulation disclosure at :91-95" },
  { file: "src/lazy/demo.page.tsx", text: "98.5%", reason: "sample success rate; page-level simulation disclosure at :91-95" },
  { file: "src/lazy/demo.page.tsx", text: "$3,100/mo", reason: "sample workflow saving; page-level simulation disclosure at :91-95" },
  { file: "src/lazy/demo.page.tsx", text: "96.1%", reason: "sample success rate; page-level simulation disclosure at :91-95" },
  { file: "src/lazy/demos.workflows.page.tsx", text: "$8,500/month", reason: "figure inside a fictional call-transcript preset; page-level simulation disclosure added in the intro" },
  { file: "src/lazy/demos.workflows.page.tsx", text: "$250/hr", reason: "line item of the fictional sample invoice the demo parses, not our rate card; covered by the page's simulation disclosure" },

  // Simulated console logs: the console header now reads "Simulated demo —
  // illustrative steps, not a measurement", and the footer "MODE: SIMULATED WORKFLOW RUN".
  { file: "src/lazy/integrations.index.page.tsx", text: "$8,500/mo", reason: "simulated demo log; console labelled 'Simulated demo — illustrative steps, not a measurement'" },
  { file: "src/lazy/integrations.index.page.tsx", text: "94.2%", reason: "simulated demo log; console labelled 'Simulated demo — illustrative steps, not a measurement'" },
  { file: "src/lazy/integrations.index.page.tsx", text: "28%", reason: "simulated demo log; console labelled 'Simulated demo — illustrative steps, not a measurement'" },
  { file: "src/lazy/integrations.index.page.tsx", text: "12%", reason: "simulated demo log; console labelled 'Simulated demo — illustrative steps, not a measurement'" },
  { file: "src/lazy/integrations.index.page.tsx", text: "89.4%", reason: "simulated demo log; console labelled 'Simulated demo — illustrative steps, not a measurement'" },
  { file: "src/lazy/integrations.index.page.tsx", text: "99.1%", reason: "simulated demo log; console labelled 'Simulated demo — illustrative steps, not a measurement'" },

  // A threshold inside a fictional scenario, not a claim about our results.
  { file: "src/content/automation-library.ts", text: "85%", reason: "budget threshold inside a demo scenario description, not a claim about our results" },
];

/** Files the guard deliberately does not scan, each with a reason. */
const NOT_SCANNED_GLOBS: { pattern: string; reason: string }[] = [
  { pattern: "src/routes/portal.*.tsx", reason: "portal UI, not marketing copy — honesty-copy-guardrail covers portal fabrication" },
  { pattern: "src/lazy/portal.*.page.tsx", reason: "portal UI, not marketing copy — honesty-copy-guardrail covers portal fabrication" },
  { pattern: "src/routes/login.tsx", reason: "auth page, no marketing copy" },
  { pattern: "src/routes/after-purchase.tsx", reason: "post-checkout confirmation, no marketing copy" },
  { pattern: "src/routes/invoices.share.*", reason: "per-customer share page: renders a real invoice, not our claims" },
  { pattern: "src/routes/deal-rooms.share.*", reason: "per-customer share page: renders a real deal room, not our claims" },
  { pattern: "src/routes/bookings.share.*", reason: "per-customer share page: renders a real booking, not our claims" },
];

// ── Enumerate the public copy ────────────────────────────────────────────────
const isExcluded = (name: string) =>
  name.startsWith("portal.") ||
  name === "login.tsx" ||
  name === "after-purchase.tsx" ||
  name.startsWith("invoices.share") ||
  name.startsWith("deal-rooms.share") ||
  name.startsWith("bookings.share");

function listDir(dir: string, filter: (name: string) => boolean): string[] {
  let entries: string[];
  try {
    entries = readdirSync(P(dir));
  } catch {
    return [];
  }
  return entries.filter(filter).map((n) => `${dir}/${n}`).sort();
}

export function publicCopyFiles(): string[] {
  const routes = listDir("src/routes", (n) => n.endsWith(".tsx") && !isExcluded(n));
  const lazy = listDir("src/lazy", (n) => n.endsWith(".page.tsx") && !isExcluded(n));
  const content = listDir("src/content", (n) => n.endsWith(".ts"));
  const components = listDir("src/components", (n) => n.startsWith("Industry") && n.endsWith(".tsx"));
  return [...routes, ...lazy, ...content, ...components];
}

/** Strip allow-listed substrings for one file, leaving only unjustified claims. */
function stripAllowed(file: string, text: string): string {
  let out = text;
  for (const a of ALLOWED) if (a.file === file) out = out.split(a.text).join("");
  return out;
}

function findClaims(file: string, text: string): string[] {
  const hits: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { name, rx } of PATTERNS) {
      rx.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(lines[i])) !== null) {
        hits.push(`${file}:${i + 1} [${name}] ${m[0]} — ${lines[i].trim().slice(0, 120)}`);
        if (m[0].length === 0) break; // never loop forever on a zero-width match
      }
    }
  }
  return hits;
}

describe("public marketing copy — no ungrounded statistic (slice 186)", () => {
  it("enumerates a real set of public copy files (the scan is not silently empty)", () => {
    const files = publicCopyFiles();
    // 30 is far below the true count (~55 today); this only catches a broken walk.
    expect(files.length).toBeGreaterThan(30);
    for (const f of files) expect(existsSync(P(f))).toBe(true);
    // The three routes this slice rewrote must be inside the scan.
    expect(files).toContain("src/lazy/industries.index.page.tsx");
    expect(files).toContain("src/lazy/integrations.index.page.tsx");
    expect(files).toContain("src/content/resources.ts");
  });

  it("the four files slice 186 deferred are scanned like any other public page", () => {
    const files = publicCopyFiles();
    for (const f of PREVIOUSLY_DEFERRED) {
      expect(existsSync(P(f)), `${f} no longer exists — remove it from PREVIOUSLY_DEFERRED`).toBe(true);
      expect(files, `${f} was deferred in 186 and slice 187 removed the exemption — it must stay scanned`).toContain(f);
    }
  });

  it("every allow-list entry still matches its file and carries a real reason", () => {
    for (const a of ALLOWED) {
      expect(a.reason.length, `${a.file} allow-entry "${a.text}" needs a written reason`).toBeGreaterThan(10);
      const text = readFileSync(P(a.file), "utf8");
      expect(
        text.includes(a.text),
        `allow-entry "${a.text}" in ${a.file} no longer matches — a stale exemption is a silent hole`
      ).toBe(true);
    }
  });

  it("no public copy file carries a numeric claim that is not allow-listed with a reason", () => {
    const violations: string[] = [];
    for (const file of publicCopyFiles()) {
      const text = stripAllowed(file, readFileSync(P(file), "utf8"));
      violations.push(...findClaims(file, text));
    }
    expect(violations, `ungrounded numeric claim in public copy:\n${violations.join("\n")}`).toEqual([]);
  });

  it("the slice-186 headline fabrications stay gone", () => {
    const industries = readFileSync(P("src/lazy/industries.index.page.tsx"), "utf8");
    expect(industries).not.toContain("15+ billable hours");
    expect(industries).not.toContain("10–15% of billable time");

    const integrations = readFileSync(P("src/lazy/integrations.index.page.tsx"), "utf8");
    // The invented outcome percentages, and the field that carried them.
    expect(integrations).not.toContain("25% increase in conversion");
    expect(integrations).not.toContain("fuel cost savings");
    expect(integrations).not.toMatch(/\broi:\s*string/);
    expect(integrations).not.toContain("ROI: {");

    const cwa = readFileSync(P("src/lazy/tools.can-we-automate-this.page.tsx"), "utf8");
    expect(cwa).not.toContain("85-95%");
    expect(cwa).not.toContain("MATCH CONFIDENCE");
    expect(cwa).not.toContain("savingsSummary");

    const advisor = readFileSync(P("src/lazy/tools.ai-advisor.page.tsx"), "utf8");
    expect(advisor).not.toContain("labor rate of $25/hr");
    expect(advisor).not.toContain("in labor savings");

    const resources = readFileSync(P("src/content/resources.ts"), "utf8");
    expect(resources).not.toContain("10x faster");
    expect(resources).not.toContain("20+ hours per week");
    expect(resources).not.toContain("40%+");
  });

  it("the dead industry-content files are not resurrected", () => {
    // Both held invented stats and had no importer; slice 186 deleted them.
    for (const dead of [
      "src/content/industryContent.ts",
      "src/content/industryContentFixed.ts",
      "src/content/audit_templates.json",
    ]) {
      expect(existsSync(P(dead)), `${dead} is dead code holding fabricated stats — do not restore it`).toBe(false);
    }
  });

  it("the guard states what it does not cover", () => {
    // A guard that quietly covers nothing is worse than no guard. The comment
    // block at the top of this file enumerates the gaps; these are the ones that
    // must stay written down.
    const self = readFileSync(P("src/test/public-stats-guard.test.ts"), "utf8");
    expect(self).toContain("WHAT THIS GUARD DOES NOT COVER");
    expect(NOT_SCANNED_GLOBS.length).toBeGreaterThan(0);
    for (const n of NOT_SCANNED_GLOBS) expect(n.reason.length).toBeGreaterThan(20);
  });
});
