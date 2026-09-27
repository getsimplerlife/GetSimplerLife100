/**
 * site-meta.ts — single source of truth for per-route SEO metadata.
 *
 * Every public route has an entry here: a unique, accurate title and meta
 * description. `pageHead(path)` builds the full SSR/client <head> block
 * (title + description + Open Graph + Twitter card) used by route `head`
 * configs; `resolvePageMeta(pathname)` is the client-side navigation fallback
 * (used by __root.tsx) so titles/meta stay correct on SPA route changes.
 *
 * Copy is truthful on purpose: it describes what the product actually does
 * (per the business plan), never overclaims capability.
 */
export interface PageMeta {
  title: string;
  description: string;
}

export const SITE_URL = "https://simplerlife100.ctonew.app";

export const DEFAULT_PAGE_META: PageMeta = {
  title: "Simpler Life 100 | One Platform for AI-Automated Client Ops",
  description:
    "One platform for AI-automated client operations. Real, working automation with human approval by default — no complexity.",
};

/**
 * Canonical map: public route path (or path prefix for dynamic routes) → meta.
 * Every entry must be unique — the test suite asserts this.
 */
export const PAGE_TITLES: Record<string, PageMeta> = {
  "/": {
    title: "Simpler Life 100 | One Platform for AI-Automated Client Ops",
    description:
      "One platform that automates your operations end to end — records, forms, documents & e-sign, booking, boards, AI extraction, surveys, transforms/EDI, dashboards, and automations. Every capability in every tier.",
  },
  "/about": {
    title: "About Simpler Life 100 | Our Mission",
    description:
      "We build one platform that automates client operations end to end, freeing people from repetitive manual work. Learn about our mission, principles, and approach to AI automation.",
  },
  "/assessment": {
    title: "Automation Assessment | Simpler Life 100",
    description:
      "Answer a few questions about your operations and get a free automation assessment with recommended workflows and estimated savings.",
  },
  "/audit": {
    title: "AI Opportunity Audit | Simpler Life 100",
    description:
      "Work through a structured AI opportunity audit to find which workflows you can automate and estimate your savings.",
  },
  "/build": {
    title: "Build Your Platform | Simpler Life 100",
    description:
      "Configure the Simpler Life 100 platform for your operations. One platform with native records, forms, docs, booking, boards, AI extraction, surveys, transforms/EDI, dashboards, and automations — every capability in every tier.",
  },
  "/case-studies": {
    title: "Case Studies | Simpler Life 100",
    description:
      "Explore case studies of AI-automated client operations — the workflows they run and the systems they integrate with, across industries.",
  },
  "/contact": {
    title: "Contact Simpler Life 100 | Get in Touch",
    description:
      "Get in touch with the Simpler Life 100 team. Schedule a demo, ask about the platform, or discuss custom automation for your industry.",
  },
  "/demo": {
    title: "Request a Demo | Simpler Life 100",
    description:
      "See Simpler Life 100 in action. Request a personalized demo of the platform for your industry.",
  },
  "/demos": {
    title: "Interactive Demos | Simpler Life 100",
    description:
      "See Simpler Life 100 in action with interactive demos of the client portal, workflows, and audit experience.",
  },
  "/faq": {
    title: "FAQ | Simpler Life 100",
    description:
      "Frequently asked questions about the platform, pricing, integrations, deployment, and how Simpler Life 100 automates your operations.",
  },
  "/features": {
    title: "Features | Simpler Life 100",
    description:
      "Native records, forms, docs & e-sign, webhooks, booking, boards, AI extraction, surveys, transforms/EDI, dashboards, and automations — one platform, every capability in every tier, with fail-closed security.",
  },
  "/how-it-works": {
    title: "How It Works | Simpler Life 100",
    description:
      "One platform for AI-automated client operations. Connect to Xero, Slack, Google, Microsoft 365, HubSpot, and DocuSign — with more integrations in development. See how Simpler Life 100 works.",
  },
  "/industries": {
    title: "Industries | Simpler Life 100",
    description:
      "One platform for AI-automated client operations across 7 focus verticals — insurance, legal, real estate, healthcare, construction, professional services, and financial services. See the specific operational problem, the workflows we automate, and how the platform fits your stack.",
  },
  "/integrations": {
    title: "Integrations | Simpler Life 100",
    description:
      "Explore the apps the Simpler Life 100 platform works with. Live today: Xero, Slack, Google, Microsoft 365, HubSpot, and DocuSign — with more in development.",
  },
  "/login": {
    title: "Login | Simpler Life 100",
    description:
      "Sign in to your Simpler Life 100 portal to manage your workflows, automations, and integrations.",
  },
  "/pricing": {
    title: "Pricing | Simpler Life 100",
    description:
      "One platform, every capability in every tier. Starter $199/mo (+ $500 onboarding), Growth $599/mo (+ $1,500), Enterprise $1,499/mo (onboarding included). Native records, forms, docs & e-sign, booking, boards, AI extraction, surveys, transforms/EDI, dashboards, and automations.",
  },
  "/privacy": {
    title: "Privacy Policy | Simpler Life 100",
    description:
      "How Simpler Life 100 collects, uses, and protects your information. Contact: electric.vortexz@gmail.com.",
  },
  "/terms": {
    title: "Terms of Service | Simpler Life 100",
    description:
      "The terms that govern use of the Simpler Life 100 platform and services. Contact: electric.vortexz@gmail.com.",
  },
  "/register": {
    title: "Register | Simpler Life 100",
    description:
      "Create your Simpler Life 100 account. Deploy the platform and start automating your operations today.",
  },
  "/resources": {
    title: "Resources | Simpler Life 100",
    description:
      "Guides, templates, and operational playbooks to help you plan and deploy AI automation for your business.",
  },
  "/security": {
    title: "Security | Simpler Life 100",
    description:
      "Your data stays under your control: scoped permissions, human approval on every write, audit trails, fail-closed behavior, and self-healing connections.",
  },
  "/you-stay-in-control": {
    title: "You Stay in Control | Simpler Life 100",
    description:
      "AI doesn't get to make the final decision — your team does. Human approval queue, audit trail, fail-closed behavior, and connections that self-heal.",
  },
  "/after-purchase": {
    title: "What Happens After You Buy | Simpler Life 100",
    description:
      "The concrete journey from purchase to deployed: Day 1 discovery, workflow design, build, testing with human approval, then ongoing monitoring and support.",
  },
  "/roi-assessment": {
    title: "ROI Assessment | Simpler Life 100",
    description:
      "Estimate the ROI of AI automation for your operations with a quick self-assessment.",
  },
  "/roi-calculator": {
    title: "ROI Calculator | Simpler Life 100",
    description:
      "Calculate your automation ROI. Estimate how much time and money AI automation can save your operations team.",
  },
  "/set-password": {
    title: "Set Password | Simpler Life 100",
    description: "Set your account password.",
  },
  "/support": {
    title: "Support | Simpler Life 100",
    description:
      "Get help with your platform. Contact support, browse documentation, or schedule a consultation with our team.",
  },
  "/tools-hub": {
    title: "Tools Hub | Simpler Life 100",
    description:
      "Free tools to assess your automation potential, estimate ROI, and plan your platform build.",
  },
  "/tools": {
    title: "Free AI Productivity Tools | Simpler Life 100",
    description:
      "Free AI-powered tools for operations teams. Analyze workflows, estimate savings, and discover automation opportunities — no signup required.",
  },
  "/workflows": {
    title: "Workflows | Simpler Life 100",
    description:
      "Browse the automation library — pre-built AI workflows across industries and tools, ready to deploy.",
  },
};

/** Resolve the closest meta for a pathname (exact match, then prefix match). */
export function resolvePageMeta(pathname: string): PageMeta | null {
  if (!pathname) return null;
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  for (const [prefix, meta] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "?")) {
      return meta;
    }
  }
  return null;
}

/**
 * Build the head block (title + description + OG + Twitter) for a route.
 * Use in each route's `head: () => pageHead("/route")` config.
 */
export function pageHead(path: string) {
  const meta = resolvePageMeta(path) ?? DEFAULT_PAGE_META;
  return {
    meta: [
      { title: meta.title },
      { name: "description", content: meta.description },
      { property: "og:title", content: meta.title },
      { property: "og:description", content: meta.description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}${path === "/" ? "/" : path}` },
      { property: "og:site_name", content: "Simpler Life 100" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: meta.title },
      { name: "twitter:description", content: meta.description },
    ],
  };
}
