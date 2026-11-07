/**
 * buyer-confirmation.test.ts — slice 138 guard for the buyer's own email.
 *
 * The gap this closes: a purchase emailed ONLY the owner. The buyer paid and
 * heard nothing but Stripe's receipt. These are the unit-level guards on the
 * builder; the wired end-to-end path (webhook → one buyer email per session id,
 * queued on failure) is asserted in purchase-notify-wiring.test.ts.
 *
 * Truthfulness is a first-class assertion here: the email may state what was
 * bought, what was paid and how to get in — and nothing else.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_ORIGIN,
  buyerConfirmationEmailBody,
  buyerConfirmationSubject,
  formatAmountCents,
  normalizeSiteOrigin,
  setPasswordLink,
  signInLink,
} from "../lib/purchase-sales-events";

const BUYER = "buyer@example.com";

describe("set-password link — reuses the existing OTP flow, invents no token", () => {
  it("points at /set-password with the billing email prefilled", () => {
    const url = setPasswordLink(BUYER, "https://simplerlife100.cto.site");
    expect(url).toBe("https://simplerlife100.cto.site/set-password?email=buyer%40example.com");
  });

  it("encodes addresses that would otherwise break the query string", () => {
    const url = setPasswordLink("A+B@Example.COM", "https://example.com");
    expect(url).toBe("https://example.com/set-password?email=a%2Bb%40example.com");
  });

  it("normalizes a base URL to a bare origin and falls back when unusable", () => {
    expect(normalizeSiteOrigin("https://example.com/deep/path?x=1")).toBe("https://example.com");
    expect(normalizeSiteOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeSiteOrigin("not a url")).toBeNull();
    expect(normalizeSiteOrigin("")).toBeNull();
    expect(setPasswordLink(BUYER, "javascript:alert(1)")).toBe(
      `${DEFAULT_SITE_ORIGIN}/set-password?email=buyer%40example.com`,
    );
    expect(signInLink("https://example.com/anything")).toBe("https://example.com/login");
  });
});

describe("buyer confirmation email — the tier they bought and a way in", () => {
  const body = buyerConfirmationEmailBody({
    productName: "Growth Plan",
    amountCents: 59900,
    customerEmail: BUYER,
    setPasswordUrl: setPasswordLink(BUYER, "https://simplerlife100.cto.site"),
    signInUrl: signInLink("https://simplerlife100.cto.site"),
  });

  it("names the exact plan that was purchased", () => {
    expect(body).toBeTruthy();
    expect(body).toContain("Plan: Growth Plan");
  });

  it("states the amount actually paid", () => {
    expect(body).toContain("Amount paid: $599.00");
  });

  it("carries the signed-in path: set-password link plus sign-in link", () => {
    expect(body).toContain("https://simplerlife100.cto.site/set-password?email=buyer%40example.com");
    expect(body).toContain("https://simplerlife100.cto.site/login");
  });

  it("tells the buyer the one-time code expires, matching the real flow", () => {
    expect(body).toContain("6-digit code");
    expect(body).toContain("10 minutes");
  });

  it("makes no claim we cannot back: no account manager, no invented onboarding promise", () => {
    const lower = String(body).toLowerCase();
    for (const banned of [
      "account manager",
      "onboarding call",
      "within 24 hours",
      "guarantee",
      "dedicated team",
      "your ai",
      "deployed",
    ]) {
      expect(lower, `buyer email must not claim "${banned}"`).not.toContain(banned);
    }
  });

  it("is addressed to the buyer, not the owner", () => {
    expect(body).toContain(`Billing email: ${BUYER}`);
  });

  it("subject names the plan", () => {
    expect(buyerConfirmationSubject("Growth Plan")).toBe("Your Growth Plan — set your password and sign in");
  });
});

describe("slice 201 — the buyer is told the charge is MONTHLY", () => {
  const monthly = buyerConfirmationEmailBody({
    productName: "Growth Plan",
    amountCents: 59900,
    customerEmail: BUYER,
    setPasswordUrl: setPasswordLink(BUYER, "https://simplerlife100.cto.site"),
    billing: { interval: "month", nextPaymentDate: null },
  });

  it("says the payment is the first month of a monthly subscription, at the amount paid", () => {
    expect(monthly).toBeTruthy();
    expect(monthly).toContain("$599.00 per month");
    expect(monthly).toContain("first month of a monthly subscription");
    expect(monthly).toContain("renews every month at $599.00 until you cancel");
    // The amount paid is still stated — both are true.
    expect(monthly).toContain("Amount paid: $599.00");
  });

  it("says nothing about a next payment date Stripe did not supply", () => {
    expect(monthly).not.toContain("Next payment:");
  });

  it("names the next payment date when Stripe gave one", () => {
    const withDate = buyerConfirmationEmailBody({
      productName: "Growth Plan",
      amountCents: 59900,
      customerEmail: BUYER,
      setPasswordUrl: setPasswordLink(BUYER),
      billing: { interval: "month", nextPaymentDate: "2026-12-07" },
    });
    expect(withDate).toContain("Next payment: 2026-12-07");
  });

  it("does not claim recurrence for a one-time purchase", () => {
    const oneTime = buyerConfirmationEmailBody({
      productName: "AI Automation Package",
      amountCents: 5000,
      customerEmail: BUYER,
      setPasswordUrl: setPasswordLink(BUYER),
      billing: { interval: null },
    });
    expect(oneTime).toBeTruthy();
    expect(oneTime).not.toContain("per month");
    expect(oneTime).not.toContain("renews");
  });
});

describe("buyer confirmation — fail-closed inputs", () => {
  it("returns null without a recipient", () => {
    expect(
      buyerConfirmationEmailBody({
        productName: "Growth Plan",
        amountCents: 59900,
        customerEmail: "",
        setPasswordUrl: setPasswordLink(BUYER),
      }),
    ).toBeNull();
  });

  it("returns null without a product name", () => {
    expect(
      buyerConfirmationEmailBody({
        productName: "",
        amountCents: 59900,
        customerEmail: BUYER,
        setPasswordUrl: setPasswordLink(BUYER),
      }),
    ).toBeNull();
  });

  it("returns null without a set-password link", () => {
    expect(
      buyerConfirmationEmailBody({
        productName: "Growth Plan",
        amountCents: 59900,
        customerEmail: BUYER,
        setPasswordUrl: "",
      }),
    ).toBeNull();
  });

  it("formats cents the way the receipt does", () => {
    expect(formatAmountCents(59900)).toBe("599.00");
    expect(formatAmountCents(0)).toBe("0.00");
  });
});
