/**
 * P0 integrity fixes (audit 10-23 — B1/B2/A3): guard suite for the portal
 * workflow builder + analytics honesty.
 *  - B2: builder save payload carries ONLY real workflow fields (no invented
 *    metrics, no agent-era references); server workflows POST whitelists.
 *  - B1: analytics (data + admin) use ONE shared real derivation with no
 *    fabricated effort numbers.
 *  - A3: the dead generate POST is gone — honest disabled state instead.
 * Read-only source assertions plus a unit check on the exported payload
 * builder. No server/auth files are modified by this suite.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWorkflowSavePayload } from "../lazy/portal.workflows.builder.page";

const P = (rel: string) => join(process.cwd(), rel);
const read = (rel: string) => readFileSync(P(rel), "utf8");

const builderSrc = read("src/lazy/portal.workflows.builder.page.tsx");
const serverSrc = read("prod-server.ts");

describe("P0 integrity fixes (B1/B2/A3)", () => {
  describe("B2 — workflow save payload is honest", () => {
    it("exports a payload builder that only carries real fields", () => {
      const payload = buildWorkflowSavePayload("Test flow", "desc", [
        {
          id: "s1",
          name: "Step one",
          type: "action",
          icon: "⚙️",
          description: "do the thing",
          config: { endpoint: "x" },
          // @ts-expect-error legacy agent-era field must never be serialized
          assignedEmployee: "emp-1",
        },
      ]);
      expect(Object.keys(payload).sort()).toEqual(["description", "name", "status", "steps"]);
      expect(payload.status).toBe("Active");
      expect(payload.steps).toHaveLength(1);
      expect(payload.steps[0]).not.toHaveProperty("assignedEmployee");
      expect(Object.keys(payload.steps[0]).sort()).toEqual([
        "config",
        "description",
        "icon",
        "id",
        "name",
        "type",
      ]);
    });

    it("builder source never fabricates metrics and has no dead generate POST", () => {
      expect(builderSrc).not.toContain('"/api/workflows/generate"');
      expect(builderSrc).not.toContain('"/api/data/employees"');
      expect(builderSrc).not.toMatch(/successRate|lastTriggered|dependencies:/);
      expect(builderSrc).not.toContain('"PDF Parser, Slack App, CRM Integration"');
      expect(builderSrc).not.toContain('"1.4s"');
      expect(builderSrc).not.toMatch(/errors:\s*0/);
    });

    it("shows an honest unavailable state instead of theater generation", () => {
      expect(builderSrc).toContain("Generation isn't available yet");
      expect(builderSrc).toMatch(/disabled/);
      expect(builderSrc).not.toContain("isGenerating");
    });

    it("saves via /api/data/workflows through the payload builder", () => {
      expect(builderSrc).toContain('"/api/data/workflows"');
      expect(builderSrc).toContain("buildWorkflowSavePayload(");
    });
  });

  describe("B1 — analytics returns real counts only", () => {
    it("has ONE shared derivation used by BOTH analytics handlers", () => {
      const uses = serverSrc.match(/computePortalAnalyticsSnapshot\(\)/g) ?? [];
      expect(uses.length).toBe(3); // definition + data + admin call sites
      const dataStart = serverSrc.indexOf('subPath === "analytics" || subPath === "analytics/"');
      const adminStart = serverSrc.indexOf('if (subPath === "analytics") {');
      expect(dataStart).toBeGreaterThan(-1);
      expect(adminStart).toBeGreaterThan(-1);
      expect(
        serverSrc.slice(dataStart, dataStart + 400).includes("computePortalAnalyticsSnapshot()")
      ).toBe(true);
      expect(
        serverSrc.slice(adminStart, adminStart + 200).includes("computePortalAnalyticsSnapshot()")
      ).toBe(true);
    });

    it("never computes fabricated effort numbers", () => {
      expect(serverSrc).not.toMatch(/hours\s*:/);
      expect(serverSrc).not.toContain("47.3");
      expect(serverSrc).not.toMatch(/successRate|lastTriggered/);
    });

    it("departments derive only name/count/percentage/color from real data", () => {
      const helper = serverSrc.slice(
        serverSrc.indexOf("function computePortalAnalyticsSnapshot"),
        serverSrc.indexOf('if (pathname.startsWith("/api/data/")) {')
      );
      expect(helper).toContain("percentage: Math.round((count / totalCat) * 100)");
      expect(helper).toContain("count,");
      expect(helper).toContain("color: deptColors");
      expect(helper).not.toMatch(/hours\s*:/);
    });
  });

  describe("B2 server — workflows POST whitelists persisted fields", () => {
    it("does not spread the client body into the workflow entry", () => {
      const start = serverSrc.indexOf('subPath === "workflows" || subPath === "workflows/"');
      const end = serverSrc.indexOf("\n      }\n", start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      const postRegion = serverSrc.slice(start, end);
      expect(postRegion).toContain("const entry = {");
      expect(postRegion).not.toContain("...body");
      expect(postRegion).toContain('name: typeof body.name === "string" ? body.name : "Untitled workflow"');
      expect(postRegion).toContain("steps: Array.isArray(body.steps) ? body.steps : []");
      expect(postRegion).toContain('status: typeof body.status === "string" ? body.status : "draft"');
    });
  });

  describe("A3 — no dead generate theater POST", () => {
    it("removes the SPA-fallback generate call from the builder", () => {
      expect(builderSrc).not.toMatch(/fetch\(\s*["'`]\/api\/workflows\/generate/);
    });
  });
});