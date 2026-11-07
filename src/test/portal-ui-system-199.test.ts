/**
 * portal-ui-system-199.test.ts — the portal is built from ONE component set.
 *
 * Why this exists. The owner's directive (2026-11-06): *"keep the dark emerald
 * look. just make it consistent on every page and improve the visual aspect of
 * search bars and buttons all around."* Consistency is not a thing you do once;
 * it is a thing that erodes the moment the next page is written by hand. The
 * read-failure class taught us the lesson: a class of bug is closed by a guard
 * that FAILS THE BUILD, not by a sweep that fixes today's instances.
 *
 * So this file does two jobs.
 *
 * ── JOB 1: no portal page hand-rolls a control ───────────────────────────────
 * Every `src/lazy/portal*.page.tsx` and `src/routes/portal*.tsx` is scanned for
 * a raw `<button` or `<input`. Anything outside `src/components/ui.tsx` must be
 * covered by an `ALLOWED` entry with a written reason and a COUNT BUDGET.
 *
 * The budget is the mechanism, and it is deliberately strict in three ways:
 *   1. A file with no entry may not contain a single raw control. A new page
 *      written by hand fails on the commit that writes it.
 *   2. A file with an entry may never EXCEED its budget — the count can only go
 *      down, so a page that adds a raw button while migrating another still
 *      fails.
 *   3. An entry whose file no longer contains any raw control FAILS, with a
 *      message telling you to delete the entry. An allow-list that silently
 *      stops applying is the same bug in a different costume (public-stats-guard
 *      makes the identical rule, for the identical reason).
 *
 * Converting a page means deleting its entry in the same commit. That is the
 * whole enforcement story, and it is why the list can only shrink.
 *
 * ── JOB 2: the component defects cannot come back ────────────────────────────
 * The five source-level defects slice 199 fixed were each measured in code
 * before they were fixed (see `src/components/ui.tsx`'s header). Each one is
 * pinned below, so re-introducing it is a red test, not a screenshot nobody
 * takes:
 *   · `shadow-emerald-100` / `shadow-rose-100` — a light-mode glow on a
 *     near-black page, with no `dark:` override to save it.
 *   · `focus:ring-2 focus:ring-offset-2` with no offset colour — a white halo.
 *   · `variant="success"` on `Button` — byte-identical to `primary`, which is
 *     how a failed approval once rendered in the colour of "Submit".
 *   · an `Input` with no placeholder colour — the browser's mid-grey reads as
 *     typed text on `bg-stone-950`.
 *   · a hand-rolled search bar on the search page instead of the shared one.
 *
 * WHAT THIS GUARD DOES NOT COVER, deliberately and not silently:
 *   · Rendered output. It reads source. `screens/199/` is the browser evidence,
 *     and the lead's rule stands: a green suite is not evidence a page renders.
 *   · `src/components/*` other than `ui.tsx`. Several of those are shared with
 *     public pages, which this slice was told not to touch.
 *   · A control that is a raw `<select>`/`<textarea>`. There is no shared
 *     component for those yet, so pinning them would demand a component that
 *     does not exist. They inherit the base-layer dark form rules in `app.css`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const REPO = process.cwd();
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

/**
 * Code only, no prose. The lead's rule (slice 186): a banned-token guard must
 * pin the CALL, never the words in our own comments — otherwise the comment
 * that explains the defect fails the guard that forbids it.
 */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/\s.*$/gm, "");

/** A raw control: the JSX opening tag, not the word inside a comment we own. */
const RAW_BUTTON = /<button[\s>]/g;
const RAW_INPUT = /<input[\s>]/g;
const count = (rx: RegExp, src: string) => (src.match(rx) || []).length;

const SCANNED_DIRS = ["src/lazy", "src/routes"];

function portalFiles(): string[] {
  const out: string[] = [];
  for (const dir of SCANNED_DIRS) {
    for (const file of readdirSync(join(REPO, dir)).sort()) {
      // `portal.page.tsx` (the shell) and every `portal.*` route/page.
      if (/^portal.*\.tsx$/.test(file)) out.push(`${dir}/${file}`);
    }
  }
  return out;
}

interface Budget {
  buttons: number;
  inputs: number;
  reason: string;
}

/**
 * SHORT AND SHRINK-ONLY. Each entry is a page whose controls were NOT converted
 * in slice 199; the numbers are what is left at the merge head. To convert a
 * page, remove its entry. Do not raise a number — that is the bug this guard
 * exists to catch.
 */
const ALLOWED: Record<string, Budget> = {
  "src/lazy/portal.$auditId.page.tsx": { buttons: 2, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.accessreview.index.page.tsx": { buttons: 1, inputs: 5, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.admin.analytics.page.tsx": { buttons: 1, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.admin.audit.page.tsx": { buttons: 3, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.admin.credentials.page.tsx": { buttons: 7, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.admin.data-health.page.tsx": { buttons: 2, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.admin.index.page.tsx": { buttons: 2, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.admin.page-views.page.tsx": { buttons: 1, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.admin.page.tsx": { buttons: 2, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.admin.workflow-builder.page.tsx": { buttons: 3, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.analytics.index.page.tsx": { buttons: 1, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.approvals.index.page.tsx": { buttons: 5, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.audit-logs.index.page.tsx": { buttons: 5, inputs: 1, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.automations.index.page.tsx": { buttons: 1, inputs: 7, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.boards.index.page.tsx": { buttons: 0, inputs: 5, reason: "not converted in 199 (form fields); budget may only shrink" },
  "src/lazy/portal.bookings.index.page.tsx": { buttons: 1, inputs: 6, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.checklists.index.page.tsx": { buttons: 1, inputs: 3, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.communications.index.page.tsx": { buttons: 6, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.dashboards.index.page.tsx": { buttons: 0, inputs: 5, reason: "not converted in 199 (form fields); budget may only shrink" },
  "src/lazy/portal.deal-rooms.index.page.tsx": { buttons: 1, inputs: 4, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.dedupe.index.page.tsx": { buttons: 0, inputs: 8, reason: "not converted in 199 (form fields); budget may only shrink" },
  "src/lazy/portal.document-ai.index.page.tsx": { buttons: 2, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.forms.index.page.tsx": { buttons: 2, inputs: 6, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.import.index.page.tsx": { buttons: 0, inputs: 1, reason: "not converted in 199 (form fields); budget may only shrink" },
  "src/lazy/portal.index.page.tsx": { buttons: 5, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.industries.index.page.tsx": { buttons: 1, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.integrations.index.page.tsx": { buttons: 11, inputs: 2, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.integrations.providers.page.tsx": { buttons: 1, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.invoices.index.page.tsx": { buttons: 5, inputs: 2, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.knowledgebase.index.page.tsx": { buttons: 0, inputs: 7, reason: "not converted in 199 (form fields); budget may only shrink" },
  "src/lazy/portal.notifications.index.page.tsx": { buttons: 2, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.page.tsx": { buttons: 3, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.proposals.index.page.tsx": { buttons: 2, inputs: 6, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.secure-transport.index.page.tsx": { buttons: 0, inputs: 11, reason: "not converted in 199 (form fields); budget may only shrink" },
  "src/lazy/portal.settings.index.page.tsx": { buttons: 8, inputs: 6, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.surveys.index.page.tsx": { buttons: 1, inputs: 5, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.tables.index.page.tsx": { buttons: 7, inputs: 8, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.tasks.index.page.tsx": { buttons: 1, inputs: 0, reason: "not converted in 199 (row/icon buttons and page-local toggles); budget may only shrink" },
  "src/lazy/portal.transforms.index.page.tsx": { buttons: 1, inputs: 7, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.vault.index.page.tsx": { buttons: 2, inputs: 1, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.webhooks.index.page.tsx": { buttons: 0, inputs: 5, reason: "not converted in 199 (form fields); budget may only shrink" },
  "src/lazy/portal.workflows.builder.page.tsx": { buttons: 5, inputs: 1, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
  "src/lazy/portal.workflows.index.page.tsx": { buttons: 6, inputs: 2, reason: "not converted in 199 (row/icon buttons and page-local toggles + form fields); budget may only shrink" },
};

describe("slice 199 — the portal is built from one component set", () => {
  it("scans the real portal surface and says how much it scanned", () => {
    // A guard that passes by finding nothing is worse than no guard (the
    // read-failure guard's lesson). Pin the shape of what is scanned.
    const files = portalFiles();
    expect(files.length).toBeGreaterThanOrEqual(55);
    expect(files).toContain("src/lazy/portal.search.index.page.tsx");
    expect(files).toContain("src/lazy/portal.index.page.tsx");
    expect(files).toContain("src/lazy/portal.page.tsx");
    expect(files.some((f) => f.startsWith("src/routes/"))).toBe(true);
  });

  it("no portal page hand-rolls a raw <button> or <input> beyond its budget", () => {
    const offenders: string[] = [];
    let convertedFiles = 0;
    for (const file of portalFiles()) {
      const src = read(file);
      const buttons = count(RAW_BUTTON, src);
      const inputs = count(RAW_INPUT, src);
      const budget = ALLOWED[file];
      if (!budget) {
        if (buttons || inputs) {
          offenders.push(
            `${file}: ${buttons} raw <button>, ${inputs} raw <input> — use Button/SearchInput/Input from ~/components/ui`
          );
        } else {
          convertedFiles += 1;
        }
        continue;
      }
      if (buttons > budget.buttons || inputs > budget.inputs) {
        offenders.push(
          `${file}: ${buttons} raw <button> (budget ${budget.buttons}), ${inputs} raw <input> (budget ${budget.inputs})`
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
    // The conversion actually happened: the core pages carry no allowance.
    expect(convertedFiles).toBeGreaterThanOrEqual(10);
  });

  it("every allow-list entry still applies — the list can only shrink", () => {
    const stale: string[] = [];
    for (const [file, budget] of Object.entries(ALLOWED)) {
      let src: string;
      try {
        src = read(file);
      } catch {
        stale.push(`${file}: file no longer exists — delete the entry`);
        continue;
      }
      const buttons = count(RAW_BUTTON, src);
      const inputs = count(RAW_INPUT, src);
      if (buttons === 0 && inputs === 0) {
        stale.push(`${file}: fully converted — delete the entry`);
        continue;
      }
      if (buttons !== budget.buttons || inputs !== budget.inputs) {
        stale.push(
          `${file}: budget says ${budget.buttons}/${budget.inputs}, file has ${buttons}/${inputs} — lower the budget to what is left (or delete the entry if it is 0)`
        );
      }
      if (!budget.reason || budget.reason.trim().length < 12) {
        stale.push(`${file}: an allow-list entry needs a written reason`);
      }
    }
    expect(stale, stale.join("\n")).toEqual([]);
  });

  it("the search page uses the shared SearchInput and hand-rolls nothing", () => {
    const src = read("src/lazy/portal.search.index.page.tsx");
    expect(src).toMatch(/from "~\/components\/ui"/);
    expect(src).toMatch(/\bSearchInput\b/);
    expect(src).toMatch(/\bPageHeader\b/);
    expect(count(RAW_INPUT, src)).toBe(0);
    // The exact string that was the second search-bar look in the product.
    expect(src).not.toContain("pl-11 pr-4 py-3.5");
  });
});

describe("slice 199 — ui.tsx is the one place a control is defined", () => {
  const ui = () => read("src/components/ui.tsx");
  const css = () => read("src/styles/app.css");

  it("exports the whole component set from the ONE library", () => {
    const src = ui();
    for (const name of [
      "Button",
      "Input",
      "SearchInput",
      "PageHeader",
      "EmptyState",
      "ListRow",
      "Badge",
      "Alert",
      "Card",
      "Modal",
      "Tabs",
      "buttonClass",
      "BUTTON_VARIANTS",
    ]) {
      expect(src, `ui.tsx must export ${name}`).toMatch(
        new RegExp(`export (const|function|type) ${name}\\b`)
      );
    }
  });

  it("has NO success button variant — success is a status, not an action", () => {
    const src = ui();
    const variants = src.match(/BUTTON_VARIANTS = \[([^\]]*)\]/);
    expect(variants, "BUTTON_VARIANTS must exist").toBeTruthy();
    expect(variants![1]).not.toContain("success");
    // …and nothing in the variant map paints a green fill twice.
    expect(src).not.toMatch(/"success":/);
  });

  it("emerald is the CTA and NOT also the success colour (tokens differ)", () => {
    const src = css();
    const cta = src.match(/--color-cta:\s*(#[0-9a-fA-F]{3,8})/);
    const success = src.match(/--color-success:\s*(#[0-9a-fA-F]{3,8})/);
    expect(cta, "app.css must define --color-cta").toBeTruthy();
    expect(success, "app.css must define --color-success").toBeTruthy();
    expect(cta![1].toLowerCase()).not.toBe(success![1].toLowerCase());
  });

  it("no light-mode glow survives on a dark page", () => {
    const src = codeOnly(ui());
    for (const banned of ["shadow-emerald-100", "shadow-rose-100"]) {
      expect(src, `${banned} is a light-mode glow with no dark: override`).not.toContain(banned);
    }
  });

  it("focus is focus-visible, with a ring offset colour that is not white", () => {
    const src = codeOnly(ui());
    const base = src.match(/const BUTTON_BASE =([\s\S]*?);/);
    expect(base, "BUTTON_BASE must exist").toBeTruthy();
    const baseSrc = base![1];
    expect(baseSrc).toContain("focus-visible:ring-offset-stone-950");
    // The defect was `focus:ring-2 … focus:ring-offset-2` — a mouse click drew a
    // ring, and the offset it drew was the browser's white.
    expect(baseSrc).not.toMatch(/focus:ring-2/);
    expect(baseSrc).not.toMatch(/focus:ring-offset-2/);
    expect(baseSrc).toContain("focus-visible:ring-2");
  });

  it("Button defaults to type=button — a button in a form must not submit it", () => {
    expect(ui()).toMatch(/type = "button"/);
  });

  it("Button has a loading state that does not shift layout", () => {
    const src = ui();
    expect(src).toMatch(/aria-busy=\{loading/);
    expect(src).toMatch(/loading && <Spinner/);
    // Children stay in the layout while the spinner overlays them.
    expect(src).toMatch(/invisible contents/);
  });

  it("Input carries a placeholder colour and a legible error state", () => {
    const src = ui();
    expect(src).toContain("placeholder:text-stone-500");
    expect(src).toContain("INPUT_ERROR_CLASS");
    expect(src).toContain("text-rose-300");
  });

  it("the dark form rules are in the base layer, so raw fields are fixed too", () => {
    const src = css();
    expect(src).toMatch(/input::placeholder,\s*\n\s*textarea::placeholder/);
    expect(src).toContain("--tw-ring-offset-color: #0c0a09");
  });

  it("Badge defaults to a neutral status, never brand green", () => {
    // The default was `emerald`, which made any status a page did not classify
    // render in the CTA colour — the collision that reached a real approval.
    expect(ui()).toMatch(/variant = "stone"/);
  });
});
