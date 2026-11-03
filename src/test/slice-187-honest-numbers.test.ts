/**
 * slice-187-honest-numbers.test.ts — the engines that used to invent their
 * numbers, and the pages that rendered them.
 *
 * Slice 186 took the fabricated statistics off the marketing pages and left a
 * `DEFERRED` list of four files whose ENGINES still invented their output:
 *
 *   src/tools/assessment-engine.ts        a hard-coded dollar table per workflow,
 *                                         times a size ladder, times a volume ladder
 *   src/components/IndustryRecommendationEngine.tsx  size multipliers, an "85%
 *                                         efficiency rate", a flat $45/hr
 *   src/tools/automation-analyzer.ts      invented hour ranges, a keyword→hours
 *                                         table, and a lookup bug that always
 *                                         returned the first key
 *   src/components/RicherROICalculator.tsx  eight industry presets and a 0.85
 *                                         "reclamation rate" applied silently
 *
 * The rule these tests defend: a number on a public page is honest only when it
 * is arithmetic on an input the visitor supplied, with every assumption shown in
 * the same view and changeable. Everything else is a fabricated statistic.
 *
 * These assertions pin the CALL, never the prose about the call — several of the
 * files explain in comments what was removed, and a guard that greps its own
 * explanation would pass for the wrong reason (or fail for it).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  computeSavings,
  defaultSavingsInputs,
  runAssessment,
  VOLUME_FROM_ANSWER,
  type AssessmentAnswers,
} from "~/tools/assessment-engine";

const REPO = process.cwd();
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const answers: AssessmentAnswers = {
  industry: "manufacturing",
  companySize: "51-200",
  department: "finance",
  topPainPoints: ["invoicing", "data-entry"],
  currentSoftware: ["quickbooks", "outlook"],
  manualProcesses: "Someone downloads invoices from email and types them into QuickBooks every morning.",
  monthlyInvoiceVolume: "101-500",
  hasComplianceNeeds: "none",
  growthPlans: "maintain",
  timeline: "this-quarter",
  budget: "500-2000",
};

describe("slice 187 — the savings model is arithmetic on the visitor's inputs", () => {
  it("computes each step from the four inputs, exactly", () => {
    // 200 items × 6 min = 1200 min = 20 hours a month; ×12 = 240 hours a year;
    // × $30 = $7,200 of labour; × the 50% share the visitor set = $3,600.
    const out = computeSavings({
      monthlyVolume: 200,
      minutesPerItem: 6,
      hourlyCost: 30,
      automationShare: 0.5,
    });
    expect(out.monthlyHours).toBeCloseTo(20, 6);
    expect(out.annualHours).toBeCloseTo(240, 6);
    expect(out.annualLabourValue).toBeCloseTo(7200, 6);
    expect(out.annualSavings).toBeCloseTo(3600, 6);
  });

  it("moves with the visitor, not with a table: doubling the volume doubles the result", () => {
    const base = { minutesPerItem: 4, hourlyCost: 40, automationShare: 0.25 };
    const one = computeSavings({ ...base, monthlyVolume: 100 });
    const two = computeSavings({ ...base, monthlyVolume: 200 });
    expect(two.annualSavings).toBeCloseTo(one.annualSavings * 2, 6);
    expect(two.annualHours).toBeCloseTo(one.annualHours * 2, 6);
  });

  it("the share is the visitor's dial, not a hidden multiplier", () => {
    const base = { monthlyVolume: 100, minutesPerItem: 10, hourlyCost: 50 };
    expect(computeSavings({ ...base, automationShare: 0 }).annualSavings).toBe(0);
    // Full share returns the whole labour value — there is no 0.85 anywhere.
    expect(computeSavings({ ...base, automationShare: 1 }).annualSavings).toBeCloseTo(
      computeSavings({ ...base, automationShare: 1 }).annualLabourValue,
      6
    );
    // Out-of-range input is clamped, not trusted.
    expect(computeSavings({ ...base, automationShare: 3 }).inputs.automationShare).toBe(1);
    expect(computeSavings({ ...base, automationShare: -1 }).inputs.automationShare).toBe(0);
  });

  it("prints its own arithmetic, and the printed lines carry the same numbers", () => {
    const out = computeSavings({
      monthlyVolume: 400,
      minutesPerItem: 3,
      hourlyCost: 60,
      automationShare: 0.5,
    });
    expect(out.lines.length).toBeGreaterThanOrEqual(3);
    const joined = out.lines.join(" ");
    expect(joined).toContain("400");
    expect(joined).toContain(Math.round(out.annualLabourValue).toLocaleString("en-US"));
  });

  it("seeds the volume from the visitor's own answer", () => {
    const seeded = defaultSavingsInputs("501-2000");
    expect(seeded.monthlyVolume).toBe(VOLUME_FROM_ANSWER["501-2000"]);
    // An answer we do not recognise must not become a fabricated volume.
    expect(defaultSavingsInputs("").monthlyVolume).toBe(VOLUME_FROM_ANSWER["101-500"]);
  });

  it("runAssessment reports a savings breakdown and no per-workflow dollar figure", () => {
    const report = runAssessment(answers);
    expect(report.savings).toBeDefined();
    expect(report.savings.lines.length).toBeGreaterThan(0);
    expect(report.topWorkflows.length).toBeGreaterThan(0);
    for (const w of report.topWorkflows) {
      expect(w).not.toHaveProperty("estimatedAnnualSavings");
      // The match score is arithmetic on their answers, so it is a number > 0.
      expect(typeof w.impactScore).toBe("number");
      expect(w.impactScore).toBeGreaterThan(0);
    }
    expect(report).not.toHaveProperty("annualSavings");
  });

  it("the visitor's own inputs reach the report unchanged", () => {
    const inputs = { monthlyVolume: 77, minutesPerItem: 9, hourlyCost: 41, automationShare: 0.35 };
    const report = runAssessment(answers, inputs);
    expect(report.savings.inputs).toMatchObject(inputs);
    expect(report.savings.annualSavings).toBeCloseTo(computeSavings(inputs).annualSavings, 6);
  });
});

describe("slice 187 — the invented tables are gone, not just unrendered", () => {
  it("assessment-engine holds no dollar table and no multiplier ladders", () => {
    const src = read("src/tools/assessment-engine.ts");
    expect(src).not.toMatch(/baseSavings/);
    expect(src).not.toMatch(/sizeMultipliers/);
    expect(src).not.toMatch(/volumeMultipliers/);
    expect(src).not.toMatch(/function calculateAnnualSavings/);
  });

  it("automation-analyzer no longer prices a workflow from a keyword", () => {
    const src = read("src/tools/automation-analyzer.ts");
    expect(src).not.toMatch(/function estimateHoursSaved/);
    expect(src).not.toMatch(/function estimateWeeklyHours/);
    expect(src).not.toMatch(/baseRanges/);
    // The real bug: a predicate that always matched, so the lookup always took
    // the first key and the rest of the table was dead.
    expect(src).not.toMatch(/\.find\(\(\) => true\)/);
  });

  it("the analyzer's result type carries no hour figure", () => {
    const src = read("src/tools/automation-analyzer.ts");
    expect(src).not.toMatch(/estimatedHoursSaved:/);
    expect(src).not.toMatch(/estimatedWeeklyHours:/);
    expect(src).not.toMatch(/savingsSummary:/);
  });

  it("industries.ts carries no per-pain-point hours and no KPI tiles", () => {
    const src = read("src/content/industries.ts");
    expect(src).not.toMatch(/hoursPerWeek/);
    expect(src).not.toMatch(/kpis:/);
    // The specific invented figures the guard used to defer.
    expect(src).not.toContain("10–15% never do");
    expect(src).not.toContain("97% are false positives");
    expect(src).not.toContain("reduce vehicle lifespan by 15–20%");
  });

  it("the recommendation engine multiplies by nothing it invented", () => {
    const src = read("src/components/IndustryRecommendationEngine.tsx");
    expect(src).not.toMatch(/sizeMultiplier/);
    expect(src).not.toMatch(/efficiencyRate/);
    // The three inputs the visitor owns must exist and be rendered.
    expect(src).toMatch(/setWeeklyHours/);
    expect(src).toMatch(/setHourlyCost/);
    expect(src).toMatch(/setAutomationShare/);
    expect(src).toMatch(/The arithmetic/);
  });

  it("the ROI calculator has no industry presets and no silent reclamation rate", () => {
    const src = read("src/components/RicherROICalculator.tsx");
    expect(src).not.toMatch(/INDUSTRY_PRESETS/);
    expect(src).not.toMatch(/applyPreset/);
    expect(src).not.toMatch(/errorRate/);
    expect(src).toMatch(/reclamationShare/);
    expect(src).toMatch(/workingDays/);
  });
});

describe("slice 187 — the pages render what the engines can honestly produce", () => {
  it("the assessment report shows its arithmetic and no labour-rate standard", () => {
    for (const page of ["src/lazy/assessment.page.tsx", "src/lazy/tools.assessment.page.tsx"]) {
      const src = read(page);
      expect(src, `${page} must mount the editable assumptions`).toContain("SavingsAssumptions");
      expect(src).not.toMatch(/Efficiency Rate Target/);
      expect(src).not.toMatch(/labor standard of/);
      expect(src).not.toMatch(/estimatedAnnualSavings/);
      expect(src).not.toMatch(/report\.annualSavings/);
    }
  });

  it("the ROI page states the model instead of an invented basis", () => {
    const src = read("src/lazy/roi-calculator.page.tsx");
    expect(src).not.toMatch(/reclamation rate of/);
    expect(src).not.toMatch(/3x the standard hourly task rate/);
    expect(src).not.toMatch(/averages 21 days/);
    expect(src).toMatch(/The one assumption/);
  });

  it("the workflow page labels its prose tiles as prose", () => {
    const src = read("src/components/WorkflowPage.tsx");
    // Pin the rendered label, not the comment that explains why it changed.
    expect(src).toMatch(/mb-1">🎯 What changes in accuracy</);
    expect(src).not.toMatch(/mb-1">🎯 Operational Accuracy</);
    expect(src).not.toMatch(/mb-1">⏱ Labor Efficiency</);
    expect(src).not.toMatch(/mb-1">📈 Payback Period</);
  });
});

describe("slice 187 — the files the guard deferred are back inside it", () => {
  it("public-stats-guard scans all four with no exemption mechanism left", () => {
    const guard = read("src/test/public-stats-guard.test.ts");
    expect(guard).not.toMatch(/const DEFERRED/);
    for (const f of [
      "src/content/industries.ts",
      "src/components/IndustryRecommendationEngine.tsx",
      "src/lazy/assessment.page.tsx",
      "src/lazy/roi-calculator.page.tsx",
    ]) {
      expect(existsSync(join(REPO, f)), `${f} must still exist`).toBe(true);
      expect(guard).toContain(f);
    }
  });
});
