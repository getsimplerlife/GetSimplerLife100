/**
 * slice-batch-b-portal-read-failure.test.tsx — read-failure BATCH B.
 *
 * The source guard (`portal-read-failure-guard.test.ts`) explicitly cannot see a
 * failure assembled at RENDER time, and it never could: rule 4 there only asks
 * whether a page knows a read can fail. These are the assertions that actually
 * decide the question, for the last eight routes in `BATCH_B_REMAINDER`:
 *
 *   admin/audit · checklists · deal-rooms · document-ai · invoices · proposals
 *   · surveys · transforms
 *
 * Each page gets TWO tests, the same shape slice 190 established for batch A:
 *   A. every read answers 500 → the failure is STATED and the affirmative empty
 *      state is ABSENT. A stated error sitting above "No invoices yet" IS the
 *      bug: to a customer the two states are indistinguishable.
 *   B. the same reads answer 2xx with zero rows → the honest empty state still
 *      renders. (B) is the control that proves this is not a blanket deletion
 *      of every empty state — a genuinely empty tenant must still be told so.
 *
 * NO ASSERTION RESTATES COPY THE COMPONENT SUPPLIES. The failure sentence is
 * `SERVER_SENTENCE`, carried only by the mocked response body as `{ error }`, so
 * it can reach the DOM only if the page prints the SERVER's own message rather
 * than inventing one. The empty-state sentences are the pages' own copy and are
 * asserted for ABSENCE in (A) and PRESENCE in (B) — the two halves of the slice.
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// The pages link through the router; in jsdom there is no router, so Link
// renders as a plain anchor (slice-175 / slice-178 / slice-183 / slice-190).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  Outlet: () => null,
  useNavigate: () => () => undefined,
  useLocation: () => ({ pathname: "/portal" }),
}));

import AuditPage from "../lazy/portal.admin.audit.page";
import ChecklistsPage from "../lazy/portal.checklists.index.page";
import DealRoomsPage from "../lazy/portal.deal-rooms.index.page";
import DocumentAiPage from "../lazy/portal.document-ai.index.page";
import InvoicesPage from "../lazy/portal.invoices.index.page";
import ProposalsPage from "../lazy/portal.proposals.index.page";
import SurveysPage from "../lazy/portal.surveys.index.page";
import TransformsPage from "../lazy/portal.transforms.index.page";
import { mockFetch, urlIs } from "./helpers/portal-primitive-fetch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A sentence only the mocked response carries. */
const SERVER_SENTENCE = "probe-batch-b: this store could not be read";

/** Every read on the page fails, carrying the sentinel. */
const allFail = () => [{ match: () => true, status: 500, body: { error: SERVER_SENTENCE } }];

/** The failure sentence reached the DOM (i.e. the SERVER's message was printed). */
const stated = () => screen.queryAllByText(new RegExp(SERVER_SENTENCE)).length > 0;

/**
 * The page states that its list could not be read. The rendered block carries
 * that phrase; a retry control sits inside it where the page can retry.
 */
const failureStated = () => screen.queryAllByText(/could not be read, so this is not an empty/i).length > 0;

/** 200 + a body, for one path. */
const ok = (path: string, body: unknown) => ({ match: urlIs(path), body });

// ── 1. /portal/admin/audit ──────────────────────────────────────────────────
describe("admin audit — a failed log read is not 'No audit logs found'", () => {
  it("a 500 states the failure and suppresses 'No audit logs found'", async () => {
    mockFetch(allFail());
    render(<AuditPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(failureStated()).toBe(true);
    expect(screen.queryByText(/No audit logs found/)).toBeNull();
  });

  it("control: a 2xx empty log still says No audit logs found", async () => {
    mockFetch([ok("/api/audit-logs", { data: [] })]);
    render(<AuditPage />);
    await waitFor(() => expect(screen.getByText(/No audit logs found/)).toBeTruthy());
    expect(stated()).toBe(false);
    expect(failureStated()).toBe(false);
  });
});

// ── 2. /portal/checklists ───────────────────────────────────────────────────
describe("checklists — a failed read is not 'No checklists yet'", () => {
  it("a 500 states the failure and suppresses 'No checklists yet'", async () => {
    mockFetch(allFail());
    render(<ChecklistsPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(failureStated()).toBe(true);
    expect(screen.queryByText(/No checklists yet/)).toBeNull();
  });

  it("control: a 2xx empty list still says No checklists yet", async () => {
    mockFetch([
      ok("/api/native/checklists", { data: [] }),
      ok("/api/native/checklists/writes", { data: [] }),
    ]);
    render(<ChecklistsPage />);
    await waitFor(() => expect(screen.getByText(/No checklists yet/)).toBeTruthy());
    expect(stated()).toBe(false);
    expect(failureStated()).toBe(false);
  });
});

// ── 3. /portal/deal-rooms ───────────────────────────────────────────────────
describe("deal rooms — a failed read is not 'No deal rooms yet'", () => {
  it("a 500 states the failure and suppresses 'No deal rooms yet'", async () => {
    mockFetch(allFail());
    render(<DealRoomsPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(failureStated()).toBe(true);
    expect(screen.queryByText(/No deal rooms yet/)).toBeNull();
  });

  it("control: a 2xx empty list still says No deal rooms yet", async () => {
    mockFetch([
      ok("/api/native/dealroom", { data: [] }),
      ok("/api/native/dealroom/writes", { data: [] }),
      ok("/api/native/proposals", { data: [] }),
      ok("/api/native/checklists", { data: [] }),
      ok("/api/native/invoice", { data: [] }),
    ]);
    render(<DealRoomsPage />);
    await waitFor(() => expect(screen.getByText(/No deal rooms yet/)).toBeTruthy());
    expect(stated()).toBe(false);
    expect(failureStated()).toBe(false);
  });
});

// ── 4. /portal/document-ai ──────────────────────────────────────────────────
describe("document AI — a failed read is not 'No extraction runs yet.'", () => {
  it("a 500 states the failure and suppresses both empty states", async () => {
    mockFetch(allFail());
    render(<DocumentAiPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(failureStated()).toBe(true);
    expect(screen.queryByText(/No extraction runs yet/)).toBeNull();
    expect(screen.queryByText(/Upload a document to the vault first/)).toBeNull();
  });

  it("control: a 2xx empty read still says No extraction runs yet.", async () => {
    mockFetch([
      ok("/api/native/extract", { data: { documents: [], extractions: [], tables: [] } }),
      ok("/api/native/extract/writes", { data: { writes: [] } }),
    ]);
    render(<DocumentAiPage />);
    await waitFor(() => expect(screen.getByText(/No extraction runs yet/)).toBeTruthy());
    expect(stated()).toBe(false);
    expect(failureStated()).toBe(false);
  });
});

// ── 5. /portal/invoices ─────────────────────────────────────────────────────
describe("invoices — a failed read is not 'No invoices yet'", () => {
  it("a 500 states the failure and suppresses 'No invoices yet'", async () => {
    mockFetch(allFail());
    render(<InvoicesPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(failureStated()).toBe(true);
    expect(screen.queryByText(/No invoices yet/)).toBeNull();
  });

  it("control: a 2xx empty read still says No invoices yet", async () => {
    mockFetch([
      ok("/api/native/invoice", { data: [] }),
      ok("/api/native/invoice/writes", { data: [] }),
      ok("/api/native/invoice/stripe", { data: { connected: false } }),
      ok("/api/native/dealroom", { data: [] }),
    ]);
    render(<InvoicesPage />);
    await waitFor(() => expect(screen.getByText(/No invoices yet/)).toBeTruthy());
    expect(stated()).toBe(false);
    expect(failureStated()).toBe(false);
  });
});

// ── 6. /portal/proposals ────────────────────────────────────────────────────
describe("proposals — a failed read is not 'No proposals yet'", () => {
  it("a 500 states the failure and suppresses 'No proposals yet'", async () => {
    mockFetch(allFail());
    render(<ProposalsPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(failureStated()).toBe(true);
    expect(screen.queryByText(/No proposals yet/)).toBeNull();
  });

  it("control: a 2xx empty list still says No proposals yet", async () => {
    mockFetch([
      ok("/api/native/proposals", { data: [] }),
      ok("/api/native/proposals/writes", { data: [] }),
    ]);
    render(<ProposalsPage />);
    await waitFor(() => expect(screen.getByText(/No proposals yet/)).toBeTruthy());
    expect(stated()).toBe(false);
    expect(failureStated()).toBe(false);
  });
});

// ── 7. /portal/surveys ──────────────────────────────────────────────────────
describe("surveys — a failed read is not 'No surveys yet'", () => {
  it("a 500 states the failure and suppresses 'No surveys yet'", async () => {
    mockFetch(allFail());
    render(<SurveysPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(failureStated()).toBe(true);
    expect(screen.queryByText(/No surveys yet/)).toBeNull();
  });

  it("control: a 2xx empty list still says No surveys yet", async () => {
    mockFetch([
      ok("/api/native/survey", { data: { surveys: [] } }),
      ok("/api/native/survey/writes", { data: { writes: [] } }),
    ]);
    render(<SurveysPage />);
    await waitFor(() => expect(screen.getByText(/No surveys yet/)).toBeTruthy());
    expect(stated()).toBe(false);
    expect(failureStated()).toBe(false);
  });
});

// ── 8. /portal/transforms ───────────────────────────────────────────────────
describe("transforms — a failed read is not 'No transforms yet'", () => {
  it("a 500 states the failure and suppresses 'No transforms yet'", async () => {
    mockFetch(allFail());
    render(<TransformsPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(failureStated()).toBe(true);
    expect(screen.queryByText(/No transforms yet/)).toBeNull();
  });

  it("control: a 2xx empty list still says No transforms yet", async () => {
    mockFetch([
      ok("/api/native/transform", { data: { transforms: [] } }),
      ok("/api/native/transform/writes", { data: { writes: [] } }),
    ]);
    render(<TransformsPage />);
    await waitFor(() => expect(screen.getByText(/No transforms yet/)).toBeTruthy());
    expect(stated()).toBe(false);
    expect(failureStated()).toBe(false);
  });
});
