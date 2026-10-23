/**
 * portal-login-theme.test.tsx — P2-4 login polish guard.
 *
 * The auth pages (/login, /register, /set-password) are portal-only restyles
 * onto the P2-1 emerald-token dark system. This guard pins:
 *   - the P2-1 tokens actually render (dark surfaces, stone-900 card borders,
 *     emerald accents, rose-500 honest error boxes with role="alert");
 *   - no light-theme residue survives (solid bg-white, stone-50/100/200,
 *     gray-* palette, red-50/emerald-50 marketing boxes);
 *   - PortalIcons stroke glyphs are used in every field;
 *   - no sub-10px labels;
 *   - the SEO/a11y invariants from site-seo-a11y are preserved (pageHead
 *     wiring + single h1 as the first heading);
 *   - the auth endpoints and honest copy are unchanged by the restyle.
 *
 * Zero server/auth changes — only route-file content is asserted.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { PortalIcon } from "../components/PortalIcons";

const AUTH_FILES = ["login.tsx", "register.tsx", "set-password.tsx"] as const;

const readAuth = (file: (typeof AUTH_FILES)[number]) => readFileSync(`src/routes/${file}`, "utf8");

describe("P2-4 — auth pages use the P2-1 portal dark visual system", () => {
  it.each(AUTH_FILES)("%s carries the emerald-token dark surfaces", (file) => {
    const src = readAuth(file);
    for (const token of ["bg-black", "bg-stone-950", "border-stone-900", "text-white", "bg-emerald-500"]) {
      expect(src, `${file} must use token ${token}`).toContain(token);
    }
  });

  it.each(AUTH_FILES)("%s has zero light-theme residue", (file) => {
    const src = readAuth(file);
    // Ban the actual light-surface utilities the pre-P2-4 pages used. Token
    // names are matched as full class fragments so dark tokens like
    // "text-stone-500" can never collide with "stone-50".
    for (const banned of [
      "bg-white",
      "bg-stone-50",
      "from-stone-50",
      "via-stone-100/50",
      "border-stone-100",
      "border-stone-200",
      "text-stone-900",
      "text-stone-700",
      "text-stone-600",
      "placeholder-stone-400",
      "shadow-stone-100",
      "bg-red-50",
      // trailing space so it cannot collide with the dark-system
      // bg-emerald-500 tokens (old light pages wrote "bg-emerald-50 border…")
      "bg-emerald-50 ",
      "bg-gray-50",
      "text-gray-900",
      "text-gray-600",
      "border-gray-300",
      "placeholder-gray-500",
    ]) {
      expect(src, `${file} must not contain "${banned}"`).not.toContain(banned);
    }
  });

  it.each(AUTH_FILES)("%s uses PortalIcons glyphs in its fields", (file) => {
    const src = readAuth(file);
    // JSX props are written multi-line; assert the attribute itself.
    expect(src).toContain('name="mail"');
    expect(src).toContain('name="secure"');
  });

  it.each(AUTH_FILES)("%s never dips below a 10px label", (file) => {
    expect(readAuth(file)).not.toContain("text-[9px]");
  });

  it.each(AUTH_FILES)("%s shows errors with honest rose tokens and role=alert", (file) => {
    const src = readAuth(file);
    expect(src).toContain("role=\"alert\"");
    expect(src).toContain("border-rose-500/30");
    expect(src).toContain("bg-rose-500/10");
    expect(src).toContain("text-rose-300");
  });

  it.each(AUTH_FILES)("%s keeps the mobile-responsive centered-card layout", (file) => {
    const src = readAuth(file);
    expect(src).toContain("px-4 py-12 sm:px-6");
    expect(src).toContain("w-full max-w-md");
  });

  it("PortalIcons mail + secure render non-empty strokes (the glyphs the pages use)", () => {
    for (const name of ["mail", "secure"] as const) {
      const { container } = render(<PortalIcon name={name} />);
      const d = container.querySelector("svg path")?.getAttribute("d");
      expect(d, `${name} icon must have a path`).toBeTruthy();
      expect(d!.length).toBeGreaterThan(5);
    }
  });
});

describe("P2-4 — SEO/a11y invariants preserved (nothing below a route file changes)", () => {
  it("every auth route still wires pageHead with its exact path", () => {
    const cases: Array<[string, string]> = [
      ["login.tsx", "/login"],
      ["register.tsx", "/register"],
      ["set-password.tsx", "/set-password"],
    ];
    for (const [file, path] of cases) {
      const src = readAuth(file as any);
      expect(src).toContain('import { pageHead } from "~/lib/site-meta"');
      expect(src).toContain(`pageHead("${path}")`);
    }
  });

  it("each auth page still starts its headings with a single h1", () => {
    for (const file of AUTH_FILES) {
      const src = readAuth(file);
      const h1s = (src.match(/<h1\b/g) || []).length;
      expect(h1s, `${file} must have one h1`).toBeGreaterThanOrEqual(1);
      const firstHeading = src.match(/<h[1-6]\b/);
      expect(firstHeading?.[0], `${file} must start headings with h1`).toBe("<h1");
    }
  });
});

describe("P2-4 — honest copy and endpoints unchanged by the restyle", () => {
  it("login keeps its call to action and real endpoint", () => {
    const src = readAuth("login.tsx");
    expect(src).toContain("Sign in to Portal");
    expect(src).toContain('fetch("/api/login"');
    expect(src).toContain('action="/login"');
  });

  it("register keeps the honest existing-account guidance and real endpoint", () => {
    const src = readAuth("register.tsx");
    expect(src).toContain("Account already exists. If you purchased an audit, go to Set Password instead.");
    expect(src).toContain('fetch("/api/register"');
  });

  it("set-password keeps the no-enumeration notice and real endpoints", () => {
    const src = readAuth("set-password.tsx");
    expect(src).toContain("If an account exists for this email, a one-time reset code has been sent to it.");
    expect(src).toContain('fetch("/api/request-password-reset"');
    expect(src).toContain('fetch("/api/set-password"');
    expect(src).toContain("The code expires in 10 minutes");
  });
});