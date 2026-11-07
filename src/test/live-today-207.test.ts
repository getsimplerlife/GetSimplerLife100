/**
 * SLICE 207 — nothing may be called live, verified or connected that has never run.
 *
 * WHAT WAS WRONG. `https://www.simplerlife100.com/integrations` rendered, to a
 * visitor, the sentence
 *
 *   "Live today: Xero, Slack, Google, Microsoft 365, HubSpot, and DocuSign — with more in development."
 *
 * (also in that page's meta description, i.e. in Google and in every link
 * preview) and a tier literally labelled "Live now", driven by `status: "live"`
 * on ten entries in `src/content/integrations.ts`. Six more places carried the
 * same claim class: every case-studies card was badged "Verified Workflow" (and
 * the detail page "VERIFIED WORKFLOW"), two CTAs said "verified automation
 * patterns", `src/lib/provider-placeholders.ts` called fifteen providers
 * "live-verified" and the portal printed their count as "connectable now".
 *
 * NONE OF IT IS TRUE. No integration in this product has ever carried a real
 * tenant record: no invoice, proposal, checklist or client store exists, and no
 * tenant has ever connected a provider. Being wired is not being verified.
 * Slice 206 established the rule; this guard extends it from the phrase
 * "live-verified" to the family of liveness claims, and replaces each one with
 * a statement about what the code does, which is checkable against the tree.
 *
 * WHY COMMENTS ARE STRIPPED. Every fix here leaves a comment quoting the
 * sentence it deleted (this one does). A guard that read the prose would fail on
 * its own explanation — the rule in WORKFLOW.md is that a source-order guard
 * matches the call, not the prose about the call. The stripper is the one
 * `portal-copy-truth-203.test.ts` and `live-verified-206.test.ts` use.
 *
 * WHAT THIS DOES NOT COVER, stated so nobody over-reads it:
 *  - It is a SOURCE guard. No page was opened in a browser for this slice, so it
 *    cannot show that a rendered page looks right — only that the string is gone
 *    from the source the page renders from.
 *  - It does not prove any provider lane works. It proves we do not say it does.
 *  - `src/lib/entitlements.ts` legitimately says a capability is "not a
 *    capability live today"; that file is not scanned, because the honest
 *    negation and the false claim share the phrase.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { integrations } from "../content/integrations";

const ROOT = process.cwd();

/** Strip comments so the guard pins rendered copy, not our notes about it. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/** Every customer-facing source file: lazy pages, routes, content, components, plus the
 *  two lib modules that feed copy straight to a customer (meta descriptions, portal cards). */
function surfaces(): string[] {
  const pick = (dir: string, re: RegExp): string[] =>
    readdirSync(join(ROOT, dir))
      .filter((f) => re.test(f))
      .sort()
      .map((f) => join(ROOT, dir, f));
  return [
    ...pick("src/lazy", /\.page\.tsx$/),
    ...pick("src/routes", /\.tsx?$/),
    ...pick("src/content", /\.ts$/),
    ...pick("src/components", /\.tsx$/),
    join(ROOT, "src/lib/site-meta.ts"),
    join(ROOT, "src/lib/provider-placeholders.ts"),
  ];
}

const rendered = () =>
  surfaces().map((path) => ({
    path: path.slice(ROOT.length + 1),
    code: stripComments(readFileSync(path, "utf-8")),
  }));

/**
 * The claims this slice retired. `status: "live"` is the data half: the tier a
 * page segments on is a claim too, and it was the one driving the "Live now"
 * label.
 */
const FORBIDDEN: Array<{ name: string; re: RegExp }> = [
  { name: "Live today", re: /live\s+today/i },
  { name: "Live now", re: /live\s+now/i },
  { name: "Verified Workflow", re: /verified\s+workflow/i },
  { name: "verified automation", re: /verified\s+automation/i },
  { name: "live-verified", re: /live[-\s]verified/i },
  { name: 'status: "live"', re: /status:\s*"live"/ },
];

/** The sentence that replaced each claim, and the file that must still carry it.
 *  These exist so the guard cannot be satisfied by deleting a page: a missing
 *  replacement fails as loudly as a surviving claim. */
const REPLACEMENTS: Array<{ path: string; needle: string; why: string }> = [
  {
    path: "src/lazy/integrations.index.page.tsx",
    needle: "Nothing on this page is connected today.",
    why: "the /integrations page must say plainly that nothing there is connected",
  },
  {
    path: "src/lazy/integrations.index.page.tsx",
    needle: "is built into the platform and needs no third-party tool at all.",
    why: "the replacement must name what the platform does on its own, not just what it does not",
  },
  {
    path: "src/lazy/integrations.index.page.tsx",
    needle: "Import lanes",
    why: "the tier that used to be called 'Live now' must still exist, described honestly",
  },
  {
    path: "src/lazy/integrations.index.page.tsx",
    needle: "Adapter code only",
    why: "the middle tier — code exists but no live route reaches it — must be visible",
  },
  {
    path: "src/lib/site-meta.ts",
    needle: "each one calls that provider's own API once you authorize it",
    why: "the meta description is rendered by search engines and link previews; it must not claim liveness",
  },
  {
    path: "src/lib/site-meta.ts",
    needle: "need no third-party tool at all",
    why: "the meta description must carry the true half too — the platform's own record-keeping",
  },
  {
    path: "src/lazy/case-studies.index.page.tsx",
    needle: "Workflow Demonstration",
    why: "the case-studies card badge must say what the card documents",
  },
  {
    path: "src/lazy/case-studies.index.page.tsx",
    needle: "the workflow patterns shown in these demonstrations",
    why: "the bottom CTA replaced 'verified automation patterns'",
  },
  {
    path: "src/components/CaseStudyPage.tsx",
    needle: "WORKFLOW DEMONSTRATION",
    why: "the case-study detail page badge replaced 'VERIFIED WORKFLOW'",
  },
  {
    path: "src/components/IntegrationPage.tsx",
    needle: "Adapter code only",
    why: "the detail page must badge the lane, not a liveness",
  },
  {
    path: "src/lazy/portal.integrations.index.page.tsx",
    needle: "with code today",
    why: "the portal count read 'connectable now' for providers nothing can connect to",
  },
  {
    path: "src/content/integrations.ts",
    needle: "export type IntegrationWiring",
    why: "the three-tier wiring model is the canonical source the pages segment on",
  },
];

describe("the stripper is honest about what it removes", () => {
  it("removes the claims from comments and leaves rendered copy alone", () => {
    const src = [
      "/** a doc-block saying Live today */",
      "// a line comment saying Verified Workflow",
      "const a = 1;",
      'const copy = "Live now";',
    ].join("\n");
    const out = stripComments(src);
    expect(out).not.toContain("a doc-block saying Live today");
    expect(out).not.toContain("a line comment saying Verified Workflow");
    expect(out).toContain("Live now");
    expect(out).toContain("const a = 1;");
  });
});

describe("no customer-facing source claims liveness or verification", () => {
  const files = rendered();

  it("reads the surfaces it claims to guard", () => {
    const count = (prefix: string) => files.filter((f) => f.path.startsWith(prefix)).length;
    expect(count("src/lazy/")).toBeGreaterThan(60);
    expect(count("src/routes/")).toBeGreaterThan(60);
    expect(count("src/content/")).toBeGreaterThan(5);
    expect(count("src/components/")).toBeGreaterThan(10);
    expect(files.some((f) => f.path === "src/lib/site-meta.ts")).toBe(true);
    expect(files.some((f) => f.path === "src/lib/provider-placeholders.ts")).toBe(true);
    expect(files.every((f) => f.code.length > 0)).toBe(true);
  });

  for (const claim of FORBIDDEN) {
    it(`carries no "${claim.name}" in rendered copy`, () => {
      const hits = files
        .filter((f) => claim.re.test(f.code))
        .map((f) => {
          const line = f.code.split("\n").find((l) => claim.re.test(l)) ?? "";
          return `${f.path}: ${line.trim().slice(0, 140)}`;
        });
      expect(hits, `rendered copy still makes this claim:\n${hits.join("\n")}`).toEqual([]);
    });
  }
});

describe("the catalogue cannot label a provider live", () => {
  it("uses only the three wiring values, and never 'live'", () => {
    const VALID = new Set(["import-lane", "adapter-lane", "roadmap"]);
    for (const i of integrations) {
      const raw = i.status ?? "roadmap";
      expect(VALID.has(raw), `${i.id} carries ${JSON.stringify(raw)}`).toBe(true);
    }
  });
});

describe("the replacements survive", () => {
  for (const r of REPLACEMENTS) {
    it(`${r.path} still says "${r.needle}"`, () => {
      const code = stripComments(readFileSync(join(ROOT, r.path), "utf-8"));
      expect(code, r.why).toContain(r.needle);
    });
  }
});
