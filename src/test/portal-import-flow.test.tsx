/**
 * portal-import-flow.test.tsx — P2-2 PORTAL-ONLY unit tests for the import
 * composer upgrade helpers (run-status timeline, bulk mapping payload, mapping
 * review samples) plus an SSR honesty guard for the pristine (empty) state.
 * Zero server/native asserts — pure view-layer logic.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import PortalImportIndexPage, {
  HUMAN_OP,
  stageOf,
  runOutcomeLine,
  firstSample,
  bulkMappingPayload,
} from "../lazy/portal.import.index.page";

describe("run-status timeline helpers (honest ledger → stage state)", () => {
  it("labels every core ledger op with a human stage name", () => {
    expect(HUMAN_OP.pullImportData).toBe("Pull");
    expect(HUMAN_OP.mapImportFields).toBe("Map");
    expect(HUMAN_OP.commitImport).toBe("Commit");
    expect(HUMAN_OP.updateImport).toBe("Update");
    expect(HUMAN_OP.deleteImport).toBe("Delete");
    expect(HUMAN_OP.createImport).toBe("Create");
  });

  it("classifies ops into the pull|map|commit|other stage families", () => {
    expect(stageOf("pullImportData")).toBe("pull");
    expect(stageOf("mapImportFields")).toBe("map");
    expect(stageOf("commitImport")).toBe("commit");
    expect(stageOf("updateImport")).toBe("other");
    expect(stageOf(undefined)).toBe("other");
  });

  it("builds outcome lines only from real ledger counts", () => {
    expect(runOutcomeLine({ pulled: 3 })).toBe("3 pulled");
    expect(runOutcomeLine({ committed: 10, failed: 1 })).toBe("10 committed · 1 failed");
    expect(runOutcomeLine({ pulled: 0, mapped: 0, skipped: 0, committed: 0, failed: 0 })).toBe("recorded with no row counts");
    expect(runOutcomeLine({})).toBe("recorded with no row counts");
    expect(runOutcomeLine({ pulled: 1, mapped: 2, skipped: 0, committed: 4, failed: 9 })).toBe("1 pulled · 2 mapped · 4 committed · 9 failed");
  });
});

describe("mapping review sample picker", () => {
  const rows = [
    { name: "", email: null, city: "Boston", tags: ["a", "b"] },
    { name: "Acme", email: "", city: "", tags: ["c"] },
  ];

  it("returns the first non-empty scalar sample for a field", () => {
    expect(firstSample(rows, "name")).toBe("Acme");
    expect(firstSample(rows, "city")).toBe("Boston");
    expect(firstSample(rows, "email")).toBeNull();
  });

  it("serializes object samples with JSON.stringify", () => {
    expect(firstSample(rows, "tags")).toBe('["a","b"]');
  });

  it("returns null when no row has a value", () => {
    expect(firstSample(rows, "nonexistent")).toBeNull();
    expect(firstSample([], "name")).toBeNull();
  });

  it("truncates long samples", () => {
    const long = Array(80).fill("x").join("");
    expect(firstSample([{ f: long }], "f")).toBe(`${long.slice(0, 57)}…`);
  });
});

describe("bulk mapping payload builder (one gated request for many fields)", () => {
  it("keeps only source fields with a non-empty target and trims whitespace", () => {
    const out = bulkMappingPayload({ name: " contact_name ", email: "", phone: "phone" });
    expect(out).toEqual([
      { sourceField: "name", targetField: "contact_name" },
      { sourceField: "phone", targetField: "phone" },
    ]);
  });

  it("de-duplicates by source field (last assignment wins)", () => {
    const draft: Record<string, string> = {};
    draft.name = "a";
    draft.name = "b"; // last assignment wins — same source field
    expect(bulkMappingPayload(draft)).toEqual([{ sourceField: "name", targetField: "b" }]);
  });

  it("returns an empty array when nothing is mapped", () => {
    expect(bulkMappingPayload({})).toEqual([]);
    expect(bulkMappingPayload({ a: "" })).toEqual([]);
  });
});

describe("import page pristine-state SSR honesty", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the empty state and the pinned framing — and NO fabricated timeline", () => {
    const html = renderToString(createElement(PortalImportIndexPage));
    // Pinned honest framing (shared with the 6.6 copy-sweep).
    expect(html).toContain("No imports yet");
    expect(html).toContain("Import &amp; migration");
    expect(html).toContain("Connect your existing tools to bring your data in");
    expect(html).toContain("We never run through your tools");
    expect(html).toContain("nothing is imported until you approve");
    // With no imports and no ledger data there must be NO run-status surface at
    // all — never a fabricated stage.
    expect(html).not.toContain("Run status");
    expect(html).not.toContain("not yet run");
    expect(html).not.toContain("recorded");
  });
});