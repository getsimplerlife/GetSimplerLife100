/**
 * SLICE 175 — four portal surfaces that claimed things that were not true.
 *
 * Every test here is written from the defect, and each one FAILS on the
 * pre-fix source at 67a67d8 (the verbatim pre-fix output is quoted in the
 * slice-175 PR). None of them asserts a literal the component also supplies:
 * the expected values come from the payload shape the SERVER sends
 * (`{ data, total, stats }`, `{ rules, records }`, the flat settings object),
 * so a component that reads a different field fails here.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AuditLogsPage from "../lazy/portal.audit-logs.index.page";
import AdminUsersPage from "../lazy/portal.admin.users.page";
import DashboardsPage from "../lazy/portal.dashboards.index.page";
import SettingsPage from "../lazy/portal.settings.index.page";
import { mockFetch, urlIs } from "./helpers/portal-primitive-fetch";

// The settings and dashboards pages link through the router; in jsdom there is
// no router, so Link renders as a plain anchor (portal-dashboards-guard
// precedent).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 1. /portal/audit-logs — the table reads the rows the server sends ───────
describe("audit logs — the tenant table shows the entries the API returns", () => {
  const entry = {
    id: "log-abc12345",
    timestamp: "2026-11-02T10:15:00.000Z",
    user: "owner@example.test",
    action: "portal.invoice.paid",
    resource: "inv_1",
    detail: "Invoice marked paid",
    ip: "127.0.0.1",
  };

  it("renders a row from `data` (the API's field), never 'No audit logs found'", async () => {
    mockFetch([
      {
        match: urlIs("/api/audit-logs"),
        body: {
          data: [entry],
          total: 1,
          page: 1,
          limit: 25,
          offset: 0,
          stats: { totalEvents: 1, uniqueUsers: 1, firstEventAt: entry.timestamp, lastEventAt: entry.timestamp },
        },
      },
    ]);
    render(<AuditLogsPage />);
    await waitFor(() => expect(screen.getByText("portal.invoice.paid")).toBeInTheDocument());
    expect(screen.queryByText("No audit logs found")).not.toBeInTheDocument();
    // The actor comes from the store's `user` field — not a "System" fallback.
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(screen.getByText("Invoice marked paid")).toBeInTheDocument();
  });

  it("never invents a severity or a status, and offers no pill for them", async () => {
    mockFetch([
      {
        match: urlIs("/api/audit-logs"),
        body: { data: [entry], total: 1, page: 1, limit: 25, offset: 0, stats: null },
      },
    ]);
    render(<AuditLogsPage />);
    await waitFor(() => expect(screen.getByText("portal.invoice.paid")).toBeInTheDocument());
    // The store records neither field, so neither value may appear.
    expect(screen.queryByText("info")).not.toBeInTheDocument();
    expect(screen.queryByText("success")).not.toBeInTheDocument();
    for (const pill of ["All Severities", "Warning", "Critical", "All Statuses", "Failure"]) {
      expect(screen.queryByRole("button", { name: pill })).not.toBeInTheDocument();
    }
    expect(screen.getByText(/does not record a severity or a\s+status/)).toBeInTheDocument();
  });

  it("a failed load is an error, not an empty log", async () => {
    mockFetch([{ match: urlIs("/api/audit-logs"), status: 500, body: { error: "boom" } }]);
    render(<AuditLogsPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not load the audit log (HTTP 500)"));
    expect(screen.queryByText("No audit logs found")).not.toBeInTheDocument();
  });
});

// ── 2. the Export button produces a real CSV download ──────────────────────
describe("audit logs — Export Audit CSV actually exports", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (URL as unknown as { createObjectURL?: unknown }).createObjectURL = vi.fn(() => "blob:slice175");
    (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("asks the server for format=csv and starts a download", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      seen.push(url);
      if (url.includes("format=csv")) {
        return {
          status: 200,
          ok: true,
          blob: async () => new Blob(["id,timestamp,user,action,resource,detail,ip\r\n"], { type: "text/csv" }),
          json: async () => ({}),
        } as unknown as Response;
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ data: [], total: 0, page: 1, limit: 25, offset: 0, stats: null }),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuditLogsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Export Audit CSV/ }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    const exportCall = seen.find((u) => u.includes("format=csv"));
    expect(exportCall, `no format=csv request — calls were ${seen.join(", ")}`).toBeTruthy();
  });

  it("a rejected export says so instead of silently doing nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : String(input);
        if (url.includes("format=csv")) {
          return { status: 500, ok: false, json: async () => ({ error: "boom" }) } as unknown as Response;
        }
        return {
          status: 200,
          ok: true,
          json: async () => ({ data: [], total: 0, page: 1, limit: 25, offset: 0, stats: null }),
        } as unknown as Response;
      }),
    );
    render(<AuditLogsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Export Audit CSV/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Export Audit CSV/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not export the audit log (HTTP 500)"));
    expect(clickSpy).not.toHaveBeenCalled();
  });
});

// ── 3. /portal/admin/users — a failed load is not "zero users" ─────────────
describe("admin users — the empty state is reserved for a genuine empty result", () => {
  it("a 403 renders an error, never 'No registered accounts yet'", async () => {
    mockFetch([{ match: urlIs("/api/data/users"), status: 403, body: { error: "Admin access required" } }]);
    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Admin access required"));
    expect(screen.queryByText("No registered accounts yet")).not.toBeInTheDocument();
  });

  it("a real empty result still renders the empty state", async () => {
    mockFetch([{ match: urlIs("/api/data/users"), body: { data: [] } }]);
    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText("No registered accounts yet")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("no Status column: the API sends no status, so the page does not print one", async () => {
    mockFetch([
      {
        match: urlIs("/api/data/users"),
        body: { data: [{ id: "a@b.test", email: "a@b.test", role: "owner", createdAt: "2026-10-01T00:00:00.000Z" }] },
      },
    ]);
    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText("a@b.test")).toBeInTheDocument());
    expect(screen.queryByText("Registered")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });
});

// ── 4. /portal/dashboards — the alert rule's breach state, told honestly ────
describe("dashboards — an alert rule is never labelled with a state it does not have", () => {
  const basePayloads = (rules: unknown[], records: unknown[]) => [
    { match: urlIs("/api/native/dashboard/reports"), body: { data: { reports: [] } } },
    { match: urlIs("/api/native/dashboard/writes"), body: { data: { writes: [] } } },
    { match: urlIs("/api/native/dashboard/schedules"), body: { data: { schedules: [] } } },
    { match: urlIs("/api/native/dashboard/alerts"), body: { data: { rules, records } } },
    { match: urlIs("/api/native/dashboard"), body: { data: { dashboards: [] } } },
    { match: urlIs("/api/native/tables"), body: { data: { tables: [] } } },
  ];

  it("a rule that has never fired says so, not 'clear'", async () => {
    mockFetch(
      basePayloads(
        [{ id: "alr_1", name: "Spike guard", reportId: "rpt_1", metric: "agg", op: "gt", threshold: 10, active: false }],
        [],
      ),
    );
    render(<DashboardsPage />);
    await waitFor(() => expect(screen.getByText(/Spike guard/)).toBeInTheDocument());
    const line = screen.getByText(/Spike guard/);
    expect(line.textContent).toMatch(/never fired/);
    expect(line.textContent).not.toMatch(/clear/);
  });

  it("a rule a run found in breach says breached", async () => {
    mockFetch(
      basePayloads(
        [{ id: "alr_2", name: "Drop alert", reportId: "rpt_1", metric: "agg", op: "lt", threshold: 3, active: true }],
        [{ id: "ale_1", ruleId: "alr_2", firedAt: "2026-11-02T00:00:00.000Z" }],
      ),
    );
    render(<DashboardsPage />);
    await waitFor(() => expect(screen.getByText(/Drop alert/)).toBeInTheDocument());
    expect(screen.getByText(/Drop alert/).textContent).toMatch(/breached/);
  });
});

// ── 5. /portal/settings — no stored preference that nothing reads ──────────
describe("settings — the six dead toggles are gone and the gaps are stated", () => {
  const renderPage = async () => {
    mockFetch([{ match: urlIs("/api/data/settings"), body: { data: {} } }]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Workspace Settings/ })).toBeInTheDocument());
  };

  it("removes the MFA, session-timeout, AI model, retention, email, SMS and Slack controls", async () => {
    await renderPage();
    for (const label of [
      "MFA Multi-Factor Auth",
      "Console Session Timeout",
      "Default AI Model Brain",
      "Creativity Temperature",
      "Standard Data Retention",
      "Email Notifications",
      "SMS Emergency Alerts",
      "Slack Dispatch logs",
    ]) {
      expect(screen.queryByText(label), `${label} is still on the page`).not.toBeInTheDocument();
    }
  });

  it("states plainly that each of those capabilities is not available yet", async () => {
    await renderPage();
    expect(screen.getByText(/Multi-factor authentication is not available yet/)).toBeInTheDocument();
    expect(screen.getByText(/Session length is not configurable yet/)).toBeInTheDocument();
    expect(screen.getByText(/No language model runs in this workspace/)).toBeInTheDocument();
    expect(screen.getByText(/Data retention is not configurable yet/)).toBeInTheDocument();
    expect(screen.getByText(/no SMS lane and no Slack connection/)).toBeInTheDocument();
  });

  it("saves the company name as a FLAT key the invoice issuer actually reads", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : String(input);
        if (init?.method === "POST") {
          bodies.push(String(init.body ?? ""));
          return { status: 200, ok: true, json: async () => ({ success: true }) } as unknown as Response;
        }
        expect(url).toContain("/api/data/settings");
        return { status: 200, ok: true, json: async () => ({ data: {} }) } as unknown as Response;
      }),
    );
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Workspace Settings/ })).toBeInTheDocument());

    // The company-name field is the first text input in the brand card.
    const input = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Acme Advisory Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Brand Profile/ }));

    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    const companyPost = bodies.map((b) => JSON.parse(b)).find((b) => b.companyName === "Acme Advisory Ltd");
    expect(companyPost, `no flat companyName POST — bodies were ${bodies.join(" | ")}`).toBeTruthy();
    // The old shape overwrote the previous key on every request.
    expect(companyPost.key).toBeUndefined();
    expect(companyPost.section).toBeUndefined();
  });

  it("loads a stored flat settings object back into the form", async () => {
    mockFetch([
      { match: urlIs("/api/data/settings"), body: { data: { companyName: "Stored Advisory LLC", timezone: "Europe/London" } } },
    ]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Stored Advisory LLC")).toBeInTheDocument());
  });
});
