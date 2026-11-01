import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_PATHS_PER_DAY,
  OTHER_PATHS_KEY,
  RETENTION_DAYS,
  addView,
  classifyPageView,
  emptyStore,
  flushPageViews,
  isAssetPath,
  isBotUserAgent,
  normalizeViewPath,
  notePageView,
  pageViewFilePath,
  parseStore,
  readPageViewSummary,
  resetPageViewStateForTest,
  shiftDayKey,
  summarizeStore,
  trimStore,
  utcDayKey,
  type ViewCandidate,
} from "~/lib/page-views";

/**
 * SLICE 159 — unit tests for the first-party page counter.
 *
 * These cover the aggregation rules in isolation: day bucketing, path
 * normalisation, bot/asset/API rejection at the door, retention trim, the
 * bounded path space, and the honesty rules (a failed write is reported, not
 * swallowed; an empty store reads as empty, not as a fabricated zero).
 *
 * The companion file `page-views-http-159.test.ts` proves the same counter
 * through the REAL self-hosted server — a green unit suite is not evidence a
 * page works (slice 158's lesson).
 */

const scratchDirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "sl100-pv159-"));
  scratchDirs.push(dir);
  return dir;
}

function candidate(over: Partial<ViewCandidate> = {}): ViewCandidate {
  return {
    method: "GET",
    pathname: "/",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    contentType: "text/html; charset=utf-8",
    status: 200,
    ...over,
  };
}

beforeEach(() => {
  resetPageViewStateForTest();
});

afterAll(() => {
  for (const dir of scratchDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe("page counter: UTC day bucketing", () => {
  it("keys a day by UTC, not by the server's local clock", () => {
    // 02:30 on 2026-11-01 at UTC+3 is still 2026-10-31 in UTC.
    expect(utcDayKey(new Date("2026-11-01T02:30:00+03:00"))).toBe("2026-10-31");
    // 23:30 UTC and 00:30 UTC are different days, one minute apart.
    expect(utcDayKey(new Date("2026-10-31T23:59:00Z"))).toBe("2026-10-31");
    expect(utcDayKey(new Date("2026-11-01T00:01:00Z"))).toBe("2026-11-01");
  });

  it("shifts day keys across month and year boundaries", () => {
    expect(shiftDayKey("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDayKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDayKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftDayKey("2026-10-31", 0)).toBe("2026-10-31");
  });

  it("puts views on different days into different buckets", () => {
    const store = emptyStore();
    addView(store, "2026-10-30", "/");
    addView(store, "2026-10-30", "/");
    addView(store, "2026-10-31", "/");
    expect(store.days["2026-10-30"]).toEqual({ "/": 2 });
    expect(store.days["2026-10-31"]).toEqual({ "/": 1 });
  });
});

describe("page counter: path normalisation", () => {
  it("treats a trailing slash as the same page", () => {
    expect(normalizeViewPath("/pricing/")).toBe("/pricing");
    expect(normalizeViewPath("/pricing")).toBe("/pricing");
    expect(normalizeViewPath("/pricing//")).toBe("/pricing");
  });

  it("keeps the root as the root", () => {
    expect(normalizeViewPath("/")).toBe("/");
    expect(normalizeViewPath("")).toBe("/");
    expect(normalizeViewPath("///")).toBe("/");
  });

  it("collapses repeated slashes and strips query/fragment defensively", () => {
    expect(normalizeViewPath("//a//b")).toBe("/a/b");
    expect(normalizeViewPath("/pricing?plan=growth")).toBe("/pricing");
    expect(normalizeViewPath("/pricing#faq")).toBe("/pricing");
  });

  it("refuses keys it cannot trust instead of storing junk", () => {
    expect(normalizeViewPath("pricing")).toBeNull(); // no leading slash
    expect(normalizeViewPath("/a/../b")).toBeNull();
    expect(normalizeViewPath("/a/./b")).toBeNull();
    expect(normalizeViewPath("/bad\u0000path")).toBeNull();
    expect(normalizeViewPath("/bad\npath")).toBeNull();
  });

  it("truncates an absurdly long path to a bounded key", () => {
    const long = "/" + "a".repeat(500);
    const normalized = normalizeViewPath(long);
    expect(normalized).not.toBeNull();
    expect(normalized!.length).toBeLessThanOrEqual(200);
  });
});

describe("page counter: what counts as a page view", () => {
  it("counts a browser GET of an HTML page", () => {
    const decision = classifyPageView(candidate());
    expect(decision.counted).toBe(true);
    if (decision.counted) expect(decision.path).toBe("/");
  });

  it("never counts a non-GET, a non-200, or a non-HTML response", () => {
    expect(classifyPageView(candidate({ method: "POST" }))).toEqual({ counted: false, reason: "method" });
    expect(classifyPageView(candidate({ method: "HEAD" }))).toEqual({ counted: false, reason: "method" });
    // A 404 is a miss, not a page view.
    expect(classifyPageView(candidate({ status: 404 }))).toEqual({ counted: false, reason: "status" });
    expect(classifyPageView(candidate({ status: 302 }))).toEqual({ counted: false, reason: "status" });
    expect(classifyPageView(candidate({ contentType: "application/json" }))).toEqual({ counted: false, reason: "content-type" });
    expect(classifyPageView(candidate({ contentType: null }))).toEqual({ counted: false, reason: "content-type" });
  });

  it("never counts API calls or assets", () => {
    expect(classifyPageView(candidate({ pathname: "/api/health" }))).toEqual({ counted: false, reason: "api" });
    expect(classifyPageView(candidate({ pathname: "/api" }))).toEqual({ counted: false, reason: "api" });
    expect(classifyPageView(candidate({ pathname: "/assets/index-abc12345.js" }))).toEqual({ counted: false, reason: "asset" });
    expect(classifyPageView(candidate({ pathname: "/product/portal.png" }))).toEqual({ counted: false, reason: "asset" });
    expect(classifyPageView(candidate({ pathname: "/robots.txt" }))).toEqual({ counted: false, reason: "asset" });
    expect(classifyPageView(candidate({ pathname: "/favicon.ico" }))).toEqual({ counted: false, reason: "asset" });
  });

  it("drops bots and scripts at the door (their headers are never stored)", () => {
    for (const ua of [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "curl/8.4.0",
      "Wget/1.21",
      "python-requests/2.31.0",
      "Mozilla/5.0 (compatible; UptimeRobot/2.0)",
      "HeadlessChrome/120.0.0.0",
      "",
    ]) {
      expect(classifyPageView(candidate({ userAgent: ua })), ua || "(empty UA)").toEqual({ counted: false, reason: "bot" });
    }
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36")).toBe(false);
  });

  it("asset detection is path-based, not content-type based", () => {
    expect(isAssetPath("/portal/invoices")).toBe(false);
    expect(isAssetPath("/pricing")).toBe(false);
    expect(isAssetPath("/assets/app-1234abcd.css")).toBe(true);
    expect(isAssetPath("/_build/x.js")).toBe(true);
  });
});

describe("page counter: aggregation and the owner's summary", () => {
  it("totals, ranks and zero-fills a real 30-day series", () => {
    const store = emptyStore();
    addView(store, "2026-10-31", "/");
    addView(store, "2026-10-31", "/");
    addView(store, "2026-10-31", "/pricing");
    addView(store, "2026-10-29", "/pricing");
    addView(store, "2026-10-29", "/pricing");
    addView(store, "2026-10-29", "/features");

    const summary = summarizeStore(store, { todayKey: "2026-10-31", windowDays: 30, topPaths: 25 });
    expect(summary.totalViews).toBe(6);
    expect(summary.uniquePaths).toBe(3);
    expect(summary.days).toHaveLength(30);
    expect(summary.days[summary.days.length - 1]).toEqual({ day: "2026-10-31", views: 3 });
    expect(summary.days[summary.days.length - 2]).toEqual({ day: "2026-10-30", views: 0 });
    expect(summary.days[summary.days.length - 3]).toEqual({ day: "2026-10-29", views: 3 });
    expect(summary.topPaths[0]).toEqual({ path: "/pricing", views: 3 });
    expect(summary.topPaths[1]).toEqual({ path: "/", views: 2 });
    expect(summary.topPaths[2]).toEqual({ path: "/features", views: 1 });
    expect(summary.hasAnyData).toBe(true);
  });

  it("caps the ranking at 25 paths and only counts the window", () => {
    const store = emptyStore();
    for (let i = 0; i < 40; i++) addView(store, "2026-10-31", `/p${i}`);
    addView(store, "2026-01-01", "/ancient");
    const summary = summarizeStore(store, { todayKey: "2026-10-31" });
    expect(summary.topPaths).toHaveLength(25);
    expect(summary.totalViews).toBe(40); // the January view is outside the 30-day window
  });

  it("says plainly when nothing has ever been recorded", () => {
    const summary = summarizeStore(emptyStore(), { todayKey: "2026-10-31" });
    expect(summary.hasAnyData).toBe(false);
    expect(summary.totalViews).toBe(0);
    expect(summary.topPaths).toEqual([]);
    expect(summary.days).toHaveLength(30);
  });

  it("keeps the distinct-path space bounded per day", () => {
    const store = emptyStore();
    for (let i = 0; i < MAX_PATHS_PER_DAY; i++) addView(store, "2026-10-31", `/invented-${i}`);
    expect(Object.keys(store.days["2026-10-31"])).toHaveLength(MAX_PATHS_PER_DAY);
    // The 1001st distinct path folds into one bucket instead of growing the key space.
    expect(addView(store, "2026-10-31", "/invented-overflow")).toBe(OTHER_PATHS_KEY);
    expect(Object.keys(store.days["2026-10-31"])).toHaveLength(MAX_PATHS_PER_DAY + 1);
    // An EXISTING path still increments itself after the cap.
    expect(addView(store, "2026-10-31", "/invented-0")).toBe("/invented-0");
  });

  it("trims days past the retention window", () => {
    const store = emptyStore();
    addView(store, "2026-01-01", "/");
    addView(store, "2026-10-31", "/");
    const dropped = trimStore(store, "2026-10-31", RETENTION_DAYS);
    expect(dropped).toEqual(["2026-01-01"]);
    expect(Object.keys(store.days)).toEqual(["2026-10-31"]);
  });
});

/** A fixed instant, so a suite that happens to cross UTC midnight cannot flake. */
const NOW = new Date("2026-10-31T12:00:00Z");

describe("page counter: storage in DATA_DIR", () => {
  it("writes the aggregate into DATA_DIR and reads it back", () => {
    const dataDir = scratch();
    const file = pageViewFilePath(dataDir);
    expect(file.startsWith(dataDir)).toBe(true);

    notePageView(dataDir, candidate({ pathname: "/" }), { now: NOW });
    notePageView(dataDir, candidate({ pathname: "/pricing/" }), { now: NOW });
    notePageView(dataDir, candidate({ pathname: "/pricing" }), { now: NOW });
    expect(flushPageViews(dataDir)).toBe(true);

    expect(existsSync(file)).toBe(true);
    const onDisk = JSON.parse(readFileSync(file, "utf-8"));
    expect(onDisk.version).toBe(1);
    expect(onDisk.days["2026-10-31"]).toEqual({ "/": 1, "/pricing": 2 });

    // A restart forgets memory and reloads from the file: the counts survive.
    resetPageViewStateForTest();
    const summary = readPageViewSummary(dataDir, { now: NOW });
    expect(summary.totalViews).toBe(3);
    expect(summary.topPaths[0]).toEqual({ path: "/pricing", views: 2 });
    expect(summary.writeHealth.ok).toBe(true);
    expect(summary.readError).toBeNull();
  });

  it("drops a bot request before anything is written", () => {
    const dataDir = scratch();
    notePageView(dataDir, candidate({ userAgent: "curl/8.4.0" }));
    flushPageViews(dataDir);
    const summary = readPageViewSummary(dataDir);
    expect(summary.totalViews).toBe(0);
    expect(summary.hasAnyData).toBe(false);
    expect(existsSync(pageViewFilePath(dataDir))).toBe(false);
  });

  it("parses a corrupt store as empty rather than trusting it", () => {
    expect(parseStore(null).days).toEqual({});
    expect(parseStore({ days: { "not-a-day": { "/": 1 } } }).days).toEqual({});
    expect(parseStore({ days: { "2026-10-31": { "/": "many" } } }).days).toEqual({ "2026-10-31": {} });
    expect(parseStore({ days: { "2026-10-31": { "/": 4 } } }).days).toEqual({ "2026-10-31": { "/": 4 } });
  });

  it("reports an unparseable store instead of silently starting from zero", () => {
    const dataDir = scratch();
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(pageViewFilePath(dataDir), "{ this is not json", "utf-8");
    const summary = readPageViewSummary(dataDir);
    expect(summary.readError).toBeTruthy();
    expect(summary.totalViews).toBe(0);
  });
});

describe("page counter: honesty when it cannot write", () => {
  it("still counts in memory, reports the failure, and recovers visibly", () => {
    const dataDir = scratch();
    notePageView(dataDir, candidate({ pathname: "/" }), { now: NOW });
    expect(flushPageViews(dataDir)).toBe(true);

    // Make the target unwritable: a DIRECTORY where the file should be, so the
    // atomic rename fails. (rm the file first so the state stays loaded.)
    rmSync(pageViewFilePath(dataDir), { force: true });
    mkdirSync(pageViewFilePath(dataDir));

    // The page must still be served: this must not throw.
    expect(() => notePageView(dataDir, candidate({ pathname: "/pricing" }), { now: NOW })).not.toThrow();
    expect(flushPageViews(dataDir)).toBe(false);

    const failing = readPageViewSummary(dataDir, { now: NOW });
    // The views are still counted in memory — the number is real, not a zero.
    expect(failing.totalViews).toBe(2);
    expect(failing.writeHealth.ok).toBe(false);
    expect(failing.writeHealth.failingSince).toBeTruthy();
    expect(failing.writeHealth.lastError).toBeTruthy();
    expect(failing.writeHealth.consecutiveFailures).toBeGreaterThanOrEqual(1);
    expect(failing.writeHealth.pendingInMemory).toBeGreaterThanOrEqual(1);

    // Repair the path: the next write succeeds and says when it recovered.
    rmSync(pageViewFilePath(dataDir), { recursive: true, force: true });
    expect(flushPageViews(dataDir)).toBe(true);
    const healthy = readPageViewSummary(dataDir, { now: NOW });
    expect(healthy.writeHealth.ok).toBe(true);
    expect(healthy.writeHealth.lastRecoveredAt).toBeTruthy();
    expect(healthy.writeHealth.pendingInMemory).toBe(0);
    expect(JSON.parse(readFileSync(pageViewFilePath(dataDir), "utf-8")).days["2026-10-31"]).toEqual({
      "/": 1,
      "/pricing": 1,
    });
  });

  it("never throws when the data dir cannot even be created", () => {
    // /dev/null is a character device: no child directory can exist under it.
    const dataDir = "/dev/null/sl100-page-views";
    expect(() => notePageView(dataDir, candidate())).not.toThrow();
    const summary = readPageViewSummary(dataDir);
    // Counted in memory, honestly flagged as not persisted.
    expect(summary.totalViews).toBe(1);
    expect(summary.writeHealth.ok).toBe(false);
    expect(summary.writeHealth.lastError).toBeTruthy();
  });
});
