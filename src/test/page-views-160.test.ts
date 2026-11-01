import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  PAGE_VIEW_FILE_NAME,
  describePageViewCounterLocation,
  flushPageViews,
  logPageViewCounterLocation,
  notePageView,
  pageViewFilePath,
  resetPageViewStateForTest,
} from "../lib/page-views";
import {
  isInsidePublishTree,
  isInsideServerBase,
  publishTreeEscapeDir,
  resolveDataDir,
} from "../lib/data-dir-policy";

/**
 * SLICE 160 — the counter's LOCATION, proved as a fact rather than assumed.
 *
 * Slice 159 shipped a counter that passed every unit test and still looked empty
 * on the live site. The tests proved the aggregation and the wiring, but nothing
 * proved WHICH FILE the deployed process wrote: "it writes into DATA_DIR" was a
 * claim about the source, and the deployed process resolves DATA_DIR from its own
 * location. This file pins the location as data the running server reports, and
 * pins the policy rule that keeps that location outside the tree a publish
 * replaces — on ANY deployment layout, not just this host's.
 */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let tmpRoot: string;

beforeEach(() => {
  resetPageViewStateForTest();
  tmpRoot = mkdtempSync(join(tmpdir(), "pv160-"));
});

afterEach(() => {
  resetPageViewStateForTest();
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("the counter reports where it writes (slice 160)", () => {
  it("names the exact file inside the data dir it was given", () => {
    const dataDir = join(tmpRoot, "data");
    const loc = describePageViewCounterLocation(dataDir);
    expect(loc.dataDir).toBe(dataDir);
    expect(loc.counterFile).toBe(join(dataDir, PAGE_VIEW_FILE_NAME));
    expect(pageViewFilePath(dataDir)).toBe(loc.counterFile);
    // A temp dir is not a publish tree.
    expect(loc.insidePublishTree).toBe(false);
  });

  it("says the file is missing before anything is counted, and real after", () => {
    const dataDir = join(tmpRoot, "data");
    mkdirSync(dataDir, { recursive: true });
    const before = describePageViewCounterLocation(dataDir);
    expect(before.fileExists).toBe(false);
    expect(before.bytes).toBeNull();
    expect(before.lastWriteAt).toBeNull();
    expect(before.writable).toBe(true);

    notePageView(dataDir, {
      method: "GET",
      pathname: "/how-it-works",
      userAgent: BROWSER_UA,
      contentType: "text/html; charset=utf-8",
      status: 200,
    });
    expect(flushPageViews(dataDir)).toBe(true);

    const after = describePageViewCounterLocation(dataDir);
    expect(after.fileExists).toBe(true);
    expect(after.bytes).toBeGreaterThan(0);
    expect(after.lastWriteAt).toBeTruthy();
    // The bytes on disk are the count, not an empty document.
    const doc = JSON.parse(readFileSync(after.counterFile, "utf-8"));
    const today = new Date().toISOString().slice(0, 10);
    expect(doc.days[today]["/how-it-works"]).toBeGreaterThanOrEqual(1);
  });

  it("flags a counter file that sits inside the publish tree", () => {
    // The exact shape that loses history on a deploy: data dir = <code dir>/.data.
    const serverBase = join(tmpRoot, "deploy", "app");
    mkdirSync(serverBase, { recursive: true });
    const loc = describePageViewCounterLocation(join(serverBase, ".data"), { serverBase });
    expect(loc.insidePublishTree).toBe(true);
  });

  it("logs the path at boot so nobody has to read the source to find the counts", () => {
    const dataDir = join(tmpRoot, "data");
    mkdirSync(dataDir, { recursive: true });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const loc = logPageViewCounterLocation(dataDir);
      expect(loc.counterFile).toBe(join(dataDir, PAGE_VIEW_FILE_NAME));
      const line = log.mock.calls.map((c) => String(c[0])).join("\n");
      expect(line).toContain("[page-views]");
      expect(line).toContain(`file=${join(dataDir, PAGE_VIEW_FILE_NAME)}`);
      expect(line).toContain("insidePublishTree=false");
    } finally {
      log.mockRestore();
    }
  });

  it("warns loudly when the counter file would live inside the publish tree", () => {
    const serverBase = join(tmpRoot, "deploy", "app");
    mkdirSync(serverBase, { recursive: true });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      logPageViewCounterLocation(join(serverBase, ".data"), serverBase);
      const warned = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(warned).toContain("inside the publish tree");
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });
});

describe("the data dir policy follows the code, not this host's path shape (slice 160)", () => {
  it("treats the server's own base directory as a publish tree", () => {
    const base = join(tmpRoot, "deploy", "app");
    expect(isInsideServerBase(base, base)).toBe(true);
    expect(isInsideServerBase(join(base, ".data"), base)).toBe(true);
    expect(isInsideServerBase(join(base, "dist"), base)).toBe(true);
    expect(isInsideServerBase(join(tmpRoot, "deploy", ".data"), base)).toBe(false);
    // "/" must never be treated as a publish tree.
    expect(isInsideServerBase("/etc", "/")).toBe(false);
  });

  it("relocates an in-tree data dir on a deployment that is NOT shaped like this host", () => {
    // This is the bug slice 159 could not see: `/…/deploy/app/.data` matches none
    // of the hardcoded shapes, so it used to be kept — inside the tree a publish
    // replaces. With the server base known, it steps out to `/…/deploy/.data`.
    const serverBase = join(tmpRoot, "deploy", "app");
    mkdirSync(serverBase, { recursive: true });
    const resolved = resolveDataDir(undefined, serverBase, serverBase);
    expect(resolved).toBe(join(tmpRoot, "deploy", ".data"));
    expect(isInsidePublishTree(resolved, serverBase)).toBe(false);
  });

  it("still relocates this host's layout to the sibling of the publish tree", () => {
    const serverBase = join(tmpRoot, "shared", "site");
    mkdirSync(serverBase, { recursive: true });
    const resolved = resolveDataDir(undefined, serverBase, serverBase);
    expect(resolved).toBe(join(tmpRoot, "shared", ".data"));
    expect(isInsidePublishTree(resolved, serverBase)).toBe(false);
  });

  it("honours an explicit DATA_DIR that is already outside the tree", () => {
    const serverBase = join(tmpRoot, "deploy", "app");
    const explicit = join(tmpRoot, "elsewhere", "data");
    mkdirSync(serverBase, { recursive: true });
    mkdirSync(explicit, { recursive: true });
    expect(resolveDataDir(explicit, serverBase, serverBase)).toBe(explicit);
  });

  it("never proposes the filesystem root as the data dir", () => {
    // `/app/.data` has no `site` segment and its parent is `/` — refuse, rather
    // than try to create `/.data` on the host.
    expect(publishTreeEscapeDir("/app/.data", "/app")).toBeNull();
  });

  it("keeps the old behaviour when no server base is supplied", () => {
    expect(isInsidePublishTree("/home/team/shared/site/.data")).toBe(true);
    expect(isInsidePublishTree("/home/team/shared/.data")).toBe(false);
    expect(isInsidePublishTree("/tmp/whatever/.data")).toBe(false);
  });
});

describe("the location is safe to read", () => {
  it("never throws on a data dir that does not exist", () => {
    const missing = join(tmpRoot, "nope", "deeper");
    expect(existsSync(missing)).toBe(false);
    const loc = describePageViewCounterLocation(missing);
    expect(loc.dirExists).toBe(false);
    expect(loc.fileExists).toBe(false);
    expect(loc.counterFile).toBe(join(missing, PAGE_VIEW_FILE_NAME));
  });
});
