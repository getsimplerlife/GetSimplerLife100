/**
 * portal-mobile-shell-200.test.ts — the portal shell on a 390 px phone.
 *
 * Slice 200 fixed five defects that were measured at source, not guessed. Each
 * one is pinned here BY SHAPE — the class that carries the property, the
 * attribute that carries the label — so re-introducing it is a red test rather
 * than a screenshot nobody takes.
 *
 *   1. The wordmark wrapped inside the fixed `h-14` mobile bar. `text-md` is not
 *      a Tailwind size class: it is a silent no-op, so the brand inherited 16 px
 *      and, with no `whitespace-nowrap`, wrapped to two lines and pushed into
 *      the content that starts at `pt-14`.
 *   2. The sidebar nav (`flex-1 overflow-y-auto`) had no `min-h-0`. A flex child
 *      cannot shrink below its content without it, so `overflow-y-auto` never
 *      engaged and the last of the 27 links sat under the `shrink-0` footer.
 *      `scrollbar-none` removed the only hint that anything continued below.
 *   3. The mobile tab bar's label span had no `truncate` and no `max-width`, so
 *      eight `flex-1` tabs at 390 px (~48 px each) collided into unreadable
 *      overlap, and no tab carried an `aria-label`.
 *   4. The admin page renders a SECOND complete chrome inside the portal's: its
 *      own `<aside>` and a `<main>` with an UNCONDITIONAL `ml-64` — 256 px of
 *      margin inside a 390 px viewport — plus a full-screen loading block drawn
 *      inside the portal pane.
 *   5. `index.html` disabled pinch-zoom (`maximum-scale=1, user-scalable=no`), a
 *      WCAG failure on its own.
 *
 * WHAT THIS GUARD DOES NOT COVER, deliberately and not silently: rendered
 * output. It reads source, and comments are stripped first so it pins the CALL
 * and never the prose about the call (a guard that matches its own explanatory
 * comment self-fails). `/home/team/shared/screens/200/` is the browser evidence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

/** Strip JSX `{/* … *\/}` blocks, block comments and whole-line `//` comments. */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * Read one opening tag starting at the first `<` at or after `from`.
 * Brace- and quote-aware: a JSX attribute like `onClick={() => close()}` holds a
 * `>` that a naive `indexOf(">")` would mistake for the end of the tag.
 */
function readTag(src: string, from: number): string {
  const start = src.indexOf("<", from);
  if (start < 0) throw new Error(`no tag found after offset ${from}`);
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated tag at offset ${start}`);
}

/** Every opening tag of `name` in `src`, with its offset. */
function openTags(src: string, name: string): { tag: string; at: number }[] {
  const out: { tag: string; at: number }[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ tag: readTag(src, m.index), at: m.index });
  return out;
}

/** The class tokens of a tag's `className` (string literal or template literal). */
function classList(tag: string): string[] {
  const m = tag.match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/);
  const raw = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
  return raw.split(/\s+/).filter(Boolean);
}

function attr(tag: string, name: string): string | null {
  const quoted = tag.match(new RegExp(`${name}="([^"]*)"`));
  if (quoted) return quoted[1];
  // A bound attribute (`aria-label={link.name}`) names the tab just as truly as
  // a literal one — the guard pins the PROPERTY, not the spelling.
  const bound = tag.match(new RegExp(`${name}=\\{([^}]*)\\}`));
  return bound ? bound[1].trim() : null;
}

const has = (cls: string[], token: string) => cls.includes(token);

// ── 1. the mobile top bar ────────────────────────────────────────────────────
describe("200 · the wordmark fits the fixed h-14 bar", () => {
  const shell = stripComments(read("src/lazy/portal.page.tsx"));

  it("the shell still carries the mobile top bar and its wordmark", () => {
    // Positive control: if the header is renamed or moved, this file must fail
    // loudly rather than pass by finding nothing.
    const headers = openTags(shell, "header").filter((h) => has(classList(h.tag), "lg:hidden"));
    expect(headers.length, "the mobile top bar (a `lg:hidden` <header>) must exist").toBe(1);
    const link = readTag(shell, headers[0].at + 1); // first tag INSIDE the bar
    expect(link.startsWith("<Link"), "the wordmark must still be the first thing in the bar").toBe(true);
    expect(attr(link, "className"), "the wordmark must be a Link with a className").toBeTruthy();
  });

  it("the wordmark is nowrap and uses a real size class", () => {
    const header = openTags(shell, "header").find((h) => has(classList(h.tag), "lg:hidden"))!;
    const wordmark = readTag(shell, header.at + 1); // first <Link> inside the bar
    const cls = classList(wordmark);
    expect(cls, "without whitespace-nowrap the brand wraps inside a fixed h-14 bar").toContain(
      "whitespace-nowrap",
    );
    // `text-md` is NOT a Tailwind size — it is a silent no-op that let the brand
    // inherit 16 px and overflow. A real size class must be present instead.
    expect(cls, "`text-md` is a no-op class, not a size").not.toContain("text-md");
    expect(
      cls.some((c) => /^text-(xs|sm|base)$/.test(c)),
      "the wordmark needs a real Tailwind size class (text-xs / text-sm / text-base)",
    ).toBe(true);
  });
});

// ── 2. the sidebar nav ───────────────────────────────────────────────────────
describe("200 · the sidebar nav scrolls instead of hiding its last links", () => {
  const shell = stripComments(read("src/lazy/portal.page.tsx"));

  it("the scrolling nav carries min-h-0 and no longer hides its scrollbar", () => {
    const navs = openTags(shell, "nav");
    const scrolling = navs.find((n) => {
      const c = classList(n.tag);
      return has(c, "flex-1") && has(c, "overflow-y-auto");
    });
    expect(scrolling, "the sidebar nav (flex-1 + overflow-y-auto) must exist").toBeTruthy();
    const cls = classList(scrolling!.tag);
    expect(
      cls,
      "a flex child cannot shrink below its content without min-h-0, so overflow-y-auto never engages",
    ).toContain("min-h-0");
    expect(
      cls,
      "scrollbar-none removes the only affordance that the nav continues below",
    ).not.toContain("scrollbar-none");
  });
});

// ── 3. the mobile tab bar ────────────────────────────────────────────────────
describe("200 · the mobile tab bar is readable and named", () => {
  const shell = stripComments(read("src/lazy/portal.page.tsx"));
  const mapAt = shell.indexOf("mobileLinks.map(");

  it("the tab bar renders every mobile link from one template", () => {
    expect(mapAt, "the mobile tab bar must still map over mobileLinks").toBeGreaterThan(0);
    const bar = readTag(shell, shell.lastIndexOf("<", mapAt));
    const cls = classList(bar);
    expect(cls, "the bar must stay mobile-only").toContain("lg:hidden");
    expect(cls, "the bar must stay pinned to the bottom edge").toContain("bottom-0");
  });

  it("every tab carries a real aria-label and marks the current page", () => {
    const tab = readTag(shell, shell.indexOf("<Link", mapAt));
    expect(
      attr(tab, "aria-label"),
      "without aria-label a screen reader gets identical unnamed links",
    ).toBeTruthy();
    expect(attr(tab, "aria-current"), "the active tab must be marked with aria-current").toBeTruthy();
  });

  it("the label span truncates inside a max width instead of colliding", () => {
    const span = readTag(shell, shell.indexOf("<span", mapAt));
    const cls = classList(span);
    expect(cls, "the label must truncate — eight flex-1 tabs at 390 px collide otherwise").toContain(
      "truncate",
    );
    expect(
      cls.some((c) => /^max-w-/.test(c)),
      "the label needs a max width so a long name cannot push its neighbours",
    ).toBe(true);
  });
});

// ── 4. the admin page must not draw a second chrome ──────────────────────────
describe("200 · the admin page stops drawing a second chrome on a phone", () => {
  const admin = stripComments(read("src/lazy/portal.admin.page.tsx"));

  it("the admin layout still owns its nav list", () => {
    expect(admin, "adminNavLinks must still drive the admin nav").toContain("adminNavLinks");
  });

  it("no unconditional left margin — ml-64 is 256 px inside a 390 px viewport", () => {
    const main = openTags(admin, "main");
    expect(main.length, "the admin layout must have exactly one <main>").toBe(1);
    const cls = classList(main[0].tag);
    const bare = cls.filter((c) => /^m[lr]?-/.test(c) && !/^(sm|md|lg|xl):/.test(c));
    expect(bare, "every margin must be breakpoint-prefixed").toEqual([]);
    expect(cls, "the desktop offset must be preserved").toContain("lg:ml-64");
  });

  it("the admin aside is suppressed below lg so the portal chrome shows", () => {
    const asides = openTags(admin, "aside");
    expect(asides.length, "the admin aside must still exist for desktop").toBe(1);
    const cls = classList(asides[0].tag);
    expect(cls, "hidden on mobile — otherwise two fixed sidebars fight for the same edge").toContain(
      "hidden",
    );
    expect(
      cls.some((c) => /^lg:(flex|block)$/.test(c)),
      "and visible again at lg, or the admin nav disappears on desktop",
    ).toBe(true);
  });

  it("the admin nav inside the aside also carries min-h-0", () => {
    const aside = openTags(admin, "aside")[0];
    const end = admin.indexOf("</aside>", aside.at);
    const inside = admin.slice(aside.at, end > 0 ? end : admin.length);
    const navs = openTags(inside, "nav");
    expect(navs.length, "the admin aside must contain a nav").toBeGreaterThan(0);
    for (const n of navs) {
      expect(classList(n.tag), "the admin nav overflows the same way").toContain("min-h-0");
    }
  });

  it("no full-screen block is drawn inside the portal's own pane", () => {
    // The loading and failure states render INSIDE the portal shell, so a
    // `min-h-screen` there paints over the chrome it is sitting in. Each block
    // is checked by walking back from its own sentence to the elements that
    // wrap it — the assertion is about the block, not a global count.
    for (const sentence of ["Verifying admin access", "Admin access could not be verified"]) {
      // Case-insensitive: the sentence may be re-cased without this guard
      // losing the block it is meant to protect.
      const at = admin.toLowerCase().indexOf(sentence.toLowerCase());
      expect(at, `the admin layout must still say "${sentence}"`).toBeGreaterThan(0);
      const wrappers = admin.slice(Math.max(0, at - 500), at);
      expect(
        wrappers,
        `"${sentence}" is drawn with min-h-screen inside the portal pane`,
      ).not.toContain("min-h-screen");
    }
  });

  it("no emoji in the admin nav labels", () => {
    expect(
      admin,
      "emoji nav labels are not a label — they render at a different size on every platform",
    ).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

// ── 5. pinch-zoom ────────────────────────────────────────────────────────────
describe("200 · the viewport allows pinch-zoom", () => {
  const html = read("index.html");

  it("keeps a viewport meta and drops the zoom lock", () => {
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1];
    expect(viewport, "index.html must keep its viewport meta").toBeTruthy();
    expect(viewport, "width=device-width must stay").toContain("width=device-width");
    expect(viewport, "user-scalable=no is a WCAG 1.4.4 failure").not.toContain("user-scalable=no");
    expect(viewport, "maximum-scale=1 blocks pinch-zoom just as effectively").not.toContain(
      "maximum-scale",
    );
  });
});
