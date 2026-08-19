/**
 * email-sendgrid.test.ts — #233: sendEmail() must use SendGrid (HTTP POST)
 * when SENDGRID_API_KEY is set, BEFORE falling back to SMTP/mock, so the
 * owner reconnect alerts actually deliver (live env has SENDGRID_API_KEY +
 * SMTP_FROM, no SMTP_*).
 *
 * Fail-closed rule under test: ONLY HTTP 202 counts as delivered. Any other
 * status or a network throw returns { success: false, error } — never a
 * success, so the #231 6h throttle cannot suppress a real alert.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmail } from "../integrations/email";

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllEnvs();
  // Isolate from any real env (SendGrid + SMTP unset → mock fallback by default).
  delete process.env.SENDGRID_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Minimal fetch-like response (no reliance on global Response in test env). */
function fakeResponse(status: number, opts: { headers?: Record<string, string>; text?: string } = {}) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers ?? {})) lower[k.toLowerCase()] = v;
  return {
    status,
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
    text: async () => opts.text ?? "",
  };
}

describe("sendEmail with SENDGRID_API_KEY set (no SMTP)", () => {
  it("returns success + isMock:false + messageId on HTTP 202", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.SMTP_FROM = "electric.vortexz@gmail.com";
    fetchMock.mockResolvedValue(fakeResponse(202, { headers: { "X-Message-Id": "sg-msg-1" } }));

    const res = await sendEmail({
      to: ["mathewortiz97@gmail.com"],
      subject: "⚠️ xero connection needs reauthorization",
      text: "Simpler Life 100 lost its xero connection…",
      html: "<p>reconnect now</p>",
    });

    expect(res.success).toBe(true);
    expect(res.isMock).toBe(false);
    expect(res.messageId).toBe("sg-msg-1");
    expect(res.recipient).toEqual(["mathewortiz97@gmail.com"]);

    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer SG.test");
    const body = JSON.parse(init.body);
    expect(body.personalizations).toEqual([{ to: [{ email: "mathewortiz97@gmail.com" }] }]);
    expect(body.from).toEqual({ email: "electric.vortexz@gmail.com" });
    expect(body.subject).toBe("⚠️ xero connection needs reauthorization");
    expect(body.content).toContainEqual({ type: "text/plain", value: "Simpler Life 100 lost its xero connection…" });
    expect(body.content).toContainEqual({ type: "text/html", value: "<p>reconnect now</p>" });
  });

  it("synthesizes a messageId when SendGrid omits X-Message-Id", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    fetchMock.mockResolvedValue(fakeResponse(202));
    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    expect(res.success).toBe(true);
    expect(res.isMock).toBe(false);
    expect(res.messageId).toMatch(/^sg-/);
  });

  it("parses a 'Name <addr>' SMTP_FROM into SendGrid from object", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.SMTP_FROM = "Simpler Life 100 <notifications@simplerlife100.ctonew.app>";
    fetchMock.mockResolvedValue(fakeResponse(202));
    await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    const [, init] = fetchMock.mock.calls[0] as [string, any];
    const body = JSON.parse(init.body);
    expect(body.from).toEqual({ email: "notifications@simplerlife100.ctonew.app", name: "Simpler Life 100" });
  });

  it("fails closed on 4xx — returns success:false + error, never marks sent", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    fetchMock.mockResolvedValue(fakeResponse(401, { text: "unauthorized" }));
    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    expect(res.success).toBe(false);
    expect(res.isMock).toBe(false);
    expect(res.error).toContain("401");
    expect(res.error).toContain("unauthorized");
  });

  it("fails closed when the network call throws", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    fetchMock.mockRejectedValue(new Error("network down"));
    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    expect(res.success).toBe(false);
    expect(res.isMock).toBe(false);
    expect(res.error).toContain("network down");
  });
});

describe("sendEmail precedence", () => {
  it("uses SendGrid when BOTH SENDGRID_API_KEY and SMTP_* are set (SendGrid first)", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    fetchMock.mockResolvedValue(fakeResponse(202));
    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    expect(res.success).toBe(true);
    expect(res.isMock).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // SendGrid, not nodemailer
  });

  it("falls back to mock when neither SendGrid nor SMTP is configured (no fetch, isMock:true)", async () => {
    const res = await sendEmail({ to: "owner@x.com", subject: "s", text: "b" });
    expect(res.success).toBe(true);
    expect(res.isMock).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
