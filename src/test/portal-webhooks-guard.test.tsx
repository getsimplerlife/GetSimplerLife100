/**
 * portal-webhooks-guard.test.tsx — slice 135 guard for the WEBHOOKS page.
 *
 *   1. ROUTE RENDERS — lazy route exists, mounts this page, page renders.
 *   2. EMPTY STATE IS HONEST — "No webhook subscriptions yet" + create lane,
 *      and an honest "no deliveries yet" rather than a fabricated history.
 *   3. UNAUTHENTICATED IS NOT DATA — 401 → sign-in state, never the empty state.
 *
 * Plus the two honesty statements the brief requires: the event-type registry
 * is NOT readable over the API (the page says so instead of inventing a list),
 * and delivery history IS recorded (so it is shown).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import WebhooksPage from "../lazy/portal.webhooks.index.page";
import { mockFetch, mockSignedOut, hasText, urlIs } from "./helpers/portal-primitive-fetch";

const ROUTE_FILE = "src/routes/portal.webhooks.index.tsx";
const PAGE_FILE = "src/lazy/portal.webhooks.index.page.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

const emptyPayloads = [
  { match: urlIs("/api/native/webhook-events"), body: { data: { receipts: [], deliveries: [] } } },
  { match: urlIs("/api/native/webhook-subscriptions"), body: { data: [] } },
  { match: urlIs("/api/native/webhook-sinks"), body: { data: [] } },
];

describe("webhooks page — route wiring", () => {
  it("has a lazy route file that mounts this page", () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
    const src = readFileSync(ROUTE_FILE, "utf8");
    expect(src).toContain('createFileRoute("/portal/webhooks/")');
    expect(src).toContain("~/lazy/portal.webhooks.index.page");
  });

  it("renders its heading from an empty tenant payload", async () => {
    mockFetch(emptyPayloads);
    render(<WebhooksPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Webhooks" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Event subscriptions (0)")).toBeInTheDocument());
  });
});

describe("webhooks page — honest empty states", () => {
  it("says 'No webhook subscriptions yet' with the create lane", async () => {
    mockFetch(emptyPayloads);
    render(<WebhooksPage />);
    await waitFor(() => expect(screen.getByText("No webhook subscriptions yet")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("shows an honest empty delivery history and empty receipts", async () => {
    mockFetch(emptyPayloads);
    render(<WebhooksPage />);
    await waitFor(() => expect(screen.getByText("No deliveries yet")).toBeInTheDocument());
    expect(screen.getByText("Inbound receipts (0)")).toBeInTheDocument();
    expect(screen.getByText("No inbound sinks yet")).toBeInTheDocument();
  });

  it("states that the built-in event-type registry has no read endpoint", async () => {
    mockFetch(emptyPayloads);
    render(<WebhooksPage />);
    await waitFor(() => expect(screen.getByText("No events have been published in this workspace yet, so there is nothing to list.")).toBeInTheDocument());
    expect(screen.getByText(/registry of built-in types has no read endpoint/)).toBeInTheDocument();
  });
});

describe("webhooks page — real data is rendered as given", () => {
  it("lists real subscriptions and real deliveries from the payloads", async () => {
    mockFetch([
      {
        match: urlIs("/api/native/webhook-events"),
        body: {
          data: {
            receipts: [],
            deliveries: [
              {
                id: "dlv_1",
                subscriptionId: "sub_1",
                subscriptionUrl: "https://example.com/hook",
                eventId: "evt_1",
                eventType: "native.form.submission",
                status: "delivered",
                attempts: [{ attempt: 1, at: "2026-10-01T00:00:00.000Z", statusCode: 200, success: true }],
                createdAt: "2026-10-01T00:00:00.000Z",
              },
            ],
          },
        },
      },
      {
        match: urlIs("/api/native/webhook-subscriptions"),
        body: {
          data: [
            {
              id: "sub_1",
              url: "https://example.com/hook",
              eventTypes: ["native.form.submission"],
              enabled: true,
              createdBy: "owner@example.com",
              createdAt: "2026-10-01T00:00:00.000Z",
            },
          ],
        },
      },
      { match: urlIs("/api/native/webhook-sinks"), body: { data: [] } },
    ]);
    render(<WebhooksPage />);
    await waitFor(() => expect(screen.getByText(hasText("Event subscriptions (1)"))).toBeInTheDocument());
    expect(screen.getByText(hasText("Delivery history (1)"))).toBeInTheDocument();
    expect(screen.getByText("native.form.submission")).toBeInTheDocument();
    expect(screen.queryByText("No webhook subscriptions yet")).not.toBeInTheDocument();
  });
});

describe("webhooks page — unauthenticated is not silently rendered as data", () => {
  it("a 401 shows the sign-in state and never the empty state", async () => {
    mockSignedOut();
    render(<WebhooksPage />);
    await waitFor(() => expect(screen.getByText("Please sign in to continue")).toBeInTheDocument());
    expect(screen.queryByText("No webhook subscriptions yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/Event subscriptions \(/)).not.toBeInTheDocument();
  });
});

describe("webhooks page — calls only routes that exist", () => {
  const src = readFileSync(PAGE_FILE, "utf8");

  it("uses the real webhook family", () => {
    for (const fragment of [
      "/api/native/webhook-subscriptions",
      "/api/native/webhook-sinks",
      "/api/native/webhook-events",
      "/api/native/events",
      "/api/native/flush",
    ]) {
      expect(src).toContain(fragment);
    }
  });

  it("never invents an event-type registry endpoint", () => {
    expect(src).not.toMatch(/webhook-event-types|webhook-registry|event-types/);
  });
});
