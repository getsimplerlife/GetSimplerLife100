/**
 * portal-primitives-guard.test.ts — slice 135 shared view-layer contract.
 *
 * The four new portal pages (forms / tables / dashboards / webhooks) share one
 * helper module. This file pins:
 *
 *   - the 401 → "signed out" rule (an unauthenticated read is NEVER data),
 *   - client paging that cannot invent a page,
 *   - bar geometry that cannot invent a chart,
 *   - the row-editor's fail-closed conversion into the gated write payload,
 *   - NO DRIFT between the field-type lists the forms/tables routers accept and
 *     the lists the portal offers (a mismatch would fail the suite, not the
 *     customer's submit).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  authedJson,
  barWidths,
  buildRowData,
  cellText,
  formatNumber,
  pageSlice,
  splitList,
  FORM_FIELD_TYPES,
  TABLE_FIELD_TYPES,
} from "../lib/portal-primitives";
import { VALID_TABLE_TYPES } from "../native/tables/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response),
  );
}

describe("authedJson — a 401 is a signed-out state, never empty data", () => {
  it("401 → { ok:false, signedOut:true } and no data field", async () => {
    stubFetch(401, { error: "Unauthorized" });
    const res = await authedJson<{ forms: unknown[] }>("/api/native/forms");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.signedOut).toBe(true);
      expect(res.error).toContain("session");
    }
  });

  it("a 400 carries the server's own message", async () => {
    stubFetch(400, { error: "name is required" });
    const res = await authedJson("/api/native/tables");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.signedOut).toBe(false);
      expect(res.error).toBe("name is required");
    }
  });

  it("2xx unwraps the { data } envelope", async () => {
    stubFetch(200, { data: { tables: [{ id: "tbl_1" }] } });
    const res = await authedJson<{ tables: { id: string }[] }>("/api/native/tables");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.tables[0]?.id).toBe("tbl_1");
  });

  it("a network failure is an error, not a signed-out or empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const res = await authedJson("/api/native/dashboard");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.signedOut).toBe(false);
      expect(res.error).toBe("offline");
    }
  });
});

describe("pageSlice — client paging cannot invent a page", () => {
  const items = Array.from({ length: 53 }, (_, i) => i);

  it("pages a real list and reports true bounds", () => {
    const first = pageSlice(items, 1, 25);
    expect(first.rows.length).toBe(25);
    expect(first.page).toBe(1);
    expect(first.pageCount).toBe(3);
    expect(first.from).toBe(1);
    expect(first.to).toBe(25);
    const last = pageSlice(items, 3, 25);
    expect(last.rows.length).toBe(3);
    expect(last.from).toBe(51);
    expect(last.to).toBe(53);
  });

  it("clamps out-of-range and non-numeric pages to a real page", () => {
    expect(pageSlice(items, 99, 25).page).toBe(3);
    expect(pageSlice(items, 0, 25).page).toBe(1);
    expect(pageSlice(items, Number.NaN, 25).page).toBe(1);
  });

  it("an empty list is one empty page, not a fake row", () => {
    const empty = pageSlice([], 1, 25);
    expect(empty.rows).toEqual([]);
    expect(empty.pageCount).toBe(1);
    expect(empty.from).toBe(0);
    expect(empty.to).toBe(0);
  });
});

describe("barWidths — no invented chart", () => {
  it("scales to the largest absolute value", () => {
    expect(barWidths([10, 5, 0])).toEqual([100, 50, 0]);
    expect(barWidths([-10, 5])).toEqual([100, 50]);
  });
  it("an all-zero series draws nothing", () => {
    expect(barWidths([0, 0])).toEqual([]);
    expect(barWidths([])).toEqual([]);
  });
  it("non-finite values are treated as zero, never as a bar", () => {
    expect(barWidths([Number.NaN, 4])).toEqual([0, 100]);
  });
});

describe("buildRowData — fail-closed row editor", () => {
  const fields = [
    { key: "name", type: "text", required: true },
    { key: "amount", type: "number" },
    { key: "active", type: "boolean" },
    { key: "meta", type: "json" },
  ];

  it("omits empty optional values instead of sending empty strings", () => {
    const out = buildRowData(fields, { name: "Acme", amount: "", active: "", meta: "" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data).toEqual({ name: "Acme" });
  });

  it("rejects a missing required field before any request", () => {
    const out = buildRowData(fields, { name: "   " });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("required");
  });

  it("coerces numbers/booleans and parses JSON", () => {
    const out = buildRowData(fields, { name: "Acme", amount: "12.5", active: "false", meta: '{"a":1}' });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data).toEqual({ name: "Acme", amount: 12.5, active: false, meta: { a: 1 } });
  });

  it("rejects a non-numeric number and invalid JSON", () => {
    const badNumber = buildRowData(fields, { name: "Acme", amount: "twelve" });
    expect(badNumber.ok).toBe(false);
    const badJson = buildRowData(fields, { name: "Acme", meta: "{oops" });
    expect(badJson.ok).toBe(false);
  });
});

describe("small formatters stay literal", () => {
  it("cellText never renders [object Object]", () => {
    expect(cellText(null)).toBe("");
    expect(cellText("x")).toBe("x");
    expect(cellText(3)).toBe("3");
    expect(cellText(["a", "b"])).toBe("a, b");
    expect(cellText({ a: 1 })).toBe('{"a":1}');
  });
  it("formatNumber refuses to invent a number", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });
  it("splitList trims, de-dupes and drops empties", () => {
    expect(splitList(" a, b ,a,, ")).toEqual(["a", "b"]);
  });
});

describe("no drift between the portal's field lists and the server's", () => {
  it("table field types match VALID_TABLE_TYPES exactly", () => {
    expect([...TABLE_FIELD_TYPES]).toEqual([...VALID_TABLE_TYPES]);
  });

  it("form field types match the forms router's accepted TYPES", () => {
    const src = readFileSync("src/native/forms/router.ts", "utf8");
    const line = src.split("\n").find((l) => l.includes('const TYPES = ['));
    expect(line).toBeTruthy();
    const accepted = (line!.match(/"([a-z]+)"/g) ?? []).map((s) => s.replace(/"/g, ""));
    expect([...FORM_FIELD_TYPES].sort()).toEqual([...accepted].sort());
  });
});
