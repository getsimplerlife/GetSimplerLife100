import { describe, it, expect } from "vitest";
import { validateOAuthState, consumeOAuthState, usableOAuthToken } from "../lib/oauth-safety";
describe("OAuth callback and persistence safety", () => {
 it("rejects missing, mismatched, and expired state", () => { const now=1_000_000; expect(validateOAuthState(undefined,"a",now)).toBe("invalid"); expect(validateOAuthState({provider:"x",email:"b",createdAt:now},"a",now)).toBe("mismatch"); expect(validateOAuthState({provider:"x",email:"a",createdAt:now-600001},"a",now)).toBe("expired"); });
 it("consumes state once to prevent replay", () => { const states:any={s:{provider:"x",email:"a",createdAt:Date.now()}}; expect(consumeOAuthState(states,"s")).toBeTruthy(); expect(consumeOAuthState(states,"s")).toBeUndefined(); });
 it("requires a usable token before Connected persistence", () => { expect(usableOAuthToken({})).toBe(false); expect(usableOAuthToken({accessToken:"short"})).toBe(false); expect(usableOAuthToken({accessToken:"valid-token-123"})).toBe(true); });
});
