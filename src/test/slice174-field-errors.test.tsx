/**
 * slice174-field-errors.test.tsx — the error path stops destroying the user's work.
 *
 * THE DEFECT THIS PINS. Each of the four composers ran its form reset
 * UNCONDITIONALLY after the POST:
 *
 *     if (res.ok) … else setError(j.error || "…");
 *     setTitle(""); setClientName(""); …        // ← also on the error path
 *
 * A rejected submit therefore wiped every input and put the server's sentence in
 * a page-level banner, away from the field it was about. On the pre-fix code the
 * first test below fails on `expect(input).toHaveValue("…")` (the input is empty)
 * and on `getByRole("alert")` inside the field's container (only the page banner
 * exists).
 *
 * The fix keeps every value the user typed and puts the message on the FIELD the
 * server named — `aria-invalid` + `aria-describedby` + a role="alert" line under
 * the input, using the same `{field, message}` shape slice 173 established in the
 * automations composer.
 *
 * The server sentence used here is not invented: it is the exact string the
 * validators return (`name must be ≤ 120 chars`), taken from the system of record
 * by asking the real table validator for it first.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { validateTableSchema } from "../native/tables/validate";
import { fieldErrorFrom } from "../lib/form-field-error";
import ProposalsPage from "../lazy/portal.proposals.index.page";
import ChecklistsPage from "../lazy/portal.checklists.index.page";
import DealRoomsPage from "../lazy/portal.deal-rooms.index.page";
import InvoicesPage from "../lazy/portal.invoices.index.page";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Route {
  match: (url: string, method: string) => boolean;
  status?: number;
  body: unknown;
}

/** Minimal fetch stand-in that is method-aware (GET list vs POST create share a URL). */
function stubFetch(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes.find((r) => r.match(url, method));
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

/** The exact sentence the real validator produces for an over-length name. */
const LONG_NAME_ERROR = (() => {
  const v = validateTableSchema({ name: "x".repeat(10_000), fields: [{ key: "a", label: "A", type: "text" }] });
  if (v.ok) throw new Error("the validator accepted a 10,000-char name — this test's premise is wrong");
  return v.error;
})();

describe("fieldErrorFrom maps a server sentence onto the field it names", () => {
  it("reads `name must be ≤ 120 chars` as the name field", () => {
    expect(fieldErrorFrom(LONG_NAME_ERROR, ["name", "description"])).toEqual({
      field: "name",
      message: LONG_NAME_ERROR,
    });
  });
  it("reads `Field \"due\" is not a real calendar date…` as the due field", () => {
    const msg = 'Field "due" is not a real calendar date: 2026-02-31 does not exist';
    expect(fieldErrorFrom(msg, ["due"])?.field).toBe("due");
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
  it("proposals: keeps the typed values and puts the 400 on the name field", async () => {
    stubFetch([
      { match: (u) => u.endsWith("/api/native/proposals/writes"), body: { data: [] } },
      { match: (u) => u.endsWith("/api/native/proposals"), body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/proposals") && m === "POST", status: 400, body: { error: LONG_NAME_ERROR } },
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
      const el = document.getElementById("proposal-name-error");
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(fieldError.textContent).toBe(LONG_NAME_ERROR);
    // the work survives
    expect(title).toHaveValue("Q1 rollout");
    expect(client.value).toHaveLength(10_000);
    expect(company).toHaveValue("Acme");
    // and the field itself is marked invalid + described by that message
    expect(client).toHaveAttribute("aria-invalid", "true");
    expect(client.getAttribute("aria-describedby")).toBe("proposal-name-error");
    expect(title).not.toHaveAttribute("aria-invalid");
  });

  it("checklists: keeps the typed values and puts the 400 on the name field", async () => {
    stubFetch([
      { match: (u) => u.endsWith("/api/native/checklists/writes"), body: { data: [] } },
      { match: (u) => u.endsWith("/api/native/checklists"), body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/checklists") && m === "POST", status: 400, body: { error: "name must be a 1..200-char string" } },
    ]);
    render(<ChecklistsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: /Checklists/ })).toBeInTheDocument());

    const name = screen.getByLabelText("Name") as HTMLInputElement;
    const items = screen.getByLabelText("Items") as HTMLTextAreaElement;
    fireEvent.change(name, { target: { value: "x".repeat(10_000) } });
    fireEvent.change(items, { target: { value: "Scope confirmed" } });
    fireEvent.click(screen.getByRole("button", { name: /Create checklist/ }));

    await waitFor(() => expect(document.getElementById("checklist-name-error")).toBeTruthy());
    expect(document.getElementById("checklist-name-error")!.textContent).toBe("name must be a 1..200-char string");
    expect(name.value).toHaveLength(10_000);
    expect(items).toHaveValue("Scope confirmed");
    expect(name).toHaveAttribute("aria-invalid", "true");
  });

  it("deal rooms: keeps the typed values and puts the 400 on the customer email field", async () => {
    stubFetch([
      { match: (u) => u.endsWith("/api/native/dealroom/writes"), body: { data: [] } },
      { match: (u) => u.endsWith("/api/native/proposals"), body: { data: [{ id: "prop_1", title: "Retainer", status: "approved" }] } },
      { match: (u) => u.endsWith("/api/native/checklists"), body: { data: [] } },
      { match: (u) => u.endsWith("/api/native/invoice"), body: { data: [] } },
      { match: (u) => u.endsWith("/api/native/dealroom"), body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/dealroom") && m === "POST", status: 400, body: { error: "customerEmail must be a valid email address" } },
    ]);
    render(<DealRoomsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: /Deal rooms/ })).toBeInTheDocument());

    const name = screen.getByLabelText("Deal room name") as HTMLInputElement;
    const customer = screen.getByLabelText("Customer name") as HTMLInputElement;
    const email = screen.getByLabelText("Customer email") as HTMLInputElement;
    const select = screen.getByLabelText("Link a proposal (required)") as HTMLSelectElement;
    fireEvent.change(name, { target: { value: "Acme rollout" } });
    fireEvent.change(customer, { target: { value: "Acme" } });
    fireEvent.change(email, { target: { value: "not-an-email" } });
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
    fireEvent.change(select, { target: { value: "prop_1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create deal room/ }));

    await waitFor(() => expect(document.getElementById("dealroom-customerEmail-error")).toBeTruthy());
    expect(document.getElementById("dealroom-customerEmail-error")!.textContent).toBe("customerEmail must be a valid email address");
    expect(name).toHaveValue("Acme rollout");
    expect(customer).toHaveValue("Acme");
    expect(email).toHaveValue("not-an-email");
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("invoices: keeps the chosen deal room and puts the 400 on the customer email field", async () => {
    stubFetch([
      { match: (u) => u.endsWith("/api/native/invoice/writes"), body: { data: [] } },
      { match: (u) => u.endsWith("/api/native/invoice/stripe"), body: { data: { connected: false } } },
      { match: (u) => u.endsWith("/api/native/dealroom"), body: { data: [{ id: "dr_1", name: "Acme rollout", status: "active" }] } },
      { match: (u) => u.endsWith("/api/native/invoice"), body: { data: [] } },
      { match: (u, m) => u.endsWith("/api/native/invoice") && m === "POST", status: 400, body: { error: "customerEmail must be a valid email or empty" } },
    ]);
    render(<InvoicesPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: /Invoices/ })).toBeInTheDocument());

    const select = screen.getByLabelText("Deal room to invoice") as HTMLSelectElement;
    const email = screen.getByLabelText("Customer email (optional)") as HTMLInputElement;
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
    fireEvent.change(select, { target: { value: "dr_1" } });
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: /Create invoice/ }));

    await waitFor(() => expect(document.getElementById("invoice-customerEmail-error")).toBeTruthy());
    expect(document.getElementById("invoice-customerEmail-error")!.textContent).toBe("customerEmail must be a valid email or empty");
    expect(select).toHaveValue("dr_1");
    expect(email).toHaveValue("not-an-email");
    expect(email).toHaveAttribute("aria-invalid", "true");
  });
});
