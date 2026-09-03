/**
 * homepage-agent-roster.test.ts — guard: the public homepage pricing section
 * must surface the FULL AI-employee roster (all 17 agents from the canonical
 * data source) so buyers see every employee name + monthly price before
 * purchase.
 *
 * The homepage renders the roster by mapping over `AGENTS` (src/data/agents.ts)
 * inside the "Monthly per AI Employee" card. Names/prices are injected at
 * runtime from that single source. This test asserts:
 *  1) the homepage source imports + maps over the canonical AGENTS module
 *     (no forked copy, no hardcoded names),
 *  2) the price markup renders from `agent.price}"/mo"` (catalog price, not a
 *     stale literal),
 *  3) every one of the 17 agent NAMES appears in the built browser bundle —
 *     i.e. the rendered output the buyer actually sees on the homepage.
 *
 * The bundle is checked for names only (minifiers split numeric price strings
 * into fragments, so exact "$950/mo" literals do not survive minification;
 * names are string literals and do).
 *
 * NOTE: the bundle check requires a prior `bun run build` — the canonical
 * repo flow always builds before testing, and dist/ is gitignored + rebuilt
 * per release.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { AGENTS } from "../data/agents";

const homeSource = readFileSync("src/routes/index.tsx", "utf8");
const agentsSource = readFileSync("src/data/agents.ts", "utf8");

// Pick the newest built entry bundle (contains the hydrated homepage HTML).
function builtEntryBundle(): string | null {
  const dir = "dist/assets";
  try {
    const files = readdirSync(dir).filter((f) => f.startsWith("index-") && f.endsWith(".js"));
    if (files.length === 0) return null;
    return join(dir, files[files.length - 1]);
  } catch {
    return null;
  }
}

describe("homepage AI-employee roster", () => {
  it("canonical data source exposes all 17 agents with catalog prices", () => {
    expect(AGENTS.length).toBe(17);
    // Spot-check the verified Stripe catalog prices are the data source.
    expect(agentsSource).toContain('price: 950');
    expect(agentsSource).toContain('price: 2000');
    expect(agentsSource).toContain('price: 499');
    expect(agentsSource).toContain('price: 1500');
  });

  it("homepage maps over the canonical AGENTS source (not a fork)", () => {
    expect(homeSource).toMatch(/import\s*\{\s*AGENTS\s*\}\s*from\s*["']~\/data\/agents["']/);
    expect(homeSource).toMatch(/AGENTS\.map\(/);
  });

  it("all 17 AI employee names appear in the built homepage bundle (rendered output)", () => {
    const bundle = builtEntryBundle();
    expect(bundle, "dist/assets entry bundle missing — run `bun run build` first").toBeTruthy();
    const out = readFileSync(bundle!, "utf8");
    const missing = AGENTS.filter((a) => !out.includes(a.name)).map((a) => a.name);
    expect(missing).toEqual([]);
  });

  it("homepage renders each price from the agent's catalog price (/mo)", () => {
    // Renders "$" + agent.price + "/mo" — the minified bundle splits these
    // fragments, so assert the source expression (proves catalog wiring).
    expect(homeSource).toMatch(/agent\.price\}\/mo/);
  });
});