import { describe, it, expect, vi, afterEach } from "vitest";
import { queryGoogleSheets } from "../lib/provider-api";

describe("Google Sheets read-only connection", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fails closed without a token, spreadsheet ID, or range without network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const missing = await queryGoogleSheets({});
    const missingId = await queryGoogleSheets({ accessToken: "token", range: "Sheet1!A1:B2" });
    const missingRange = await queryGoogleSheets({ accessToken: "token", spreadsheetId: "valid_sheet_id_123", });
    expect(missing.status).toBe("auth_failed");
    expect(missingId.status).toBe("auth_failed");
    expect(missingRange.status).toBe("auth_failed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed range and never makes a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await queryGoogleSheets({ accessToken: "token", spreadsheetId: "valid_sheet_id_123", range: "https://evil.example/read" });
    expect(result.status).toBe("auth_failed");
    expect(result.error).toMatch(/range/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads only the explicit Google Sheets host and configured range", async () => {
    const response = new Response(JSON.stringify({ values: [["marker", "value"], ["synthetic", "read-only"]] }), { status: 200, headers: { "content-type": "application/json" } });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const result = await queryGoogleSheets({ accessToken: "token", spreadsheetId: "valid_sheet_id_123", range: "Synthetic Data!A1:B2" });
    expect(result.status).toBe("ok");
    expect(result.recordsFound).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://sheets.googleapis.com/v4/spreadsheets/valid_sheet_id_123/values/Synthetic%20Data!A1%3AB2");
    expect((init as RequestInit).method).toBeUndefined();
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token", Accept: "application/json" });
  });

  it("reports unauthorized reads without exposing credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const result = await queryGoogleSheets({ accessToken: "secret-token", spreadsheetId: "valid_sheet_id_123", range: "Sheet1!A1:B2" });
    expect(result.status).toBe("auth_failed");
    expect(result.error).toBe("Invalid token");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
