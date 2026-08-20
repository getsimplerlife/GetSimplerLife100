import { describe, it, expect } from "vitest";
import {
  buildOwnerSaleEvent,
  ownerSaleEmailBody,
  provisionAccountForPurchase,
  formatAmountCents,
} from "../lib/purchase-sales-events";

describe("purchase-sales-events — shared on-purchase-completed handler", () => {
  describe("owner sale notification", () => {
    it("builds a durable owner sale event for a real purchase (product, amount, customer)", () => {
      const evt = buildOwnerSaleEvent({
        productName: "Starter Plan",
        opportunityType: "plan",
        amountCents: 750000,
        customerEmail: "Acme@Example.com",
        provisioned: "created",
      });
      expect(evt).not.toBeNull();
      expect(evt!.customerEmail).toBe("acme@example.com"); // normalized
      expect(evt!.productName).toBe("Starter Plan");
      expect(evt!.amountCents).toBe(750000);
      expect(evt!.at).toBeTruthy();
    });

    it("fails closed (no event) when there is no customer email — never invents a notification", () => {
      expect(
        buildOwnerSaleEvent({
          productName: "Starter Plan",
          opportunityType: "plan",
          amountCents: 750000,
          customerEmail: "",
          provisioned: "created",
        }),
      ).toBeNull();
    });

    it("email body contains product, amount, and buyer", () => {
      const evt = buildOwnerSaleEvent({
        productName: "ERP Connection Pack",
        opportunityType: "erp-pack",
        amountCents: 350000,
        customerEmail: "buyer@example.com",
        provisioned: "upgraded",
      })!;
      const body = ownerSaleEmailBody(evt);
      expect(body).toContain("ERP Connection Pack");
      expect(body).toContain("$3500.00");
      expect(body).toContain("buyer@example.com");
      expect(body).toContain("upgraded (existing)");
    });

    it("formats amount cents correctly", () => {
      expect(formatAmountCents(750000)).toBe("7500.00");
      expect(formatAmountCents(500)).toBe("5.00");
      expect(formatAmountCents(0)).toBe("0.00");
    });
  });

  describe("account provisioning/upgrade (account-creation-on-purchase)", () => {
    it("creates a new account for the purchase email when none exists (no password, seeded source)", () => {
      const users = {};
      const { users: next, outcome } = provisionAccountForPurchase(users, "newbuyer@example.com", {
        tier: "starter",
      });
      expect(outcome).toBe("created");
      const u = next["newbuyer@example.com"];
      expect(u).toBeTruthy();
      expect(u.email).toBe("newbuyer@example.com");
      expect(u.source).toBe("purchase");
      expect(u.purchased).toBe(true);
      expect(u.entitlements.tier).toBe("starter");
      expect(u.password).toBeUndefined(); // customer sets via /api/set-password
      expect(users["newbuyer@example.com"]).toBeUndefined(); // original untouched (new object)
    });

    it("upgrades an existing account WITHOUT duplicating or overwriting the password/login", () => {
      const users = {
        "existing@example.com": {
          email: "existing@example.com",
          password: "letmein-hashed-BC:xxxxx",
          role: "user",
          createdAt: 123456,
        },
      };
      const { users: next, outcome } = provisionAccountForPurchase(users, "Existing@Example.com", {
        tier: "enterprise",
      });
      expect(outcome).toBe("upgraded");
      expect(Object.keys(next)).toHaveLength(1); // no duplicate row
      const u = next["existing@example.com"];
      expect(u.password).toBe("letmein-hashed-BC:xxxxx"); // login preserved
      expect(u.role).toBe("user");
      expect(u.createdAt).toBe(123456);
      expect(u.entitlements.tier).toBe("enterprise");
      expect(u.purchased).toBe(true);
    });

    it("fails closed: no email → no account provisioning and no mutation", () => {
      const users = { "someone@example.com": { email: "someone@example.com" } };
      const { users: next, outcome } = provisionAccountForPurchase(users, "   ");
      expect(outcome).toBe("none");
      expect(next).toBe(users);
    });
  });
});
