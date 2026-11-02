/**
 * automations-composer-173.test.tsx — SLICE 173, defects W1 and W2.
 *
 * The automations composer built its action like this:
 *
 *   const actions = actionKind === "notify"
 *     ? [{ kind: "notify", recipients: [recipient || "ops@example.com"], ... }]
 *     : [{ kind: "webhook", eventType, payload: { source: "automation" } }];
 *
 * W1: picking "Table write" or "Run transform" created a WEBHOOK action — the
 *     UI said one thing and the record said another (the same species as the
 *     404 CTA in slice 171).
 * W2: a blank recipient field invented `ops@example.com`, an external address
 *     the user never typed.
 *
 * The contract proven here: the action stored is the action chosen, and a
 * blank recipient is a validation error naming the field — never a fabricated
 * address.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AutomationsPage from "../lazy/portal.automations.index.page";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function stubFetch(): Call[] {
  const calls: Call[] = [];
  const json = (body: unknown) => ({ status: 200, ok: true, json: async () => body }) as unknown as Response;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      if (url.endsWith("/api/native/automation/rules") && method === "GET") return json({ data: { rules: [] } });
      if (url.endsWith("/api/native/automation/runs")) return json({ data: { runs: [] } });
      if (url.endsWith("/api/native/automation/writes")) return json({ data: { writes: [] } });
      if (url.endsWith("/api/native/automation/rules") && method === "POST") return json({ data: { status: "pending" } });
      if (url.endsWith("/api/native/entitlements")) return json({ entitlement: { tier: "none", label: "No plan on file" } });
      if (url.endsWith("/api/native/tables")) return json({ data: { tables: [{ id: "tbl_leads", name: "Leads" }] } });
      if (url.endsWith("/api/native/transform")) return json({ data: { transforms: [{ id: "trf_map", name: "CSV map", status: "active" }] } });
      return json({ data: {} });
    }),
  );
  return calls;
}

const rulesPost = (calls: Call[]) =>
  calls.filter((c) => c.method === "POST" && c.url.endsWith("/api/native/automation/rules"));

const sentActions = (call: Call) => (call.body as { actions: Array<Record<string, unknown>> }).actions;

function typeRuleName(name: string) {
  fireEvent.change(screen.getByPlaceholderText("Rule name"), { target: { value: name } });
}
/** The action select is the first combobox in the composer (no label in the pre-173 page). */
const actionSelect = () => screen.getAllByRole("combobox")[0]!;
const createButton = () => screen.getByRole("button", { name: /create rule/i });

afterEach(() => vi.unstubAllGlobals());

describe("W1 — the composer never records an action the user did not choose", () => {
  it("choosing 'Table write' never sends a webhook action", async () => {
    const calls = stubFetch();
    render(<AutomationsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Automations" })).toBeInTheDocument());
    typeRuleName("Write a lead row");
    fireEvent.change(actionSelect(), { target: { value: "tableWrite" } });
    fireEvent.click(createButton());
    // Either the rule is created as a tableWrite, or creation is refused with an
    // error the user can read. What must never happen is a webhook record.
    await waitFor(() => expect(rulesPost(calls).length + screen.queryAllByRole("alert").length).toBeGreaterThan(0));
    for (const call of rulesPost(calls)) {
      expect(sentActions(call).map((a) => a.kind)).not.toContain("webhook");
    }
  });

  it("'Table write' creates a tableWrite action for the chosen table", async () => {
    const calls = stubFetch();
    render(<AutomationsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Automations" })).toBeInTheDocument());
    typeRuleName("Write a lead row");
    fireEvent.change(actionSelect(), { target: { value: "tableWrite" } });
    await waitFor(() => expect(screen.getByLabelText("Table")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Table"), { target: { value: "tbl_leads" } });
    fireEvent.change(screen.getByLabelText("Row to insert (JSON)"), { target: { value: '{"name":"Acme"}' } });
    fireEvent.click(createButton());

    await waitFor(() => expect(rulesPost(calls)).toHaveLength(1));
    const action = sentActions(rulesPost(calls)[0]!)[0]!;
    expect(action.kind).toBe("tableWrite");
    expect(action.tableId).toBe("tbl_leads");
    expect(action.row).toEqual({ name: "Acme" });
  });

  it("'Run transform' creates a runTransform action for the chosen transform", async () => {
    const calls = stubFetch();
    render(<AutomationsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Automations" })).toBeInTheDocument());
    typeRuleName("Run the map");
    fireEvent.change(actionSelect(), { target: { value: "runTransform" } });
    await waitFor(() => expect(screen.getByLabelText("Transform")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Transform"), { target: { value: "trf_map" } });
    fireEvent.click(createButton());

    await waitFor(() => expect(rulesPost(calls)).toHaveLength(1));
    const action = sentActions(rulesPost(calls)[0]!)[0]!;
    expect(action.kind).toBe("runTransform");
    expect(action.transformId).toBe("trf_map");
  });

  it("'Webhook' still creates a webhook action", async () => {
    const calls = stubFetch();
    render(<AutomationsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Automations" })).toBeInTheDocument());
    typeRuleName("Publish an event");
    fireEvent.change(actionSelect(), { target: { value: "webhook" } });
    fireEvent.click(createButton());
    await waitFor(() => expect(rulesPost(calls)).toHaveLength(1));
    expect(sentActions(rulesPost(calls)[0]!)[0]!.kind).toBe("webhook");
  });
});

describe("W2 — a blank recipient is an error naming the field, never an invented address", () => {
  it("refuses to create a notify rule with no recipient and names the field", async () => {
    const calls = stubFetch();
    render(<AutomationsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Automations" })).toBeInTheDocument());
    typeRuleName("Notify the owner");
    fireEvent.change(actionSelect(), { target: { value: "notify" } });
    fireEvent.click(createButton());

    // Let any (wrong) request settle before judging it.
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Nothing anywhere in the request invented an external address.
    expect(JSON.stringify(calls)).not.toContain("ops@example.com");
    expect(rulesPost(calls)).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/recipient/i);
  });

  it("sends exactly the address the user typed when one is supplied", async () => {
    const calls = stubFetch();
    render(<AutomationsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Automations" })).toBeInTheDocument());
    typeRuleName("Notify ops");
    fireEvent.change(actionSelect(), { target: { value: "notify" } });
    fireEvent.change(screen.getByLabelText("Notify recipient email"), { target: { value: "ops@acme.test" } });
    fireEvent.click(createButton());
    await waitFor(() => expect(rulesPost(calls)).toHaveLength(1));
    expect((sentActions(rulesPost(calls)[0]!)[0] as { recipients: string[] }).recipients).toEqual(["ops@acme.test"]);
  });
});
