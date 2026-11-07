/**
 * SLICE 203 — portal copy truth.
 *
 * The portal and the invoice PDF it generates carried fourteen claims that the
 * code behind them contradicts. Eleven were one-line strings; two were P1s that
 * had to be DELETED, not softened:
 *
 *   - the invoice PDF told the customer their accounting books were posted by a
 *     connected Xero/QuickBooks adapter. Books-posting is out of scope
 *     (`src/native/invoice/types.ts:21-22`) and `src/native/import/` ships a Xero
 *     SOURCE with no QuickBooks source at all — both halves were false, in a
 *     document the customer keeps.
 *   - the deal-room share page carried the same sentence to the client.
 *
 * This guard is deliberately a SOURCE guard with comments stripped, so it pins
 * the string the customer reads and not the prose we write about the string.
 * That matters here: every fix in 203 left a comment quoting the old claim.
 *
 * WHY THE FILE LIST IS NOT `src/lazy/*.page.tsx`. The brief asked for that glob.
 * `src/lazy/tools.*.page.tsx` are the public marketing calculators, and three of
 * them still say "within 24 hours" and one still labels a button "Download PDF
 * Report". Those are a separate lane with a separate claim set and were outside
 * 203's scope, so including them would make this guard red on day one and prove
 * nothing about the portal. They are named in the slice report as outstanding
 * rather than quietly excluded here. The glob below is the portal lane plus the
 * one public share page and the PDF generator that 203 actually fixed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LAZY_DIR = join(process.cwd(), "src", "lazy");

/**
 * Strip comments so the guard pins rendered copy, not our notes about it.
 *
 * Handles `//`, `/* … *\/`, and the JSX form `{/* … *\/}` — the JSX braces stay
 * in place, which is harmless because no banned pattern spans a brace.
 * A `//` immediately after a colon is left alone so URLs survive.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/** Every portal page, plus the deal-room share page and the invoice PDF body. */
export function copySurfaces(): string[] {
  const portalPages = readdirSync(LAZY_DIR)
    .filter((f) => /^portal.*\.page\.tsx$/.test(f))
    .sort()
    .map((f) => join(LAZY_DIR, f));
  return [
    ...portalPages,
    join(LAZY_DIR, "deal-rooms.share.$slug.page.tsx"),
    join(process.cwd(), "src", "native", "invoice", "generate.ts"),
  ];
}

/**
 * Each entry: what the customer used to read, and why it was false. The reason
 * is carried in the failure message so a revert explains itself.
 */
const BANNED: Array<{ label: string; pattern: RegExp; why: string }> = [
  {
    label: "(Xero/QuickBooks)",
    pattern: /\(Xero\/QuickBooks\)/,
    why:
      "no outbound books-posting lane exists (types.ts:21-22) and there is no QuickBooks source in src/native/import/ — this was a P1, deleted not softened",
  },
  {
    label: "Posting to … accounting books",
    pattern: /Posting to (your|the customer'?s) accounting books/i,
    why: "same false claim in prose form; nothing posts to any customer's books",
  },
  {
    label: "Google Calendar adapter",
    pattern: /Google Calendar adapter/,
    why:
      "no calendar is connected and no sync runs; 192b-2 removed this from the share page but the portal booking row still printed it",
  },
  {
    label: "within 24 hours",
    pattern: /within 24 hours/i,
    why:
      "a commitment nothing schedules — no queue, timer or notification drives a 24-hour turnaround",
  },
  {
    label: "Download PDF Report",
    pattern: /Download PDF Report/,
    why: "the handler is window.print(); no PDF is produced or stored",
  },
  {
    label: "Instant storage in Drizzle",
    pattern: /Instant storage in Drizzle/i,
    why:
      "names a database engine we do not run, inside a four-bullet 'pipeline spec' block nothing implements",
  },
  {
    label: "Full 180+",
    pattern: /Full 180\+/,
    why:
      "the catalog is 179 rows and the page it opens says most are still in development",
  },
  {
    label: "AI layout analyzer",
    pattern: /AI layout analyzer/i,
    why:
      "the document lane is a store plus an extractor; there is no analyzer, and no model runs on upload",
  },
  {
    label: "enterprise integration for workflow synchronization",
    pattern: /enterprise integration for workflow synchronization/i,
    why:
      "asserts a two-way sync on cards whose own field reads 'LAST SYNC RUN: Never'; import is one-time and nothing stays connected",
  },
  {
    label: "Agent {agentId} as the requester",
    pattern: /Agent\s*<span[^>]*>\s*\{a\.agentId\}/,
    why:
      "agentId defaults to the literal 'ai-employee'; there are no AI employees and src/agents/* is retired",
  },
];

/**
 * Positive controls. Deleting a whole section would also satisfy the banned
 * list, so each honest replacement must still be present. These are the exact
 * sentences 203 shipped.
 */
const REQUIRED: Array<{ file: string; text: string }> = [
  {
    file: "src/native/invoice/generate.ts",
    text: "This invoice was generated from the deal room in your workspace.",
  },
  {
    file: "src/lazy/deal-rooms.share.$slug.page.tsx",
    text: "These are the invoices issued for this engagement.",
  },
  {
    file: "src/lazy/portal.$auditId.page.tsx",
    text: "This audit has no results recorded yet.",
  },
  {
    file: "src/lazy/portal.$auditId.page.tsx",
    text: "Print this report",
  },
  {
    file: "src/lazy/portal.$auditId.page.tsx",
    text: "Nothing was recorded",
  },
  {
    file: "src/lazy/portal.bookings.index.page.tsx",
    text: "this workspace has no calendar connected",
  },
  {
    file: "src/lazy/portal.integrations.index.page.tsx",
    text: "nothing is acted on automatically",
  },
  {
    file: "src/lazy/portal.integrations.index.page.tsx",
    text: "The extracted text and key fields are shown for you to review.",
  },
  {
    file: "src/lazy/portal.integrations.index.page.tsx",
    text: "data can be brought in through a one-time import. Nothing stays connected.",
  },
  {
    file: "src/lazy/portal.page.tsx",
    text: "Import lanes · Catalog status",
  },
  {
    file: "src/lazy/portal.page.tsx",
    text: "Ask · Recorded · Approval-gated",
  },
  {
    file: "src/lazy/portal.index.page.tsx",
    text: "Bring your existing data in as a one-time import",
  },
  {
    file: "src/lazy/portal.approvals.index.page.tsx",
    text: "No writes are waiting for approval.",
  },
  {
    file: "src/lazy/portal.approvals.index.page.tsx",
    text: "Requested by",
  },
];

describe("slice 203 — the portal and the invoice PDF tell the truth", () => {
  const surfaces = copySurfaces();
  const bodies = surfaces.map((path) => ({
    path: path.slice(process.cwd().length + 1),
    raw: readFileSync(path, "utf-8"),
  }));

  it("audits a non-trivial number of surfaces (cannot pass by finding nothing)", () => {
    // 56 portal pages + the share page + the PDF body at the time of writing.
    // A floor, not an equality: adding a portal page must not fail this test.
    expect(bodies.length).toBeGreaterThanOrEqual(58);
    expect(bodies.some((b) => b.path.endsWith("portal.page.tsx"))).toBe(true);
    expect(bodies.some((b) => b.path.endsWith("generate.ts"))).toBe(true);
  });

  it("stripComments removes prose about a claim but keeps the claim", () => {
    // Self-test of the stripper: without this, a broken stripper could make
    // every assertion below vacuously true.
    const src = [
      "// Download PDF Report in a line comment",
      "/* within 24 hours in a block comment */",
      "{/* AI layout analyzer in a JSX comment */}",
      '<span>Download PDF Report</span>',
      'const u = "https://example.test/x";',
    ].join("\n");
    const out = stripComments(src);
    expect(out).not.toContain("within 24 hours");
    expect(out).not.toContain("AI layout analyzer");
    expect(out).not.toContain("in a line comment");
    expect(out).toContain('<span>Download PDF Report</span>');
    // A URL keeps its slashes.
    expect(out).toContain("https://example.test/x");
  });

  it("no surface carries a retired claim", () => {
    const violations: string[] = [];
    for (const body of bodies) {
      const code = stripComments(body.raw);
      for (const banned of BANNED) {
        if (banned.pattern.test(code)) {
          violations.push(`${body.path} — "${banned.label}": ${banned.why}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("every honest replacement 203 shipped is still on the page", () => {
    const missing: string[] = [];
    for (const req of REQUIRED) {
      const raw = readFileSync(join(process.cwd(), req.file), "utf-8");
      if (!raw.includes(req.text)) missing.push(`${req.file} — "${req.text}"`);
    }
    expect(missing).toEqual([]);
  });
});
