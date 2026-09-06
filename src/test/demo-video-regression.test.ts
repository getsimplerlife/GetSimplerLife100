import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
/**
 * P4.3 demo-video regression guard.
 *
 * The quote-to-cash demo video is the site's primary credibility asset for
 * the signed-proposal flow. Guards:
 *  1. Assets exist under public/videos (MP4 + poster) so the build copies
 *     them into dist/videos.
 *  2. The homepage embeds the self-hosted MP4 (truthful — no external host)
 *     with a poster and an aria-label on the <video> element (a11y).
 *  3. The landing caption labels the data as "Interactive demo with illustrative data" —
 *     no fabricated customer records, and NO claim of live provider execution
 *     (the /demo pages are static MOCK data, not live provider connections).
 *  4. prod-server.ts serves /videos/* statically (the static allowlist must
 *     include it, otherwise the MP4 404s in production).
 */
const REPO = process.cwd();

describe("P4.3 — quote-to-cash demo video (truthful, self-hosted)", () => {
  it("assets exist under public/videos (MP4 + poster)", () => {
    for (const f of ["quote-to-cash-demo.mp4", "quote-to-cash-demo-poster.jpg"]) {
      const p = join(REPO, "public", "videos", f);
      expect(existsSync(p), `missing ${p}`).toBe(true);
    }
  });

  it("homepage embeds the self-hosted MP4 with poster + aria-label", () => {
    const src = readFileSync(join(REPO, "src", "routes", "index.tsx"), "utf8");
    expect(src).toContain('<source src="/videos/quote-to-cash-demo.mp4" type="video/mp4" />');
    expect(src).toContain('poster="/videos/quote-to-cash-demo-poster.jpg"');
    expect(src).toContain("aria-label=");
  });

  it("landing caption marks the data as illustrative (no fabricated customers)", () => {
    const src = readFileSync(join(REPO, "src", "routes", "index.tsx"), "utf8");
    expect(src).toMatch(/Interactive demo with illustrative data/i);
  });

  it("landing caption never claims live provider execution (truthfulness)", () => {
    const src = readFileSync(join(REPO, "src", "routes", "index.tsx"), "utf8");
    // The /demo pages are static MOCK data — the video must never overstate
    // itself as a live provider pass. The caption must (a) say the flow is
    // *illustrated* by the demo, (b) explicitly disclaim live provider
    // connections, and (c) avoid phrasing that claims live execution.
    expect(src).toMatch(/interactive demo walkthrough/i);
    expect(src).not.toMatch(/live demo walkthrough/i);
    expect(src).not.toMatch(/real provider/i);
    expect(src).toMatch(/no live provider connections/i);
    expect(src).toMatch(/illustrating the signed-proposal flow/i);
  });

  it("site-wide sweep: no user-facing 'live demo' / 'live provider' claims in routes/lazy/components", () => {
    const { readdirSync, statSync } = require("fs");
    const dirs = ["src/routes", "src/lazy", "src/components"];
    const files: string[] = [];
    for (const d of dirs) {
      const walk = (p: string) => {
        for (const e of readdirSync(p)) {
          const full = join(p, e);
          if (statSync(full).isDirectory()) walk(full);
          else if (e.endsWith(".tsx")) files.push(full);
        }
      };
      walk(join(REPO, d));
    }
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Only flag the claim phrases in render copy — the caption's explicit
      // negation "no live provider connections" is REQUIRED and allowed.
      for (const m of src.matchAll(/live[- ]?demo|live[- ]?provider/gi)) {
        // Allow only the caption's explicit negation ("no live provider
        // connections") and the "live demo walkthrough" description — both are
        // the truthful framing the owner-approved caption requires. Anything
        // else ("live demo", "live provider", "live-demo", …) is a claim.
        const line = src.slice(Math.max(0, m.index - 80), m.index + 40);
        if (/no live ?provider connections/i.test(line)) continue;
        if (/live[- ]?demo walkthrough/i.test(line)) continue;
        bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad, `live-demo/live-provider claims found:\n${bad.join("\n")}`).toEqual([]);
  });
  it("prod-server statically serves /videos/*", () => {
    const src = readFileSync(join(REPO, "prod-server.ts"), "utf8");
    expect(src).toMatch(/pathname\.startsWith\("\/videos\/"\)/);
  });
});
