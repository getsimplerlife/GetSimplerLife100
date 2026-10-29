/**
 * portal-tables-guard.test.tsx — slice 135 guard for the TABLES portal page.
 *
 * Pins the three required properties:
 *   1. ROUTE RENDERS — lazy route exists, mounts this page, page renders.
 *   2. EMPTY STATE IS HONEST — "No tables yet" + create action, counts from
 *      the payload only.
 *   3. UNAUTHENTICATED IS NOT DATA — 401 → sign-in state, never the empty state.
 *
 * Plus the gated-write contract: row writes go to the EXISTING routes and the
 * apply lane is addressed by the pending-write id (ptw_), which is what
 * /api/native/tables/writes/:id/apply resolves on the server.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import TablesPage from "../lazy/portal.tables.index.page";
import { mockFetch, mockSignedOut, hasText, urlIs } from "./helpers/portal-primitive-fetch";

const ROUTE_FILE = "src/routes/portal.tables.index.tsx";
const PAGE_FILE = "src/lazy/portal.tables.index.page.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

const emptyLists = [
  { match: urlIs("/api/native/tables/writes"), body: { data: { writes: [] } } },
  { match: urlIs("/api/native/tables"), body: { data: { tables: [] } } },
];

describe("tables page — route wiring", () => {
  it("has a lazy route file that mounts this page", () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
    const src = readFileSync(ROUTE_FILE, "utf8");
    expect(src).toContain('createFileRoute("/portal/tables/")');
    expect(src).toContain("~/lazy/portal.tables.index.page");
  });

  it("renders its heading from an empty tenant payload", async () => {
    mockFetch(emptyLists);
    render(<TablesPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Tables" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Your tables (0)")).toBeInTheDocument());
  });
});

describe("tables page — honest empty state", () => {
  it("says 'No tables yet' with the create action", async () => {
    mockFetch(emptyLists);
    render(<TablesPage />);
    await waitFor(() => expect(screen.getByText("No tables yet")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Open the table builder/ })).toBeInTheDocument();
  });

  it("counts real tables from the payload and shows real row counts", async () => {
    mockFetch([
      { match: urlIs("/api/native/tables/writes"), body: { data: { writes: [] } } },
      {
        match: urlIs("/api/native/tables"),
        body: {
          data: {
            tables: [
              {
                id: "tbl_1",
                name: "Clients",
                description: "",
                fields: [{ key: "name", label: "Name", type: "text" }],
                version: 1,
                rows: 3,
                pending: 0,
                createdAt: "2026-10-01T00:00:00.000Z",
                updatedAt: "2026-10-01T00:00:00.000Z",
              },
            ],
          },
        },
      },
    ]);
    render(<TablesPage />);
    await waitFor(() => expect(screen.getByText(hasText("Your tables (1)"))).toBeInTheDocument());
    expect(screen.getByText("Clients")).toBeInTheDocument();
    expect(screen.getByText(/3 rows · 1 field/)).toBeInTheDocument();
    expect(screen.queryByText("No tables yet")).not.toBeInTheDocument();
  });
});

describe("tables page — unauthenticated is not silently rendered as data", () => {
  it("a 401 shows the sign-in state and never the empty state", async () => {
    mockSignedOut();
    render(<TablesPage />);
    await waitFor(() => expect(screen.getByText("Please sign in to continue")).toBeInTheDocument());
    expect(screen.queryByText("No tables yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/Your tables \(/)).not.toBeInTheDocument();
  });
});

describe("tables page — gated write contract", () => {
  const src = readFileSync(PAGE_FILE, "utf8");

  it("uses only the real tables routes", () => {
    for (const fragment of [
      "/api/native/tables",
      "/rows",
      "/writes",
      "/export?format=csv",
    ]) {
      expect(src).toContain(fragment);
    }
    expect(src).not.toMatch(/api\/native\/documents/);
  });

  it("addresses the apply lane by pending-write id (what the server resolves)", () => {
    expect(src).toContain("/api/native/tables/writes/${write.id}/apply");
    expect(src).not.toContain("writes/${write.approvalActionId}/apply");
  });

  it("never claims a row is stored before the write is applied", () => {
    expect(src).toContain("queued for approval");
    expect(src).toContain('res.data?.status === "pending"');
  });
});
