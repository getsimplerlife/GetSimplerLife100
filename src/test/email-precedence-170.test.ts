/**
 * email-precedence-170.test.ts — SLICE 170: the mail lane must tell the truth
 * about which provider it used, and a failing provider must not black-hole
 * mail.
 *
 * Before this slice `sendEmail` did:
 *   if (SENDGRID_API_KEY) return sendViaSendGrid(...)   // whatever it said
 *   ...SMTP... catch { throw new Error("SMTP Send Failure") }
 * so (a) a set SendGrid key was ALWAYS consulted even when a working SMTP lane
 * existed, and (b) the answer of the chosen provider was the answer — no
 * fall-through, and an SMTP throw escaped past a perfectly good SendGrid lane.
 *
 * Rules now:
 *   (a) SMTP configured (HOST+USER+PASS) → SMTP is used; SendGrid is never called.
 *   (b) the chosen lane fails → fall through to the next configured lane; the
 *       result names the lane that answered AND what failed.
 *   (c) nothing configured → mock, `isMock: true`, `channel: "none"`.
 *   (d) every configured lane fails → `success: false`, `isMock: false`
 *       (a real provider WAS attempted — never a mock success after a try).
 *
 * No message leaves the machine: nodemailer is mocked and `fetch` is a spy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMailLane } from "./mail-lane-isolation";

// Hoisted so the module factory below can see them (vi.mock is hoisted above
// the imports; a plain const would be in its temporal dead zone).
const mail = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn((_opts?: unknown) => ({ sendMail }));
  return { sendMail, createTransport };
});
vi.mock("nodemailer", () => ({
  default: { createTransport: (opts: unknown) => mail.createTransport(opts) },
}));

import { sendEmail, emailLaneStatus } from "../integrations/email";

const originalFetch = globalThis.fetch;
let restoreMailLane: () => void;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // State the world: no lane at all, whatever this machine exports.
  restoreMailLane = clearMailLane();
  mail.sendMail.mockReset();
  mail.createTransport.mockClear();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreMailLane();
  vi.restoreAllMocks();
});

function configureSmtp() {
  process.env.SMTP_HOST = "smtp-relay.brevo.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "brevo-user";
  process.env.SMTP_PASS = "brevo-pass";
  process.env.SMTP_FROM = "Simpler Life 100 <electric.vortexz@gmail.com>";
}

/** SendGrid 202 ack, minimal fetch-like response (no global Response needed). */
function ack202(messageId = "sg-msg-1") {
  return {
    status: 202,
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === "x-message-id" ? messageId : null) },
    text: async () => "",
  } as unknown as Response;
}
function reject500() {
  return {
    status: 500,
    ok: false,
    headers: { get: () => null },
    text: async () => "invalid api key",
  } as unknown as Response;
}

describe("(a) a working lane wins — SMTP before SendGrid", () => {
  it("SMTP configured + SENDGRID_API_KEY present → SMTP is used and SendGrid is never called", async () => {
    configureSmtp();
    process.env.SENDGRID_API_KEY = "SG.test";
    mail.sendMail.mockResolvedValue({ messageId: "smtp-msg-1" });
    fetchMock.mockResolvedValue(ack202());

    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });

    expect(res.success).toBe(true);
    expect(res.isMock).toBe(false);
    expect(res.channel).toBe("smtp");
    expect(res.messageId).toBe("smtp-msg-1");
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled(); // SendGrid not consulted at all
    expect(res.attempts).toEqual([{ channel: "smtp", ok: true }]);
  });

  it("emailLaneStatus() reports the SMTP lane when both lanes are configured", () => {
    configureSmtp();
    process.env.SENDGRID_API_KEY = "SG.test";
    expect(emailLaneStatus()).toEqual({ configured: true, channel: "smtp" });
  });

  it("SendGrid is still used when it is the ONLY configured lane", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    fetchMock.mockResolvedValue(ack202("sg-only"));
    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    expect(res.success).toBe(true);
    expect(res.channel).toBe("sendgrid");
    expect(res.messageId).toBe("sg-only");
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});

describe("(b) a failing lane falls through instead of black-holing", () => {
  it("SMTP throws → SendGrid delivers, and the result names both lanes", async () => {
    configureSmtp();
    process.env.SENDGRID_API_KEY = "SG.test";
    mail.sendMail.mockRejectedValue(new Error("connection refused"));
    fetchMock.mockResolvedValue(ack202("sg-after-fallthrough"));

    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });

    // The message actually went out — through the fall-through lane.
    expect(res.success).toBe(true);
    expect(res.isMock).toBe(false);
    expect(res.channel).toBe("sendgrid");
    expect(res.messageId).toBe("sg-after-fallthrough");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // ...and the result says the first lane failed and why.
    expect(res.attempts).toEqual([
      { channel: "smtp", ok: false, error: expect.stringContaining("connection refused") },
      { channel: "sendgrid", ok: true },
    ]);
  });

  it("SendGrid fails and SMTP is not configured → failure result naming SendGrid (no fall-through lane to try)", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    fetchMock.mockResolvedValue(reject500());
    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    expect(res.success).toBe(false);
    expect(res.isMock).toBe(false);
    expect(res.channel).toBe("sendgrid");
    expect(res.error).toContain("SendGrid HTTP 500");
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});

describe("(c) nothing configured — the mock path is untouched", () => {
  it("no lane at all → mock, isMock:true, channel 'none', nothing dispatched", async () => {
    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    expect(res.success).toBe(true);
    expect(res.isMock).toBe(true);
    expect(res.channel).toBe("none");
    expect(res.messageId).toMatch(/^mock-/);
    expect(res.attempts).toEqual([]);
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(emailLaneStatus()).toEqual({ configured: false, channel: "none" });
  });

  it("a half-configured SMTP (host + user, no pass) is NOT a lane", async () => {
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    process.env.SMTP_USER = "brevo-user";
    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    expect(res.isMock).toBe(true);
    expect(res.channel).toBe("none");
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});

describe("(d) every configured lane fails → a failure result, never a mock success", () => {
  it("SMTP throws and SendGrid rejects → success:false, isMock:false, both lanes named", async () => {
    configureSmtp();
    process.env.SENDGRID_API_KEY = "SG.test";
    mail.sendMail.mockRejectedValue(new Error("smtp down"));
    fetchMock.mockResolvedValue(reject500());

    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });

    expect(res.success).toBe(false);
    expect(res.isMock).toBe(false); // a real provider WAS attempted
    expect(res.messageId).toBe("");
    expect(res.error).toContain("smtp");
    expect(res.error).toContain("smtp down");
    expect(res.error).toContain("sendgrid");
    expect(res.error).toContain("SendGrid HTTP 500");
    expect(res.attempts?.map((a) => [a.channel, a.ok])).toEqual([
      ["smtp", false],
      ["sendgrid", false],
    ]);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
