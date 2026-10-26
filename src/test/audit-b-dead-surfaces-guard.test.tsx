/**
 * AUDIT-B guard (10-26): dead surfaces retired + banned-vocab coverage
 * extended to the paths the standing greps missed.
 *
 * The six dead endpoints (verified 0 server literals at audit time) must
 * have ZERO client or server references anywhere in product source. The
 * "Connect AI" page/route/lib is retired. The /api/admin/backup Health
 * button is now WIRED to the real durable-store snapshot flow instead of a
 * 404, the admin Audit page derives stats from the REAL /api/audit-logs
 * store, and the /demo simulation is honestly labeled.
 *
 * Coverage extension (audit gap): the older banned-vocab greps only scanned
 * src/portal|native|site|pages|routes. This suite additionally scans
 * src/lazy/**, src/routes/**, src/api/**, src/native/** and prod-server.ts,
 * and pins the retired-consistent vocabulary to zero there.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO = process.cwd();
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

function walkTs(dir: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (p: string) => {
    for (const e of readdirSync(p)) {
      const full = join(p, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (e.endsWith(".ts") || e.endsWith(".tsx")) {
        out.push([full.replace(REPO + "/", ""), readFileSync(full, "utf8")]);
      }
    }
  };
  walk(dir);
  return out;
}

const productSrc = [
  ...walkTs("src/lazy"),
  ...walkTs("src/routes"),
  ...walkTs("src/api"),
  ...walkTs("src/native"),
];
const lazSrc = walkTs("src/lazy");
const serverSrc = read("prod-server.ts");

function assertAbsent(items: Array<[string, string]>, re: RegExp, label: string) {
  const hits = items.filter(([, src]) => re.test(src)).map(([n]) => n);
  expect(hits, `${label} — found in ${hits.join(", ")}`).toEqual([]);
}

describe("AUDIT-B — dead surfaces retired + vocab coverage extended", () => {
  describe("six dead endpoints: zero literals in product source + server", () => {
    it.each([
      ["/api/audit-logs/stats", /audit-logs\/stats/],
      ["/api/connect-ai/mapping (all connect-ai forms)", /connect-ai|connectAI/],
      ["/api/workflows/generate", /workflows\/generate/],
      ["/api/v1/trigger", /v1\/trigger/],
      ["/api/portal/files/view", /files\/view/],
    ])("%s — no references remain", (_label, re) => {
      assertAbsent(productSrc, re as RegExp, String(_label));
      expect(serverSrc).not.toMatch(re as RegExp);
    });
  });

  describe("'Connect AI' page + route + lib are retired", () => {
    it("deletes the page, its route file and its API lib", () => {
      expect(existsSync(join(REPO, "src/routes/portal.workflows.connect.tsx"))).toBe(false);
      expect(existsSync(join(REPO, "src/lazy/portal.workflows.connect.page.tsx"))).toBe(false);
      expect(existsSync(join(REPO, "src/api/connectAI.ts"))).toBe(false);
    });
    it("'Connect AI' vocabulary is gone from product source and server", () => {
      assertAbsent(productSrc, /Connect AI/i, "Connect AI vocab");
      expect(serverSrc).not.toMatch(/Connect AI/i);
    });
    it("route tree no longer registers /portal/workflows/connect", () => {
      const rt = join(REPO, "src/routeTree.gen.ts");
      // Generated at build time (gitignored) — only pin when present.
      if (existsSync(rt)) expect(read("src/routeTree.gen.ts")).not.toMatch(/workflows\/connect/);
    });
  });

  describe("B-wired endpoints are REAL now", () => {
    it("/api/admin/backup is wired to the real durable-store snapshot flow", () => {
      expect(serverSrc).toMatch(/subPath === "backup"/);
      const adminRegion = serverSrc.slice(
        serverSrc.indexOf('if (pathname.startsWith("/api/admin/"))'),
        serverSrc.indexOf("Unknown admin resource")
      );
      expect(adminRegion).toMatch(/runBackupSnapshot\(\)/);
    });
    it("Health page posts to the wired endpoint and claims no fake paths/sizes", () => {
      const health = lazSrc.find(([n]) => n.includes("portal.admin.health.page"))?.[1] ?? "";
      expect(health).toContain('"/api/admin/backup"');
      expect(health).not.toMatch(/size_kb|json\.path/);
      expect(health).toMatch(/Backup snapshot completed/);
    });
    it("admin Audit page derives stats from the REAL /api/audit-logs store", () => {
      const audit = lazSrc.find(([n]) => n.includes("portal.admin.audit.page"))?.[1] ?? "";
      expect(audit).not.toContain("audit-logs/stats");
      expect(audit).toContain("data.data || []");
      expect(audit).toContain("/api/audit-logs?limit=10000");
      expect(audit).toMatch(/log\.timestamp/);
      expect(audit).not.toMatch(/recentErrors|bySeverity/);
    });
    it("File library view-audit uses the real POST /api/portal/files handler", () => {
      const files = lazSrc.find(([n]) => n.includes("portal.files.index.page"))?.[1] ?? "";
      expect(files).not.toContain("files/view");
      expect(files).toMatch(/await fetch\("\/api\/portal\/files", \{/);
      const hal = serverSrc.slice(serverSrc.indexOf("// ── /api/portal/files"));
      expect(hal).not.toMatch(/files\/view/);
    });
    it("admin workflow builder no longer advertises the dead webhook path", () => {
      const wb = lazSrc.find(([n]) => n.includes("portal.admin.workflow-builder.page"))?.[1] ?? "";
      expect(wb).not.toMatch(/t_webhook|v1\/trigger|X-SL100-Signature/);
    });
  });

  describe("/demo simulation is honestly labeled", () => {
    const demo = lazSrc.find(([n]) => n.includes("demo.page"))?.[1] ?? "";
    it("carries a clear illustrative-example disclosure", () => {
      expect(demo).toMatch(/illustrative example data for demo purposes/);
      expect(demo).toMatch(/(not real|does not reflect) real customer results/);
    });
    it("removes the agent-era wording", () => {
      expect(demo).not.toMatch(/Cross-?Agent/);
      expect(demo).not.toMatch(/\bAgents?\b/);
    });
    it("keeps its truthful self-labels (demo-video parity)", () => {
      expect(demo).toMatch(/Interactive Demo/);
      expect(demo).toMatch(/MOCK_AGENTS|MOCK_ACTIVITIES|MOCK_MARKETPLACE/);
    });
  });

  describe("banned-vocab coverage extended to lazy/routes/api/native/server", () => {
    it("retired-era phrases are zero across the extended scope", () => {
      const re =
        /AI Operations Team|AI coworkers|AI Employee|AI agent|AI workforce|AI Agents|Cross-?Agent|Connect AI/i;
      assertAbsent(productSrc, re, "retired-era vocab (lazy/routes/api/native)");
      expect(serverSrc).not.toMatch(re);
    });
    it("demo page keeps the MOCK-* internals but no product-facing individual-worker claims", () => {
      const demo = lazSrc.find(([n]) => n.includes("demo.page"))?.[1] ?? "";
      expect(demo).not.toMatch(/Active Agents/);
      expect(demo).toMatch(/Simulation — everything on this page/);
    });
  });
});