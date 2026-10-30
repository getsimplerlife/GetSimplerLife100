/**
 * after-purchase.test.tsx — slice 138 guard for /after-purchase.
 *
 * The page used to be a static "what happens after you buy" timeline: a buyer
 * who had just paid landed on marketing copy with no way in. It is now the
 * doorway, and the two states that matter are:
 *
 *   purchased     — we CONFIRMED the session (our webhook ledger or a live
 *                   Stripe lookup), so we show the plan, the amount, and the
 *                   two actions: check your email / sign in.
 *   not purchased — no session id, or a session we could not confirm. The page
 *                   must never claim "payment succeeded". It renders the
 *                   honest "here's how you get in" doorway instead.
 *
 * Both are asserted by RENDERING the presentational view, not by grepping copy.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { afterPurchaseView } from "../lib/after-purchase";
import { AfterPurchaseView } from "../lazy/after-purchase.page";

const CONFIRMED = {
  found: true,
  verified: true,
  source: "ledger",
  productName: "Growth Plan",
  amountCents: 59900,
};

describe("afterPurchaseView — purchased state", () => {
  const view = afterPurchaseView({ sessionId: "cs_test_abc123", status: CONFIRMED });

  it("is the purchased state and shows the real plan + amount", () => {
    expect(view.state).toBe("purchased");
    expect(view.receipt).toEqual([
      { label: "Plan", value: "Growth Plan" },
      { label: "Amount paid", value: "$599.00" },
    ]);
  });

  it("offers exactly the two actions the brief calls for", () => {
    expect(view.actions.map((a) => a.href)).toEqual(["/login", "/set-password"]);
    expect(view.actions[0].primary).toBe(true);
  });

  it("does not claim the email went out when the send actually failed", () => {
    const failed = afterPurchaseView({
      sessionId: "cs_test_abc123",
      status: { ...CONFIRMED, emailSent: false },
    });
    expect(failed.state).toBe("purchased");
    expect(failed.lead.toLowerCase()).toContain("could not confirm");
    // Still a doorway — the receipt and both actions survive.
    expect(failed.receipt.length).toBe(2);
    expect(failed.actions.map((a) => a.href)).toEqual(["/login", "/set-password"]);
  });

  it("tells the buyer to check their email for the sign-in link", () => {
    expect(view.actionTitle).toBe("Check your email for your sign-in link");
    expect(view.lead.toLowerCase()).toContain("check your email");
  });
});

describe("afterPurchaseView — not purchased states stay honest", () => {
  it("no session id → visitor state, no payment claim, no receipt", () => {
    const view = afterPurchaseView({ sessionId: "", status: null });
    expect(view.state).toBe("visitor");
    expect(view.receipt).toEqual([]);
    expect(view.heading.toLowerCase()).not.toContain("payment received");
    expect(view.badge.toLowerCase()).not.toContain("payment received");
    // Still a doorway: sign in and set-password are both offered.
    expect(view.actions.map((a) => a.href)).toContain("/login");
    expect(view.actions.map((a) => a.href)).toContain("/set-password");
  });

  it("an unconfirmed session id → confirming state, never a receipt", () => {
    const view = afterPurchaseView({ sessionId: "cs_test_abc123", status: { found: false } });
    expect(view.state).toBe("confirming");
    expect(view.receipt).toEqual([]);
    expect(view.heading.toLowerCase()).not.toContain("received");
    expect(view.notes.join(" ").toLowerCase()).toContain("only show a receipt");
  });

  it("a failed lookup (null status) is treated as unconfirmed, not success", () => {
    const view = afterPurchaseView({ sessionId: "cs_test_abc123", status: null, checking: false });
    expect(view.state).toBe("confirming");
    expect(view.receipt).toEqual([]);
  });
});

describe("/after-purchase renders", () => {
  it("purchased state shows the plan, the amount, and both actions", () => {
    render(<AfterPurchaseView view={afterPurchaseView({ sessionId: "cs_test_abc123", status: CONFIRMED })} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Growth Plan is on your account.");
    expect(screen.getByText("Growth Plan")).toBeTruthy();
    expect(screen.getByText("$599.00")).toBeTruthy();
    expect(screen.getByText("Check your email for your sign-in link")).toBeTruthy();
    const signIn = screen.getByText("Sign in").closest("a");
    expect(signIn?.getAttribute("href")).toBe("/login");
    const setPassword = screen.getByText("Set or reset your password").closest("a");
    expect(setPassword?.getAttribute("href")).toBe("/set-password");
    // Honest receipt header only when we really confirmed a purchase.
    expect(screen.getByLabelText("Your purchase")).toBeTruthy();
  });

  it("visitor state claims no payment and still offers both actions", () => {
    render(<AfterPurchaseView view={afterPurchaseView({ sessionId: "", status: null })} />);
    const body = document.body.textContent || "";
    expect(body.toLowerCase()).not.toContain("payment received");
    expect(body.toLowerCase()).not.toContain("amount paid");
    expect(screen.queryByLabelText("Your purchase")).toBeNull();
    expect(screen.getByText("How you get in")).toBeTruthy();
    expect(screen.getByText("Sign in").closest("a")?.getAttribute("href")).toBe("/login");
    expect(screen.getByText("Set or reset your password").closest("a")?.getAttribute("href")).toBe(
      "/set-password",
    );
  });

  it("unconfirmed state renders the honest confirming copy, not a receipt", () => {
    render(
      <AfterPurchaseView view={afterPurchaseView({ sessionId: "cs_test_abc123", status: { found: false } })} />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("We're confirming your payment.");
    expect(screen.queryByLabelText("Your purchase")).toBeNull();
  });
});

describe("source-level: the page actually asks the server", () => {
  const page = readFileSync("src/lazy/after-purchase.page.tsx", "utf8");

  it("reads session_id from the return URL and calls the purchase-status endpoint", () => {
    expect(page).toContain('params.get("session_id")');
    expect(page).toContain("/api/purchase/status?session_id=");
  });

  it("routes every state through the shared view model (no copy drift)", () => {
    expect(page).toContain("afterPurchaseView(");
    expect(page).toContain("AfterPurchaseView");
  });
});
