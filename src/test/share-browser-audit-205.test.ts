/**
 * SLICE 205 — the share-page defects a real browser found.
 *
 * Source: `/home/team/shared/share-pages-browser-audit-204.md` (findings D-2,
 * D-3, D-4, D-5, D-7, P-3) and §12 of `/home/team/shared/AUDIT-REGISTER.md`.
 * A QA auditor seeded one record of each kind into a throwaway instance and
 * opened 10 share routes + 10 public routes at 1440 and 390 px. Four of the five
 * share pages held up; these are the five things that did not:
 *
 *  1. An EXPIRED proposal was badged "AWAITING YOUR DECISION" — the panel was
 *     expiry-aware, the badge read `STATUS_LABEL[view.status]`, and `pending` is
 *     a true statement about the record that carries a false instruction.
 *  2. The survey share route served no `noindex` and no `X-Robots-Tag`, so a
 *     private client link was indexable. It was the only one of the five.
 *  3. `/case-studies` named six "live-verified integrations" in its hero while
 *     the grid below it rendered eight different slugs and the capability
 *     catalog records three as wired.
 *  4. Three 390 px visual defects (receipt contrast, colliding amount columns,
 *     `ISSUED` beside `PAID`) — fixed by measurement, not by eye.
 *  5. This guard.
 *
 * WHY THIS IS A SOURCE GUARD WITH COMMENTS STRIPPED. Every fix in this slice
 * left a comment quoting the claim it deleted, exactly as 203's did. A guard
 * that reads the prose would fail on its own explanation; a guard that reads
 * only the code pins what a customer actually gets. The same rule the lead wrote
 * into WORKFLOW.md: "a source-order guard must match the call, not the prose
 * about the call."
 *
 * WHAT IT DOES NOT COVER, stated so nobody over-reads it: it cannot see a
 * ternary, so it cannot prove the badge is expiry-aware for every input — that
 * is why the fix routes the badge through `DECISION_BADGE` (a typed map, so a
 * missing state is a compile error) instead of a condition this file would have
 * to pattern-match. And it says nothing about the four other share pages'
 * rendered layout; those are measured in the slice report, not here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const PROPOSAL_PAGE = "src/lazy/proposals.share.$slug.page.tsx";
const SURVEY_ROUTE = "src/routes/surveys.share.$slug.tsx";
const SURVEY_ROUTER = "src/native/survey/router.ts";
const CASE_STUDIES = "src/lazy/case-studies.index.page.tsx";

/** A source file, comments stripped, plus its path for failure messages. */
function surface(rel: string): { path: string; code: string } {
  return { path: rel, code: stripComments(readFileSync(join(ROOT, rel), "utf-8")) };
}

/**
 * Strip comments so the guard pins rendered code, not our notes about it.
 * Handles `//`, `/* … *\/` and the JSX form `{/* … *\/}`. A `//` immediately
 * after a colon is left alone so URLs survive. (Same stripper as
 * `portal-copy-truth-203.test.ts`; a second copy here keeps this guard
 * self-contained, and the self-test below keeps the copy honest.)
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/** The `{ … }` object that follows `marker`, brace-matched; "" when absent. */
export function objectBlock(code: string, marker: string): string {
  const at = code.indexOf(marker);
  if (at < 0) return "";
  const open = code.indexOf("{", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return "";
}

/** The six decision states the page declares (`DecisionState`, 192b-2). */
const DECISION_STATES = ["pending", "expired", "applied", "queued", "already-decided", "refused"];

describe("slice 205 — the guard itself works", () => {
  it("stripComments removes prose about a claim but keeps the claim", () => {
    // Without this, a broken stripper would make every assertion below
    // vacuously true — the failure mode the lead called out after 203.
    const src = [
      "// STATUS_LABEL[view.status] in a line comment",
      "/* name: \"robots\" in a block comment */",
      '{/* Xero, HubSpot in a JSX comment */}',
      '<Badge variant={badge.variant}>{badge.label}</Badge>',
      'const u = "https://example.test/x";',
    ].join("\n");
    const out = stripComments(src);
    expect(out).not.toContain("STATUS_LABEL[view.status]");
    expect(out).not.toContain('name: "robots"');
    expect(out).not.toContain("Xero, HubSpot");
    expect(out).toContain("<Badge variant={badge.variant}>{badge.label}</Badge>");
    expect(out).toContain("https://example.test/x");
  });

  it("objectBlock brace-matches the map it is pointed at", () => {
    const code = 'const MAP: Record<X, Y> = { a: () => ({ k: 1 }), b: () => ({}) };\nconst NEXT = 1;';
    expect(objectBlock(code, "MAP: Record<X, Y>")).toBe("{ a: () => ({ k: 1 }), b: () => ({}) }");
    expect(objectBlock(code, "NOT_THERE")).toBe("");
  });
});

describe("D-2 — an expired proposal must read as expired everywhere on the page", () => {
  const page = surface(PROPOSAL_PAGE);

  it("reads the file it claims to guard (cannot pass by finding nothing)", () => {
    expect(page.code.length).toBeGreaterThan(2000);
    expect(page.code).toContain("export default function");
  });

  it("has ONE typed badge map, keyed by the same DecisionState the panel uses", () => {
    // A `Record<DecisionState, …>` makes a new state a COMPILE ERROR here, which
    // is the guarantee a regex can never give: a state added without copy cannot
    // silently fall back to the record's status.
    expect(page.code).toContain("DECISION_BADGE: Record<DecisionState,");
    const map = objectBlock(page.code, "DECISION_BADGE: Record<DecisionState,");
    expect(map.length).toBeGreaterThan(0);
    const missing = DECISION_STATES.filter((state) => !new RegExp(`(^|[\\s{,])"?${state}"?:`).test(map));
    expect(missing).toEqual([]);
  });

  it("the expiry entry does NOT fall back to the record's own status", () => {
    // The bug in one line: `status: pending` + a lapsed window. If `expired`
    // ever delegates to `recordBadge(...)` again, the badge says "Awaiting your
    // decision" over a panel that says nothing can be accepted.
    const map = objectBlock(page.code, "DECISION_BADGE: Record<DecisionState,");
    const expiredLine = map.split("\n").find((l) => /^\s*"?expired"?:/.test(l)) ?? "";
    expect(expiredLine).not.toBe("");
    expect(expiredLine).not.toContain("recordBadge");
    expect(expiredLine).not.toContain("STATUS_LABEL");
  });

  it("the rendered badge comes out of that map — never a raw status lookup", () => {
    // The regression, verbatim: `<Badge variant={STATUS_BADGE[view.status]}>`
    // with `{STATUS_LABEL[view.status]}` as its child.
    expect(page.code).toContain("DECISION_BADGE[state]");
    expect(page.code).toContain("<Badge variant={badge.variant}>{badge.label}</Badge>");
    expect(page.code).not.toMatch(/STATUS_LABEL\s*\[\s*view\.status\s*\]/);
    expect(page.code).not.toMatch(/STATUS_BADGE\s*\[\s*view\.status\s*\]/);
    // And the badge element itself must not index the record.
    const badgeTag = /<Badge[\s\S]{0,200}?<\/Badge>/.exec(page.code)?.[0] ?? "";
    expect(badgeTag).not.toBe("");
    expect(badgeTag).not.toContain("view.status");
  });
});

describe("D-3 — a survey share link is a private client link", () => {
  it("EVERY share route sets noindex, nofollow in head() — not just the survey", () => {
    // Structural, not per-case: a sixth share route added tomorrow is covered.
    const routes = readdirSync(join(ROOT, "src", "routes"))
      .filter((f) => /\.share\.\$slug\.tsx$/.test(f))
      .sort();
    expect(routes.length).toBeGreaterThanOrEqual(5);
    const bad: string[] = [];
    for (const file of routes) {
      const code = stripComments(readFileSync(join(ROOT, "src", "routes", file), "utf-8"));
      const hasRobots = /name:\s*"robots"/.test(code) && /noindex,\s*nofollow/.test(code);
      if (!hasRobots) bad.push(`src/routes/${file} — no robots meta in head()`);
    }
    expect(bad).toEqual([]);
  });

  it("the survey page route declares it in head()", () => {
    const route = surface(SURVEY_ROUTE);
    expect(route.code).toMatch(/head:\s*\(\)\s*=>/);
    expect(route.code).toMatch(/name:\s*"robots"/);
    expect(route.code).toMatch(/noindex,\s*nofollow/);
  });

  it("the survey API lane sends the headers too — the meta tag cannot cover JSON", () => {
    // A crawler can fetch /api/native/survey/share/<slug> directly; the page's
    // meta tag does nothing for that response. Booking's lane (192b-2) sends
    // both headers on EVERY answer via `withNoStore`; the survey lane now does.
    const router = surface(SURVEY_ROUTER);
    expect(router.code).toMatch(/x-robots-tag"?:\s*"noindex, nofollow"/);
    expect(router.code).toMatch(/cache-control"?:\s*"no-store"/);
    const handler = objectBlock(router.code, "export function handleNativeSurveyShare");
    expect(handler.length).toBeGreaterThan(0);
    expect(router.code).toContain(".then(withNoStore)");
  });
});

describe("P-3 — /case-studies states no integration count it cannot back", () => {
  const page = surface(CASE_STUDIES);

  it("reads the file it claims to guard", () => {
    expect(page.code).toContain("caseStudies");
    expect(page.code.length).toBeGreaterThan(1000);
  });

  it("no hand-written 'live-verified integrations' claim survives", () => {
    // The hero said "our own live-verified integrations — Xero, HubSpot,
    // DocuSign, Slack, Google, and Microsoft 365": six names against a grid
    // rendering eight slugs and a capability catalog listing three wired. There
    // is no honest number to put back, so the claim is gone and the cards below
    // name their own integrations.
    expect(page.code).not.toMatch(/live-verified\s+integrations/i);
    expect(page.code).not.toMatch(/Xero,\s*HubSpot/);
  });

  it("no count of integrations is hardcoded in the page copy", () => {
    // The class of bug, not the one string: any "N integrations" in rendered
    // copy has to come from data or not exist.
    const countClaim = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:[a-z-]+\s+){0,2}integrations\b/i;
    expect(page.code).not.toMatch(countClaim);
  });
});
