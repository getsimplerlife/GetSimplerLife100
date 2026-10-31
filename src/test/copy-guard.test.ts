/**
 * Copy guard — the banned-vocabulary rule, as a test instead of a grep.
 *
 * WHY: "Blueprint", "S1 Agent", "Autonomous Operations Console", "AI agent",
 * "AI Employee", "AI Operations Team", "AI coworker", "AI workforce",
 * "Connection Pack", "Sprint", "14AbJ", "4gMfZ", "Deploy Live" and
 * "reconnect" were retired as product vocabulary (owner 10-20 / 10-21), but the
 * rule lived in someone's memory as a grep command. It drifted: by 10-31 there
 * were 27 hits across the seven roots — 11 of them customer-facing error
 * strings. A rule nobody can run automatically is a rule that decays.
 *
 * THE DIRECTORY LIST IS THE BUG, NOT THE WORDS (slice 148 lesson): the roots
 * live here in code, and a root that disappears fails the suite rather than
 * silently going unscanned. Adding a new top-level surface means adding it to
 * GUARDED_ROOTS — and the "every root is present and non-trivial" test makes
 * that impossible to forget quietly.
 *
 * NOTE: this file itself is under `src/test`, which is NOT one of the guarded
 * roots, so writing the retired words here as data cannot self-trip.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every surface a customer can read. Kept in code — see the note above. */
const GUARDED_ROOTS = [
  "src/components",
  "src/content",
  "src/routes",
  "src/lazy",
  "src/tools",
  "src/api",
  "src/native",
] as const;

/**
 * Retired vocabulary. `why` is the reason a hit is a bug, so the next person
 * reading a failure knows whether they are looking at a regression or at
 * ordinary English that needs a different word.
 */
const BANNED: { term: string; why: string }[] = [
  { term: "Blueprint", why: "retired product name" },
  { term: "S1 Agent", why: "retired agent-era name" },
  { term: "Autonomous Operations Console", why: "retired agent-era name" },
  { term: "AI agent", why: "we sell a platform, not AI employees" },
  { term: "AI Employee", why: "we sell a platform, not AI employees" },
  { term: "AI Operations Team", why: "we sell a platform, not AI employees" },
  { term: "AI coworker", why: "we sell a platform, not AI employees" },
  { term: "AI workforce", why: "we sell a platform, not AI employees" },
  { term: "Connection Pack", why: "retired product (10-21)" },
  { term: "Sprint", why: "retired product (10-21)" },
  { term: "14AbJ", why: "retired Stripe price fragment" },
  { term: "4gMfZ", why: "retired Stripe price fragment" },
  { term: "Deploy Live", why: "retired agent-era UI label" },
  { term: "reconnect", why: "no reconnect program — the client re-authorises their own connection" },
];

interface Hit { file: string; line: number; text: string }

const hits = new Map<string, Hit[]>();
let scannedFiles = 0;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(p, out);
    } else if (entry.isFile()) {
      out.push(p);
    }
  }
}

beforeAll(() => {
  const files: string[] = [];
  for (const root of GUARDED_ROOTS) walk(root, files);
  scannedFiles = files.length;

  for (const { term } of BANNED) hits.set(term, []);
  const needles = BANNED.map((b) => ({ ...b, lower: b.term.toLowerCase() }));

  for (const file of files) {
    // Binary-ish files are skipped by extension, not by guessing at content.
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|zip|gz|mp4|mp3)$/i.test(file)) continue;
    if (!statSync(file).isFile()) continue;
    const body = readFileSync(file, "utf8");
    if (body.includes("\u0000")) continue; // binary
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      for (const needle of needles) {
        if (lower.includes(needle.lower)) {
          hits.get(needle.term)!.push({ file, line: i + 1, text: lines[i].trim().slice(0, 160) });
        }
      }
    }
  }
});

const report = (term: string): string => {
  const list = hits.get(term) ?? [];
  return (
    `${list.length} hit(s) for the retired term "${term}":\n` +
    list.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join("\n")
  );
};

describe("copy guard — the seven guarded roots", () => {
  it("scans every guarded root (a root that vanishes is a bug, not a pass)", () => {
    expect(GUARDED_ROOTS.length).toBe(7);
    for (const root of GUARDED_ROOTS) {
      expect(statSync(root).isDirectory(), `${root} is missing — was a surface renamed or moved?`).toBe(true);
    }
    // A walk that returns nothing would make every term below pass vacuously.
    expect(scannedFiles).toBeGreaterThan(300);
  });

  it("keeps the banned list populated (an empty list guards nothing)", () => {
    expect(BANNED.length).toBeGreaterThanOrEqual(14);
    expect(BANNED.map((b) => b.term)).toContain("reconnect");
  });

  for (const { term, why } of BANNED) {
    it(`contains no "${term}" (${why})`, () => {
      expect(hits.get(term) ?? [], report(term)).toEqual([]);
    });
  }
});
