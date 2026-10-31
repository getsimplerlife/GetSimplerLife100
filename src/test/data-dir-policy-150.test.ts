/**
 * Slice 150 — runtime data must never live inside the publish tree.
 *
 * The 2026-08-11 fix (PR #124) moved DATA_DIR out of the publish tree by writing
 * a key into `.env` — a file inside that same tree. The key is gone today and the
 * directory it named no longer exists, so the server had quietly gone back to
 * `<repo>/.data`, where a publish can replace it. These tests pin the rule that
 * replaces the config file: resolution happens in code, an in-tree result is
 * relocated to the sibling of the tree, and a path that cannot be relocated is
 * kept with a loud warning rather than silently.
 *
 * Every case uses a temp directory. Nothing here reads or writes the real store.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isInsidePublishTree,
  publishTreeEscapeDir,
  relocateOutOfPublishTree,
  resolveDataDir,
} from "../lib/data-dir-policy";
import { resolveDataDir as resolveViaDataStore } from "../lib/data-store";

const REPO_ROOT = existsSync(join(process.cwd(), "prod-server.ts")) ? process.cwd() : join(process.cwd(), "..");
const temps: string[] = [];
function tmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  while (temps.length) {
    const d = temps.pop()!;
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("isInsidePublishTree", () => {
  it("flags the paths a publish can replace", () => {
    expect(isInsidePublishTree("/home/team/shared/site/.data")).toBe(true);
    expect(isInsidePublishTree("/home/team/shared/site/dist/.data")).toBe(true);
    expect(isInsidePublishTree("/srv/site/.data")).toBe(true);
  });

  it("does not flag the sibling of the tree or an unrelated absolute path", () => {
    expect(isInsidePublishTree("/home/team/shared/.data")).toBe(false);
    expect(isInsidePublishTree("/var/lib/simplerlife100/.data")).toBe(false);
    expect(isInsidePublishTree("/home/team/shared/site-backup/.data")).toBe(false);
  });
});

describe("publishTreeEscapeDir", () => {
  it("steps out of the last `site` segment", () => {
    expect(publishTreeEscapeDir("/home/team/shared/site/.data")).toBe("/home/team/shared/.data");
    expect(publishTreeEscapeDir("/home/team/shared/site")).toBe("/home/team/shared/.data");
    expect(publishTreeEscapeDir("/opt/site/nested/.data")).toBe("/opt/.data");
  });

  it("returns null when there is no `site` segment to step out of", () => {
    expect(publishTreeEscapeDir("/var/lib/app/.data")).toBe(null);
    expect(publishTreeEscapeDir("/site/.data")).toBe(null);
  });
});

describe("resolveDataDir", () => {
  it("honours an explicit DATA_DIR outside the tree, unchanged", () => {
    expect(resolveDataDir("/var/lib/simplerlife100/.data", "/base")).toBe("/var/lib/simplerlife100/.data");
  });

  it("joins a relative DATA_DIR to the base directory", () => {
    expect(resolveDataDir(".data", "/base/dir")).toBe("/base/dir/.data");
  });

  it("defaults to <base>/.data for an absent, empty or blank override", () => {
    expect(resolveDataDir(undefined, "/base/dir")).toBe("/base/dir/.data");
    expect(resolveDataDir("", "/base/dir")).toBe("/base/dir/.data");
    expect(resolveDataDir("   ", "/base/dir")).toBe("/base/dir/.data");
  });

  it("relocates a publish-tree base to the sibling of the tree (the regression)", () => {
    // The exact shape that regressed: no DATA_DIR in the environment, server
    // running from the publish tree.
    const base = tmpDir("ddp-base-");
    const tree = join(base, "site");
    expect(resolveDataDir(undefined, tree)).toBe(join(base, ".data"));
    expect(isInsidePublishTree(resolveDataDir(undefined, tree))).toBe(false);
  });

  it("relocates an explicit DATA_DIR that points inside the tree", () => {
    const base = tmpDir("ddp-env-");
    const tree = join(base, "site");
    expect(resolveDataDir(join(tree, ".data"), tree)).toBe(join(base, ".data"));
  });

  it("never returns a publish-tree path when the sibling is writable", () => {
    const base = tmpDir("ddp-out-");
    const resolved = resolveDataDir(undefined, join(base, "site"));
    expect(isInsidePublishTree(resolved)).toBe(false);
    expect(existsSync(resolved)).toBe(true); // the relocation creates it
  });

  it("keeps the original path (and does not throw) when the sibling cannot be created", () => {
    const base = tmpDir("ddp-blocked-");
    // A FILE where the escape directory's parent must be: mkdir cannot succeed.
    const blocker = join(base, "blocker");
    writeFileSync(blocker, "not a directory");
    const inTree = join(blocker, "site", ".data");
    expect(isInsidePublishTree(inTree)).toBe(true);
    expect(relocateOutOfPublishTree(inTree)).toBe(inTree);
  });

  it("is stable across calls — a second resolve does not drift", () => {
    const base = tmpDir("ddp-idem-");
    const tree = join(base, "site");
    const first = resolveDataDir(undefined, tree);
    const second = resolveDataDir(undefined, tree);
    expect(second).toBe(first);
  });

  it("is re-exported unchanged by data-store (every store imports it from there)", () => {
    const base = tmpDir("ddp-reexport-");
    expect(resolveViaDataStore(undefined, join(base, "site"))).toBe(join(base, ".data"));
  });
});

describe("the loud warning survives", () => {
  it("prod-server still prints DATA_DIR and warns when it resolves inside the tree", () => {
    const src = readFileSync(join(REPO_ROOT, "prod-server.ts"), "utf8");
    expect(src).toContain('[prod-server] DATA_DIR=" + DATA_DIR');
    expect(src).toContain("WARNING: DATA_DIR is inside the publish tree");
    expect(src).toContain("isInsidePublishTree(DATA_DIR)");
  });

  it("the policy warns instead of silently keeping an in-tree path", () => {
    const base = tmpDir("ddp-warn-");
    const blocker = join(base, "blocker");
    writeFileSync(blocker, "not a directory");
    const original = console.warn;
    const lines: string[] = [];
    console.warn = (msg: unknown) => lines.push(String(msg));
    try {
      relocateOutOfPublishTree(join(blocker, "site", ".data"));
    } finally {
      console.warn = original;
    }
    expect(lines.some((l) => l.includes("WARNING: DATA_DIR resolves inside the publish tree"))).toBe(true);
  });
});

describe("every runtime resolves DATA_DIR the same way", () => {
  const scripts = ["scripts/backup-daemon.mjs", "scripts/ensure-backup-daemon.mjs", "scripts/backup.mjs"];
  for (const rel of scripts) {
    it(`${rel} uses the shared policy and hardcodes no publish-tree default`, () => {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(src).toContain("resolveDataDir(");
      // The pre-150 defaults pointed at the publish tree itself.
      expect(src).not.toContain('|| join(REPO_ROOT, ".data")');
      expect(src).not.toContain('"/home/team/shared/site/.data"');
    });
  }

  it("the boot migration helper exists and uses the shared policy", () => {
    const src = readFileSync(join(REPO_ROOT, "scripts/ensure-data-dir.mjs"), "utf8");
    expect(src).toContain("resolveDataDir(");
    expect(src).toContain("migrateLegacyData(");
    expect(src).toContain("seedDataFiles(");
  });
});
