/**
 * backup-restore.test.ts — SLICE 143: the same-host archive and its restore.
 *
 * WHAT THIS PINS (each one is a way a "backup" becomes data loss):
 *   1. a tampered byte fails verification — restore aborts instead of installing
 *      a corrupted store;
 *   2. a JSON file that does not re-parse fails the BACKUP run — because
 *      `readJSON` returns `{}` on a parse error, a torn file would otherwise be
 *      restored as an EMPTY store and look fine;
 *   3. a file whose two reads disagree (a `writeFileSync` in flight) is refused;
 *   4. `prod-server.lock` / `liveness-watchdog.lock` are never archived — they
 *      make a fresh instance refuse to boot;
 *   5. `backup_status.json` is status, not data, and is excluded;
 *   6. restore refuses a non-empty target without `--force` and succeeds with it;
 *   7. retention keeps the newest 7 days + 4 weeks and prunes the rest;
 *   8. the backup CLI refuses to write inside the publish tree;
 *   9. `/api/admin/datadir`'s backup fields read a real status file and report
 *      nulls (never a made-up success) when it is missing or malformed.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  BACKUP_STATUS_FILE,
  LOCK_FILES,
  buildManifest,
  collectBackupFiles,
  collectVerifiedFiles,
  isManifest,
  isInsidePublishTree,
  planRetention,
  publishTreeRoot,
  runIdFor,
  sha256Of,
  stableRead,
  statusFor,
  verifyManifestFiles,
  weekKeyOf,
  type Manifest,
} from "../../scripts/lib/backup-core";
import { countStoreEntries, readBackupStatus } from "../lib/backup-status";

const REPO = existsSync(join(process.cwd(), "prod-server.ts")) ? process.cwd() : join(process.cwd(), "..");
const tmpDirs: string[] = [];

function makeDataDir(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), "bk-data-"));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function manifestFor(files: Array<{ path: string; sha256: string; bytes: number }>, runId = "2026-10-30T20-00-00Z"): Manifest {
  return buildManifest({
    runId,
    takenAt: "2026-10-30T20:00:00.000Z",
    source: { host: "test", dataDir: "/tmp/x", gitSha: "abc1234", durableEnabled: false },
    files,
    totals: { files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), jsonFiles: files.length, vaultBlobs: 0, nativeDocs: 0, otherFiles: 0 },
    excluded: [],
    encryption: "off",
    archive: null,
  });
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("slice 143 — verification refuses anything it cannot prove", () => {
  it("rejects a tampered byte", () => {
    const dir = makeDataDir({ "users.json": JSON.stringify({ "owner@example.com": { role: "admin" } }) });
    const { files, totals } = collectVerifiedFiles(dir);
    const manifest = manifestFor(files);
    expect(verifyManifestFiles(dir, manifest).ok).toBe(true);

    writeFileSync(join(dir, "users.json"), JSON.stringify({ "owner@example.com": { role: "admin" }, evil: 1 }));
    const bad = verifyManifestFiles(dir, manifest);
    expect(bad.ok).toBe(false);
    expect(bad.mismatches).toHaveLength(1);
    expect(bad.mismatches[0].path).toBe("users.json");
    expect(totals.files).toBe(1);
  });

  it("fails the run when a JSON file does not re-parse (a torn store reads back as {})", () => {
    const dir = makeDataDir({ "tenant_purchases.json": '{"a":1,"b":' });
    expect(() => collectVerifiedFiles(dir, { sleepMs: 0 })).toThrow(/unparseable JSON in tenant_purchases\.json/);
  });

  it("refuses a file whose two reads disagree (writeFileSync in flight)", () => {
    const dir = makeDataDir({ "users.json": "{}" });
    let call = 0;
    expect(() =>
      stableRead(join(dir, "users.json"), {
        attempts: 2,
        sleepMs: 0,
        readFile: () => {
          call++;
          // odd reads are torn, even reads are whole — every pair disagrees
          return Buffer.from(call % 2 === 1 ? '{"half":' : '{"half":true}');
        },
      }),
    ).toThrow(/torn\/unstable read/);
  });

  it("never archives the ownership locks or the backup status file", () => {
    const dir = makeDataDir({
      "users.json": "{}",
      "prod-server.lock": '{"pid":1}',
      "liveness-watchdog.lock": '{"pid":2}',
      [BACKUP_STATUS_FILE]: '{"lastBackupOk":true}',
      "vault/blobs/aa/doc_1/v1.bin": Buffer.from([1, 2, 3]),
      "native_docs/bb/doc_2/v1.pdf": Buffer.from([4, 5, 6]),
    });
    const { include, excluded } = collectBackupFiles(dir);
    expect(include).toEqual(["native_docs/bb/doc_2/v1.pdf", "users.json", "vault/blobs/aa/doc_1/v1.bin"]);
    expect(excluded).toHaveLength(3);
    for (const lock of LOCK_FILES) {
      expect(include.some((p) => p.endsWith(lock))).toBe(false);
      expect(excluded.some((p) => p.startsWith(lock))).toBe(true);
    }
    const { totals } = collectVerifiedFiles(dir, { sleepMs: 0 });
    expect(totals).toMatchObject({ files: 3, jsonFiles: 1, vaultBlobs: 1, nativeDocs: 1, otherFiles: 0 });
  });

  it("does not mistake a foreign JSON file for a manifest", () => {
    expect(isManifest({ runId: "x" })).toBe(false);
    expect(isManifest({ runId: "x", files: [{ path: "a", sha256: 1, bytes: 2 }] })).toBe(false);
    expect(isManifest(manifestFor([]))).toBe(true);
  });
});

describe("slice 143 — restore CLI", () => {
  function makeRun(files: Record<string, string>): { out: string; runId: string } {
    const out = mkdtempSync(join(tmpdir(), "bk-root-"));
    tmpDirs.push(out);
    const runId = "2026-10-30T20-00-00Z";
    const runDir = join(out, runId);
    mkdirSync(join(runDir, "data"), { recursive: true });
    const entries: Array<{ path: string; sha256: string; bytes: number }> = [];
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(runDir, "data", rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
      entries.push({ path: rel, sha256: sha256Of(readFileSync(abs)), bytes: readFileSync(abs).length });
    }
    writeFileSync(join(runDir, "manifest.json"), JSON.stringify(manifestFor(entries, runId)));
    return { out, runId };
  }

  const runRestore = (args: string[]) => spawnSync("bun", ["scripts/restore.mjs", ...args], { cwd: REPO, encoding: "utf8" });

  it("refuses a non-empty target without --force, and restores with it", () => {
    const { out, runId } = makeRun({ "users.json": '{"owner@example.com":{"role":"admin"}}' });
    const target = mkdtempSync(join(tmpdir(), "bk-target-"));
    tmpDirs.push(target);
    writeFileSync(join(target, "keep-me.json"), "{}");

    const refused = runRestore(["--out", out, "--run", runId, "--target", target]);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toMatch(/exists and is not empty/);
    // the existing file is untouched — a refused restore must not clear anything
    expect(existsSync(join(target, "keep-me.json"))).toBe(true);

    const forced = runRestore(["--out", out, "--run", runId, "--target", target, "--force"]);
    expect(forced.status).toBe(0);
    expect(existsSync(join(target, "users.json"))).toBe(true);
    expect(existsSync(join(target, "keep-me.json"))).toBe(false);
  });

  it("aborts on a tampered archive instead of installing it", () => {
    const { out, runId } = makeRun({ "users.json": '{"a":1}' });
    writeFileSync(join(out, runId, "data", "users.json"), '{"a":2}');
    const target = mkdtempSync(join(tmpdir(), "bk-target2-"));
    tmpDirs.push(target);
    rmSync(target, { recursive: true, force: true });
    const res = runRestore(["--out", out, "--run", runId, "--target", target]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/verification failed/);
    expect(existsSync(target)).toBe(false);
  });
});

describe("slice 143/146 — the backup CLI refuses to write inside the publish tree", () => {
  // SLICE 146: this used to assert against `join(REPO, "backups-should-not-exist")`
  // and passed only because REPO happened to be `/home/team/shared/site` — the
  // guard itself was a literal `/site/` regex, so in a detached worktree
  // (/tmp/wt-abc/GetSimplerLife100) the guard did not fire and the test failed
  // (expected non-zero, got 0). Both halves are fixed: the guard now resolves
  // the tree the code lives in, and this test builds the "inside" path from
  // THAT root, so it means the same thing wherever it runs.
  it("exits non-zero for an out dir inside the tree the code lives in", () => {
    const root = publishTreeRoot();
    expect(root).toBeTruthy(); // our repo really is identifiable from this module
    expect(isInsidePublishTree(root!)).toBe(true);
    const inside = join(root!, "backups-should-not-exist");
    expect(isInsidePublishTree(inside)).toBe(true);

    const data = makeDataDir({ "users.json": "{}" });
    const res = spawnSync("bun", ["scripts/backup.mjs", "--data-dir", data, "--out", inside], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/refusing to write a backup inside the publish tree/);
    expect(existsSync(inside)).toBe(false);
  });

  it("keeps the literal /site/ backstop and allows a normal directory", () => {
    // the platform's publish tree names, refused even if the code lives elsewhere
    expect(isInsidePublishTree("/home/team/shared/site/.data/backups")).toBe(true);
    expect(isInsidePublishTree("/var/www/site")).toBe(true);
    // a directory outside the tree is allowed — the guard must not over-refuse
    const outside = mkdtempSync(join(tmpdir(), "bk-outside-"));
    tmpDirs.push(outside);
    expect(isInsidePublishTree(join(outside, "backups"))).toBe(false);
  });
});

describe("slice 143 — retention", () => {
  it("keeps the newest run per day for 7 days, then 4 weeks, and prunes the rest", () => {
    const ids = [
      "2026-10-30T06-00-00Z",
      "2026-10-30T18-00-00Z", // same day as above — the newer one wins the day slot
      "2026-10-29T18-00-00Z",
      "2026-10-28T18-00-00Z",
      "2026-10-27T18-00-00Z",
      "2026-10-26T18-00-00Z",
      "2026-10-25T18-00-00Z",
      "2026-10-24T18-00-00Z",
      "2026-10-23T18-00-00Z", // 8th distinct day → weekly bucket
      "2026-10-16T18-00-00Z",
      "2026-10-09T18-00-00Z",
      "2026-10-02T18-00-00Z",
      "2026-09-25T18-00-00Z", // 5th week → pruned
      "not-a-run-id", // unknown shape → pruned, never kept by accident
    ];
    const plan = planRetention(ids, { daily: 7, weekly: 4 });
    expect(plan.keep).toContain("2026-10-30T18-00-00Z");
    expect(plan.keep).not.toContain("2026-10-30T06-00-00Z");
    expect(plan.keep).toHaveLength(11);
    // 10-23 shares ISO week 2026-W43 with the kept 10-24/10-25 runs, so the
    // weekly slot is already covered and the older run in that week goes.
    expect(plan.prune).toEqual(["2026-10-30T06-00-00Z", "2026-10-23T18-00-00Z", "not-a-run-id"]);
    expect(plan.keep).toContain("2026-09-25T18-00-00Z");
  });

  it("run ids round-trip and weeks are ISO weeks", () => {
    const d = new Date(Date.UTC(2026, 9, 30, 18, 0, 0));
    expect(runIdFor(d)).toBe("2026-10-30T18-00-00Z");
    expect(weekKeyOf(d)).toBe("2026-W44");
  });
});

describe("slice 143 — the admin surface reports what actually happened", () => {
  it("reads a real status file", () => {
    const dir = makeDataDir({ "users.json": "{}" });
    const manifest = manifestFor([{ path: "users.json", sha256: "x", bytes: 2 }]);
    writeFileSync(join(dir, BACKUP_STATUS_FILE), JSON.stringify(statusFor(manifest, "/home/team/shared/backups/run1")));
    const status = readBackupStatus(dir);
    expect(status).toMatchObject({
      lastBackupAt: "2026-10-30T20:00:00.000Z",
      lastBackupOk: true,
      lastBackupBytes: 2,
      lastBackupTarget: "/home/team/shared/backups/run1",
      lastBackupError: null,
      lastBackupRunId: "2026-10-30T20-00-00Z",
      lastBackupFiles: 1,
      lastBackupEncryption: "off",
    });
  });

  it("reports nulls — never a made-up success — when the status is missing or malformed", () => {
    const dir = makeDataDir({ "users.json": "{}" });
    expect(readBackupStatus(dir).lastBackupOk).toBeNull();
    writeFileSync(join(dir, BACKUP_STATUS_FILE), "{not json");
    const status = readBackupStatus(dir);
    expect(status.lastBackupOk).toBeNull();
    expect(status.lastBackupAt).toBeNull();
  });

  it("counts store entries without exposing a single value", () => {
    const dir = makeDataDir({
      "users.json": JSON.stringify({ "a@example.com": { role: "admin" }, "b@example.com": { role: "user" } }),
      "tenant_approvals.json": JSON.stringify({ "a@example.com": [{ id: "1" }, { id: "2" }] }),
    });
    const counts = countStoreEntries(dir);
    expect(counts.find((c) => c.file === "users.json")).toMatchObject({ present: true, entries: 2 });
    expect(counts.find((c) => c.file === "tenant_approvals.json")).toMatchObject({ present: true, entries: 1 });
    expect(counts.find((c) => c.file === "leads.json")).toMatchObject({ present: false, entries: 0 });
    expect(JSON.stringify(counts)).not.toMatch(/a@example\.com/);
  });
});
