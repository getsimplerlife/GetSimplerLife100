/**
 * slice-188-portal-read-failure.test.tsx — a failed read must never render as
 * an affirmative empty state (slice 188).
 *
 * These are the RENDER-TIME assertions the source guard
 * (`portal-read-failure-guard.test.ts`) explicitly cannot make: the defect is a
 * ternary that says "nothing here" about a store nobody read. Each test drives a
 * real 500 through the page's own fetch path and then asserts TWO things:
 *
 *   1. the failure is stated (a sentence a tenant can act on), and
 *   2. the affirmative empty state is ABSENT.
 *
 * (2) is the one that matters. Before this slice every page below passed (1) —
 * or said nothing at all — and still printed "All Clear!" / "No documents yet"
 * / "Nothing to reply to yet" underneath. The positive control at the end of
 * each page's block proves the empty state still renders when the read really
 * did succeed, so the gate is not a blanket removal of honest empty states.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ApprovalQueue from "../lazy/portal.approvals.index.page";
import Vault from "../lazy/portal.vault.index.page";
import CommsInbox from "../lazy/portal.communications.index.page";
import { mockFetch, urlIs } from "./helpers/portal-primitive-fetch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const readFailed = (path: string) => ({ match: urlIs(path), status: 500, body: { error: "boom" } });

describe("approvals — the money path never says All Clear over an unread queue", () => {
  it("a 500 states the failure and suppresses 'All Clear!'", async () => {
    mockFetch([readFailed("/api/portal/approvals")]);
    render(<ApprovalQueue />);
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
    // The affirmative state must be gone, not merely accompanied by an error.
    expect(screen.queryByText(/All Clear!/i)).toBeNull();
    expect(screen.queryByText(/No agent writes are waiting/i)).toBeNull();
    // And the badge states the queue was not read instead of a count.
    expect(screen.getByText(/Not read/i)).toBeTruthy();
  });

  it("control: a real empty queue still says All Clear", async () => {
    mockFetch([
      {
        match: urlIs("/api/portal/approvals"),
        body: { data: { pending: [], decided: [], mode: "on" } },
      },
    ]);
    render(<ApprovalQueue />);
    await waitFor(() => expect(screen.getByText(/All Clear!/i)).toBeTruthy());
    expect(screen.queryByText(/could not be read/i)).toBeNull();
  });
});

describe("vault — an unreadable vault is not an empty vault", () => {
  it("a 500 states the failure and suppresses 'No documents yet'", async () => {
    mockFetch([readFailed("/api/vault/search"), readFailed("/api/vault/folders")]);
    render(<Vault />);
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
    expect(screen.queryByText(/No documents yet/i)).toBeNull();
    // The folder rules are secondary, but "No rules yet" about a failed read is
    // still a claim: it must not be printed either.
    expect(screen.queryByText(/No rules yet/i)).toBeNull();
  });

  it("control: a real empty vault still says No documents yet", async () => {
    mockFetch([
      { match: urlIs("/api/vault/search"), body: { data: [] } },
      { match: urlIs("/api/vault/folders"), body: { data: { rules: [] } } },
    ]);
    render(<Vault />);
    await waitFor(() => expect(screen.getByText(/No documents yet/i)).toBeTruthy());
    expect(screen.queryByText(/could not be read/i)).toBeNull();
  });
});

describe("communications — an unreadable log is not an empty inbox", () => {
  it("a 500 states the failure and suppresses 'Nothing to reply to yet'", async () => {
    mockFetch([readFailed("/api/native/communications"), readFailed("/api/native/communications/writes")]);
    render(<CommsInbox />);
    await waitFor(() => expect(screen.getAllByText(/could not be read/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Nothing to reply to yet/i)).toBeNull();
  });

  it("control: a real empty log still says Nothing to reply to yet", async () => {
    mockFetch([
      { match: urlIs("/api/native/communications/writes"), body: { data: { writes: [] } } },
      { match: urlIs("/api/native/communications"), body: { data: { messages: [] } } },
    ]);
    render(<CommsInbox />);
    await waitFor(() => expect(screen.getByText(/Nothing to reply to yet/i)).toBeTruthy());
    expect(screen.queryByText(/could not be read/i)).toBeNull();
  });
});
