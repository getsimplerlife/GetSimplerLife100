/**
 * src/test/slice174-field-errors.test.tsx — SLICE 174, UI half.
 *
 * TWO THINGS ARE PINNED HERE, and they are different in kind.
 *
 * 1. `fieldErrorFrom()` must read BOTH sentence shapes the native validators
 *    emit — the bare form (`name must be ≤ 120 chars`) and the quoted form the
 *    date fix introduced (`Field "due" is not a real calendar date: …`). The
 *    quoted form silently returned null while the code used one alternation
 *    regex ending in `\b` (a boundary that does not exist between `"` and a
 *    space), so the date message stayed in the page banner. That is product
 *    code and it is exercised in production, not only here.
 *
 * 2. A rejected submit must KEEP every value the user typed and put the server's
 *    sentence on the FIELD it names — `aria-invalid` + `aria-describedby` + a
 *    role="alert" line under the input. Before slice 174 the four composers ran
 *    `setTitle(""); setClientName(""); …` on the error path too, so a user who
 *    pasted a 10,000-character value lost the whole form and got one sentence in
 *    a banner at the top of the page.
 *
 * Every server sentence asserted below is DERIVED from the real validator that
 * emits it (never typed by hand), so this file fails when a validator and a page
 * disagree. The page renders the sentence; the validator supplies it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { validateTableSchema } from "../native/tables/validate";
import { validateProposalMutation } from "../native/proposals/validate";
import { validateChecklistMutation } from "../native/checklists/validate";
import { validateDealRoomMutation } from "../native/dealroom/validate";
import { validateCustomerEmail } from "../native/invoice/validate";
import { fieldErrorFrom } from "../lib/form-field-error";
import ProposalsPage from "../lazy/portal.proposals.index.page";
import ChecklistsPage from "../lazy/portal.checklists.index.page";
import DealRoomsPage from "../lazy/portal.deal-rooms.index.page";
import InvoicesPage from "../lazy/portal.invoices.index.page";

/**
 * The invoices page renders a TanStack `<Link>` (to the Stripe settings page) in
 * its "connect Stripe" notice. A Link outside a RouterProvider throws
 * (`Cannot read properties of null (reading 'isServer')`) and React unmounts the
 * WHOLE page, leaving `<body><div /></body>` — every query then finds nothing and
 * the composer looks broken when it is not. The composer needs no router, so the
 * link renders as a plain anchor here.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: unknown }) => <a href={typeof to === "string" ? to : "#"}>{children as never}</a>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Route {
  match: (url: string, method: string) => boolean;
  status?: number;
  body: unknown;
}

/** Minimal fetch stand-in that is method-aware (GET list vs POST create share a URL).
 *
 *  AMBIGUITY IS AN ERROR, NOT A SILENT WIN FOR THE FIRST ROUTE. `routes.find()`
 *  used to hand a POST to whichever GET list route was written first, so the
 *  composer under test never received its 400, never entered the error path, and
 *  the field error was legitimately absent — the test failed and the page looked
 *  broken. Two matching routes now throw with the method and URL named. */
function stubFetch(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const matches = routes.filter((r) => r.match(url, method));
    if (matches.length > 1) {
      throw new Error(`ambiguous fetch stub for ${method} ${url}: ${matches.length} routes match — make the matchers method-specific`);
    }
    const route = matches[0];
    const status = route ? (route.status ?? 200) : 404;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => (route ? route.body : { error: "not mocked" }),
      text: async () => "",
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Ask the real validator for the sentence, and refuse to run on a false premise. */
function mustReject(result: { ok: boolean; error?: string }, what: string): string {
  if (result.ok) throw new Error(`${what}: the validator accepted the bad input — this test's premise is wrong`);
  if (!result.error) throw new Error(`${what}: the validator rejected without naming a reason`);
  return result.error;
}

/** The exact sentence the real table validator produces for an over-length name. */
const LONG_NAME_ERROR = mustReject(
  validateTableSchema({ name: "x".repeat(10_000), fields: [{ key: "a", label: "A", type: "text" }] }),
  "table name",
);
const PROPOSAL_CLIENT_NAME_ERROR = mustReject(
  validateProposalMutation({ clientName: "x".repeat(10_000) }),
  "proposal clientName",
);
const CHECKLIST_NAME_ERROR = mustReject(
  validateChecklistMutation({ name: "x".repeat(10_000) }, { requireItems: true }),
  "checklist name",
);
const DEAL_ROOM_EMAIL_ERROR = mustReject(validateDealRoomMutation({ customerEmail: "not-an-email" }), "deal room customerEmail");
const INVOICE_EMAIL_ERROR = mustReject(validateCustomerEmail("not-an-email"), "invoice customerEmail");

describe("fieldErrorFrom maps a server sentence onto the field it names", () => {
  it("reads `name must be ≤ 120 chars` as the name field", () => {
    expect(fieldErrorFrom(LONG_NAME_ERROR, ["name", "description"])).toEqual({
      field: "name",
      message: LONG_NAME_ERROR,
    });
  });

  it('reads `Field "due" is not a real calendar date…` as the due field', () => {
    const msg = 'Field "due" is not a real calendar date: 2026-02-31 does not exist';
    expect(fieldErrorFrom(msg, ["due"])?.field).toBe("due");
    // the whole sentence is kept — the user is told which date does not exist
    expect(fieldErrorFrom(msg, ["due"])?.message).toBe(msg);
    // a field this composer does not render is never blamed on one of its own
    expect(fieldErrorFrom(msg, ["name", "description"])).toBeNull();
  });

  it("never blames a field the server did not name", () => {
    expect(fieldErrorFrom("Internal error", ["name"])).toBeNull();
    expect(fieldErrorFrom("something odd happened", ["name"])).toBeNull();
    expect(fieldErrorFrom("", ["name"])).toBeNull();
    // a field outside this composer's own inputs is not pinned on one of them
    expect(fieldErrorFrom("customerEmail must be a valid email", ["name"])).toBeNull();
  });

  it("can rename a wire field to the input the page renders", () => {
    expect(fieldErrorFrom("linkedDealRoomId is required", ["linkedDealRoomId"], { linkedDealRoomId: "dealRoomId" })?.field).toBe("dealRoomId");
  });
});

describe("slice 174 — a rejected submit keeps the user's work and blames the field", () => {
  it("proposals: keeps the typed values and puts the 400 on the client name field", async () => {
    stubFetch([
      { match: (u, m) => u.endsWith("/api/native/proposals/writes") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/proposals") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/proposals") && m === "POST", status: 400, body: { error: PROPOSAL_CLIENT_NAME_ERROR } },
    ]);
    render(<ProposalsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: /Proposals/ })).toBeInTheDocument());
    const title = screen.getByLabelText("Title") as HTMLInputElement;
    const client = screen.getByLabelText("Client name") as HTMLInputElement;
    const company = screen.getByLabelText("Client company") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "Q1 rollout" } });
    fireEvent.change(client, { target: { value: "x".repeat(10_000) } });
    fireEvent.change(company, { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: /Create draft/ }));
    const fieldError = await waitFor(() => {
      // the page renders one error line per input it owns; the over-length field
      // is `clientName` (there is no `name` input on this composer).
      const el = document.getElementById("proposal-clientName-error");
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(fieldError.textContent).toBe(PROPOSAL_CLIENT_NAME_ERROR);
    // the work survives
    expect(title).toHaveValue("Q1 rollout");
    expect(client.value).toHaveLength(10_000);
    expect(company).toHaveValue("Acme");
    // and the field itself is marked invalid + described by that message
    expect(client).toHaveAttribute("aria-invalid", "true");
    expect(client.getAttribute("aria-describedby")).toBe("proposal-clientName-error");
    expect(title).not.toHaveAttribute("aria-invalid");
    // no error line under a field the server did not name
    expect(document.getElementById("proposal-title-error")).toBeNull();
  });

  /** DOM-level helpers: these pages are big, so query what the user sees by
   *  aria-label / button text instead of testing-library's role queries. */
  const byLabel = (label: string) =>
    document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  const clickButton = (text: RegExp) => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => text.test(b.textContent ?? ""));
    if (!btn) throw new Error(`no button matching ${text}`);
    fireEvent.click(btn);
  };
  const errorText = (id: string) => document.getElementById(id)?.textContent ?? null;

  it("checklists: keeps the typed values and puts the 400 on the name field", async () => {
    stubFetch([
      { match: (u, m) => u.endsWith("/api/native/checklists/writes") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/checklists") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/checklists") && m === "POST", status: 400, body: { error: CHECKLIST_NAME_ERROR } },
    ]);
    render(<ChecklistsPage />);
    await waitFor(() => expect(byLabel("Name")).toBeTruthy());
    const name = byLabel("Name") as HTMLInputElement;
    const items = byLabel("Items") as HTMLTextAreaElement;
    fireEvent.change(name, { target: { value: "x".repeat(10_000) } });
    fireEvent.change(items, { target: { value: "Scope confirmed" } });
    clickButton(/Create checklist/);
    await waitFor(() => expect(errorText("checklist-name-error")).toBe(CHECKLIST_NAME_ERROR));
    expect(name.value).toHaveLength(10_000);
    expect(items.value).toBe("Scope confirmed");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toBe("checklist-name-error");
    // a field the server did not name carries no error line
    expect(errorText("checklist-items-error")).toBeNull();
  });

  it("deal rooms: keeps the typed values and puts the 400 on the customer email field", async () => {
    stubFetch([
      { match: (u, m) => u.endsWith("/api/native/dealroom/writes") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/proposals") && m === "GET", body: { data: [{ id: "prop_1", title: "Retainer", status: "approved" }] } },
      { match: (u, m) => u.endsWith("/api/native/checklists") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/invoice") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/dealroom") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/dealroom") && m === "POST", status: 400, body: { error: DEAL_ROOM_EMAIL_ERROR } },
    ]);
    render(<DealRoomsPage />);
    await waitFor(() => expect(byLabel("Deal room name")).toBeTruthy());
    const name = byLabel("Deal room name") as HTMLInputElement;
    const customer = byLabel("Customer name") as HTMLInputElement;
    const email = byLabel("Customer email") as HTMLInputElement;
    const select = byLabel("Link a proposal (required)") as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
    fireEvent.change(name, { target: { value: "Acme rollout" } });
    fireEvent.change(customer, { target: { value: "Acme" } });
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.change(select, { target: { value: "prop_1" } });
    clickButton(/Create deal room/);
    await waitFor(() => expect(errorText("dealroom-customerEmail-error")).toBe(DEAL_ROOM_EMAIL_ERROR));
    expect(name.value).toBe("Acme rollout");
    expect(customer.value).toBe("Acme");
    expect(email.value).toBe("not-an-email");
    expect(select.value).toBe("prop_1");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe("dealroom-customerEmail-error");
    expect(name.getAttribute("aria-invalid")).toBeNull();
  });

  it("invoices: keeps the chosen deal room and puts the 400 on the customer email field", async () => {
    stubFetch([
      { match: (u, m) => u.endsWith("/api/native/invoice/writes") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/invoice/stripe") && m === "GET", body: { data: { connected: false } } },
      { match: (u, m) => u.endsWith("/api/native/dealroom") && m === "GET", body: { data: [{ id: "dea_1", name: "Acme rollout", status: "active" }] } },
      { match: (u, m) => u.endsWith("/api/native/invoice") && m === "GET", body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/invoice") && m === "POST", status: 400, body: { error: INVOICE_EMAIL_ERROR } },
    ]);
    render(<InvoicesPage />);
    await waitFor(() => expect(byLabel("Deal room to invoice")).toBeTruthy());
    const select = byLabel("Deal room to invoice") as HTMLSelectElement;
    const email = byLabel("Customer email (optional)") as HTMLInputElement;
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
    fireEvent.change(select, { target: { value: "dea_1" } });
    fireEvent.change(email, { target: { value: "not-an-email" } });
    clickButton(/Create invoice/);
    await waitFor(() => expect(errorText("invoice-customerEmail-error")).toBe(INVOICE_EMAIL_ERROR));
    expect(select.value).toBe("dea_1");
    expect(email.value).toBe("not-an-email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe("invoice-customerEmail-error");
    // the select was not named by the server, so it is not blamed
    expect(select.getAttribute("aria-invalid")).toBeNull();
  });
});
