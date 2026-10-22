/**
 * portal-notifications.test.tsx — P2-3 honest, unified notifications surface.
 *
 * What the surface guarantees:
 *   - the feed is DERIVED from real workspace records — no fabrication,
 *     no placeholder rows, no invented activity (a job with no ledger run
 *     produces nothing; an untouched draft produces nothing);
 *   - unread = the underlying record still needs attention, cleared when the
 *     record changes;
 *   - the agent-era theater is gone: no dead-end notification-store writes
 *     (the store was never served), no "Notification Hub" / channels tab /
 *     mark-all loops, no fake copy.
 *   - every count/badge (unreadCount, section counts) comes from the same
 *     derived items that render.
 *
 * Covers the pure builders + a file-content guard on the touched surfaces
 * (same pattern as the native-import-copy-sweep guard). No server changes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  approvalNotices,
  importNotices,
  quoteNotices,
  buildNoticeFeed,
  noticeTime,
  toEpochMs,
  type ApprovalActionShape,
  type ImportJobShape,
  type RunLedgerShape,
  type ProposalShape,
  type InvoiceShape,
  type DealRoomShape,
  type NoticeFeedInputs,
} from "../lib/portal-notifications";

const NOW = 1_700_000_000_000;

describe("approvalNotices — Approval Queue is the real source", () => {
  const pending: ApprovalActionShape = {
    actionId: "act-1",
    actionType: "createProposal",
    provider: "hubspot",
    summary: { what: "Create proposal Alpha", where: "Deal 42", why: "Client request" },
    status: "pending",
    createdAt: NOW - 60_000,
  };

  it("pending actions become unread, tone=approval items that link to Approvals", () => {
    const [item] = approvalNotices([pending], []);
    expect(item.unread).toBe(true);
    expect(item.tone).toBe("approval");
    expect(item.kind).toBe("approval");
    expect(item.link).toBe("/portal/approvals");
    expect(item.title).toContain("createProposal");
    expect(item.message).toContain("Create proposal Alpha");
    expect(item.message).toContain("HubSpot");
    expect(item.at).toBe(NOW - 60_000);
  });

  it("decided actions are NOT unread; a failed execution is tone=error", () => {
    const decided: ApprovalActionShape = {
      actionId: "act-2",
      actionType: "updateTask",
      provider: "xero",
      status: "rejected",
      createdAt: NOW - 120_000,
      decidedAt: NOW - 10_000,
      decidedBy: "owner@acme.test",
    };
    const [item] = approvalNotices([], [decided]);
    expect(item.unread).toBe(false);
    expect(item.at).toBe(NOW - 10_000);
    expect(item.message).toContain("rejected");
    expect(item.message).toContain("owner@acme.test");

    const failed: ApprovalActionShape = { ...decided, status: "approved", resultError: "provider 401" };
    expect(approvalNotices([], [failed])[0].tone).toBe("error");
  });

  it("empty queues yield an empty list — never placeholder rows", () => {
    expect(approvalNotices([], [])).toEqual([]);
  });
});

describe("importNotices — drawn ONLY from the honest run ledger", () => {
  const job: ImportJobShape = { id: "imp-1", provider: "xero", sourceLabel: "Acme Books", status: "staged" };
  const runs: Record<string, RunLedgerShape[]> = {
    "imp-1": [
      { op: "pull", at: NOW - 300_000, counts: { rows: 12 } },
      { op: "map", at: NOW - 200_000 },
    ],
  };

  it("a job with NO recorded run produces nothing (no fabricated activity)", () => {
    expect(importNotices([{ ...job, status: "draft" }], {})).toEqual([]);
    // even a "staged"-looking job without a ledger is silent
    expect(importNotices([job], {})).toEqual([]);
  });

  it("staged job → unread, approval tone, honest staged copy, nothing-imported claim", () => {
    const [item] = importNotices([job], runs);
    expect(item.unread).toBe(true);
    expect(item.tone).toBe("approval");
    expect(item.link).toBe("/portal/import");
    expect(item.title).toBe("Import staged — nothing imported yet");
    expect(item.message).toContain("Acme Books");
    expect(item.message).toContain("12 row(s) staged");
    expect(item.message).toContain("nothing is imported until you approve");
    expect(item.at).toBe(NOW - 300_000);
  });

  it("committed job (commit run in the ledger) → resolved, complete tone, real count", () => {
    const committed = importNotices([{ ...job, status: "committed" }], {
      "imp-1": [...runs["imp-1"], { op: "commit", at: NOW - 60_000, counts: { rows: 12 } }],
    });
    const [item] = committed;
    expect(item.unread).toBe(false);
    expect(item.tone).toBe("complete");
    expect(item.message).toContain("12 row(s) imported");
    expect(item.at).toBe(NOW - 60_000);
  });

  it("failed job → unread, error tone", () => {
    const [item] = importNotices([{ ...job, status: "failed" }], {
      "imp-1": [{ op: "pull", at: NOW - 300_000, note: "provider rejected credential" }],
    });
    expect(item.unread).toBe(true);
    expect(item.tone).toBe("error");
    expect(item.title).toBe("Import failed");
    expect(item.message).toContain("provider rejected credential");
  });

  it("empty imports list → empty list", () => {
    expect(importNotices([], {})).toEqual([]);
  });
});

describe("quoteNotices — proposals / invoices / deal rooms status changes", () => {
  const proposal: ProposalShape = { id: "p-1", title: "Q3 Retainer", clientName: "Acme", status: "sent", updatedAt: "2026-10-21T10:00:00Z" };

  it("sent or pending proposal → unread, approval tone, links to Proposals", () => {
    const [item] = quoteNotices([proposal], [], []);
    expect(item.unread).toBe(true);
    expect(item.tone).toBe("approval");
    expect(item.link).toBe("/portal/proposals");
    expect(item.title).toBe("Proposal awaiting review");
    expect(item.message).toContain("Q3 Retainer");
    expect(item.message).toContain("Acme");
    const [pendingItem] = quoteNotices([{ ...proposal, status: "pending" }], [], []);
    expect(pendingItem.unread).toBe(true);
  });

  it("approved proposal → resolved complete; rejected → unread error; draft → silent", () => {
    const resolved = quoteNotices([{ ...proposal, status: "approved" }], [], []);
    expect(resolved[0].unread).toBe(false);
    expect(resolved[0].tone).toBe("complete");
    const declined = quoteNotices([{ ...proposal, status: "rejected" }], [], []);
    expect(declined[0].unread).toBe(true);
    expect(declined[0].tone).toBe("error");
    expect(quoteNotices([{ ...proposal, status: "draft" }], [], [])).toEqual([]);
  });

  it("sent invoice → unread info with real number/amount; draft invoice → silent", () => {
    const invoice: InvoiceShape = {
      id: "inv-1",
      invoiceNumber: "INV-1001",
      amountDueCents: 12_345,
      currency: "USD",
      status: "sent",
      updatedAt: "2026-10-21T11:00:00Z",
    };
    const [item] = quoteNotices([], [invoice], []);
    expect(item.unread).toBe(true);
    expect(item.tone).toBe("info");
    expect(item.link).toBe("/portal/invoices");
    expect(item.message).toContain("INV-1001");
    expect(item.message).toContain("USD 123.45");
    expect(quoteNotices([], [{ ...invoice, status: "draft" }], [])).toEqual([]);
  });

  it("draft deal room → unread ready-to-open; active/archived → silent", () => {
    const room: DealRoomShape = { id: "dr-1", name: "Acme Rollout", customerName: "Acme", status: "draft", updatedAt: "2026-10-21T12:00:00Z" };
    const [item] = quoteNotices([], [], [room]);
    expect(item.unread).toBe(true);
    expect(item.link).toBe("/portal/deal-rooms");
    expect(quoteNotices([], [], [{ ...room, status: "active" }])).toEqual([]);
    expect(quoteNotices([], [], [{ ...room, status: "archived" }])).toEqual([]);
  });
});

describe("buildNoticeFeed — one honest merged feed", () => {
  const inputs: NoticeFeedInputs = {
    pending: [{ actionId: "a1", actionType: "createProposal", provider: "xero", summary: { what: "W1" }, status: "pending", createdAt: NOW - 60_000 }],
    decided: [],
    imports: [{ id: "i1", sourceLabel: "Books", status: "staged" }],
    runsByJob: { i1: [{ op: "pull", at: NOW - 300_000, counts: { rows: 5 } }] },
    proposals: [{ id: "p1", title: "T1", clientName: "C1", status: "sent", updatedAt: "2026-10-21T10:00:00Z" }],
    invoices: [],
    dealRooms: [],
  };

  it("merges sources, sorts newest first, dedupes by kind+id, derives unreadCount", () => {
    const feed = buildNoticeFeed(inputs);
    // desc by at: proposal (2026-10-21) > pending approval (NOW-60s) > staged import pull (NOW-5m)
    expect(feed.items.map((i) => i.kind)).toEqual(["quote", "approval", "import"]);
    expect(feed.unreadCount).toBe(3);
    // dedupe: same approval id in pending+decided keeps one entry
    const both = buildNoticeFeed({
      ...inputs,
      pending: inputs.pending,
      decided: [{ actionId: "a1", actionType: "createProposal", status: "approved", createdAt: NOW - 60_000, decidedAt: NOW }],
    });
    expect(both.items.filter((i) => i.id === "approval:a1").length).toBe(1);
  });

  it("empty inputs → empty feed and unreadCount 0 (never fabricates)", () => {
    const feed = buildNoticeFeed({ pending: [], decided: [], imports: [], runsByJob: {}, proposals: [], invoices: [], dealRooms: [] });
    expect(feed.items).toEqual([]);
    expect(feed.unreadCount).toBe(0);
  });
});

describe("time helpers", () => {
  it("noticeTime renders honest human labels; unknown time renders ''", () => {
    expect(noticeTime(NOW - 5_000, NOW)).toBe("just now");
    expect(noticeTime(NOW - 120_000, NOW)).toBe("2m ago");
    expect(noticeTime(NOW - 7_200_000, NOW)).toBe("2h ago");
    expect(noticeTime(NOW - 3 * 86_400_000, NOW)).toBe("3d ago");
    expect(noticeTime(0, NOW)).toBe("");
  });
  it("toEpochMs accepts ISO strings and numbers, guards NaN", () => {
    expect(toEpochMs("2026-10-21T10:00:00Z")).toBe(Date.parse("2026-10-21T10:00:00Z"));
    expect(toEpochMs(NOW)).toBe(NOW);
    expect(toEpochMs("not-a-date")).toBe(0);
    expect(toEpochMs(undefined)).toBe(0);
  });
});

describe("P2-3 honesty guard — dead-end theater is gone from the touched surfaces", () => {
  const page = readFileSync("src/lazy/portal.notifications.index.page.tsx", "utf8");
  const shell = readFileSync("src/lazy/portal.page.tsx", "utf8");
  const context = readFileSync("src/routes/portal.context.tsx", "utf8");

  it("the page renders the honest framing (live-drawn, nothing fabricated, approval-gated imports)", () => {
    for (const phrase of [
      "drawn from your live workspace records",
      "Nothing is stored or fabricated",
      "Nothing needs your attention right now",
      "Nothing is queued for your decision",
      "nothing is imported until you approve",
      "No quote-to-cash activity",
      "Couldn't refresh notifications.",
    ]) {
      expect(page, `page must contain "${phrase}"`).toContain(phrase);
    }
  });

  it("the agent-era theater is gone: no dead store writes, no hub/broadcast/channels/mark-all", () => {
    for (const banned of [
      "system_notifications",
      "Notification Hub",
      "SYSTEM BROADCAST",
      "Resolve Exception",
      "Communication Channels",
      "Mark all read",
      "See All Reports & Alerts",
      "🔔",
    ]) {
      expect(page.toLowerCase(), `page must not contain "${banned}"`).not.toContain(banned.toLowerCase());
      expect(shell.toLowerCase(), `shell must not contain "${banned}"`).not.toContain(banned.toLowerCase());
    }
  });

  it("the context no longer exposes the dead notification-store API", () => {
    expect(context).not.toContain("SystemNotification");
    expect(context).not.toContain("markAsRead");
    expect(context).not.toContain("markAllAsRead");
    expect(context).not.toContain("addNotification");
    // and the new surface keys ARE there
    for (const key of ["feed", "unreadCount", "notificationsError", "updatedAt", "refreshNotifications"]) {
      expect(context).toContain(key);
    }
  });
});