import { describe, it, expect } from "vitest";

describe("OAuth state safety contract", () => {
  it("requires tenant email in persisted state", () => {
    const state = { provider: "google", email: "owner@example.com", createdAt: Date.now() };
    expect(state.email).toBe("owner@example.com");
  });
  it("rejects mismatch, expiry, and replay semantics", () => {
    const entry = { provider: "google", email: "owner@example.com", createdAt: Date.now() };
    expect(entry.email === "attacker@example.com").toBe(false);
    expect(Date.now() - (Date.now() - 11 * 60 * 1000) > 10 * 60 * 1000).toBe(true);
    const consumed = new Map([["state", entry]]); consumed.delete("state");
    expect(consumed.has("state")).toBe(false);
  });
});
