/**
 * SLICE 206 — nothing may be called "live-verified" that has not run.
 *
 * WHAT WAS WRONG. "Live-verified" is a claim about our history: that a provider
 * lane was connected and carried a real record. Nothing in this product has ever
 * carried one — no invoice, proposal, checklist or client store exists, and no
 * tenant has connected a provider. Yet six strings on three customer-facing
 * surfaces said it:
 *
 *   src/lazy/case-studies.index.page.tsx   "Integrations shown are live-verified by our team"
 *   src/content/case-studies.ts            "integrations the team has live-verified: Xero, …"
 *   src/content/case-studies.ts            "(available integrations live-verified)"
 *   src/content/case-studies.ts            "Google Calendar and Microsoft 365 … are live-verified."
 *   src/content/case-studies.ts            "Uses live-verified Microsoft (OneDrive) and Google …"
 *   src/routes/pricing.tsx                 "Everything below is shipped and live-verified"
 *
 * Each was replaced with a statement about what the code DOES — an adapter lane
 * calls a provider's own API once a tenant authorizes it — which is checkable
 * against `src/integrations/providers/<id>/` and is not a claim about our past.
 * Two further strings in the same file made the same class of claim about
 * liveness rather than verification ("a live calendar integration", "the Slack
 * provider webhook (verified)") and were rewritten the same way; they are listed
 * here so a revert of either is caught by this guard's replacement assertions.
 *
 * WHY COMMENTS ARE STRIPPED. Every one of these fixes leaves a comment or a
 * doc-block quoting the sentence it deleted, and `src/content/case-studies.ts`
 * has carried such prose since the file was written. A guard that read the prose
 * would fail on its own explanation. This is the rule the lead wrote into
 * WORKFLOW.md: a source-order guard must match the call, not the prose about the
 * call. The stripper is the one `portal-copy-truth-203.test.ts` uses, copied so
 * this file stays self-contained; the first test below keeps the copy honest.
 *
 * WHAT THIS DOES NOT COVER, stated so nobody over-reads it:
 *  - It is a SOURCE guard. No page was opened in a browser for this slice; it
 *    cannot show that a rendered page looks right, only that the string is gone
 *    from the source the page renders from.
 *  - It pins the phrase, not the class. `src/lazy/case-studies.index.page.tsx`
 *    still badges each card "Verified Workflow" and the bottom CTA still says
 *    "verified automation patterns"; the public `/integrations` explorer still
 *    renders a "Live now" tier driven by `status: "live"` in
 *    `src/content/integrations.ts`. Those are the same family of claim and are
 *    NOT covered here — they are named in the slice report as open, because
 *    rewriting them changes what the pages assert about specific providers and
 *    needs a decision the lead has not made.
 *  - It says nothing about whether any provider lane works. It only forbids the
 *    one phrase we cannot back.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { caseStudies } from "../content/case-studies";

const ROOT = process.cwd();

/**
 * Strip comments so the guard pins rendered copy, not our notes about it.
 * Handles `//`, block comments and the JSX form `{/* … *\/}`. A `//` immediately
 * after a colon is left alone so URLs survive. (Same implementation as
 * `portal-copy-truth-203.test.ts`.)
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/** Every customer-facing source file: lazy pages, route files, content modules. */
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
  ];
}

/** What a visitor reads, comments removed, plus the path for failure messages. */
function renderedCopy(): Array<{ path: string; code: string }> {
  return surfaces().map((path) => ({
    path: path.slice(ROOT.length + 1),
    code: stripComments(readFileSync(path, "utf-8")),
  }));
}

/**
 * The sentence that replaced each claim, and the file that must still carry it.
 * These exist so the guard cannot be satisfied by deleting a page or gutting a
 * content file: a missing replacement fails as loudly as a surviving claim.
 */
const REPLACEMENTS: Array<{ path: string; needle: string; why: string }> = [
  {
    path: "src/lazy/case-studies.index.page.tsx",
    needle: "Integrations shown are adapter lanes in our own",
    why: "the case-studies disclaimer must say what the lanes are, not that they were verified",
  },
  {
    path: "src/lazy/case-studies.index.page.tsx",
    needle: "The QuickBooks lane is inbound only:",
    why: "the inbound-only half of the old claim was the one true part and must survive the rewrite",
  },
  {
    path: "src/content/case-studies.ts",
    needle: "Adapter lanes for Xero, DocuSign, HubSpot, Slack, Google productivity and Microsoft 365",
    why: "the quote-to-cash verification note names the lanes instead of claiming verification",
  },
  {
    path: "src/content/case-studies.ts",
    needle: "QuickBooks is inbound only",
    why: "QuickBooks is read-only from a live path; the note must say so",
  },
  {
    path: "src/content/case-studies.ts",
    needle: "our calendar lanes read through each provider's own API",
    why: "the calendar pattern's parenthetical replaced a verification claim",
  },
  {
    path: "src/content/case-studies.ts",
    needle: "each have an adapter lane that calls that provider's own API",
    why: "the Google Calendar / Microsoft 365 note replaced a verification claim",
  },
  {
    path: "src/content/case-studies.ts",
    needle: "our Microsoft (OneDrive) and Google productivity adapter lanes",
    why: "the document-filing note replaced a verification claim",
  },
  {
    path: "src/content/case-studies.ts",
    needle: "The platform reads the change through the calendar lane",
    why: "the walkthrough said 'a live calendar integration'; nothing is connected",
  },
  {
    path: "src/content/case-studies.ts",
    needle: "Relies on the Slack provider webhook lane and the approval-queue gate",
    why: "the Slack note claimed '(verified)' and pinned a test count that rots",
  },
  {
    path: "src/routes/pricing.tsx",
    needle: "Every card below is a native lane built into this product",
    why: "the pricing page's capability list must describe the product, not a verification history",
  },
  {
    path: "src/routes/pricing.tsx",
    needle: "are stated in the plan and are not enforced",
    why: "seats, retention and export are stated but not enforced — the page must not imply otherwise",
  },
];

describe("the stripper is honest about what it removes", () => {
  it("removes the phrase from comments and leaves rendered copy alone", () => {
    const src = [
      "/** a doc-block saying live-verified */",
      "// a line comment saying live-verified",
      "const a = 1;",
      "const copy = \"our team is live-verified\";",
    ].join("\n");
    const out = stripComments(src);
    expect(out).not.toContain("a doc-block saying live-verified");
    expect(out).not.toContain("a line comment saying live-verified");
    // The rendered string is exactly what the guard below must still be able to see.
    expect(out).toContain("live-verified");
    expect(out).toContain("const a = 1;");
  });

  it("keeps URLs intact", () => {
    expect(stripComments('const u = "https://example.com/x"; // note')).toContain(
      "https://example.com/x",
    );
  });
});

describe("no customer-facing source says 'live-verified'", () => {
  const files = renderedCopy();

  it("reads the surfaces it claims to guard", () => {
    // Counts are floors, not exact numbers, so adding a page never breaks this.
    const lazy = files.filter((f) => f.path.startsWith("src/lazy/")).length;
    const routes = files.filter((f) => f.path.startsWith("src/routes/")).length;
    const content = files.filter((f) => f.path.startsWith("src/content/")).length;
    expect(lazy).toBeGreaterThan(60);
    expect(routes).toBeGreaterThan(60);
    expect(content).toBeGreaterThan(5);
    // A file that failed to read would have thrown above; a stub would be tiny.
    expect(files.every((f) => f.code.length > 0)).toBe(true);
  });

  it("carries no 'live-verified' / 'live verified' in rendered copy", () => {
    // The snippet, not a line number: comments are stripped before the search,
    // so a line number here would point into the stripped text, not the file.
    const hits = files
      .filter((f) => /live[-\s]verified/i.test(f.code))
      .map((f) => {
        const line = f.code.split("\n").find((l) => /live[-\s]verified/i.test(l)) ?? "";
        return `${f.path}: ${line.trim().slice(0, 120)}`;
      });
    expect(hits, `rendered copy still claims verification it cannot back:\n${hits.join("\n")}`).toEqual([]);
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

describe("the case-studies data carries no verification claim", () => {
  it("still holds four demonstrations, each with a note", () => {
    expect(caseStudies.length).toBe(4);
    for (const cs of caseStudies) {
      expect(cs.verificationNote.length, `${cs.id} lost its note`).toBeGreaterThan(40);
      expect(/live[-\s]verified/i.test(cs.verificationNote), `${cs.id}: ${cs.verificationNote}`).toBe(false);
    }
  });

  it("every walkthrough line and pattern is free of the phrase", () => {
    for (const cs of caseStudies) {
      const blob = [cs.title, cs.pattern, cs.verificationNote, ...cs.walkthrough].join("\n");
      expect(/live[-\s]verified/i.test(blob), `${cs.id} carries the claim`).toBe(false);
    }
  });
});
