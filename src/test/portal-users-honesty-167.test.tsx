/**
 * SLICE 167 — D-13 + D-14: /portal/users stops inventing an empty workspace and
 * stops offering controls that do nothing.
 *
 * D-13. The page never checked `res.ok`. `/api/data/users` is owner-gated, so a
 * 403 (or any failure) rendered "No team members yet — Team members appear here
 * after their first signup" — an invented fact about the workspace, shown with
 * no error anywhere. An error must look like an error; the empty state belongs
 * to a genuine empty result only.
 *
 * D-14. The page offered "➕ Invite Member" and a per-row "Edit" that POSTed to
 * /api/data/users — a read-only, owner-gated route with no action dispatch. Both
 * answered 200 and wrote nothing, while the subtitle promised "Configure role
 * privileges, manage tenancy users, and audit active sessions". Role management
 * does not exist; this slice does not build it (owner gate: no new capability
 * until the portal audit is complete). The controls are gone and the copy now
 * describes what the page really does.
 *
 * Every assertion below fails on the pre-fix page: it rendered the empty state on
 * a 403, and it rendered an Invite button and per-row Edit buttons.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import UsersPage from "../lazy/portal.users.index.page";
import { mockFetch, urlHas } from "./helpers/portal-primitive-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

const USER = { id: "u_1", email: "owner@simplerlife.test", role: "owner", createdAt: "2026-10-01T10:00:00.000Z" };

describe("D-13 — a failed load is an error, never an empty workspace", () => {
  it("shows a real error for a 403 and does NOT claim the workspace is empty", async () => {
    mockFetch([{ match: urlHas("/api/data/users"), status: 403, body: { error: "Forbidden" } }]);
    render(<UsersPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load team members");
    expect(alert.textContent).toContain("Forbidden");

    // The invented fact must not appear anywhere.
    expect(screen.queryByText("No team members yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/after their first signup/)).not.toBeInTheDocument();
    // …and the page says plainly that nothing was loaded.
    expect(screen.getByText(/This is an error, not an empty workspace/)).toBeInTheDocument();
  });

  it("shows a real error for a 500 with no JSON body", async () => {
    mockFetch([{ match: urlHas("/api/data/users"), status: 500, body: {} }]);
    render(<UsersPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("HTTP 500");
    expect(screen.queryByText("No team members yet")).not.toBeInTheDocument();
  });

  it("treats a response with no user list as an error, not as an empty workspace", async () => {
    mockFetch([{ match: urlHas("/api/data/users"), body: { users: [USER] } }]);
    render(<UsersPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no user list");
    expect(screen.queryByText("No team members yet")).not.toBeInTheDocument();
  });

  it("still renders the empty state for a GENUINE empty list", async () => {
    mockFetch([{ match: urlHas("/api/data/users"), body: { data: [] } }]);
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText("No team members yet")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists the real accounts when the server returns them", async () => {
    mockFetch([{ match: urlHas("/api/data/users"), body: { data: [USER] } }]);
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText("owner@simplerlife.test")).toBeInTheDocument());
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.queryByText("No team members yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("D-14 — no control that writes nothing, and copy that tells the truth", () => {
  it("renders no Invite and no Edit control, and posts nothing", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : String(input);
        calls.push({ url, method: (init?.method ?? "GET").toUpperCase() });
        return { status: 200, ok: true, json: async () => ({ data: [USER] }) } as unknown as Response;
      }),
    );

    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText("owner@simplerlife.test")).toBeInTheDocument());

    // The two dead controls are gone, in every spelling the audit saw.
    expect(screen.queryByRole("button", { name: /invite/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/invite member/i)).not.toBeInTheDocument();
    // The page has no controls at all any more: it reads.
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    // Nothing was written anywhere.
    const writes = calls.filter((c) => c.method !== "GET" && c.method !== "HEAD");
    expect(writes).toEqual([]);
    // And the only request is the read it actually needs.
    expect(calls).toEqual([{ url: "/api/data/users", method: "GET" }]);
  });

  it("describes exactly what the page does instead of promising role management", async () => {
    mockFetch([{ match: urlHas("/api/data/users"), body: { data: [USER] } }]);
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText("owner@simplerlife.test")).toBeInTheDocument());

    expect(
      screen.getByText(
        "Every account in this workspace, with its role and when it was created. This page reads the list — it does not add members or change roles.",
      ),
    ).toBeInTheDocument();

    // The old promises are gone.
    expect(screen.queryByText(/Configure role privileges/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/manage tenancy users/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/audit active sessions/i)).not.toBeInTheDocument();
  });

  it("does not show the Department or MFA columns the API never sends", async () => {
    mockFetch([{ match: urlHas("/api/data/users"), body: { data: [USER] } }]);
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText("owner@simplerlife.test")).toBeInTheDocument());

    expect(screen.queryByRole("columnheader", { name: /department/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /mfa/i })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Added" })).toBeInTheDocument();
    // A real value from the API, not a fabricated "None".
    expect(screen.queryByText("None")).not.toBeInTheDocument();
  });
});
