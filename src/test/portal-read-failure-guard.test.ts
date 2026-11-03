/**
 * portal-read-failure-guard.test.ts — a failed READ may never render as an
 * affirmative EMPTY STATE (slice 188).
 *
 * Why this exists. A read-only audit of the whole portal found one defect
 * repeated across 19 routes: a read that fails (non-2xx, a throw, or a body
 * that is not the envelope the page expects) is parsed anyway, coerced with
 * `|| []` / `Array.isArray(x) ? x : []`, and rendered as "Nothing needs your
 * attention" — the tenant is told their queue is clear when the server could
 * not be read. Three shapes produce it, and each is a line of source:
 *
 *   1. UNCHECKED-READ     `await res.json()` with no `res.ok` test anywhere in
 *                         the file, so a 500 body (or the SPA's HTML fallback)
 *                         is treated as data.
 *   2. SWALLOWED-READ     the same read with `.catch(() => ({}))` / `([])` on
 *                         it, so a parse failure becomes an empty list instead
 *                         of a failure. (On a WRITE whose status IS checked the
 *                         same idiom is correct — a non-JSON error body — and
 *                         that is why this rule requires the unchecked status
 *                         too, rather than banning the idiom outright.)
 *   3. ERROR-CLEARED      `setError(null)` / `setError("")` inside a function
 *                         that also handles a failure, so a later success path
 *                         wipes the message for a failure that was never
 *                         resolved (vault: a 500 cleared the error it set).
 *
 * ── WHAT A SOURCE GUARD CANNOT SEE ──────────────────────────────────────────
 * 1. A failure assembled at RENDER time. `loaded === false` being ignored while
 *    the page renders its empty state is a defect in a ternary, not in a fetch.
 *    This test cannot see it; `slice-188-portal-read-failure.test.tsx` asserts
 *    it per page (approvals, vault, communications, dashboard, notifications).
 * 2. Which files are SCANNED. The glob is `src/lazy/portal.*.page.tsx` and
 *    `src/lib/portal-*.ts`; a new page named `portalX.page.tsx`, or a hook in
 *    `src/hooks/`, is invisible here. Adding a portal page means checking the
 *    name matches the glob.
 * 3. Per-variable dataflow. A file that checks `res.ok` in one function and
 *    not in another is only caught when the two use different response
 *    variable names. The guard reads the file, not the scope.
 * 4. A `catch` that LOGS and returns `[]` from a helper the page then trusts.
 *    The swallow is in the helper, not the page.
 *
 * ── THE REMAINDER IS COUNTED, NOT EXEMPTED ──────────────────────────────────
 * Slice 188 fixed the five worst pages plus the shared notifications hook,
 * which together cover every portal page. The other affected routes are listed
 * in `SLICE_189_REMAINDER` — one entry per surviving violation, each with the
 * reason "slice 189", and the test pins the file count so the debt can only
 * shrink by editing this list. A blanket exemption would hide it; this cannot.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const P = (rel: string) => join(REPO, rel);

// ── The scanned set ─────────────────────────────────────────────────────────
const PAGE_RX = /^portal\..*\.page\.tsx$/;
const LIB_RX = /^portal-.*\.ts$/;

export function scannedFiles(): string[] {
  const lazy = readdirSync(P("src/lazy"))
    .filter((n) => PAGE_RX.test(n))
    .map((n) => `src/lazy/${n}`);
  const lib = readdirSync(P("src/lib"))
    .filter((n) => LIB_RX.test(n))
    .map((n) => `src/lib/${n}`);
  return [...lazy, ...lib].sort();
}

// ── Comment stripping (slice 187's trap: a comment describing a call) ───────
// Slice 187's setup-fee guard failed on a COMMENT that reproduced the removed
// fee. Guards must pin the CALL, not prose about the call, so comments are
// blanked (characters → spaces, newlines kept) before any rule runs. Strings
// are left intact: a defect inside a string literal is still a defect.
export function stripComments(src: string): string {
  const out: string[] = [];
  let state: "code" | "line" | "block" | "s" | "d" | "t" = "code";
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (state === "code") {
      if (c === "/" && n === "/") {
        state = "line";
        out.push("  ");
        i += 2;
        continue;
      }
      if (c === "/" && n === "*") {
        state = "block";
        out.push("  ");
        i += 2;
        continue;
      }
      if (c === '"') state = "d";
      else if (c === "'") state = "s";
      else if (c === "`") state = "t";
      out.push(c);
      i++;
      continue;
    }
    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out.push("\n");
      } else out.push(" ");
      i++;
      continue;
    }
    if (state === "block") {
      if (c === "*" && n === "/") {
        state = "code";
        out.push("  ");
        i += 2;
        continue;
      }
      out.push(c === "\n" ? "\n" : " ");
      i++;
      continue;
    }
    // inside a string: copy verbatim, honour escapes, stop at the delimiter
    if (c === "\\") {
      out.push(c, n ?? "");
      i += 2;
      continue;
    }
    if ((state === "s" && c === "'") || (state === "d" && c === '"') || (state === "t" && c === "`")) {
      state = "code";
    } else if (c === "\n" && state !== "t") {
      state = "code"; // unterminated literal (JSX apostrophe) — never swallow the file
    }
    out.push(c);
    i++;
  }
  return out.join("");
}

// ── Rule 1 + 2: an unchecked / swallowed response body read ─────────────────
const JSON_CALL = /(\w+)\s*\.json\(\s*\)/g;
const SWALLOW_FALLBACK = /\.catch\(\s*\(\s*\)\s*=>\s*(?:\(\s*(?:\{\s*\}|\[\s*\])\s*\)|\{\s*\}|\[\s*\])/;

// ── Rule 3: an error cleared inside a block that read without checking ──────
const ERROR_CLEAR = /\bset\w*Error\(\s*(?:null|"")\s*\)/;

// ── Rule 4: an affirmative empty state with no notion of a failed read ──────
// The other half of the class is assembled at RENDER time: `items.length === 0`
// renders "Nothing here yet" whatever happened to the read. A source guard
// cannot evaluate the ternary, but it CAN ask the cheap question: does this page
// know a read can fail at all? No `loaded` / `readError` / `signedOut` anywhere
// plus an affirmative empty-state string is the shape that produced the audit's
// findings. It is a heuristic, not proof — hence one allow-list entry per file
// and a written reason, never a blanket exemption.
const EMPTY_STATE =
  /(?:Nothing (?:needs your attention|to reply to|to search|recorded|here yet)\b|No [A-Za-z][A-Za-z0-9 ]{0,24}(?:yet|found|here)\b|All [Cc]lear)/;
const LOAD_OUTCOME = /\b(?:loaded|readError|signedOut|loadError|readFailed)\b/;

const FN_START = /^ {0,2}(?:export\s+)?(?:async\s+)?(?:function\s+\w+|const\s+\w+\s*=)/;

/** The top-level-ish statement containing `idx` — the enclosing function, near enough. */
function enclosingRange(lines: string[], idx: number): { start: number; end: number } {
  let start = idx;
  while (start > 0 && !FN_START.test(lines[start] as string)) start--;
  let end = start + 1;
  while (end < lines.length && !FN_START.test(lines[end] as string)) end++;
  return { start, end: Math.max(end, idx + 1) };
}

/**
 * A response is CHECKED when the same function tests `res.ok`, or compares
 * `res.status` to a real status OTHER than 401.
 *
 * The 401 carve-out is the whole point of this guard: vault's loader did test
 * `res.status === 401` (to bounce to /login) and then parsed the body anyway,
 * so a 500 rendered an empty vault. A sign-out check is not a read guard.
 */
function isChecked(src: string, receiver: string, start: number, end: number): boolean {
  const block = src.split("\n").slice(start, end).join("\n");
  if (new RegExp(`\\b${receiver}\\.ok\\b`).test(block)) return true;
  return new RegExp(`\\b${receiver}\\.status\\s*[!=]==?\\s*(?!401\\b)\\d`).test(block);
}

export interface Violation {
  file: string;
  rule: "unchecked-read" | "swallowed-read" | "error-cleared" | "empty-state-unconditional";
  line: number;
  snippet: string;
}

export function findViolations(file: string, rawSource: string): Violation[] {
  const src = stripComments(rawSource);
  const lines = src.split("\n");
  const hits: Violation[] = [];
  const uncheckedBlocks: { start: number; end: number }[] = [];

  lines.forEach((line, i) => {
    JSON_CALL.lastIndex = 0;
    const receivers: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = JSON_CALL.exec(line)) !== null) receivers.push(m[1] as string);
    if (receivers.length === 0) return;
    const { start, end } = enclosingRange(lines, i);
    const unchecked = receivers.filter((r) => !isChecked(src, r, start, end));
    if (unchecked.length === 0) return;
    hits.push({ file, rule: "unchecked-read", line: i + 1, snippet: line.trim().slice(0, 120) });
    if (!uncheckedBlocks.some((b) => b.start === start)) uncheckedBlocks.push({ start, end });
    const swallowed = SWALLOW_FALLBACK.test(line);
    if (swallowed) {
      hits.push({ file, rule: "swallowed-read", line: i + 1, snippet: line.trim().slice(0, 120) });
    }
  });

  // Rule 3: the error is cleared inside a function that read without checking,
  // so a failure this code never resolved is wiped from the screen.
  lines.forEach((line, i) => {
    if (!ERROR_CLEAR.test(line)) return;
    const { start, end } = enclosingRange(lines, i);
    if (uncheckedBlocks.some((b) => b.start === start && b.end === end)) {
      hits.push({ file, rule: "error-cleared", line: i + 1, snippet: line.trim().slice(0, 120) });
    }
  });
  // Rule 4: one hit per FILE, on the first affirmative empty state.
  const emptyLine = lines.findIndex((l) => EMPTY_STATE.test(l));
  if (emptyLine >= 0 && !LOAD_OUTCOME.test(src)) {
    hits.push({
      file,
      rule: "empty-state-unconditional",
      line: emptyLine + 1,
      snippet: (lines[emptyLine] as string).trim().slice(0, 120),
    });
  }
  return hits;
}

// ── The written allow-list ──────────────────────────────────────────────────
// `slice 189` = debt this slice did not touch. Anything else is a fixed
// survivor with a reason for why the shape is correct here.
interface AllowEntry {
  file: string;
  rule: Violation["rule"];
  reason: string;
  /** What the surviving line actually says — for a human reading the debt. */
  what?: string;
}

const ALLOWED: AllowEntry[] = [
  // ── The five pages and the notifications hook this slice fixed: no entries.
  // Everything below is debt this slice did NOT touch. ──
];

/**
 * SLICE 189 — the counted remainder.
 *
 * 15 portal pages render an affirmative empty state ("No invoices yet", "No
 * boards yet", …) with no notion that a read can fail: they hold an `error`
 * string for writes, but nothing distinguishes "zero rows" from "the read did
 * not answer". They are NOT exempted from the guard — each is listed here by
 * name, the count below is pinned, and slice 189 removes them one at a time.
 *
 * Slice 188 fixed the five worst (approvals, dashboard, vault, communications,
 * notifications) plus the shared bell hook, which together cover every portal
 * page's shell; those five no longer appear anywhere in this file.
 */
const SLICE_189_REMAINDER: AllowEntry[] = [
  { file: "src/lazy/portal.accessreview.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No campaigns yet." },
  { file: "src/lazy/portal.admin.audit.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No audit logs found" },
  { file: "src/lazy/portal.admin.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No clients yet" },
  { file: "src/lazy/portal.assistant.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No asks yet" },
  { file: "src/lazy/portal.automations.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No rules yet." },
  { file: "src/lazy/portal.boards.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No boards yet" },
  { file: "src/lazy/portal.checklists.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No checklists yet" },
  { file: "src/lazy/portal.deal-rooms.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No deal rooms yet" },
  { file: "src/lazy/portal.dedupe.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No merges yet." },
  { file: "src/lazy/portal.document-ai.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No extraction runs yet." },
  { file: "src/lazy/portal.invoices.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No invoices yet" },
  { file: "src/lazy/portal.knowledgebase.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No categories yet." },
  { file: "src/lazy/portal.proposals.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No proposals yet" },
  { file: "src/lazy/portal.surveys.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No surveys yet" },
  { file: "src/lazy/portal.transforms.index.page.tsx", rule: "empty-state-unconditional", reason: "slice 189", what: "No transforms yet" },
];

/** The number of pages still carrying the render-time half of this class. */
export const REMAINDER_COUNT = 15;

const key = (v: { file: string; rule: string }) => `${v.file}|${v.rule}`;

/** Consume allow-entries against the found violations; returns both leftovers. */
function reconcile(violations: Violation[], allow: AllowEntry[]) {
  const pool = new Map<string, number>();
  for (const a of allow) pool.set(key(a), (pool.get(key(a)) ?? 0) + 1);
  const unexplained: Violation[] = [];
  for (const v of violations) {
    const k = key(v);
    const left = pool.get(k) ?? 0;
    if (left > 0) pool.set(k, left - 1);
    else unexplained.push(v);
  }
  const stale = [...pool.entries()].filter(([, n]) => n > 0).map(([k]) => k);
  return { unexplained, stale };
}

const fmt = (v: Violation) => `${v.file}:${v.line} [${v.rule}] ${v.snippet}`;

describe("portal read-failure guard (slice 188)", () => {
  it("scans a real set of portal files (the walk is not silently empty)", () => {
    const files = scannedFiles();
    // 51 pages + 5 lib modules today; 40 only catches a broken directory read.
    expect(files.length).toBeGreaterThan(40);
    for (const f of files) expect(() => readFileSync(P(f), "utf8")).not.toThrow();
    // The six files this slice fixed must be inside the scan.
    for (const f of [
      "src/lib/portal-notifications.ts",
      "src/lazy/portal.index.page.tsx",
      "src/lazy/portal.vault.index.page.tsx",
      "src/lazy/portal.communications.index.page.tsx",
      "src/lazy/portal.approvals.index.page.tsx",
    ]) {
      expect(files, `${f} must be scanned`).toContain(f);
    }
  });

  it("no scanned file reads a response body it never checked, or clears an unresolved error", () => {
    const violations: Violation[] = [];
    for (const file of scannedFiles()) violations.push(...findViolations(file, readFileSync(P(file), "utf8")));
    const { unexplained, stale } = reconcile(violations, [...ALLOWED, ...SLICE_189_REMAINDER]);
    // Compared as TEXT, not as arrays: a failed assertion must print every
    // offending line in full, so the next engineer can read the debt.
    expect(
      unexplained.map(fmt).join("\n"),
      "a failed read would render as an empty state (or an unresolved error is cleared)",
    ).toBe("");
    expect(stale.join("\n"), "stale allow-list entry — the shape is gone, delete the entry").toBe("");
  });

  it("the slice-188 fix holds in the six files it touched", () => {
    // A behaviour test would pass on a page that renders an error AND an empty
    // state; these pin the shape that makes the empty state impossible.
    for (const f of [
      "src/lib/portal-notifications.ts",
      "src/lazy/portal.index.page.tsx",
      "src/lazy/portal.vault.index.page.tsx",
      "src/lazy/portal.communications.index.page.tsx",
      "src/lazy/portal.approvals.index.page.tsx",
    ]) {
      expect(findViolations(f, readFileSync(P(f), "utf8")), `${f} regressed`).toEqual([]);
    }
  });

  it("the slice-189 remainder is named, counted and carries its reason", () => {
    // The debt is visible and it can only shrink by editing this list: the count
    // is pinned, every entry names its owning slice, and a fixed page leaves a
    // stale entry that the reconcile above already fails on.
    const files = new Set(SLICE_189_REMAINDER.map((e) => e.file));
    expect(files.size, "the slice-189 remainder changed — update REMAINDER_COUNT and the list together").toBe(
      REMAINDER_COUNT,
    );
    for (const e of SLICE_189_REMAINDER) {
      expect(e.reason).toBe("slice 189");
      expect(e.what, `${e.file} should say what it renders`).toBeTruthy();
    }
  });

  it("every allow-listed survivor carries a written reason", () => {
    for (const a of ALLOWED) expect(a.reason.length, `${key(a)} needs a written reason`).toBeGreaterThan(20);
    // Slice 188 allowed itself ZERO exceptions in the files it fixed: the fix
    // has to hold on the source shape, not on a note saying it is fine.
    for (const fixed of [
      "src/lib/portal-notifications.ts",
      "src/lazy/portal.index.page.tsx",
      "src/lazy/portal.vault.index.page.tsx",
      "src/lazy/portal.communications.index.page.tsx",
      "src/lazy/portal.approvals.index.page.tsx",
    ]) {
      expect([...ALLOWED, ...SLICE_189_REMAINDER].filter((e) => e.file === fixed), `${fixed} must not be allow-listed`).toEqual([]);
    }
  });

  it("the guard states what it cannot see", () => {
    const self = readFileSync(P("src/test/portal-read-failure-guard.test.ts"), "utf8");
    expect(self).toContain("WHAT A SOURCE GUARD CANNOT SEE");
  });
});
