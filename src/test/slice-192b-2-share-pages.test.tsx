/**
 * SLICE 192b-2 — the two remaining share pages, rebuilt to the survey's shape.
 *
 * THE DEFECTS THESE PIN (read at source in `share-pages-192b-audit-2026-11-06.md`
 * §3, findings 11, 12, 15, 16, 17, 19, 22–24, 26–28):
 *
 *  - Proposals collapsed EVERY failure into "Proposal not found"
 *    (`proposals.share.$slug.page.tsx:47,148`), so a 500 or an unreadable
 *    payload told the client their link was dead.
 *  - The Accept/Decline card never closed: `:131-145` re-fetched nothing and
 *    `:194-226` rendered the form from `view.status !== "pending"` alone, so a
 *    client could accept, then decline, and the owner got two contradictory
 *    approval cards for one quote.
 *  - 200 (applied) and 202 (queued for approval) printed the SAME sentence,
 *    "the proposal owner will confirm them" — false on the applied path.
 *  - "Standard terms apply." was invented whenever `terms` was "".
 *  - "Valid for {validityDays} days" was printed and never computed; the real
 *    `expiresAt` (192b-1) was not shown and the form ignored it.
 *  - Bookings rendered `return null` on an unreadable 200 (`:84`) — a blank
 *    white page — and kept the previous date's slots after a failed read
 *    (`:43-53`), so the client clicked a time from another day and the server
 *    then said "that time slot is no longer available", which was false.
 *  - Every published booking page carried "Confirmed bookings sync to your
 *    calendar through the connected Google Calendar adapter" — no sync is
 *    executed and no tenant can connect it.
 *  - Neither route set `noindex`.
 *
 * HOW THE ASSERTIONS AVOID BLESSING THE BUG: every expectation is a
 * relationship the page itself must honour — 404 copy ≠ 500 copy, the presence
 * of a form after a recorded decision, the absence of a slot that was already
 * on screen — never a second copy of a string the page writes. Where a string
 * is asserted (the 500 heading, "Standard terms") it is one this slice is
 * REMOVING or one the sibling survey page already established as the model.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SLUG_P = "sp_192b2";
const SLUG_B = "bk_192b2";

let currentSlug = SLUG_P;

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, className }: { to: string; children?: React.ReactNode; className?: string }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
    useParams: () => ({ slug: currentSlug }),
    useSearch: () => ({}),
  };
});

import ProposalSharePage from "~/lazy/proposals.share.$slug.page";
import BookingSharePage from "~/lazy/bookings.share.$slug.page";
import { Route as ProposalShareRoute } from "~/routes/proposals.share.$slug";
import { Route as BookingShareRoute } from "~/routes/bookings.share.$slug";
import { proposalPublicApiPath, bookingPublicApiPath, bookingSlotsApiPath } from "~/lib/share-links";

// ── fetch stub ───────────────────────────────────────────────────────────────
interface Stub {
  /** Matched with `url.includes(...)` — put the MOST SPECIFIC stubs first. */
  match: string;
  method?: "GET" | "POST";
  status?: number;
  body: unknown;
}

function stubFetch(stubs: Stub[]) {
  const fn = vi.fn(async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const hit = stubs.find((s) => url.includes(s.match) && (!s.method || s.method === method));
    const status = hit ? (hit.status ?? 200) : 404;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (hit ? hit.body : { error: "not mocked" }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── fixtures ─────────────────────────────────────────────────────────────────
/** The shape `publicShareView` sends (src/native/proposals/router.ts:123-143). */
function proposalView(over: Record<string, unknown> = {}) {
  return {
    proposalId: "prp_192b2",
    title: "Q1 platform build",
    clientName: "Ada Lovelace",
    clientCompany: "Acme Ltd",
    issuerName: "Northwind Advisory",
    status: "pending",
    signable: true,
    currency: "USD",
    lineItems: [
      { description: "Discovery", qty: 1, unitPrice: 2500 },
      { description: "Discovery", qty: 2, unitPrice: 2500 }, // duplicate description — key collision
    ],
    total: "$7,500.00",
    totalCents: 750000,
    terms: "Net 30 from the invoice date.",
    validityDays: 30,
    issuedAt: "2026-11-01T00:00:00.000Z",
    issuedAtSource: "opened",
    expiresAt: "2026-12-01T00:00:00.000Z",
    expired: false,
    ...over,
  };
}

function bookingPage(over: Record<string, unknown> = {}) {
  return {
    name: "Intro call",
    description: "A 30 minute conversation.",
    hostName: "Northwind Advisory",
    timeZone: "UTC",
    slotDurationMinutes: 30,
    bufferMinutes: 0,
    availability: ["Mon 09:00-17:00"],
    teamSize: 1,
    ...over,
  };
}

/** Find a text control by its label, falling back to its placeholder. */
function field(re: RegExp): HTMLInputElement {
  const byLabel = screen.queryByLabelText(re) as HTMLInputElement | null;
  if (byLabel) return byLabel;
  return screen.getByPlaceholderText(re) as HTMLInputElement;
}

/** The initials control: the label is exact so the "Typed initials" radio never matches. */
function initialsField(): HTMLInputElement {
  return field(/^\s*your initials\s*$/i);
}

async function renderProposal(stubs: Stub[]) {
  currentSlug = SLUG_P;
  stubFetch(stubs);
  render(<ProposalSharePage />);
}

async function renderBooking(stubs: Stub[]) {
  currentSlug = SLUG_B;
  stubFetch(stubs);
  render(<BookingSharePage />);
}

// ── 1. proposals: four phases ────────────────────────────────────────────────
describe("slice 192b-2 — the proposal page has four phases, not one", () => {
  it("a 404 reads 'not available' and a 500 reads a retryable error — never each other", async () => {
    await renderProposal([
      { match: proposalPublicApiPath(SLUG_P), status: 404, body: { error: "Unknown proposal share link" } },
    ]);
    expect(await screen.findByText(/proposal isn't available/i)).toBeTruthy();
    expect(screen.queryByText(/couldn't load this proposal/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull(); // a 404 is not retryable
    cleanup();

    await renderProposal([
      { match: proposalPublicApiPath(SLUG_P), status: 500, body: { error: "Internal error" } },
    ]);
    expect(await screen.findByText(/couldn't load this proposal/i)).toBeTruthy();
    // The server's own words, and a retry that re-reads.
    expect(screen.getByText(/Internal error/)).toBeTruthy();
    const retry = screen.getByRole("button", { name: /try again/i });
    expect(retry).toBeTruthy();
    expect(screen.queryByText(/proposal isn't available/i)).toBeNull();
  });

  it("a retry after a 500 re-reads and renders the quote", async () => {
    let first = true;
    stubFetch([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const status = first ? 500 : 200;
        first = false;
        return {
          ok: status === 200,
          status,
          json: async () => (status === 200 ? { data: proposalView() } : { error: "Internal error" }),
        } as unknown as Response;
      }),
    );
    currentSlug = SLUG_P;
    render(<ProposalSharePage />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { name: /Q1 platform build/i })).toBeTruthy();
  });

  it("an unreadable 200 renders an error, never a quote", async () => {
    await renderProposal([
      // `status` is a machine enum the page maps to a label; an unknown one means
      // the payload is not the shape this page understands.
      { match: proposalPublicApiPath(SLUG_P), body: { data: { title: "Q1 platform build", status: "mystery" } } },
    ]);
    expect(await screen.findByText(/couldn't load this proposal/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Q1 platform build/i })).toBeNull();
  });

  it("a line item whose price is not a number is an error, not a crash", async () => {
    await renderProposal([
      {
        match: proposalPublicApiPath(SLUG_P),
        body: { data: proposalView({ lineItems: [{ description: "Discovery", qty: 1, unitPrice: "n/a" }] }) },
      },
    ]);
    expect(await screen.findByText(/couldn't load this proposal/i)).toBeTruthy();
  });
});

// ── 2. proposals: the decision panel ─────────────────────────────────────────
describe("slice 192b-2 — the proposal decision panel", () => {
  it("an expired proposal renders no Accept form and prints the real expiry date", async () => {
    const expiresAt = "2026-01-31T00:00:00.000Z";
    await renderProposal([
      {
        match: proposalPublicApiPath(SLUG_P),
        body: { data: proposalView({ signable: false, expired: true, expiresAt }) },
      },
    ]);
    // SLICE 205 — this query was `/expired/i` and the page now legitimately says
    // "expired" TWICE: the status badge and the panel heading. Both are correct
    // (before 205 the badge said "Awaiting your decision"), so the assertion is
    // scoped to the panel heading it was always about.
    expect(await screen.findByRole("heading", { name: /has expired/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /decline/i })).toBeNull();
    // The date the server holds, formatted — not "Valid for 30 days".
    expect(document.body.textContent).toContain(new Date(expiresAt).toLocaleDateString());
    expect(document.body.textContent).not.toMatch(/valid for \d+ days/i);
  });

  it("a recorded decision (200 applied) leaves no live form and says it was recorded", async () => {
    await renderProposal([
      {
        match: proposalPublicApiPath(SLUG_P),
        method: "POST",
        body: { data: { status: "applied", decision: "approve", autonomy: true } },
      },
      { match: proposalPublicApiPath(SLUG_P), body: { data: proposalView() } },
    ]);
    fireEvent.change(await waitFor(() => field(/your full name/i)), { target: { value: "Ada Lovelace" } });
    fireEvent.change(initialsField(), { target: { value: "AL" } });
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    const receipt = await screen.findByText(/recorded/i);
    expect(receipt).toBeTruthy();
    // NO form, in any shape: a second click would queue a contradictory card.
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /decline/i })).toBeNull();
    expect(screen.queryByLabelText(/^\s*your initials\s*$/i)).toBeNull();
  });

  it("a queued decision (202) reads differently from an applied one", async () => {
    await renderProposal([
      {
        match: proposalPublicApiPath(SLUG_P),
        method: "POST",
        status: 202,
        body: { data: { status: "pending", approvalActionId: "act_1" } },
      },
      { match: proposalPublicApiPath(SLUG_P), body: { data: proposalView() } },
    ]);
    fireEvent.change(await waitFor(() => field(/your full name/i)), { target: { value: "Ada Lovelace" } });
    fireEvent.change(initialsField(), { target: { value: "AL" } });
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    const queued = await screen.findByText(/waiting/i);
    expect(queued).toBeTruthy();
    // Nothing was applied, so the page must not claim it was recorded.
    expect(document.body.textContent).not.toMatch(/was recorded/i);
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
  });

  it("a proposal already decided on the server renders no form", async () => {
    await renderProposal([
      { match: proposalPublicApiPath(SLUG_P), body: { data: proposalView({ status: "approved", signable: false }) } },
    ]);
    await waitFor(() => expect(document.body.textContent).toMatch(/accepted/i));
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /decline/i })).toBeNull();
  });

  it("the terms sentence is the record's own, or nothing — never 'Standard terms apply.'", async () => {
    await renderProposal([
      { match: proposalPublicApiPath(SLUG_P), body: { data: proposalView({ terms: "" }) } },
    ]);
    await screen.findByRole("heading", { name: /Q1 platform build/i });
    expect(document.body.textContent).not.toMatch(/standard terms/i);
    cleanup();

    await renderProposal([{ match: proposalPublicApiPath(SLUG_P), body: { data: proposalView() } }]);
    await screen.findByRole("heading", { name: /Q1 platform build/i });
    expect(document.body.textContent).toContain("Net 30 from the invoice date.");
  });

  it("names the firm that issued it and both duplicate line items render", async () => {
    await renderProposal([{ match: proposalPublicApiPath(SLUG_P), body: { data: proposalView() } }]);
    await screen.findByRole("heading", { name: /Q1 platform build/i });
    expect(document.body.textContent).toContain("Northwind Advisory");
    expect(screen.getAllByText("Discovery")).toHaveLength(2);
  });

  it("a refused decision prints the server's words and offers no live form", async () => {
    await renderProposal([
      {
        match: proposalPublicApiPath(SLUG_P),
        method: "POST",
        status: 409,
        body: { error: "This proposal expired on 2026-01-31T00:00:00.000Z.", reason: "expired" },
      },
      { match: proposalPublicApiPath(SLUG_P), body: { data: proposalView() } },
    ]);
    fireEvent.change(await waitFor(() => field(/your full name/i)), { target: { value: "Ada Lovelace" } });
    fireEvent.change(initialsField(), { target: { value: "AL" } });
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    expect(await screen.findByText(/This proposal expired on/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
  });
});

// ── 3. bookings: four phases ─────────────────────────────────────────────────
describe("slice 192b-2 — the booking page has four phases, not a blank page", () => {
  it("a 404 reads 'not available' and a 500 reads a retryable error — never each other", async () => {
    await renderBooking([
      { match: bookingPublicApiPath(SLUG_B), status: 404, body: { error: "Unknown booking page link" } },
    ]);
    expect(await screen.findByText(/booking page isn't available/i)).toBeTruthy();
    expect(screen.queryByText(/couldn't load this booking page/i)).toBeNull();
    cleanup();

    await renderBooking([
      { match: bookingPublicApiPath(SLUG_B), status: 500, body: { error: "Internal error" } },
    ]);
    expect(await screen.findByText(/couldn't load this booking page/i)).toBeTruthy();
    expect(screen.getByText(/Internal error/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(screen.queryByText(/booking page isn't available/i)).toBeNull();
  });

  it("an unreadable 200 renders an error, never a blank page", async () => {
    // The exact shape the audit found: `return null` on a payload the page
    // cannot read (`bookings.share.$slug.page.tsx:84`).
    await renderBooking([{ match: bookingPublicApiPath(SLUG_B), body: { data: null } }]);
    expect(await screen.findByText(/couldn't load this booking page/i)).toBeTruthy();
    cleanup();

    // …and a payload that is *nearly* right (no `availability` array) is the
    // same answer, not a render-time crash.
    await renderBooking([{ match: bookingPublicApiPath(SLUG_B), body: { data: { name: "Intro call" } } }]);
    expect(await screen.findByText(/couldn't load this booking page/i)).toBeTruthy();
  });

  it("prints the host's name", async () => {
    await renderBooking([{ match: bookingPublicApiPath(SLUG_B), body: { data: bookingPage() } }]);
    expect(await screen.findByRole("heading", { name: /Intro call/i })).toBeTruthy();
    expect(document.body.textContent).toContain("Northwind Advisory");
  });

  it("carries no calendar-sync claim, even when the payload still offers one", async () => {
    await renderBooking([
      {
        match: bookingPublicApiPath(SLUG_B),
        body: {
          data: bookingPage({
            calendarSyncLabel:
              "Confirmed bookings sync to your calendar through the connected Google Calendar adapter (verified integration).",
          }),
        },
      },
    ]);
    await screen.findByRole("heading", { name: /Intro call/i });
    expect(document.body.textContent).not.toMatch(/calendar/i);

    // The claim cannot come back through the source either.
    const src = readFileSync(join(process.cwd(), "src/lazy/bookings.share.$slug.page.tsx"), "utf8");
    expect(src).not.toMatch(/Google Calendar/);
    expect(src).not.toMatch(/calendarSyncLabel/);
  });
});

// ── 4. bookings: slots ───────────────────────────────────────────────────────
describe("slice 192b-2 — booking slots tell the truth", () => {
  it("a failed availability read clears the previous date's slots", async () => {
    const SLOT = "2030-01-07T09:00:00.000Z";
    await renderBooking([
      { match: bookingSlotsApiPath(SLUG_B, "2030-01-07"), body: { data: { date: "2030-01-07", slots: [SLOT] } } },
      { match: bookingSlotsApiPath(SLUG_B, "2030-01-08"), status: 500, body: { error: "Availability store unavailable" } },
      { match: bookingPublicApiPath(SLUG_B), body: { data: bookingPage() } },
    ]);
    const dateInput = (await waitFor(() => {
      const el = document.querySelector('input[type="date"]');
      if (!el) throw new Error("date input not rendered yet");
      return el;
    })) as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: "2030-01-07" } });
    expect(await screen.findByRole("button", { name: /09:00/ })).toBeTruthy();

    fireEvent.change(dateInput, { target: { value: "2030-01-08" } });
    // The old date's time must not stay clickable: the server would refuse it
    // and this page would then say "no longer available", which is false.
    await waitFor(() => expect(screen.queryByRole("button", { name: /09:00/ })).toBeNull());
    expect(await screen.findByText(/Availability store unavailable/)).toBeTruthy();
  });

  it("a time that has already passed is not offered", async () => {
    await renderBooking([
      {
        match: bookingSlotsApiPath(SLUG_B, "2030-01-07"),
        body: {
          data: {
            date: "2030-01-07",
            slots: ["2020-01-06T09:00:00.000Z", "2030-01-07T09:30:00.000Z"],
          },
        },
      },
      { match: bookingPublicApiPath(SLUG_B), body: { data: bookingPage() } },
    ]);
    const dateInput = (await waitFor(() => {
      const el = document.querySelector('input[type="date"]');
      if (!el) throw new Error("date input not rendered yet");
      return el;
    })) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2030-01-07" } });

    expect(await screen.findByRole("button", { name: /09:30/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /09:00/ })).toBeNull();
  });

  it("keeps the weekday in the slot label", async () => {
    const SLOT = "2030-01-07T09:00:00.000Z"; // a Monday
    await renderBooking([
      { match: bookingSlotsApiPath(SLUG_B, "2030-01-07"), body: { data: { date: "2030-01-07", slots: [SLOT] } } },
      { match: bookingPublicApiPath(SLUG_B), body: { data: bookingPage() } },
    ]);
    const dateInput = (await waitFor(() => {
      const el = document.querySelector('input[type="date"]');
      if (!el) throw new Error("date input not rendered yet");
      return el;
    })) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2030-01-07" } });
    const btn = await screen.findByRole("button", { name: /09:00/ });
    const label = (btn.textContent ?? "").trim();
    // The formatter produced a weekday and the page threw it away.
    expect(label).toMatch(/Mon|Monday/);
  });
});

// ── 5. both routes ───────────────────────────────────────────────────────────
describe("slice 192b-2 — both share routes are non-indexable", () => {
  const robotsOf = (route: { options: { head?: (ctx: never) => unknown } }) => {
    const head = route.options.head?.({} as never) as { meta?: { name?: string; content?: string }[] } | undefined;
    return head?.meta?.find((m) => m.name === "robots")?.content;
  };

  it("proposals/share/$slug sets noindex, nofollow", () => {
    expect(robotsOf(ProposalShareRoute as never)).toBe("noindex, nofollow");
  });

  it("bookings/share/$slug sets noindex, nofollow", () => {
    expect(robotsOf(BookingShareRoute as never)).toBe("noindex, nofollow");
  });
});
