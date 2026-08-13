import { describe, expect, it } from "vitest";
import { createExcelClient } from "../integrations/providers/microsoft-excel/client";

function makeClient() {
  return createExcelClient({ accessToken: "tok-1", refreshToken: "rt-1", expiresAt: Date.now() / 1000 + 3600 } as never);
}

describe("Microsoft Excel client (Graph)", () => {
  it("uses Bearer token and the canonical graph host", () => {
    const c = makeClient();
    expect((c as any).headers["Authorization"]).toBe("Bearer tok-1");
    expect((c as any).client.baseUrl).toBe("https://graph.microsoft.com/v1.0");
  });

  it("createExcelWorkbook builds a valid xlsx and PUTs to OneDrive", async () => {
    const c = makeClient();
    let captured: { url: string; body: Uint8Array; headers: Record<string, string> } | undefined;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      captured = { url, body: opts.body, headers: opts.headers };
      return { ok: true, json: async () => ({ id: "wb-1", name: "Ledger.xlsx" }) };
    };
    const r = await c.createExcelWorkbook("Ledger", [
      ["Name", "Amount"],
      ["Widget", 42],
    ]);
    expect(captured!.url).toBe("https://graph.microsoft.com/v1.0/me/drive/root/children/Ledger.xlsx:/content");
    expect(captured!.headers["Content-Type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const bodyText = new TextDecoder().decode(captured!.body);
    expect(bodyText).toContain("PK");
    expect(bodyText).toContain("inlineStr");
    expect(r.id).toBe("wb-1");
    delete (globalThis as any).fetch;
  });

  it("createExcelWorkbook fails closed on empty name", async () => {
    const c = makeClient();
    await expect(c.createExcelWorkbook("", [["a"]])).rejects.toThrow(/requires a name/);
  });

  it("readWorkbookRange GETs the workbook API values endpoint", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: [["a", "b"], ["c", "d"]] };
    };
    const values = await c.readWorkbookRange("wb-1", "Sheet1!A1:B2");
    expect(calls[0]).toContain("/me/drive/items/wb-1/workbook/worksheets/Sheet1/range(address='Sheet1!A1:B2')/values");
    expect(values.length).toBe(2);
  });

  it("readWorkbookRange fails closed on empty id", async () => {
    const c = makeClient();
    await expect(c.readWorkbookRange("")).rejects.toThrow(/requires an id/);
  });

  it("writeWorkbookRange PATCHes values to the workbook API", async () => {
    const c = makeClient();
    const calls: Array<{ path: string; body: any }> = [];
    (c as any).client.patch = async (path: string, body: any) => {
      calls.push({ path, body });
      return { data: [["x"]] };
    };
    await c.writeWorkbookRange("wb-1", "Sheet1!A1", [["x"]]);
    expect(calls[0].path).toContain("/me/drive/items/wb-1/workbook/worksheets/Sheet1/range(address='Sheet1!A1')/values");
    expect(calls[0].body).toEqual([["x"]]);
  });

  it("writeWorkbookRange fails closed on empty values", async () => {
    const c = makeClient();
    await expect(c.writeWorkbookRange("wb-1", "A1", [])).rejects.toThrow(/non-empty values/);
  });
});
