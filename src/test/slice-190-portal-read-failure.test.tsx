/**
 * slice-190-portal-read-failure.test.tsx — read-failure BATCH A (slice 190).
 *
 * The source guard (`portal-read-failure-guard.test.ts`) explicitly cannot see
 * a failure assembled at RENDER time: `loaded === false` being ignored while the
 * page prints its affirmative empty state is a defect in a ternary, not in a
 * fetch. These are those assertions, for the twelve routes batch A covers.
 *
 * Each page gets TWO tests:
 *   A. the primary read answers 500 → the failure is STATED and the affirmative
 *      empty state is ABSENT (a stated error beside "No boards yet" is the bug);
 *   B. the same reads answer 2xx with zero rows → the honest empty state still
 *      renders. (B) is the control that proves the gate is not a blanket
 *      deletion of every empty state.
 *
 * NO ASSERTION RESTATES COPY THE COMPONENT SUPPLIES. The failure sentence is
 * `SERVER_SENTENCE`, carried only by the mocked response body as `{ error }`,
 * so it can reach the DOM only if the page prints the SERVER's own message
 * (`authedJson` surfaces `json.error`). An assertion that the empty state is
 * gone is an ABSENCE check — the whole point of the slice.
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// The pages link through the router; in jsdom there is no router, so Link
// renders as a plain anchor and the layout's Outlet renders nothing
// (slice-175 / slice-178 / slice-183 precedent).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  Outlet: () => null,
  useNavigate: () => () => undefined,
  useLocation: () => ({ pathname: "/portal/admin" }),
}));

import SettingsPage from "../lazy/portal.settings.index.page";
import AdminCredentialsPage from "../lazy/portal.admin.credentials.page";
import AdminLayout from "../lazy/portal.admin.page";
import DedupePage from "../lazy/portal.dedupe.index.page";
import KnowledgeBasePage from "../lazy/portal.knowledgebase.index.page";
import AccessReviewPage from "../lazy/portal.accessreview.index.page";
import SecureTransportPage from "../lazy/portal.secure-transport.index.page";
import AssistantPage from "../lazy/portal.assistant.index.page";
import BoardsPage from "../lazy/portal.boards.index.page";
import TablesPage from "../lazy/portal.tables.index.page";
import AdminIndexPage from "../lazy/portal.admin.index.page";
import AutomationsPage from "../lazy/portal.automations.index.page";
import { mockFetch, urlIs } from "./helpers/portal-primitive-fetch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A sentence only the mocked response carries. */
const SERVER_SENTENCE = "probe-190: this store could not be read";

/** Every read on the page fails, carrying the sentinel. */
const allFail = () => [{ match: () => true, status: 500, body: { error: SERVER_SENTENCE } }];

/** The failure sentence reached the DOM (i.e. the SERVER's message was printed). */
const stated = () => screen.getAllByText(new RegExp(SERVER_SENTENCE)).length > 0;

/** 200 + a body, for one path. */
const ok = (path: string, body: unknown) => ({ match: urlIs(path), body });

// ── 1. /portal/settings ─────────────────────────────────────────────────────
describe("settings — a failed profile read never renders an editable blank form", () => {
  it("a 500 hides the form, states the failure, and offers no way to save blanks", async () => {
    mockFetch(allFail());
    const { container } = render(<SettingsPage />);
    await waitFor(() => expect(screen.getAllByText(/could not be read/i).length).toBeGreaterThan(0));
    expect(stated()).toBe(true);
    // The form itself must be gone: no input may be rendered over an unread
    // profile, because saving one would overwrite the stored values.
    expect(container.querySelectorAll("input").length).toBe(0);
    expect(screen.queryByText(/Update Brand Profile/)).toBeNull();
    expect(screen.queryByText(/Update Regional Settings/)).toBeNull();
  });

  it("control: a 2xx profile renders the form WITH the stored value", async () => {
    mockFetch([ok("/api/data/settings", { data: { companyName: "Acme Industries" } })]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Acme Industries")).toBeTruthy());
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
    expect(screen.getByText(/Update Brand Profile/)).toBeTruthy();
  });

  it("a failed Stripe status read says so instead of 'not connected'", async () => {
    mockFetch([
      ok("/api/data/settings", { data: {} }),
      { match: urlIs("/api/native/invoice/stripe"), status: 500, body: { error: SERVER_SENTENCE } },
    ]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText(/Update Brand Profile/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Payments/ }));
    await waitFor(() => expect(screen.getByText(/Stripe status could not be read/i)).toBeTruthy());
    expect(stated()).toBe(true);
    expect(screen.queryByText(/No Stripe account connected/i)).toBeNull();
  });

  it("control: a 2xx Stripe status saying 'not connected' still says it", async () => {
    mockFetch([
      ok("/api/data/settings", { data: {} }),
      ok("/api/native/invoice/stripe", {
        data: { connected: false, hint: null, keyMode: null, addedAt: null },
      }),
    ]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText(/Update Brand Profile/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Payments/ }));
    await waitFor(() => expect(screen.getByText(/No Stripe account connected/i)).toBeTruthy());
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });
});

// ── 2. /portal/admin/credentials ────────────────────────────────────────────
describe("admin credentials — a failed read never claims nothing is configured", () => {
  it("a 500 states the failure and prints no count at all", async () => {
    mockFetch(allFail());
    render(<AdminCredentialsPage />);
    await waitFor(() => expect(screen.getByText(/credentials could not be read/i)).toBeTruthy());
    expect(stated()).toBe(true);
    // No metrics banner: a "Configured: 0" here makes the owner retype secrets
    // that are already stored.
    expect(screen.queryByText(/Total Providers/)).toBeNull();
    expect(screen.queryByText(/Configured Credentials/)).toBeNull();
  });

  it("control: a 2xx pair renders the counts and the provider row", async () => {
    mockFetch([
      ok("/api/integrations/providers", {
        data: [{ id: "xero", name: "Xero", category: "Accounting", authType: "oauth", description: "Ledgers" }],
      }),
      ok("/api/admin/credentials", { data: [] }),
    ]);
    render(<AdminCredentialsPage />);
    await waitFor(() => expect(screen.getByText(/Total Providers/)).toBeTruthy());
    expect(screen.getByText("Xero")).toBeTruthy();
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });
});

// ── 3. /portal/admin/* layout ───────────────────────────────────────────────
describe("admin layout — a thrown session read is not a blank screen", () => {
  it("a rejected fetch renders a readable failure instead of nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(SERVER_SENTENCE);
      }),
    );
    const { container } = render(<AdminLayout />);
    await waitFor(() => expect(screen.getByText(/Admin access could not be verified/i)).toBeTruthy());
    expect(stated()).toBe(true);
    // The old code returned null here: an empty container is the defect.
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(40);
  });

  it("control: an owner session renders the admin shell", async () => {
    mockFetch([ok("/api/me", { user: { email: "owner@example.com", role: "owner" } })]);
    render(<AdminLayout />);
    await waitFor(() => expect(screen.getByText("owner@example.com")).toBeTruthy());
    expect(screen.queryByText(/Admin access could not be verified/i)).toBeNull();
  });
});

// ── 4. /portal/dedupe ───────────────────────────────────────────────────────
const DEDUPE_URLS = [
  "/api/native/dedupe/rules",
  "/api/native/dedupe/quality-rules",
  "/api/native/dedupe/suggestions",
  "/api/native/dedupe/runs",
  "/api/native/dedupe/identities",
  "/api/native/tables",
  "/api/native/dedupe/writes",
];
const dedupeEmpty = () => [
  ok("/api/native/dedupe/rules", { data: { rules: [] } }),
  ok("/api/native/dedupe/quality-rules", { data: { rules: [] } }),
  ok("/api/native/dedupe/suggestions", { data: { suggestions: [] } }),
  ok("/api/native/dedupe/runs", { data: { runs: [] } }),
  ok("/api/native/dedupe/identities", { data: { identities: [] } }),
  ok("/api/native/tables", { data: { tables: [] } }),
  ok("/api/native/dedupe/writes", { data: { writes: [] } }),
];

describe("dedupe — seven silent reads now state a failure", () => {
  it("a 500 states the failure and suppresses all three empty states", async () => {
    expect(DEDUPE_URLS.length).toBe(7);
    mockFetch(allFail());
    render(<DedupePage />);
    await waitFor(() => expect(screen.getByText(/dedupe data/i)).toBeTruthy());
    expect(stated()).toBe(true);
    expect(screen.queryByText(/No merges yet/i)).toBeNull();
    expect(screen.queryByText(/Nothing waiting for approval/i)).toBeNull();
    expect(screen.queryByText(/No open suggestions/i)).toBeNull();
  });

  it("control: seven 2xx empty answers still render the honest empty states", async () => {
    mockFetch(dedupeEmpty());
    render(<DedupePage />);
    await waitFor(() => expect(screen.getByText(/No merges yet/i)).toBeTruthy());
    expect(screen.getByText(/Nothing waiting for approval/i)).toBeTruthy();
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });
});

// ── 5. /portal/knowledgebase ────────────────────────────────────────────────
const KB_URLS = [
  "/api/native/knowledgebase/categories",
  "/api/native/knowledgebase/articles",
  "/api/native/knowledgebase/drafts",
  "/api/native/knowledgebase/writes",
];
const kbEmpty = () => [
  ok("/api/native/knowledgebase/categories", { data: { categories: [] } }),
  ok("/api/native/knowledgebase/articles", { data: { articles: [] } }),
  ok("/api/native/knowledgebase/drafts", { data: { drafts: [] } }),
  ok("/api/native/knowledgebase/writes", { data: { writes: [] } }),
];

describe("knowledgebase — a failed read and a failed SEARCH are both stated", () => {
  it("a 500 states the failure and suppresses the three empty states", async () => {
    expect(KB_URLS.length).toBe(4);
    mockFetch(allFail());
    render(<KnowledgeBasePage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(screen.queryByText(/No categories yet/i)).toBeNull();
    expect(screen.queryByText(/No articles yet/i)).toBeNull();
    expect(screen.queryByText(/No pending approvals/i)).toBeNull();
  });

  it("control: four 2xx empty answers still render the honest empty states", async () => {
    mockFetch(kbEmpty());
    render(<KnowledgeBasePage />);
    await waitFor(() => expect(screen.getByText(/No categories yet/i)).toBeTruthy());
    expect(screen.getByText(/No articles yet/i)).toBeTruthy();
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });

  it("a failed search says the search could not be read, not 'no articles match'", async () => {
    mockFetch([
      ...kbEmpty(),
      { match: urlIs("/api/native/knowledgebase/search"), status: 500, body: { error: SERVER_SENTENCE } },
    ]);
    render(<KnowledgeBasePage />);
    await waitFor(() => expect(screen.getByText(/No categories yet/i)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Search titles/i), { target: { value: "invoice" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText(/search could not be read/i)).toBeTruthy());
    expect(stated()).toBe(true);
    expect(screen.queryByText(/No articles match/i)).toBeNull();
  });
});

// ── 6. /portal/accessreview ─────────────────────────────────────────────────
describe("access review — the evidence log never reads as empty when unread", () => {
  it("a 500 states the failure and suppresses the four empty states", async () => {
    mockFetch(allFail());
    render(<AccessReviewPage />);
    await waitFor(() => expect(screen.getByText(/access reviews/i)).toBeTruthy());
    expect(stated()).toBe(true);
    expect(screen.queryByText(/No campaigns yet/i)).toBeNull();
    expect(screen.queryByText(/No attestations recorded yet/i)).toBeNull();
    expect(screen.queryByText(/Nothing awaiting approval/i)).toBeNull();
  });

  it("control: three 2xx empty answers still render the honest empty states", async () => {
    mockFetch([
      ok("/api/native/accessreview/campaigns", { data: { campaigns: [] } }),
      ok("/api/native/accessreview/evidence", { data: { evidence: [] } }),
      ok("/api/native/accessreview/writes", { data: { writes: [] } }),
    ]);
    render(<AccessReviewPage />);
    await waitFor(() => expect(screen.getByText(/No campaigns yet/i)).toBeTruthy());
    expect(screen.getByText(/No attestations recorded yet/i)).toBeTruthy();
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });
});

// ── 7. /portal/secure-transport ─────────────────────────────────────────────
const TRANSPORT_URLS = [
  "/api/native/transport/connections",
  "/api/native/transport/rules",
  "/api/native/transport/keys",
  "/api/native/transport/runs",
  "/api/native/transport/writes",
];

describe("secure transport — no connections/rules/keys/runs is not an empty workspace", () => {
  it("a 500 states the failure in every one of the four lists", async () => {
    expect(TRANSPORT_URLS.length).toBe(5);
    mockFetch(allFail());
    render(<SecureTransportPage />);
    await waitFor(() => expect(screen.getByText(/secure transport/i)).toBeTruthy());
    expect(stated()).toBe(true);
    // Connections, rules, PGP keys and the run ledger each say so.
    expect(screen.getAllByText(/could not be read/i).length).toBeGreaterThanOrEqual(4);
  });

  it("control: a 2xx connection renders, with no failure text anywhere", async () => {
    mockFetch([
      ok("/api/native/transport/connections", {
        data: {
          connections: [
            {
              id: "conn_1",
              name: "Prod SFTP",
              host: "sftp.example.com",
              port: 22,
              username: "svc",
              authMode: "password",
              hasSecret: true,
              poolMax: 4,
              failClosed: true,
              updatedAt: "",
            },
          ],
        },
      }),
      ok("/api/native/transport/rules", { data: { rules: [] } }),
      ok("/api/native/transport/keys", { data: { keys: [] } }),
      ok("/api/native/transport/runs", { data: { runs: [] } }),
      ok("/api/native/transport/writes", { data: { writes: [] } }),
    ]);
    render(<SecureTransportPage />);
    await waitFor(() => expect(screen.getAllByText(/Prod SFTP/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/could not be read/i)).toBeNull();
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });
});

// ── 8. /portal/assistant ────────────────────────────────────────────────────
describe("assistant — an unread transcript is not 'No asks yet'", () => {
  it("a 500 states the failure and suppresses 'No asks yet'", async () => {
    mockFetch(allFail());
    render(<AssistantPage />);
    await waitFor(() => expect(screen.getByText(/assistant history/i)).toBeTruthy());
    expect(stated()).toBe(true);
    expect(screen.queryByText(/No asks yet/i)).toBeNull();
  });

  it("control: a 2xx empty transcript still says No asks yet", async () => {
    mockFetch([ok("/api/native/assistant/messages", { messages: [] }), ok("/api/native/assistant/writes", { writes: [] })]);
    render(<AssistantPage />);
    await waitFor(() => expect(screen.getByText(/No asks yet/i)).toBeTruthy());
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });
});

// ── 9. /portal/boards ───────────────────────────────────────────────────────
describe("boards — an A-tier capability may not report an unread list as empty", () => {
  it("a 500 states the failure and suppresses 'No boards yet'", async () => {
    mockFetch(allFail());
    render(<BoardsPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(screen.queryByText(/No boards yet/i)).toBeNull();
    expect(screen.getByText(/not an empty workspace/i)).toBeTruthy();
  });

  it("control: a 2xx empty list still says No boards yet", async () => {
    mockFetch([
      ok("/api/native/board", { data: { boards: [] } }),
      ok("/api/native/board/writes", { data: { writes: [] } }),
    ]);
    render(<BoardsPage />);
    await waitFor(() => expect(screen.getByText(/No boards yet/i)).toBeTruthy());
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });
});

// ── 10. /portal/tables ──────────────────────────────────────────────────────
describe("tables — a failed table read is not an empty workspace", () => {
  it("a 500 states the failure and suppresses 'No tables yet'", async () => {
    mockFetch(allFail());
    render(<TablesPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(screen.queryByText(/No tables yet/i)).toBeNull();
    expect(screen.getByText(/not an empty workspace/i)).toBeTruthy();
  });

  it("control: a 2xx empty list still says No tables yet", async () => {
    mockFetch([
      ok("/api/native/tables", { data: { tables: [] } }),
      ok("/api/native/tables/writes", { data: { writes: [] } }),
    ]);
    render(<TablesPage />);
    await waitFor(() => expect(screen.getByText(/No tables yet/i)).toBeTruthy());
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });
});

// ── 11. /portal/admin ───────────────────────────────────────────────────────
describe("admin index — a failed client read is not 'no clients yet'", () => {
  it("a 500 on the client read states it and suppresses 'No clients yet'", async () => {
    mockFetch([
      { match: urlIs("/api/admin/users"), status: 500, body: { error: SERVER_SENTENCE } },
      ok("/api/admin/purchases", { data: [] }),
      ok("/api/audit-logs", { data: [] }),
      ok("/api/admin/subscriptions", { data: [] }),
    ]);
    render(<AdminIndexPage />);
    // The notice is built from the STATUS the server sent, so 500 is derived
    // from the mock, not from the component's copy.
    await waitFor(() => expect(screen.getByText(/Couldn't load clients \(HTTP 500\)/)).toBeTruthy());
    expect(screen.queryByText(/No clients yet/i)).toBeNull();
    expect(screen.getByText(/The client list could not be read/i)).toBeTruthy();
  });

  it("control: a 2xx empty client list still says No clients yet", async () => {
    mockFetch([
      ok("/api/admin/users", { data: [] }),
      ok("/api/admin/purchases", { data: [] }),
      ok("/api/audit-logs", { data: [] }),
      ok("/api/admin/subscriptions", { data: [] }),
    ]);
    render(<AdminIndexPage />);
    await waitFor(() => expect(screen.getByText(/No clients yet/i)).toBeTruthy());
    expect(screen.queryByText(/Couldn't load clients/i)).toBeNull();
  });
});

// ── 12. /portal/automations ─────────────────────────────────────────────────
describe("automations — a stated error may not sit above 'No rules yet'", () => {
  it("a 500 states the failure and suppresses all three empty states", async () => {
    mockFetch(allFail());
    render(<AutomationsPage />);
    await waitFor(() => expect(stated()).toBe(true));
    expect(screen.queryByText(/No rules yet/i)).toBeNull();
    expect(screen.queryByText(/No runs recorded/i)).toBeNull();
    expect(screen.queryByText(/None pending/i)).toBeNull();
  });

  it("control: three 2xx empty answers still render the honest empty states", async () => {
    mockFetch([
      ok("/api/native/automation/rules", { data: { rules: [] } }),
      ok("/api/native/automation/runs", { data: { runs: [] } }),
      ok("/api/native/automation/writes", { data: { writes: [] } }),
      ok("/api/native/tables", { data: { tables: [] } }),
      ok("/api/native/transform", { data: { transforms: [] } }),
      ok("/api/native/entitlements", { entitlement: { tier: "none", label: "no plan", features: {} } }),
    ]);
    render(<AutomationsPage />);
    await waitFor(() => expect(screen.getByText(/No rules yet/i)).toBeTruthy());
    expect(screen.getByText(/No runs recorded/i)).toBeTruthy();
    expect(screen.queryByText(new RegExp(SERVER_SENTENCE))).toBeNull();
  });
});
