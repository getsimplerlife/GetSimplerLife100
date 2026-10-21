/**
 * native-import-copy-sweep.test.ts — Phase 5.1 (6.6) COPY SWEEP + PORTAL
 * IMPORT UI truthfulness contracts (LAST Phase 5 slice).
 *
 * Owner 10-20 direction: external tool connections are CLIENT-optional
 * import/migration lanes — "connect your existing tools to bring your data
 * in"; NEVER "we run through your tools", never background sync, never
 * write-back, never the retired reconnect program.
 *
 * Contracts under test:
 *   - IMPORT_LANE_COPY covers every KNOWN_IMPORT_PROVIDERS entry with an
 *     honest per-lane description,
 *   - per-lane honesty: live lanes say what they read AND what they do NOT
 *     read ("file contents are NOT downloaded by this lane", "message content
 *     is NOT downloaded", "event attachments are NOT downloaded", "bounded
 *     snapshot, page 1"); config-metadata lanes say no live provider call is
 *     made ("no live SendGrid API call"); nothing claims sync/write-back/
 *     reconnect/run-through-tools,
 *   - the swept user-facing pages no longer contain the retired reconnect /
 *     auto-flow phrasing (you-stay-in-control, security, homepage, customers
 *     portal page),
 *   - the portal import page's static copy renders the honest framing
 *     ("connect your existing tools to bring your data in", "nothing is
 *     imported until you approve", "no public share" absent by design),
 *   - standing greps stay 0 on the touched surfaces: banned agent-era vocab,
 *     old per-agent Stripe links, stale offers in the new portal page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import PortalImportIndexPage, { IMPORT_LANE_COPY } from "../lazy/portal.import.index.page";
import { KNOWN_IMPORT_PROVIDERS } from "../native/import/gate";

const BANNED_PHRASES = [
  "reconnect",
  "reconnected automatically",
  "one-click reconnect",
  "run through your tools",
  "through your tools",
  "data routes automatically",
  "data flows automatically",
  "write-back",
  "background sync",
  "syncs automatically",
  "on your behalf",
  "live provider",
  "live demo",
  "AI Operations Team",
  "AI coworkers",
  "AI Employee",
  "AI agent",
  "AI workforce",
];

describe("6.6 copy sweep — honest, client-side import framing", () => {
  it("IMPORT_LANE_COPY covers every KNOWN_IMPORT_PROVIDERS entry (catalog never shows a lane without copy)", () => {
    for (const provider of KNOWN_IMPORT_PROVIDERS) {
      const meta = IMPORT_LANE_COPY[provider];
      expect(meta, `provider ${provider} must have honest lane copy`).toBeTruthy();
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.copy.length).toBeGreaterThan(20);
    }
  });
  it("live lanes state what they read AND what they do NOT read (file/event/channel metadata only)", () => {
    for (const [provider, meta] of Object.entries(IMPORT_LANE_COPY)) {
      if (meta.family.startsWith("live")) {
        expect(meta.copy, `${provider} live lane must state bounded page-1`).toMatch(/page 1|last 30 days|bounded snapshot/);
        if (meta.family === "live-file") expect(meta.copy).toContain("File contents are NOT downloaded by this lane");
        if (meta.family === "live-event") expect(meta.copy).toContain("Event attachments are NOT downloaded by this lane");
        if (meta.family === "live-channel") expect(meta.copy).toContain("Message content is NOT downloaded by this lane");
      }
    }
  });
  it("config-metadata lanes say no live provider call is made and never claim email/file transfer", () => {
    expect(IMPORT_LANE_COPY["sendgrid"].copy).toContain("No live SendGrid API call");
    expect(IMPORT_LANE_COPY["sendgrid"].copy).toContain("email content is never transferred");
    expect(IMPORT_LANE_COPY["sftp"].copy).toContain("No live SFTP connection is made");
    expect(IMPORT_LANE_COPY["sftp"].copy).toContain("file content transfer is not part of this lane");
  });
  it("no lane copy uses banned phrasing (no sync/write-back/reconnect/run-through-tools/agent-era vocab)", () => {
    for (const [provider, meta] of Object.entries(IMPORT_LANE_COPY)) {
      for (const banned of BANNED_PHRASES) {
        expect(meta.copy.toLowerCase(), `${provider} copy must not contain "${banned}"`).not.toContain(banned);
      }
    }
  });
  it("swept user-facing pages no longer carry the retired reconnect / auto-flow claims", () => {
    const sweepTargets: Array<[string, string[]]> = [
      ["src/lazy/you-stay-in-control.page.tsx", ["reconnected automatically", "one-click reconnect"]],
      ["src/lazy/security.page.tsx", ["a reconnect path", "reconnect-required"]],
      ["src/routes/index.tsx", ["reconnected in one click"]],
      ["src/lazy/portal.customers.index.page.tsx", ["data routes automatically", "data flows automatically", "Universal Connector"]],
      ["src/lazy/portal.index.page.tsx", ["Connected Integrations", "Connect Tools", "Connect your first integration"]],
      ["src/lazy/portal.crm.index.page.tsx", ["universal connector", "We integrate with"]],
      ["src/lazy/portal.erp.index.page.tsx", ["universal connector", "We integrate with"]],
      ["src/lazy/portal.api.index.page.tsx", ["connected integrations"]],
      ["src/lazy/integrations.index.page.tsx", ["synced with audit trail"]],
    ];
    for (const [file, phrases] of sweepTargets) {
      const content = readFileSync(file, "utf8").toLowerCase();
      for (const p of phrases) expect(content, `${file} must not contain "${p}"`).not.toContain(p);
    }
    // The replaced phrases now carry the client-side import framing.
    expect(readFileSync("src/lazy/you-stay-in-control.page.tsx", "utf8")).toContain("Bring your data in");
    expect(readFileSync("src/lazy/security.page.tsx", "utf8")).toContain("Client-side, one-shot transfers");
    expect(readFileSync("src/routes/index.tsx", "utf8")).toContain("Nothing imports on");
    expect(readFileSync("src/routes/index.tsx", "utf8")).toContain("nothing is written until you approve");
    expect(readFileSync("src/lazy/portal.customers.index.page.tsx", "utf8")).toContain("nothing writes back");
    expect(readFileSync("src/lazy/portal.customers.index.page.tsx", "utf8")).toContain("CRM &amp; ERP import");
    expect(readFileSync("src/lazy/portal.index.page.tsx", "utf8")).toContain("Your tool connections");
    expect(readFileSync("src/lazy/portal.index.page.tsx", "utf8")).toContain("Bring your data in — connect your first tool");
    expect(readFileSync("src/lazy/portal.crm.index.page.tsx", "utf8")).toContain("Import lanes cover 180+");
    expect(readFileSync("src/lazy/portal.erp.index.page.tsx", "utf8")).toContain("Import lanes cover 180+");
    expect(readFileSync("src/lazy/integrations.index.page.tsx", "utf8")).toContain("appended to the audit trail");
  });
});

describe("portal import page renders the honest static surface (SSR)", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });
  it("renders the owner 10-20 framing: connect your tools to bring data in, approve every step", () => {
    const html = renderToString(createElementPage());
    for (const phrase of [
      "Import &amp; migration",
      "Connect your existing tools to bring your data in",
      "We never run through your tools",
      "nothing syncs in the background",
      "nothing writes back",
      "nothing is imported until you approve",
      "approval-gated",
    ]) {
      expect(html, `SSR html must contain "${phrase}"`).toContain(phrase);
    }
  });
  it("never renders public-share / per-agent-era phrases", () => {
    const html = renderToString(createElementPage());
    for (const banned of ["public share", "one-click reconnect", "reconnect", "AI employee", "per-agent"]) {
      expect(html.toLowerCase(), `SSR html must not contain "${banned}"`).not.toContain(banned);
    }
  });
});

/** SSR entry — renders the lazy page component directly (same pattern as
 *  src/test/portal-file-library.test.tsx). */
function createElementPage() {
  return createElement(PortalImportIndexPage);
}