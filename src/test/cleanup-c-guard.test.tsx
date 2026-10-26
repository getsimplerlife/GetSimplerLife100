/**
 * CLEANUP (c) guard (10-26): the AI-employee layer is retired.
 *
 * Retired in this slice:
 *   - .data/ai_employees.json  (the LAST global cross-tenant store — deleting
 *     it + its seed restores the literal zero-cross-tenant-file guarantee)
 *   - src/data/agents.ts       (the 17-agent seed catalog with per-agent
 *     prices + legacy per-agent Stripe links — module deleted)
 *   - src/lib/employee-attention.ts (only consumer was the employees handler)
 *   - /api/data/employees + /api/data/marketplace subPath handlers
 *   - /api/agents/run + /api/agents/:id/pause|resume|status
 *   - per-agent purchase gating: the run-gate 402 path, the per-agent
 *     payment-link/meta matchers (agentPaymentLink / matchAgentBy*),
 *     suggestion price-ids, plan-agent GRANTS (the grant list is now ALWAYS
 *     empty and no employees store is read), lead-email roster matching,
 *     and the employees seed/repair inside seedDataFiles.
 *
 * KEPT by design (guardrail-pinned legacy runtime): the tier LINK mapping in
 * src/lib/stripe-webhook.ts (stripe-catalog-guardrail asserts the retired
 * tier constants still resolve there) and the plan purchase branch (the
 * legacy checkout mapping + packSlot redemption stay functional; it writes
 * an EMPTY grant list and never touches an employees store).
 *
 * Assertions:
 *   1. ZERO retired literals in product source (src/lazy|routes|api|native),
 *      prod-server.ts, the two server libs that owned the layer, and every
 *      .data/*.json in the worktree.
 *   2. The dead server surfaces fail closed on the live self-hosted server:
 *      /api/agents/run (never registered) → 404 JSON; the retired data
 *      subPaths → 401 JSON anon (auth gate) and, authed, the documented
 *      catch-all empty-store shape ({data: []}) — never SPA HTML, never a
 *      roster.
 *   3. Isolation positive: seedDataFiles on a FRESH dir creates NO global
 *      employees store, no catalog/attention module exists on disk, and the
 *      user-visible "AI Employee" spoken copy is gone from reachable code.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";
import { seedDataFiles } from "../lib/data-store";

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
const serverSrc = read("prod-server.ts");
const libFiles: Array<[string, string]> = [
  "src/lib/stripe-webhook.ts",
  "src/lib/data-store.ts",
].map((f) => [f, read(f)] as [string, string]);

function assertAbsent(items: Array<[string, string]>, re: RegExp, label: string) {
  const hits = items.filter(([, src]) => re.test(src)).map(([n]) => n);
  expect(hits, `${label} — found in ${hits.join(", ")}`).toEqual([]);
}

const ALL_SCOPES = [...productSrc, ["prod-server.ts", serverSrc], ...libFiles] as Array<[string, string]>;

describe("CLEANUP (c) — AI-employee layer retired", () => {
  describe("zero retired literals in product source, server, libs and .data", () => {
    it.each([
      ["the global store name", /ai_employees/],
      ["the employees API path", /\/api\/data\/employees/],
      ["the employees file constant", /AI_EMPLOYEES_FILE/],
      ["per-agent run gate message", /Purchase required to run this agent/],
      ["suggested per-agent price-id field", /suggestedAgentPriceId/],
      ["per-agent payment-link/meta matchers", /agentPaymentLink|matchAgentByPaymentLink|matchAgentByMetadata/],
      ["employees-attention enrichment", /enrichEmployeesAttention/],
    ])("%s — zero references remain", (label, re) => {
      assertAbsent(ALL_SCOPES, re as RegExp, String(label));
    });

    it("src/data/agents.ts + src/lib/employee-attention.ts are deleted", () => {
      expect(existsSync(join(REPO, "src/data/agents.ts"))).toBe(false);
      expect(existsSync(join(REPO, "src/lib/employee-attention.ts"))).toBe(false);
    });

    it("no .data/*.json in the worktree mentions the retired store", () => {
      const dataDir = join(REPO, ".data");
      if (!existsSync(dataDir)) return; // fresh worktrees carry no runtime data
      for (const f of readdirSync(dataDir)) {
        if (!f.endsWith(".json")) continue;
        const content = readFileSync(join(dataDir, f), "utf8");
        expect(content, `.data/${f} mentions the retired store`).not.toMatch(/ai_employees/);
      }
    });

    it("no retired-store literals remain anywhere in src/lib + src/integrations", () => {
      const libAndInt = [...walkTs("src/lib"), ...walkTs("src/integrations")];
      assertAbsent(libAndInt, /ai_employees|AI_EMPLOYEES_FILE/, "retired-store literals (libs+integrations)");
    });

    it("reachable 'AI Employee' spoken copy is zero across product src, src/lib and src/integrations", () => {
      // The slice-c sweep covers the USER-VISIBLE employee wording too: the
      // file-creation reply string and the run-notification email templates.
      // Dead runtime modules (src/agents/**, the provider-api/agent-processor
      // leftovers) are a separate follow-on purge.
      const libAndInt = [...walkTs("src/lib"), ...walkTs("src/integrations")];
      assertAbsent([...productSrc, ...libAndInt], /AI Employee|AI employee/i, "AI Employee spoken copy");
    });

    it("the server never reads an employees store and grants NO plan agents", () => {
      expect(serverSrc).not.toMatch(/AI_EMPLOYEES_FILE/);
      expect(serverSrc).not.toMatch(/readJSON\(join\(DATA_DIR, "ai_employees/);
      // The kept plan branch must not materialize agent grants — the call is
      // always planAgentIds([], …) so the grant list stays empty.
      expect(serverSrc).toContain("planAgentIds([], planSpec)");
      expect(serverSrc).not.toMatch(/const employees = readJSON\(AI_EMPLOYEES_FILE\)/);
    });
  });

  describe("retired surfaces fail closed (live self-hosted server)", () => {
    const BASE_URL = testBaseUrl();
    beforeAll(async () => {
      await ensureTestServer();
    });

    it("anonymous /api/data/employees → 401 JSON (auth gate first, never HTML)", async () => {
      const res = await fetch(`${BASE_URL}/api/data/employees`);
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type") || "").toContain("application/json");
      expect((await res.json()).error).toBe("Not authenticated");
    });

    it("anonymous /api/data/marketplace → 401 JSON (subPath retired)", async () => {
      const res = await fetch(`${BASE_URL}/api/data/marketplace`);
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type") || "").toContain("application/json");
    });

    it("/api/agents/run (any verb) → 404 JSON — the per-agent runtime is gone", async () => {
      const res = await fetch(`${BASE_URL}/api/agents/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "invoice-processor-v1" }),
      });
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type") || "").toContain("application/json");
      expect((await res.json()).error).toBe("not found");
    });

    it("/api/tools/analyze no longer returns per-agent pricing/link fields", async () => {
      const res = await fetch(`${BASE_URL}/api/tools/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "test" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.analysis).toBeDefined();
      expect(json.analysis.suggestedAgentPriceId).toBeUndefined();
      expect(json.analysis.paymentLink).toBeUndefined();
    });
  });

  describe("isolation positive — no global employees store is created or read", () => {
    it("seedDataFiles on a FRESH dir creates no ai_employees.json", () => {
      const fresh = join(testDataDir(), "cleanup-c-fresh-" + Date.now());
      seedDataFiles(fresh);
      expect(existsSync(join(fresh, "ai_employees.json"))).toBe(false);
    });

    it("prod-server performs no store read keyed to a global employees file", () => {
      // Everything about the employees store was removed with the layer — any
      // future re-introduction would trip the literal scans above. This pin
      // makes the isolation property explicit: no readJSON call in the server
      // may reference a retired-store filename.
      expect(serverSrc).not.toMatch(/AI_EMPLOYEES_FILE/);
      expect(serverSrc).not.toMatch(/readJSON\(join\(DATA_DIR, "ai_employees/);
    });
  });
});