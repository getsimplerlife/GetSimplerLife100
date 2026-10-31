/**
 * copy-cleanup-141.test.ts — SLICE 141 copy guard (2026-10-30), widened by SLICE 148.
 *
 * WHY THIS FILE EXISTS: an earlier "copy clean" verdict passed while the LIVE
 * site still said "Blueprint" on /case-studies, /industries/* and /resources/*,
 * and still sold the provider-reconnect program the owner retired on 10-20.
 * The old greps only ever scanned `src/lib` — a directory that holds almost no
 * customer copy. So this guard scans the directories a buyer actually reads.
 *
 * SLICE 148 added the four roots the slice-141 version never looked at —
 * `src/lazy`, `src/tools`, `src/api`, `src/native` — because that gap is
 * exactly why /integrations kept shipping "[ REAL-TIME BLUEPRINT CONSOLE ]",
 * "simulate the S1 Agent executing live workloads" and an "Automation
 * Feasibility Blueprint … $5,000.00" line item while this test was green.
 * Seven roots now; if a copy directory is ever added under `src/`, add it here.
 *
 * Manual probe list after a publish (a 200 is not proof — read the body text):
 * see `docs/copy-guard-probe-list.md`.
 *
 * What it pins:
 *   1. ZERO retired vocabulary in customer-facing copy:
 *        "blueprint"      — retired product vocabulary
 *        "reconnect"      — the retired provider-reconnect program (owner 10-20)
 *        "re-consent"     — the retired one-click re-consent flow
 *        "self-healing"   — an unverifiable reliability claim
 *        "S1 Agent" / "autonomous operations" — the retired agent runtime
 *        "AI agent/employee/coworker/workforce/operations team" — same
 *        "Connection Pack" / "Sprint" — retired SKUs
 *        "14AbJ" / "4gMfZ" — retired Stripe price ids
 *        "Deploy Live" — retired deploy control
 *   2. The only place that vocabulary may survive is REAL CODE, and only the
 *      documented files: import-lane credential-health state names (a client
 *      reconnecting their OWN provider credential is a real runtime state, not
 *      a customer promise) and the retirement record in stripe-webhook.ts.
 *      Anything outside that allow-list fails, so a new reconnect promise
 *      cannot be added without a deliberate edit here.
 *   3. The CaseStudy shape carries `pattern`, not `blueprint`, and every reader
 *      reads `pattern` — the word cannot creep back through the data model.
 *   4. The `xero-resilience` case study is GONE, its URL fails closed, and no
 *      surviving case study claims reconnect / re-consent / self-healing.
 *   5. The dead `src/components/IndustryLanding.tsx` stays deleted.
 *   6. Every case-study URL in the sitemap resolves to a real entry.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { caseStudies } from "../content/case-studies";

const REPO = existsSync(join(process.cwd(), "prod-server.ts"))
  ? process.cwd()
  : join(process.cwd(), "..", "..");
const read = (rel: string): string => {
  const p = join(REPO, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(abs);
  }
  return out;
}

/** The directories a customer actually reads copy from. SLICE 148 widened this
 *  from three roots to seven: `src/lazy` (every code-split page — this is where
 *  /integrations, /demos/workflows, /tools, /assessment and the portal pages
 *  actually live), `src/tools` (the analyzer that generates report text),
 *  `src/api` and `src/native` (server modules that hold user-visible strings). */
const COPY_DIRS = [
  "src/components",
  "src/content",
  "src/routes",
  "src/lazy",
  "src/tools",
  "src/api",
  "src/native",
];

/** Vocabulary that must not appear in SERVER CODE either — the four terms that
 *  have no legitimate code meaning anywhere. The agent-runtime terms below are
 *  deliberately NOT in this set: `src/agents/*`, `src/lib/agent-processor.ts`
 *  and the retirement records still name what was retired until the control
 *  plane slice removes the runtime. That is tracked separately, not silently
 *  ignored here. */
const CODE_RETIRED: Array<[RegExp, string]> = [
  [/blueprint/i, "retired product vocabulary"],
  [/\breconnect/i, "retired provider-reconnect program"],
  [/re-?consent/i, "retired one-click re-consent flow"],
  [/self[-\s]?heal/i, "unverifiable self-healing claim"],
];

/** The full retired-term list, enforced across all seven copy roots. */
const RETIRED_COPY: Array<[RegExp, string]> = [
  ...CODE_RETIRED,
  [/\bS1 Agent\b/i, "claims an agent executes customer work"],
  [/autonomous operations/i, "retired agent-era console naming"],
  [/\bAI[-\s]?agents?\b/i, "implies an AI agent runtime we do not run"],
  [/\bAI[-\s]?employees?\b/i, "implies an AI employee product"],
  [/\bAI Operations Team\b/i, "implies an AI staff we do not sell"],
  [/\bAI[-\s]?coworkers?\b/i, "implies AI coworkers"],
  [/\bAI workforce\b/i, "implies an AI workforce"],
  [/\bConnection Packs?\b/i, "retired Connection Pack SKU"],
  [/\bSprints?\b/i, "retired Sprint SKU"],
  [/14AbJ/, "retired Stripe price id"],
  [/4gMfZ/, "retired Stripe price id"],
  [/\bDeploy Live\b/i, "retired deploy control"],
];

/** Genuine false positives — a match on this exact line of this exact file is
 *  not customer copy. Keep this list tiny and justified; it is the only way a
 *  retired word survives the sweep below. */
const LINE_WHITELIST: Array<{ file: string; line: RegExp; why: string }> = [
  // The automation-analyzer entry was retired by slice 153: its industry keyword
  // list said "blueprint", which slice 153 renamed to "site plan", so the term is
  // genuinely gone rather than whitelisted. A stale entry here now fails the test.
  {
    file: "src/lazy/portal.tasks.index.page.tsx",
    // `aiEmployee` is the field name in the /api/data/tasks payload; the column
    // the tenant reads is headed "Automation" and shows the automation's label.
    // Renaming it is an API-contract change, not a copy change.
    line: /aiEmployee/,
    why: "server payload field name for the automation label; the rendered column is 'Automation'",
  },
];

/** Files where the words are CODE, not copy — import-lane credential health
 *  (a real runtime state) and the record of what was retired. Nothing else.
 *  prod-server.ts is here because health state names and comments live beside
 *  the routes; the RENDERED html is pinned separately by
 *  native-import-copy-sweep.test.ts, which asserts the SSR output carries no
 *  "reconnect" / "one-click reconnect". */
const CODE_ALLOW_LIST = [
  "prod-server.ts",
  "src/lib/connection-health.ts",
  "src/lib/connected-accounts.ts",
  "src/lib/token-refresher.ts",
  "src/lib/connection-refresh-lock.ts",
  "src/lib/durable-store.ts",
  "src/lib/data-store.ts",
  "src/lib/stripe-webhook.ts",
  "src/api/integrationRoutes.ts",
  "src/native/import/types.ts",
  "src/native/import/xero-source.ts",
  "src/native/import/hubspot-source.ts",
  "src/native/import/onedrive-source.ts",
  "src/native/import/google-drive-source.ts",
  "src/native/import/google-calendar-source.ts",
  "src/native/import/dropbox-source.ts",
  "src/native/import/box-source.ts",
  "src/native/import/sharepoint-source.ts",
  "src/native/import/sftp-source.ts",
  "src/native/import/slack-source.ts",
  "src/native/import/sendgrid-source.ts",
];

describe("slice 141 — retired vocabulary is out of the copy a buyer reads", () => {
  it("no retired term anywhere in the seven copy roots", () => {
    const hits: string[] = [];
    const whitelisted: string[] = [];
    for (const dir of COPY_DIRS) {
      for (const file of walk(join(REPO, dir))) {
        const rel = file.replace(REPO + "/", "");
        // Code files whose words are deliberate and already governed by the
        // allow-list test below: the import lanes carry a real credential-health
        // state named "reconnect" (a client reconnecting their OWN credential),
        // and integrationRoutes.ts is named in CODE_ALLOW_LIST. They are not
        // copy, so the copy sweep does not re-litigate them here.
        if (rel.startsWith("src/native/import/") || CODE_ALLOW_LIST.includes(rel)) continue;
        const text = readFileSync(file, "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          for (const [re, why] of RETIRED_COPY) {
            if (!re.test(lines[i])) continue;
            const allowed = LINE_WHITELIST.find((w) => w.file === rel && w.line.test(lines[i]));
            if (allowed) {
              whitelisted.push(`${rel}:${i + 1} → ${allowed.why}`);
              continue;
            }
            hits.push(`${rel}:${i + 1} → ${why} (${re})`);
          }
        }
      }
    }
    expect(
      hits,
      `retired copy is live on the site:\n${hits.join("\n")}`,
    ).toEqual([]);
    // The whitelist is not allowed to grow into a hiding place: only the
    // documented customer-input keyword line and the one API field name may
    // land here, and every documented entry must still be doing work.
    const whitelistedFiles = new Set(whitelisted.map((w) => w.slice(0, w.indexOf(":"))));
    expect(
      whitelistedFiles.size,
      `unexpected whitelisted copy:\n${whitelisted.join("\n")}`,
    ).toBeLessThanOrEqual(LINE_WHITELIST.length);
    for (const w of LINE_WHITELIST) {
      expect(whitelistedFiles.has(w.file), `stale whitelist entry for ${w.file} (${w.why})`).toBe(true);
    }
  });

  it("the words survive only as code in the documented allow-list", () => {
    const scanned = [
      ...walk(join(REPO, "src/lib")),
      ...walk(join(REPO, "src/api")),
      ...walk(join(REPO, "src/native")),
      join(REPO, "prod-server.ts"),
    ];
    const hits: string[] = [];
    for (const file of scanned) {
      const rel = file.replace(REPO + "/", "");
      if (CODE_ALLOW_LIST.includes(rel)) continue;
      if (rel.startsWith("src/native/import/")) continue;
      if (rel.includes("/test/")) continue;
      const text = readFileSync(file, "utf8");
      for (const [re] of CODE_RETIRED) {
        if (re.test(text)) hits.push(`${rel} → ${re}`);
      }
    }
    expect(
      hits,
      `a new file carries retired vocabulary outside the allow-list:\n${hits.join("\n")}`,
    ).toEqual([]);
  });
});

describe("slice 148 — the retired demo console and the $5,000 product stay gone", () => {
  const INTEGRATIONS = read("src/lazy/integrations.index.page.tsx");
  const DEMOS = read("src/lazy/demos.workflows.page.tsx");
  const BUILDER = read("src/lazy/portal.admin.workflow-builder.page.tsx");

  it("the integration console describes a simulation, never an agent executing work", () => {
    expect(INTEGRATIONS).not.toBe("");
    expect(/executing live workloads/i.test(INTEGRATIONS)).toBe(false);
    expect(/S1 Agent/i.test(INTEGRATIONS)).toBe(false);
    // The honest replacement is present, so the section still reads as a demo.
    expect(INTEGRATIONS).toContain("simulated run");
    expect(INTEGRATIONS).toContain("S1 Workflow Simulator");
  });

  it("the retired $5,000 line item is gone from the workflow demo bundle", () => {
    expect(DEMOS).not.toBe("");
    expect(DEMOS.includes("$5,000"), "the retired $5,000 product is back in the bundle").toBe(false);
    expect(/Automation Feasibility/i.test(DEMOS)).toBe(false);
    // The invoice demo still needs two line items to show multi-line extraction.
    expect(DEMOS).toContain("Operational Assessment (40 hrs)");
    expect(DEMOS).toContain("Documentation hand-off package");
  });

  it("the workflow-builder export is named for what it is: workflow JSON", () => {
    expect(BUILDER).not.toBe("");
    expect(BUILDER).toContain(".workflow.json");
    expect(BUILDER).toContain("Export Workflow (JSON)");
    // No action may claim an LLM reasoning engine executes (LLM is OFF by default).
    expect(/LLM reasoning engine/i.test(BUILDER)).toBe(false);
  });
});

describe("slice 141 — the CaseStudy model carries `pattern`, never `blueprint`", () => {
  const CONTENT = read("src/content/case-studies.ts");

  it("the interface declares `pattern: string` and no `blueprint` field", () => {
    expect(CONTENT).toContain("pattern: string;");
    expect(/blueprint/i.test(CONTENT), "case-studies.ts still names a blueprint field").toBe(false);
  });

  it("every reader reads `pattern`", () => {
    for (const rel of ["src/components/CaseStudyPage.tsx", "src/lazy/case-studies.index.page.tsx"]) {
      const src = read(rel);
      expect(src, `${rel} is missing — it is the reader of the field`).not.toBe("");
      expect(src, `${rel} must read cs.pattern`).toContain("cs.pattern");
      expect(/cs\.blueprint/i.test(src), `${rel} still reads cs.blueprint`).toBe(false);
    }
  });

  it("each case study still describes a real pattern (the rename kept the copy)", () => {
    expect(caseStudies.length).toBeGreaterThan(0);
    for (const cs of caseStudies) {
      expect(typeof cs.pattern, `${cs.id} has no pattern text`).toBe("string");
      expect(cs.pattern.length, `${cs.id} pattern text is empty`).toBeGreaterThan(20);
      expect(cs.walkthrough.length, `${cs.id} has no walkthrough`).toBeGreaterThan(0);
    }
  });
});

describe("slice 141 — the retired reconnect program is gone from the case studies", () => {
  it("no case study id or copy is about keeping connections alive", () => {
    const ids = caseStudies.map((cs) => cs.id);
    expect(ids, "the reconnect case study is still in the array").not.toContain("xero-resilience");
    expect(new Set(ids).size, "duplicate case-study ids").toBe(ids.length);
    for (const cs of caseStudies) {
      const blob = [cs.title, cs.pattern, cs.verificationNote, ...cs.walkthrough].join("\n");
      expect(/reconnect|re-?consent|self[-\s]?healing/i.test(blob), `${cs.id} still sells reconnect`).toBe(
        false,
      );
    }
  });

  it("the quote-to-cash verification note credits Xero without the retired parenthetical", () => {
    const q2c = caseStudies.find((cs) => cs.id === "quote-to-cash");
    expect(q2c).toBeTruthy();
    expect(q2c!.verificationNote).toContain("Xero");
    expect(/self[-\s]?healing|reconnect|re-?consent/i.test(q2c!.verificationNote)).toBe(false);
  });

  it("/case-studies/xero-resilience fails closed — 404, never a half-empty page", () => {
    const route = read("src/routes/case-studies.$caseStudyId.tsx");
    expect(route, "the detail route must fail closed on an unknown id").toMatch(/throw notFound\(\)/);
    expect(route).toContain("notFoundComponent");
    // And the lazy page keeps its own guard so an unknown id can never render
    // a detail page with an empty title/walkthrough.
    const page = read("src/lazy/case-studies.$caseStudyId.page.tsx");
    expect(page).toMatch(/if \(!data\)/);
    expect(page).toContain("Case study not found");
  });

  it("the sitemap advertises only case studies that exist", () => {
    const sitemap = read("public/sitemap.xml");
    const ids = [...sitemap.matchAll(/\/case-studies\/([a-z0-9-]+)</g)].map((m) => m[1]);
    const known = new Set(caseStudies.map((cs) => cs.id));
    const stale = ids.filter((id) => !known.has(id));
    expect(stale, `sitemap points at case studies that no longer exist: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("slice 141 — the dead IndustryLanding component stays deleted", () => {
  it("src/components/IndustryLanding.tsx does not exist and nothing imports it", () => {
    expect(existsSync(join(REPO, "src/components/IndustryLanding.tsx"))).toBe(false);
    const hits: string[] = [];
    for (const file of walk(join(REPO, "src"))) {
      const rel = file.replace(REPO + "/", "");
      if (rel.startsWith("src/test/")) continue;
      if (readFileSync(file, "utf8").includes("IndustryLanding")) hits.push(rel);
    }
    expect(hits, `dangling IndustryLanding reference: ${hits.join(", ")}`).toEqual([]);
  });
});
