/**
 * SLICE 185 — four places that told a customer something that was not true.
 *
 *   1. THE LEAD EMAIL quoted setup fees the owner DROPPED on 2026-10-30:
 *      "$199/mo + $500 onboarding", "$599/mo + $1,500 onboarding",
 *      "$1,499/mo (onboarding included)". The site and Stripe charge the
 *      monthly price and nothing else. The email is sent to real leads now
 *      that delivery works, so it was the most urgent copy defect we had.
 *   2. NO `Reply-To`. `simplerlife100.com` has no MX record, so a reply to a
 *      message we send is undeliverable. Every lane must name the owner's real
 *      inbox instead.
 *   3. `POST /api/tools/analyze` answered EVERY caller with
 *      `savingsSummary: "20 hours/week"` — a statistic nobody measured.
 *   4. The provider-catalog catch answered `200 { data: [], total: 0 }`, which
 *      made /portal/integrations/providers say "No Providers Match Your
 *      Query — try checking spelling" over a catalog nobody had read.
 *
 * HOW THESE ASSERTIONS AVOID THE "A TEST WRITTEN FROM THE BUG" TRAP
 * ----------------------------------------------------------------
 * - The expected price is DERIVED from `TIER_SPECS` (what /pricing renders)
 *   and cross-checked against `TIER_MONTHLY_USD` (what Stripe bills); the test
 *   never restates a dollar figure the email also supplies. It then asserts
 *   every `$` amount in the body is one of those monthly prices — so an
 *   invented fee fails even if it is not one of the three we knew about.
 * - The Reply-To value is a SENTINEL only the test sets (`EMAIL_REPLY_TO`), so
 *   it can only appear in the header if the header is really wired to the
 *   address source. A hard-coded literal in the send call fails this test.
 * - The prod-server guards strip comments before scanning, so they pin the
 *   CODE and cannot be satisfied — or broken — by prose about the code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { clearMailLane } from "./mail-lane-isolation";
import { mockFetch, urlIs } from "./helpers/portal-primitive-fetch";

const mail = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn((_opts?: unknown) => ({ sendMail }));
  return { sendMail, createTransport };
});
vi.mock("nodemailer", () => ({
  default: { createTransport: (opts: unknown) => mail.createTransport(opts) },
}));

import { sendEmail, replyToAddress, DEFAULT_REPLY_TO } from "../integrations/email";
import { buildLeadEmail, monthlyPriceLabel } from "../lib/lead-email";
import { TIER_SPECS, TIER_MONTHLY_USD, type PaidTier } from "../lib/entitlements";
import ProvidersPage from "../lazy/portal.integrations.providers.page";

// The page links through the router; jsdom has none (slice-175/178 precedent).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

const REPO_ROOT = join(__dirname, "..", "..");

/** Source with comments removed, so a guard pins CODE and not the prose. */
function codeOnly(file: string): string {
  return readFileSync(join(REPO_ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The route branch for `pathname === "<path>"`, up to the next route literal. */
function routeBlock(source: string, path: string): string {
  const start = source.indexOf(`pathname === "${path}"`);
  expect(start, `route ${path} not found in source`).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n\s*(if \(pathname|const pathname|\/\/ ──)/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

// ─────────────────────────────── 1. the lead email ───────────────────────────

describe("slice 185 — the lead email quotes the monthly price and no fee", () => {
  /** Drive `buildLeadEmail` to each tier via the number of matched names. */
  function emailFor(tier: PaidTier) {
    const wanted = tier === "starter" ? 2 : tier === "growth" ? 5 : 9;
    const topWorkflows = Array.from({ length: wanted }, (_, i) => ({ name: `Workflow ${i + 1}` }));
    return buildLeadEmail("lead@example.com", "assessment", { topWorkflows });
  }

  it("both price tables still agree (the precondition every assertion rests on)", () => {
    for (const tier of ["starter", "growth", "enterprise"] as PaidTier[]) {
      expect(TIER_SPECS[tier].monthlyUsd, `TIER_SPECS.${tier}`).toBe(TIER_MONTHLY_USD[tier]);
    }
  });

  it.each(["starter", "growth"] as PaidTier[])(
    "%s — the plan line carries exactly the site's monthly price",
    (tier) => {
      const { body } = emailFor(tier);
      const expected = `$${TIER_SPECS[tier].monthlyUsd.toLocaleString("en-US")}/mo`;
      expect(body).toContain(expected);
      expect(body).not.toMatch(/onboarding/i);
      expect(body).not.toMatch(/setup fee|set-up fee|onboarding fee|installation/i);
    },
  );

  it("enterprise — priced from the same table (that branch is unreachable from a tool, see below)", () => {
    // Finding, recorded rather than fixed here: `buildLeadEmail` caps the
    // assessment branch at 5 workflow names, so `count > 7` (the Enterprise
    // branch) can never be reached from any tool result — the plan-selection
    // logic is out of scope for this slice, so the test proves the COPY in that
    // branch instead of pretending the branch fires.
    expect(monthlyPriceLabel("enterprise")).toBe(
      `$${TIER_SPECS.enterprise.monthlyUsd.toLocaleString("en-US")}/mo`,
    );
    const src = codeOnly("src/lib/lead-email.ts");
    const branch = src.slice(src.indexOf('bestPlan = "Enterprise"'));
    expect(branch.slice(0, 200)).toContain('monthlyPriceLabel("enterprise")');
    expect(src).not.toMatch(/onboarding|setup fee/i);
  });

  it("every dollar amount in the body is a tier monthly price — no invented fee", () => {
    const allowed = new Set(
      (["starter", "growth", "enterprise"] as PaidTier[]).map(
        (t) => `$${TIER_SPECS[t].monthlyUsd.toLocaleString("en-US")}`,
      ),
    );
    for (const tier of ["starter", "growth", "enterprise"] as PaidTier[]) {
      const { body } = emailFor(tier);
      const amounts = body.match(/\$[\d,]+/g) ?? [];
      expect(amounts.length, `${tier} body quoted no price at all`).toBeGreaterThan(0);
      for (const amount of amounts) expect(allowed.has(amount), `${tier} invented ${amount}`).toBe(true);
    }
  });

  it("the plan-selection logic is untouched: 2 matched names → Starter, 5 → Growth", () => {
    expect(emailFor("starter").bestPlan).toBe("Starter");
    expect(emailFor("growth").bestPlan).toBe("Growth");
  });
});

// ─────────────────────────────── 2. Reply-To ─────────────────────────────────

describe("slice 185 — every outbound message carries a Reply-To a human reads", () => {
  const SENTINEL = "slice185-reply-sentinel@example.test";
  let restoreMailLane: () => void;
  let savedReplyTo: string | undefined;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    restoreMailLane = clearMailLane();
    savedReplyTo = process.env.EMAIL_REPLY_TO;
    process.env.EMAIL_REPLY_TO = SENTINEL;
    mail.sendMail.mockReset();
    mail.createTransport.mockClear();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (savedReplyTo === undefined) delete process.env.EMAIL_REPLY_TO;
    else process.env.EMAIL_REPLY_TO = savedReplyTo;
    restoreMailLane();
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("SMTP lane — the header handed to the transport is the address, not a literal", async () => {
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "brevo-user";
    process.env.SMTP_PASS = "brevo-pass";
    mail.sendMail.mockResolvedValue({ messageId: "smtp-msg" });

    const res = await sendEmail({ to: "lead@example.com", subject: "s", text: "b" });

    expect(res.channel).toBe("smtp");
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    const envelope = mail.sendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(envelope.replyTo).toBe(SENTINEL);
  });

  it("SendGrid lane — reply_to in the JSON body is the address, not a literal", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    const fetchMock = vi.fn(async () => ({
      status: 202,
      ok: true,
      headers: { get: () => "sg-msg" },
      text: async () => "",
    })) as unknown as typeof globalThis.fetch;
    globalThis.fetch = fetchMock;

    const res = await sendEmail({ to: "lead@example.com", subject: "s", text: "b" });

    expect(res.channel).toBe("sendgrid");
    const call = (fetchMock as unknown as { mock: { calls: any[][] } }).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.reply_to).toEqual({ email: SENTINEL });
  });

  it("with no override the address is the one definition, and it is a real address", () => {
    delete process.env.EMAIL_REPLY_TO;
    expect(replyToAddress()).toBe(DEFAULT_REPLY_TO);
    // Not a placeholder: a single, deliverable-looking mailbox.
    expect(DEFAULT_REPLY_TO).toMatch(/^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i);
  });

  it("the THIRD lane (prod-server sendEmailSMTP) sends the same Reply-To", () => {
    const server = codeOnly("prod-server.ts");
    const fnStart = server.indexOf("async function sendEmailSMTP(");
    expect(fnStart, "sendEmailSMTP not found").toBeGreaterThan(-1);
    const fnBody = server.slice(fnStart, server.indexOf("\n}", server.indexOf('"https://api.sendgrid.com/v3/mail/send"', fnStart)));
    expect(fnBody).toContain("reply_to: { email: replyToAddress() }");
    expect(server).toContain('import { replyToAddress } from "./src/integrations/email"');
  });

  it("the address has ONE definition — no send call pastes the literal", () => {
    // The address is legitimately used elsewhere for other jobs (the lead
    // notification RECIPIENT, the public contact address), so this pins what
    // matters: exactly one definition, and no send call inlining a value.
    const definitions = ["prod-server.ts", "src/integrations/email.ts"]
      .flatMap((f) => codeOnly(f).match(/DEFAULT_REPLY_TO\s*=\s*"/g) ?? []);
    expect(definitions).toHaveLength(1);
    for (const file of ["prod-server.ts", "src/integrations/email.ts"]) {
      expect(codeOnly(file), `${file} inlines a reply-to address`).not.toMatch(
        /reply_?to:\s*(\{\s*email:\s*)?"/i,
      );
    }
  });
});

// ─────────────────── 3. /api/tools/analyze invents no statistic ───────────────

describe("slice 185 — /api/tools/analyze reports no figure it did not measure", () => {
  it("the route quotes no hard-coded hours-per-week figure", () => {
    const block = routeBlock(codeOnly("prod-server.ts"), "/api/tools/analyze");
    expect(block).not.toMatch(/savingsSummary:\s*["'`]/);
    expect(block).not.toMatch(/\d+\s*(hours?|hrs?)\s*(per|\/)\s*week/i);
  });

  it("it says plainly that nothing was measured", () => {
    const block = routeBlock(codeOnly("prod-server.ts"), "/api/tools/analyze");
    expect(block).toMatch(/savingsSummary:\s*null/);
    expect(block).toMatch(/No analysis was performed/);
  });
});

// ────────── 4. the provider catalog answers honestly, and the page reads it ──

describe("slice 185 — a failed catalog read is a failure, not an empty search", () => {
  it("the server's catalog catch is a non-2xx with a tenant-readable error", () => {
    const block = routeBlock(codeOnly("prod-server.ts"), "/api/integrations/providers");
    expect(block).not.toMatch(/data:\s*\[\]/);
    expect(block).not.toMatch(/total:\s*0/);
    const catchAt = block.indexOf("} catch");
    expect(catchAt, "the catalog route lost its catch").toBeGreaterThan(-1);
    const catchBlock = block.slice(catchAt);
    expect(catchBlock).toMatch(/status:\s*500/);
    expect(catchBlock).toMatch(/error:\s*"[^"]+"/);
  });

  it("a 500 renders the SERVER's sentence, never the empty-search state", async () => {
    const SENTENCE = "slice185-catalog-unreadable-sentinel";
    mockFetch([{ match: urlIs("/api/integrations/providers"), status: 500, body: { error: SENTENCE } }]);
    render(<ProvidersPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert")).toHaveTextContent(SENTENCE);
    expect(screen.queryByText(/No Providers Match Your Query/i)).toBeNull();
  });

  it("a 401 is a signed-out state, not an empty catalog", async () => {
    mockFetch([{ match: urlIs("/api/integrations/providers"), status: 401, body: { error: "Not authenticated" } }]);
    render(<ProvidersPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert")).toHaveTextContent(/session is not active/i);
    expect(screen.queryByText(/No Providers Match Your Query/i)).toBeNull();
  });

  it("a 2xx with no rows still renders the honest empty-search state", async () => {
    mockFetch([{ match: urlIs("/api/integrations/providers"), status: 200, body: { data: [], total: 0 } }]);
    render(<ProvidersPage />);

    await waitFor(() => expect(screen.queryByText(/No Providers Match Your Query/i)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
