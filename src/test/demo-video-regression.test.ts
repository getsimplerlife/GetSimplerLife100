import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
/**
 * Demo truthfulness regression guard (post owner direction 2026-09-06).
 *
 * Owner direction: the homepage demo video was removed — it didn't help
 * customers. The /demo route and its assets are KEPT (they stay standard).
 *
 * Guards:
 *  (a) HOMEPAGE: no <video> element, no /videos/ references, and no
 *      "demo" CTA (the hero now links /assessment + /how-it-works). The
 *      homepage's job is a clean CTA, NOT a demo.
 *  (b) /demo ROUTE: still carries its truthful self-labels (DEMO badge,
 *      "Interactive Demo" name, MOCK-* data only) and never claims to be
 *      a live provider pass — the global sweep below enforces that.
 *  (c) ASSETS: public/videos files still exist (they were deliberately
 *      kept) and prod-server.ts still serves /videos/* so any retained
 *      reference (e.g. the /demo-adjacent walkthrough pages) resolves.
 *  (d) GLOBAL SWEEP: no user-facing "live demo"/"live provider" claims
 *      anywhere in routes/lazy/components.
 */
const REPO = process.cwd();

describe("demo truthfulness (homepage clean, /demo honest)", () => {
  it("homepage has NO video element and NO /videos/ references", () => {
    const src = readFileSync(join(REPO, "src", "routes", "index.tsx"), "utf8");
    expect(src).not.toMatch(/<video[\s>]/);
    expect(src).not.toMatch(/\/videos\//);
    expect(src).not.toMatch(/quote-to-cash-demo/);
    // no poster, no aria-label on a video, no video source
    expect(src).not.toMatch(/poster=/);
    expect(src).not.toMatch(/video\/mp4/);
  });

  it("homepage hero CTA is clean: no demo mention; primary + secondary links intact", () => {
    const src = readFileSync(join(REPO, "src", "routes", "index.tsx"), "utf8");
    // No "demo" wording anywhere in homepage copy.
    expect(src).not.toMatch(/interactive demo/i);
    expect(src).not.toMatch(/[Ss]ee it working/);
    // Primary CTA (assessment) and the replacement secondary CTA (approach).
    expect(src).toMatch(/to="\/assessment"/);
    expect(src).toMatch(/Find My First Automation/);
    expect(src).toMatch(/to="\/how-it-works"/);
  });

  it("assets kept: public/videos MP4 + poster still exist", () => {
    for (const f of ["quote-to-cash-demo.mp4", "quote-to-cash-demo-poster.jpg"]) {
      const p = join(REPO, "public", "videos", f);
      expect(existsSync(p), `missing ${p}`).toBe(true);
    }
  });

  it("/demo route keeps its truthful self-labels (DEMO badge, Interactive Demo, MOCK-only data)", () => {
    const src = readFileSync(join(REPO, "src", "lazy", "demo.page.tsx"), "utf8");
    expect(src).toMatch(/>\s*DEMO\s*</);            // header DEMO badge
    expect(src).toMatch(/Interactive Demo/);        // footer self-label
    expect(src).toMatch(/MOCK_AGENTS|MOCK_ACTIVITIES|MOCK_MARKETPLACE/); // mock-only data
    expect(src).not.toMatch(/no live provider|real provider|live provider/i); // no claims needed/absent
  });

  it("site-wide sweep: no user-facing 'live demo' / 'live provider' claims in routes/lazy/components", () => {
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
      for (const m of src.matchAll(/live[- ]?demo|live[- ]?provider/gi)) {
        const line = src.slice(Math.max(0, m.index - 80), m.index + 40);
        if (/no live ?provider connections/i.test(line)) continue;
        if (/live[- ]?demo walkthrough/i.test(line)) continue;
        bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad, `live-demo/live-provider claims found:\n${bad.join("\n")}`).toEqual([]);
  });

  it("prod-server statically serves /videos/* (assets kept, route stays)", () => {
    const src = readFileSync(join(REPO, "prod-server.ts"), "utf8");
    expect(src).toMatch(/pathname\.startsWith\("\/videos\/"\)/);
  });
});
