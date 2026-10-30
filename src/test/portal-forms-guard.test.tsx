/**
 * portal-forms-guard.test.tsx — slice 135 guard for the FORMS portal page.
 *
 * Three things are pinned, per the slice brief:
 *   1. ROUTE RENDERS — the lazy route exists, mounts this page, and the page
 *      renders its own heading from real (empty) payloads.
 *   2. EMPTY STATE IS HONEST — "No forms yet" plus the create action; the
 *      count comes from the payload, never a placeholder row.
 *   3. UNAUTHENTICATED IS NOT DATA — a 401 renders the sign-in state and NOT
 *      the empty state (an empty list must never stand in for "signed out").
 *
 * Plus content guards: only the routes that exist are called, and the page
 * never claims a hosted public form page (there is none — the public lane is
 * the POST endpoint).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import FormsPage from "../lazy/portal.forms.index.page";
import { mockFetch, mockSignedOut, hasText, urlHas } from "./helpers/portal-primitive-fetch";

const ROUTE_FILE = "src/routes/portal.forms.index.tsx";
const PAGE_FILE = "src/lazy/portal.forms.index.page.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("forms page — route wiring", () => {
  it("has a lazy route file that mounts this page", () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
    const src = readFileSync(ROUTE_FILE, "utf8");
    expect(src).toContain('createFileRoute("/portal/forms/")');
    expect(src).toContain("~/lazy/portal.forms.index.page");
  });

  it("renders its heading from an empty tenant payload", async () => {
    mockFetch([{ match: urlHas("/api/native/forms"), body: { data: { forms: [] } } }]);
    render(<FormsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Forms" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Your forms (0)")).toBeInTheDocument());
  });
});

describe("forms page — honest empty state", () => {
  it("says 'No forms yet' with the create action and no fabricated rows", async () => {
    mockFetch([{ match: urlHas("/api/native/forms"), body: { data: { forms: [] } } }]);
    render(<FormsPage />);
    await waitFor(() => expect(screen.getByText("No forms yet")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Open the form builder/ })).toBeInTheDocument();
    // No submission surface is invented while there is nothing to show.
    expect(screen.getByText("Pick a form to see its submissions")).toBeInTheDocument();
  });

  it("counts real forms from the payload (no placeholder rows)", async () => {
    mockFetch([
      {
        match: urlHas("/api/native/forms"),
        body: {
          data: {
            forms: [
              {
                id: "frm_1",
                slug: "abc123",
                name: "Client intake",
                description: "",
                steps: 1,
                fields: 2,
                prefillKeys: [],
                enabled: true,
                submissions: 0,
                createdAt: "2026-10-01T00:00:00.000Z",
                updatedAt: "2026-10-01T00:00:00.000Z",
              },
            ],
          },
        },
      },
    ]);
    render(<FormsPage />);
    await waitFor(() => expect(screen.getByText(hasText("Your forms (1)"))).toBeInTheDocument());
    expect(screen.getByText("Client intake")).toBeInTheDocument();
    expect(screen.queryByText("No forms yet")).not.toBeInTheDocument();
  });
});

describe("forms page — unauthenticated is not silently rendered as data", () => {
  it("a 401 shows the sign-in state and never the empty state", async () => {
    mockSignedOut();
    render(<FormsPage />);
    await waitFor(() => expect(screen.getByText("Please sign in to continue")).toBeInTheDocument());
    expect(screen.queryByText("No forms yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/Your forms \(/)).not.toBeInTheDocument();
  });
});

describe("forms page — calls only routes that exist", () => {
  it("uses the real /api/native/forms family and invents no hosted public page", () => {
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("/api/native/forms");
    expect(src).toContain("/submissions");
    expect(src).toContain("/submit");
    // Honest: there is no public form page route in the app.
    expect(existsSync("src/routes/forms.share.$slug.tsx")).toBe(false);
    expect(src).toContain("no hosted public form page yet");
  });
});
