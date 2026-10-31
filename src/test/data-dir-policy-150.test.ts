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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isInsidePublishTree,
  publishTreeEscapeDir,
  rawDataDir,
  relocateOutOfPublishTree,
  resolveDataDir,
} from "../lib/data-dir-policy";
import {
  legacyDataDirCandidates,
  migrateLegacyData,
  migrationSources,
  resolveDataDir as resolveViaDataStore,
  rawDataDir as rawViaDataStore,
} from "../lib/data-store";

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

/**
 * SLICE 150b — the relocation must not strand the data it relocated away from.
 *
 * The policy moves the READER to the sibling of the publish tree. The store a
 * pre-fix deployment left behind still sits at the pre-relocation path, and the
 * default migration candidates are `LEGACY_DATA_DIR` plus one hardcoded host
 * path (`/home/team/shared/site/.data`). On any other machine those candidates
 * do not exist, so boot order was: relocate -> migrate finds nothing -> seed
 * fresh empty stores -> serve an empty dataset while the real store sits in the
 * directory the policy just moved away from. `rawDataDir` + `migrationSources`
 * put the pre-relocation path FIRST, so the copy happens on every host.
 *
 * The shape below is the exact deployment shape: `<base>/site/.data` (in-tree)
 * with a JSON store and a nested `vault/blobs/**` document blob, and an empty
 * `<base>/.data` sibling that the policy creates on first boot.
 */
describe("slice 150b — the pre-relocation path is the first migration source", () => {
  function siteWithStore() {
    const base = tmpDir("ddp150b-");
    const tree = join(base, "site");
    const raw = join(tree, ".data");
    mkdirSync(join(raw, "vault", "blobs", "2026-10"), { recursive: true });
    writeFileSync(join(raw, "users.json"), JSON.stringify([{ email: "owner@example.com", role: "owner" }]));
    writeFileSync(join(raw, "tenant_purchases.json"), "[]");
    writeFileSync(join(raw, "vault", "vault_index.json"), JSON.stringify({ files: 1 }));
    writeFileSync(join(raw, "vault", "blobs", "2026-10", "blob-1.bin"), "BLOB-BYTES-150B");
    return { base, tree, raw, target: join(base, ".data") };
  }

  it("rawDataDir reports the path BEFORE relocation and is untouched by it", () => {
    const { tree, raw, target } = siteWithStore();
    expect(rawDataDir(undefined, tree)).toBe(raw);
    expect(isInsidePublishTree(rawDataDir(undefined, tree))).toBe(true);
    expect(resolveDataDir(undefined, tree)).toBe(target);
    expect(isInsidePublishTree(resolveDataDir(undefined, tree))).toBe(false);
    // Same rule as resolveDataDir for the env override, minus the relocation.
    expect(rawDataDir(join(tree, ".data"), tree)).toBe(join(tree, ".data"));
    expect(rawDataDir(".data", "/base/dir")).toBe("/base/dir/.data");
    expect(rawDataDir("   ", "/base/dir")).toBe("/base/dir/.data");
    expect(rawViaDataStore(undefined, tree)).toBe(raw);
  });

  it("first boot: the escape dir is used AND every file, including a nested vault blob, is carried across", () => {
    const { tree, raw, target } = siteWithStore();
    const dir = resolveDataDir(undefined, tree);
    expect(dir).toBe(target);
    // The policy creates the sibling empty — this is the "looks like data loss" state.
    expect(existsSync(target)).toBe(true);
    expect(readdirSync(target)).toEqual([]);

    const mig = migrateLegacyData(dir, migrationSources(rawDataDir(undefined, tree)));
    expect(mig.legacyDir).toBe(raw);
    expect(mig.migrated).toBeGreaterThan(0);

    expect(readFileSync(join(dir, "users.json"), "utf8")).toContain("owner@example.com");
    expect(readFileSync(join(dir, "tenant_purchases.json"), "utf8")).toBe("[]");
    expect(readFileSync(join(dir, "vault", "vault_index.json"), "utf8")).toBe(JSON.stringify({ files: 1 }));
    expect(readFileSync(join(dir, "vault", "blobs", "2026-10", "blob-1.bin"), "utf8")).toBe("BLOB-BYTES-150B");
    // The original is never moved or deleted by the migration.
    expect(readFileSync(join(raw, "vault", "blobs", "2026-10", "blob-1.bin"), "utf8")).toBe("BLOB-BYTES-150B");
  });

  it("the pre-relocation path is the ONLY source that can work off this box", () => {
    const { tree, raw } = siteWithStore();
    const sources = migrationSources(rawDataDir(undefined, tree));
    expect(sources[0]).toBe(raw);
    // The old candidate list alone cannot know this deployment's tree.
    expect(legacyDataDirCandidates()).not.toContain(raw);
    // ...and with that list alone nothing is copied (the bug this slice fixes).
    const target = join(tmpDir("ddp150b-alone-"), ".data");
    const withoutRaw = migrateLegacyData(target, []);
    expect(withoutRaw.migrated).toBe(0);
    // With the raw path as the first candidate, the same call carries everything.
    const withRaw = migrateLegacyData(target, [raw]);
    expect(withRaw.legacyDir).toBe(raw);
    expect(readFileSync(join(target, "vault", "blobs", "2026-10", "blob-1.bin"), "utf8")).toBe("BLOB-BYTES-150B");
  });

  it("second boot copies nothing more and never overwrites a changed value", () => {
    const { tree, raw, target } = siteWithStore();
    const sources = () => migrationSources(rawDataDir(undefined, tree));
    const first = migrateLegacyData(resolveDataDir(undefined, tree), sources());
    expect(first.migrated).toBeGreaterThan(0);
    const entriesAfterFirst = readdirSync(target).sort();

    // The customer edits a value in the live (relocated) store.
    writeFileSync(join(target, "users.json"), JSON.stringify([{ email: "changed@example.com" }]));

    const second = migrateLegacyData(resolveDataDir(undefined, tree), sources());
    expect(second.migrated).toBe(0);
    expect(second.legacyDir).toBe(null);
    expect(readFileSync(join(target, "users.json"), "utf8")).toContain("changed@example.com");
    expect(readdirSync(target).sort()).toEqual(entriesAfterFirst);
    // Still readable from the original, untouched.
    expect(readFileSync(join(raw, "users.json"), "utf8")).toContain("owner@example.com");
  });

  it("an empty pre-relocation path is a no-op, not a crash", () => {
    const base = tmpDir("ddp150b-empty-");
    const tree = join(base, "site");
    mkdirSync(join(tree, ".data"), { recursive: true });
    const dir = resolveDataDir(undefined, tree);
    const mig = migrateLegacyData(dir, migrationSources(rawDataDir(undefined, tree)));
    expect(mig.migrated).toBe(0);
  });

  it("both boot callers pass the pre-relocation path FIRST", () => {
    const server = readFileSync(join(REPO_ROOT, "prod-server.ts"), "utf8");
    expect(server).toContain("rawDataDir(process.env.DATA_DIR, SERVER_BASE)");
    expect(server).toContain("migrateLegacyData(DATA_DIR, migrationSources(DATA_DIR_RAW))");

    const ensure = readFileSync(join(REPO_ROOT, "scripts/ensure-data-dir.mjs"), "utf8");
    expect(ensure).toContain("rawDataDir(process.env.DATA_DIR, REPO_ROOT)");
    expect(ensure).toContain("migrationSources(RAW_DATA_DIR)");
    expect(ensure).toContain("migrateLegacyData(DATA_DIR, sources)");

    // `migrationSources` itself puts the raw path ahead of the legacy list.
    const first = migrationSources("/raw/dir")[0];
    expect(first).toBe("/raw/dir");
  });

  it("this box's dev server runs the boot half (it has a caller, not just a script)", () => {
    const cfg = readFileSync(join(REPO_ROOT, "vite.config.ts"), "utf8");
    expect(cfg).toContain("scripts/ensure-data-dir.mjs");
    expect(cfg).toContain("dataDirBootHook()");
  });
});
