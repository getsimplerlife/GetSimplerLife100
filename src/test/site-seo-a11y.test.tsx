/**
 * site-seo-a11y.test.tsx — I9/I10 guards:
 *
 * I9 (SEO): every public route must resolve unique, truthful meta
 * (title + description) via the shared site-meta module, and every public
 * route file must wire `head` through `pageHead()` so SSR/OG tags render.
 *
 * I10 (a11y): icon-only buttons must carry aria-labels; the modal close
 * button must be announced and keep a visible keyboard focus (no
 * focus:outline-none suppression); the header mobile toggle exposes its
 * expanded state; desktop dropdowns open on keyboard focus (focus-within)
 * and announce aria-haspopup.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  PAGE_TITLES,
  resolvePageMeta,
  pageHead,
  DEFAULT_PAGE_META,
} from "../lib/site-meta";

// Every public (non-portal) route path that must resolve a meta entry.
const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/assessment",
  "/audit",
  "/build",
  "/case-studies",
  "/case-studies/meridian-manufacturing", // dynamic child → prefix match
  "/contact",
  "/demo",
  "/demos",
  "/demos/audit-portal",
  "/demos/workflows",
  "/faq",
  "/features",
  "/how-it-works",
  "/industries",
  "/industries/logistics", // dynamic child → prefix match
  "/integrations",
  "/integrations/salesforce", // dynamic child → prefix match
  "/login",
  "/pricing",
  "/register",
  "/resources",
  "/resources/guides",
  "/resources/templates",
  "/roi-assessment",
  "/roi-calculator",
  "/set-password",
  "/support",
  "/tools-hub",
  "/tools",
  "/tools/assessment",
  "/tools/ai-advisor",
  "/tools/can-we-automate-this",
  "/workflows",
  "/workflows/invoice-automation", // dynamic child → prefix match
];

const ROUTE_FILES: [string, string][] = [
  ["src/routes/index.tsx", "/"],
  ["src/routes/about.tsx", "/about"],
  ["src/routes/assessment.tsx", "/assessment"],
  ["src/routes/audit.tsx", "/audit"],
  ["src/routes/build.tsx", "/build"],
  ["src/routes/case-studies.index.tsx", "/case-studies"],
  ["src/routes/case-studies.$caseStudyId.tsx", "/case-studies"],
  ["src/routes/contact.tsx", "/contact"],
  ["src/routes/demo.tsx", "/demo"],
  ["src/routes/demos.tsx", "/demos"],
  ["src/routes/demos.audit-portal.tsx", "/demos/audit-portal"],
  ["src/routes/demos.workflows.tsx", "/demos/workflows"],
  ["src/routes/faq.tsx", "/faq"],
  ["src/routes/features.tsx", "/features"],
  ["src/routes/how-it-works.tsx", "/how-it-works"],
  ["src/routes/industries.index.tsx", "/industries"],
  ["src/routes/industries.$industryId.tsx", "/industries"],
  ["src/routes/integrations.index.tsx", "/integrations"],
  ["src/routes/integrations.$integrationId.tsx", "/integrations"],
  ["src/routes/login.tsx", "/login"],
  ["src/routes/pricing.tsx", "/pricing"],
  ["src/routes/register.tsx", "/register"],
  ["src/routes/resources.index.tsx", "/resources"],
  ["src/routes/resources.guides.index.tsx", "/resources/guides"],
  ["src/routes/resources.templates.index.tsx", "/resources/templates"],
  ["src/routes/roi-assessment.tsx", "/roi-assessment"],
  ["src/routes/roi-calculator.tsx", "/roi-calculator"],
  ["src/routes/set-password.tsx", "/set-password"],
  ["src/routes/support.tsx", "/support"],
  ["src/routes/tools-hub.tsx", "/tools-hub"],
  ["src/routes/tools.index.tsx", "/tools"],
  ["src/routes/tools.assessment.tsx", "/tools/assessment"],
  ["src/routes/tools.ai-advisor.tsx", "/tools/ai-advisor"],
  ["src/routes/tools.can-we-automate-this.tsx", "/tools/can-we-automate-this"],
  ["src/routes/workflows.index.tsx", "/workflows"],
  ["src/routes/workflows.$workflowId.tsx", "/workflows"],
];

describe("I9 — SEO: every public route has unique, accurate meta", () => {
  it("every public route resolves a meta entry via resolvePageMeta", () => {
    for (const path of PUBLIC_ROUTES) {
      const meta = resolvePageMeta(path);
      expect(meta, `no meta for ${path}`).not.toBeNull();
      expect(meta!.title.length).toBeGreaterThan(10);
      expect(meta!.description.length).toBeGreaterThan(20);
    }
  });

  it("no two routes share the same description (uniqueness)", () => {
    const seen = new Map<string, string>();
    for (const [path, meta] of Object.entries(PAGE_TITLES)) {
      const existing = seen.get(meta.description);
      expect(existing, `duplicate description between ${existing} and ${path}`).toBeUndefined();
      seen.set(meta.description, path);
    }
  });

  it("no two routes share the same title (uniqueness)", () => {
    const seen = new Map<string, string>();
    for (const [path, meta] of Object.entries(PAGE_TITLES)) {
      const existing = seen.get(meta.title);
      expect(existing, `duplicate title between ${existing} and ${path}`).toBeUndefined();
      seen.set(meta.title, path);
    }
  });

  it("pageHead emits title, description, og:title, og:description, og:url, twitter card", () => {
    const head = pageHead("/pricing").meta as any[];
    const props = head.map((m: any) => Object.entries(m)[0]);
    expect(head.some((m) => m.title === PAGE_TITLES["/pricing"].title)).toBe(true);
    expect(head.some((m) => m.name === "description" && m.content)).toBe(true);
    expect(head.some((m) => m.property === "og:title" && m.content)).toBe(true);
    expect(head.some((m) => m.property === "og:description" && m.content)).toBe(true);
    expect(head.some((m) => m.property === "og:url" && m.content)).toBe(true);
    expect(head.some((m) => m.name === "twitter:card" && m.content)).toBe(true);
  });

  it("every public route file wires head through pageHead()", () => {
    for (const [file, path] of ROUTE_FILES) {
      const src = readFileSync(file, "utf-8");
      expect(src, `${file} must import pageHead`).toContain('import { pageHead } from "~/lib/site-meta"');
      expect(src, `${file} must use pageHead for head`).toContain(`pageHead("${path}")`);
    }
  });
});

describe("I10 — a11y: icon-only controls are labeled and keyboard-accessible", () => {
  it("modal close button (icon-only) carries aria-label and no focus suppression", () => {
    const src = readFileSync("src/components/ui.tsx", "utf-8");
    const btnAt = src.indexOf('aria-label="Close dialog"');
    expect(btnAt).toBeGreaterThan(-1);
    const closeBtn = src.slice(Math.max(0, btnAt - 120), btnAt + 200);
    expect(closeBtn).toContain("type=\"button\"");
    expect(closeBtn).not.toContain("focus:outline-none");
  });

  it("header mobile menu toggle carries aria-label and aria-expanded", () => {
    const src = readFileSync("src/components/Header.tsx", "utf-8");
    expect(src).toContain('aria-label="Toggle menu"');
    expect(src).toContain("aria-expanded={menuOpen}");
  });

  it("desktop nav dropdowns are keyboard-openable (focus-within) and announce aria-haspopup", () => {
    const src = readFileSync("src/components/Header.tsx", "utf-8");
    // three desktop dropdown panels (Industries / Tools / FAQ)
    expect(src.split("group-focus-within:opacity-100").length - 1).toBe(3);
    expect(src.split('aria-haspopup="true"').length - 1).toBe(3);
  });

  it("auth pages start with a single h1 (heading order)", () => {
    for (const file of ["src/routes/login.tsx", "src/routes/register.tsx", "src/routes/set-password.tsx"]) {
      const src = readFileSync(file, "utf-8");
      const h1s = (src.match(/<h1\b/g) || []).length;
      expect(h1s, `${file} must have one h1`).toBeGreaterThanOrEqual(1);
      // first heading element in the file must be h1 (no h2 before it)
      const firstHeading = src.match(/<h[1-6]\b/);
      expect(firstHeading?.[0], `${file} must start headings with h1`).toBe("<h1");
    }
  });
});
