import { describe, it, expect, vi, afterEach } from "vitest";
import { executeProviderAction } from "../lib/provider-api";

describe("unknown provider write safety", () => {
  afterEach(() => vi.restoreAllMocks());
  it("fails closed without network for unknown providers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await executeProviderAction("unknown-provider", "Unknown", { accessToken: "secret-token" }, { action: "create" });
    expect(result.status).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
