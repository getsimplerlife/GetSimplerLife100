import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { integrations, integrationWiring, hasAdapterLane } from "../content/integrations";
/**
 * Integration explorer tier segmentation — SLICE 207.
 *
 * WHAT THIS FILE USED TO BE. Until slice 207 it asserted, in a test, that
 * `src/lazy/integrations.index.page.tsx` contained the sentence
 *
 *   "Live today you can connect Xero, Slack, Google, Microsoft 365, HubSpot, and DocuSign"
 *
 * and that ten catalog entries carried `status: "live"`. Both were false: no
 * integration in this product has ever carried a real tenant record, no tenant
 * has ever connected a provider, and the sentence named six providers as live
 * on the public site. A test written from the bug can only confirm the bug, so
 * this file no longer asserts the page's own prose. It asserts the CATALOGUE
 * against the FILESYSTEM: a tier is only allowed to claim a lane if the lane's
 * code is on disk, and a tier may never claim liveness at all.
 *
 * It also cannot pass by finding nothing: the counts are asserted.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const VALID = new Set(["import-lane", "adapter-lane", "roadmap"]);

describe("the catalogue's wiring model", () => {
  it("has three tiers and no 'live' value at all", () => {
    for (const i of integrations) {
      const raw = i.status ?? "roadmap";
      expect(VALID.has(raw), `${i.id} carries an unknown status ${JSON.stringify(raw)}`).toBe(true);
    }
    // Nothing anywhere in the catalogue may be labelled live/verified/connected.
    expect(read("src/content/integrations.ts")).not.toContain('status: "live"');
  });

  it("fails closed to roadmap when the field is absent or unrecognised", () => {
    const base = integrations[0];
    expect(integrationWiring({ ...base, status: undefined })).toBe("roadmap");
    expect(integrationWiring({ ...base, status: "nonsense" as never })).toBe("roadmap");
    expect(hasAdapterLane({ ...base, status: undefined })).toBe(false);
  });

  it("every 'import-lane' entry has a real import source file on disk", () => {
    const lanes = integrations.filter((i) => integrationWiring(i) === "import-lane");
    expect(lanes.length).toBeGreaterThanOrEqual(4);
    for (const i of lanes) {
      expect(
        existsSync(join(ROOT, "src/native/import", `${i.id}-source.ts`)),
        `${i.id} is marked import-lane but src/native/import/${i.id}-source.ts does not exist`,
      ).toBe(true);
    }
  });

  it("every 'adapter-lane' entry has a provider client directory on disk", () => {
    const adapters = integrations.filter((i) => integrationWiring(i) === "adapter-lane");
    expect(adapters.length).toBeGreaterThanOrEqual(7);
    for (const i of adapters) {
      expect(
        existsSync(join(ROOT, "src/integrations/providers", i.id)),
        `${i.id} is marked adapter-lane but src/integrations/providers/${i.id}/ does not exist`,
      ).toBe(true);
    }
  });

  it("the three tiers partition the catalogue exactly once each", () => {
    for (const i of integrations) {
      const hits = [
        integrationWiring(i) === "import-lane",
        integrationWiring(i) === "adapter-lane",
        !hasAdapterLane(i),
      ].filter(Boolean).length;
      expect(hits, `${i.id} fell into ${hits} tiers`).toBe(1);
    }
  });
});

describe("the explorer page reads the canonical source, not its own list", () => {
  const src = read("src/lazy/integrations.index.page.tsx");

  it("derives every tier through integrationWiring / hasAdapterLane", () => {
    expect(src).toContain("integrationWiring");
    expect(src).toContain("hasAdapterLane");
    expect(src).toContain("const importLaneIntegrations = filteredIntegrations.filter((i) => integrationWiring(i) === \"import-lane\")");
    expect(src).toContain("const adapterOnlyIntegrations = filteredIntegrations.filter((i) => integrationWiring(i) === \"adapter-lane\")");
    expect(src).toContain("const roadmapIntegrations = filteredIntegrations.filter((i) => !hasAdapterLane(i))");
  });

  it("labels the tiers as what they are", () => {
    expect(src).toContain("Import lanes");
    expect(src).toContain("Adapter code only");
    expect(src).toContain("In development / Roadmap");
  });

  it("keeps the notify-me capture for the tiers with no lane", () => {
    expect(src).toContain("Notify me when live");
    expect(src).toContain("/api/tools/capture-lead");
    expect(src).toContain("notify-when-live");
  });
});

describe("the integration detail page badges the lane, not a liveness", () => {
  const src = read("src/components/IntegrationPage.tsx");

  it("uses integrationWiring for all three badge states", () => {
    expect(src).toContain("integrationWiring");
    expect(src).toContain("Import lane");
    expect(src).toContain("Adapter code only");
    expect(src).toContain("In development / Roadmap");
  });

  it("no longer claims the platform talks to every provider bi-directionally", () => {
    expect(src).not.toContain("communicates bi-directionally");
  });
});
