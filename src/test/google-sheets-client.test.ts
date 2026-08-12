import { describe, expect, it } from "vitest";
import { HttpClientError } from "../integrations/framework/client";
import { createGSheetsClient } from "../integrations/providers/google-sheets/client";

function makeClient() {
  return createGSheetsClient({ accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 } as never);
}

describe("Google Sheets client (create/read/write)", () => {
  it("uses Bearer token and canonical host", () => {
    const c = makeClient();
    const headers = (c as any).headers;
    expect(headers["Authorization"]).toBe("Bearer tok-1");
    expect((c as any).client.baseUrl).toBe("https://sheets.googleapis.com/v4");
  });

  it("createSpreadsheet posts title and tabs", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; body: any }> = [];
    (c as any).client.post = async (path: string, body: any) => {
      calls.push({ path, body });
      return { data: { spreadsheetId: "s-1", properties: { title: "Ledger" } } };
    };
    const s = await c.createSpreadsheet("Ledger", ["Sheet1", "Sheet2"]);
    expect(s.spreadsheetId).toBe("s-1");
    expect(calls[0].path).toBe("/spreadsheets");
    expect(calls[0].body.properties.title).toBe("Ledger");
    expect(calls[0].body.sheets).toHaveLength(2);
  });

  it("readRange hits values/{range} and returns rows", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { values: [["a", "b"], ["c", "d"]] } };
    };
    const rows = await c.readRange("s-1", "Sheet1!A1:D50");
    expect(rows).toEqual([["a", "b"], ["c", "d"]]);
    expect(calls[0]).toContain("/spreadsheets/s-1/values/Sheet1!A1%3AD50");
  });

  it("readRange requires a range (fail closed)", async () => {
    const c = makeClient();
    await expect(c.readRange("s-1", "")).rejects.toThrow("requires a range");
  });

  it("writeRange PUTs values with valueInputOption=RAW", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; body: any }> = [];
    (c as any).client.put = async (path: string, body: any) => {
      calls.push({ path, body });
      return { data: { updatedRange: "Sheet1!A1:B2", updatedCells: 4 } };
    };
    const r = await c.writeRange("s-1", "Sheet1!A1", [["a"], ["b"]]);
    expect(r.updatedCells).toBe(4);
    expect(calls[0].path).toContain("valueInputOption=RAW");
    expect(calls[0].body.majorDimension).toBe("ROWS");
  });

  it("appendRows POSTs to :append", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.post = async (path: string) => {
      calls.push(path);
      return { data: { updates: { updatedRows: 2 } } };
    };
    await c.appendRows("s-1", "Sheet1!A1", [["x", "y"]]);
    expect(calls[0]).toContain(":append?valueInputOption=RAW");
    await expect(c.appendRows("s-1", "Sheet1!A1", [])).rejects.toThrow("non-empty values");
  });

  it("healthCheck probes a bogus spreadsheet id and reports token validity", async () => {
    const c = makeClient();
    const paths: string[] = [];
    (c as any).client.get = async (path: string) => {
      paths.push(path);
      throw new HttpClientError("GET probe failed (404)", 404, "Not Found");
    };
    expect(await c.healthCheck()).toBe(true); // 404 on a bogus id = auth OK
    expect(paths[0]).toMatch(/^\/spreadsheets\//);
    (c as any).client.get = async () => {
      throw new HttpClientError("GET probe failed (401)", 401, "Unauthorized");
    };
    expect(await c.healthCheck()).toBe(false); // rejected token = fail
    (c as any).client.get = async () => {
      throw new HttpClientError("GET probe failed (403)", 403, "Forbidden");
    };
    expect(await c.healthCheck()).toBe(false);
    (c as any).client.get = async () => {
      throw new HttpClientError("GET probe failed (400)", 400, "Bad Request");
    };
    expect(await c.healthCheck()).toBe(true); // malformed id = auth OK
    (c as any).client.get = async () => {
      throw new Error("network down");
    };
    expect(await c.healthCheck()).toBe(false);
  });

  it("healthCheck refreshes an expired token before probing (refresh path)", async () => {
    const c = createGSheetsClient({
      accessToken: "tok-expired",
      refreshToken: "rt-1",
      expiresAt: Date.now() / 1000 - 60,
    } as never);
    let refreshed = false;
    const seenHeaders: any[] = [];
    (c as any).ensureToken = async () => {
      refreshed = true;
      (c as any).tokens = { accessToken: "tok-fresh", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 };
    };
    (c as any).client.get = async (_path: string, headers: any) => {
      seenHeaders.push(headers);
      throw new HttpClientError("GET probe failed (404)", 404, "Not Found");
    };
    expect(await c.healthCheck()).toBe(true);
    expect(refreshed).toBe(true);
    expect(seenHeaders[0]["Authorization"]).toBe("Bearer tok-fresh");
  });
});
