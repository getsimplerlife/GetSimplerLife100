/**
 * pending-email-drain-201.test.ts — the retry lane is READ, not just written.
 *
 * The defect: three call sites pushed undelivered mail into
 * pending_emails.json and NOTHING in the codebase ever read it back. A queue
 * nothing reads is a lie about durability.
 *
 * These are unit tests of the drain's rules, with the sender INJECTED — no mail
 * lane, no network, no disk. Every assertion here is about what may and may not
 * be recorded as delivered.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_ATTEMPTS,
  drainPendingEmails,
  pendingEmailCount,
  type PendingEmailRow,
} from "../lib/pending-email-drain";

const NOW = Date.parse("2026-11-07T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function row(over: Partial<PendingEmailRow> = {}): PendingEmailRow {
  return {
    id: "email-1",
    to: "buyer@example.com",
    subject: "Your Starter Plan — set your password and sign in",
    body: "hello",
    timestamp: new Date(NOW - HOUR).toISOString(),
    sent: false,
    attempts: 0,
    ...over,
  };
}

describe("drainPendingEmails — delivery is recorded ONLY on a provider messageId", () => {
  it("marks a message sent when the sender reports a real messageId", async () => {
    const send = vi.fn(async () => ({ delivered: true, channel: "smtp", messageId: "<abc@simplerlife100.com>" }));
    const out = await drainPendingEmails([row()], send, { now: NOW });

    expect(send).toHaveBeenCalledTimes(1);
    expect(out.attempted).toBe(1);
    expect(out.delivered).toBe(1);
    expect(out.items[0].sent).toBe(true);
    expect(out.items[0].messageId).toBe("<abc@simplerlife100.com>");
    expect(out.items[0].channel).toBe("smtp");
    expect(typeof out.items[0].sentAt).toBe("string");
  });

  it("never marks sent when the sender says delivered but returns no messageId", async () => {
    const out = await drainPendingEmails(
      [row()],
      async () => ({ delivered: true, channel: "smtp", messageId: "" }),
      { now: NOW },
    );

    expect(out.delivered).toBe(0);
    expect(out.items[0].sent).toBe(false);
    expect(out.items[0].attempts).toBe(1);
    expect(String(out.items[0].lastError)).toContain("did not acknowledge");
  });

  it("records the failure, the error and the attempt count when the send fails", async () => {
    const out = await drainPendingEmails(
      [row()],
      async () => ({ delivered: false, channel: "smtp", error: "SMTP Send Failure: connection refused" }),
      { now: NOW },
    );

    expect(out.items[0].sent).toBe(false);
    expect(out.items[0].attempts).toBe(1);
    expect(String(out.items[0].lastError)).toContain("connection refused");
    expect(out.items[0].abandonedAt).toBeUndefined();
  });

  it("treats a THROWN send as a failed attempt, not a delivery and not a crash", async () => {
    const out = await drainPendingEmails(
      [row()],
      async () => {
        throw new Error("socket hang up");
      },
      { now: NOW },
    );

    expect(out.items[0].sent).toBe(false);
    expect(String(out.items[0].lastError)).toContain("socket hang up");
    expect(out.attempted).toBe(1);
  });
});

describe("drainPendingEmails — bounds, and nothing is destroyed", () => {
  it("abandons after the attempt budget instead of retrying forever, and keeps the row", async () => {
    const send = vi.fn(async () => ({ delivered: false, error: "still down" }));
    const out = await drainPendingEmails([row({ attempts: DEFAULT_MAX_ATTEMPTS - 1 })], send, { now: NOW });

    expect(send).toHaveBeenCalledTimes(1);
    expect(out.abandoned).toBe(1);
    expect(out.items).toHaveLength(1); // kept, with a reason — never deleted
    expect(String(out.items[0].abandonedReason)).toContain("retries exhausted");
  });

  it("does not attempt a row that is already over the attempt budget", async () => {
    const send = vi.fn(async () => ({ delivered: true, channel: "smtp", messageId: "x" }));
    const out = await drainPendingEmails([row({ attempts: DEFAULT_MAX_ATTEMPTS })], send, { now: NOW });

    expect(send).not.toHaveBeenCalled();
    expect(out.abandoned).toBe(1);
  });

  it("abandons a message older than the age bound WITHOUT sending it", async () => {
    const send = vi.fn(async () => ({ delivered: true, channel: "smtp", messageId: "x" }));
    const out = await drainPendingEmails([row({ timestamp: new Date(NOW - 25 * HOUR).toISOString() })], send, { now: NOW });

    expect(send).not.toHaveBeenCalled();
    expect(out.abandoned).toBe(1);
    expect(String(out.items[0].abandonedReason)).toContain("older than");
  });

  it("abandons an unaddressable row rather than sending to an empty recipient", async () => {
    const send = vi.fn(async () => ({ delivered: true, channel: "smtp", messageId: "x" }));
    const out = await drainPendingEmails([row({ to: "   " })], send, { now: NOW });

    expect(send).not.toHaveBeenCalled();
    expect(out.abandoned).toBe(1);
  });

  it("honours the per-drain limit and leaves the rest for a later drain", async () => {
    const send = vi.fn(async () => ({ delivered: true, channel: "smtp", messageId: "m" }));
    const rows = [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })];
    const out = await drainPendingEmails(rows, send, { now: NOW, limit: 2 });

    expect(send).toHaveBeenCalledTimes(2);
    expect(out.attempted).toBe(2);
    expect(out.items.filter((r) => r.sent === true)).toHaveLength(2);
    expect(out.items[2]).toBe(rows[2]); // untouched row keeps its identity
  });

  it("leaves delivered, abandoned and unreadable rows exactly as they were", async () => {
    const send = vi.fn(async () => ({ delivered: true, channel: "smtp", messageId: "m" }));
    const done = row({ id: "done", sent: true });
    const gone = row({ id: "gone", abandonedAt: new Date(NOW).toISOString() });
    const junk = "not-an-object" as unknown as PendingEmailRow;
    const out = await drainPendingEmails([done, gone, junk], send, { now: NOW });

    expect(send).not.toHaveBeenCalled();
    expect(out.items[0]).toBe(done);
    expect(out.items[1]).toBe(gone);
    expect(out.items[2]).toBe(junk);
    expect(out.attempted).toBe(0);
  });

  it("never mutates the array or the rows it was given", async () => {
    const rows = [row()];
    const snapshot = JSON.stringify(rows);
    await drainPendingEmails(rows, async () => ({ delivered: false, error: "nope" }), { now: NOW });
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe("pendingEmailCount — what an operator view should show", () => {
  it("counts only rows still awaiting delivery", () => {
    expect(
      pendingEmailCount([
        row({ id: "a" }),
        row({ id: "b", sent: true }),
        row({ id: "c", abandonedAt: new Date(NOW).toISOString() }),
      ]),
    ).toBe(1);
  });
});
