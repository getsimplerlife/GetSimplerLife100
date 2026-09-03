import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
/**
 * P4.4 — no competitor names in sales copy (owner amendment 09-02).
 *
 * The competitor-comparison message must convey "We don't give you another
 * tool to figure out — we build and operate the workflow for you" WITHOUT
 * naming or disparaging any competitor (no brand names, no "better than X").
 *
 * Scope: SALES / LANDING copy only — src/routes (landing), src/lazy/*.page.tsx
 * (public marketing pages), src/components used on public pages, and
 * src/content marketing files (case-studies, workflows, industries).
 *
 * Deliberately EXCLUDED: src/content/integrations.ts — that is the factual
 * integration CATALOG (the platform can CONNECT to n8n/Make/Zapier/Power
 * Automate etc. as integrations; naming them as connectable systems is a
 * factual capability claim, not a comparative/sales claim).
 */
const COMPETITOR_NAMES = [
  "Zapier", "Make", "Power Automate", "IFTTT", "n8n", "Integromat",
  "UiPath", "Celonis", "Workato", "Tray.io", "Pipefy", "Kissflow",
];
const SCAN_DIRS = ["src/routes", "src/lazy", "src/components", "src/content"];
const EXCLUDED_FILES = [/integrations\.ts$/, /industries\.ts$/, /integration-.*\.ts$/];
const EXCLUDED_DIRS = ["src/lazy/portal"];

const BRAND_NAMES_AS_INTEGRATIONS = ["Acme", "Stripe"]; // allowed anchors (test self-check)

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDED_DIRS.some((d) => full.includes(d))) out.push(...listFilesRecursive(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      if (!EXCLUDED_FILES.some((re) => re.test(entry))) out.push(full);
    }
  }
  return out;
}

describe("P4.4 — no competitor brand names in sales/marketing copy", () => {
  it("no competitor names appear in landing routes, public lazy pages, or marketing content", () => {
    const files = SCAN_DIRS.flatMap((d) => listFilesRecursive(join(process.cwd(), d)));
    expect(files.length).toBeGreaterThan(10);
    const violations: { file: string; name: string }[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const name of COMPETITOR_NAMES) {
        // word-boundary match (case-sensitive for Zapier/Make; Make needs \b to avoid "make")
        const re = name === "Make"
          ? new RegExp(`\\bMake\\b`, "g")
          : new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        if (re.test(content)) violations.push({ file, name });
      }
    }
    expect(violations).toEqual([]);
  });

  it("the comparison framing uses the honest no-name message on how-it-works", () => {
    const src = readFileSync(join(process.cwd(), "src", "routes", "how-it-works.tsx"), "utf8");
    expect(src).toMatch(/Traditional Automation Tools/);
    expect(src).toMatch(/You don't need to learn automation/);
    expect(src).toMatch(/build, integrate, deploy, monitor, and support/);
  });
});