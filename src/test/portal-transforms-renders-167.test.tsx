/**
 * SLICE 167 — D-8: /portal/transforms renders, and the boundary reports why when
 * it does not.
 *
 * THE DEFECT THIS PINS. The transforms page read `t.transforms` and `w.writes`
 * off the response ENVELOPE, but every native route answers `{ data: … }`. Both
 * were `undefined`; `setTransforms(undefined)` landed in state and
 * `transforms.map(...)` threw into the root error boundary. The page was dead
 * for every user, owner included — it rendered `<h1>Something went wrong</h1>`
 * with an empty body — and the boundary reported nothing, which is why a full
 * portal audit walked past it.
 *
 * The render test below fails on the pre-fix code by throwing (undefined.map)
 * instead of finding the empty state, and the boundary test fails on the pre-fix
 * code because a non-`Error` thrown value produced no message anywhere.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RouteError } from "~/components/RouteError";
import TransformsPage from "../lazy/portal.transforms.index.page";
import { mockFetch, urlHas } from "./helpers/portal-primitive-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as any).__errors;
});

describe("D-8 — /portal/transforms renders from the real response envelope", () => {
  it("renders the empty state (not the error boundary) for an empty transform list", async () => {
    mockFetch([
      { match: urlHas("/api/native/transform/writes"), body: { data: { writes: [] } } },
      { match: urlHas("/api/native/transform"), body: { data: { transforms: [] } } },
    ]);
    render(<TransformsPage />);
    expect(screen.getByRole("heading", { level: 1, name: /Data transforms & EDI/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No transforms yet — create one above.")).toBeInTheDocument());
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("renders every transform from the payload (the unwrap works for real rows too)", async () => {
    mockFetch([
      { match: urlHas("/api/native/transform/writes"), body: { data: { writes: [] } } },
      {
        match: urlHas("/api/native/transform"),
        body: {
          data: {
            transforms: [
              {
                id: "itrf_1",
                name: "Invoice lines",
                sourceKind: "csv",
                outputMode: "records",
                artifactKind: "csv",
                status: "draft",
                version: 1,
                fieldCount: 2,
                runCount: 0,
              },
            ],
          },
        },
      },
    ]);
    render(<TransformsPage />);
    await waitFor(() => expect(screen.getByText("Invoice lines")).toBeInTheDocument());
    // One row from one record — no invented rows, no empty state.
    expect(screen.queryByText("No transforms yet — create one above.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Invoice lines")).toHaveLength(1);
  });

  it("surfaces a malformed envelope as a page error instead of silently rendering undefined", async () => {
    // No `data` envelope at all — the shape the page used to read by mistake.
    mockFetch([
      { match: urlHas("/api/native/transform/writes"), body: { data: { writes: [] } } },
      { match: urlHas("/api/native/transform"), body: { transforms: [] } },
    ]);
    render(<TransformsPage />);
    await waitFor(() =>
      expect(screen.getByText(/no data envelope/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });
});

describe("D-8 — the error boundary reports its cause", () => {
  it("shows and records the message for a non-Error thrown value", () => {
    render(<RouteError error={{ code: 42 }} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText(/"code":42/)).toBeInTheDocument();
    expect((window as any).__errors.join("\n")).toContain('"code":42');
  });

  it("records an Error's message and stack even when window.__errors did not exist yet", () => {
    const err = new Error("transforms blew up");
    render(<RouteError error={err} />);
    const recorded = (window as any).__errors.join("\n");
    expect(recorded).toContain("transforms blew up");
    expect(recorded).toContain("Error");
    expect(screen.getByText(/transforms blew up/)).toBeInTheDocument();
  });
});
