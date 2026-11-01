/**
 * boot-restore-164.test.ts — SLICE 164. Data that outlives a disk it cannot keep.
 *
 * The live deployment's filesystem is replaced by every publish (see the header
 * of src/lib/boot-restore.ts for the evidence). The only honest architecture left
 * is: restore this deployment's newest encrypted archive into the empty data
 * directory at boot, then back up on a schedule. These tests prove the parts that
 * can destroy data if they are wrong — which is all of them:
 *
 *   1. a directory that predates this boot is NEVER restored over;
 *   2. a fresh directory IS restored, and the bytes land byte-identical;
 *   3. machine identity (`deployment-generation.json`, `backup_instance.json`,
 *      `backup_status.json`) is NEVER written back from another machine's archive;
 *   4. only THIS deployment's own namespace is listed — another deployment's
 *      archive is not a recovery, it is contamination;
 *   5. a tampered archive is refused before anything is written;
 *   6. every failure is REPORTED (a report file + a reason), never thrown.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  BOOT_RESTORE_FILE,
  NEVER_RESTORED,
  bootRestoreNeeded,
  readBootRestore,
  restoreNewestArchiveAtBoot,
} from "~/lib/boot-restore";
import { buildManifest, collectVerifiedFiles, type Manifest } from "../../scripts/lib/backup-core";
import { encryptRunDir } from "../../scripts/lib/backup-crypto";
import type { R2Fetch } from "~/lib/r2-upload";

const PASS = "test-passphrase-164";
const RUN_ID = "2026-11-01T09-00-00Z";
const LIVE_PREFIX = "simplerlife100/backups/live/";

const tmpDirs: string[] = [];
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

/** Build a real encrypted archive of `payload`, exactly as a backup run does. */
function buildArchive(payload: Record<string, string>, runId = RUN_ID): { bytes: Buffer; manifest: Manifest } {
  const runDir = tmp("sl-run-");
  const dataDir = join(runDir, "data");
  mkdirSync(dataDir, { recursive: true });
  writeFiles(dataDir, payload);
  const { files, totals } = collectVerifiedFiles(dataDir, { sleepMs: 0 });
  const manifest = buildManifest({
    runId,
    takenAt: "2026-11-01T09:00:00.000Z",
    source: { host: "live", dataDir: "/home/engine/.data", gitSha: "abc1234", durableEnabled: false },
    files,
    totals,
    excluded: [],
    encryption: "aes-256-gcm",
    archive: `${runId}.tar.gz.enc`,
  });
  writeFileSync(join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const archiveName = encryptRunDir(runDir, manifest, PASS);
  return { bytes: readFileSync(join(runDir, archiveName)), manifest };
}

/** A fake bucket: LIST answers one page of XML, GET answers the object bytes. */
function fakeBucket(objects: Array<{ key: string; bytes: Buffer }>, opts: { tamper?: boolean } = {}) {
  const calls: string[] = [];
  const fetchImpl: R2Fetch = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    const u = new URL(url);
    const listing = init.method === "GET" && u.searchParams.get("list-type") === "2";
    if (listing) {
      const contents = objects
        .map(
          (o) =>
            `<Contents><Key>${o.key}</Key><Size>${o.bytes.length}</Size>` +
            `<ETag>&quot;etag-${o.key.length}&quot;</ETag><LastModified>2026-11-01T09:00:00.000Z</LastModified></Contents>`,
        )
        .join("");
      const xml = `<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => xml,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    // GET object: the path is /<bucket>/<key>
    const key = decodeURIComponent(u.pathname.replace(/^\/[^/]+\//, ""));
    const found = objects.find((o) => o.key === key);
    if (!found) {
      return { ok: false, status: 404, headers: { get: () => null }, text: async () => "not found", arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const bytes = Buffer.from(found.bytes);
    if (opts.tamper) bytes[bytes.length - 20] ^= 0xff;
    return {
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === "etag" ? '"etag"' : null) },
      text: async () => "",
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  };
  return { fetchImpl, calls };
}

function env(extra: Record<string, string> = {}): Record<string, string | undefined> {
  return {
    // the suite's own runtime identity, so the non-production gate is exercised
    VITEST: "1",
    R2_ACCOUNT_ID: "acct-164",
    R2_ACCESS_KEY_ID: "key-164",
    R2_SECRET_ACCESS_KEY: "secret-164",
    R2_BUCKET: "bucket-164",
    R2_INSTANCE: "live",
    BACKUP_PASSPHRASE: PASS,
    // the suite runs with VITEST set; this is what lets a test drive the real path
    BACKUP_R2_ALLOW_NONPROD: "1",
    ...extra,
  };
}

const PAYLOAD = {
  "users.json": JSON.stringify({ "owner@example.com": { role: "admin" } }),
  "tenant_purchases.json": JSON.stringify({ a: 1 }),
  "vault/blobs/aa/doc_1/v1.bin": "blob-bytes",
  // machine identity that must NEVER be restored:
  "deployment-generation.json": JSON.stringify({ version: 1, firstSeenAt: "2026-10-01T00:00:00.000Z", boots: 9 }),
  "backup_instance.json": JSON.stringify({ id: "data-b2e7f21a", dataDir: "/home/team/shared/.data" }),
  "backup_status.json": JSON.stringify({ lastBackupOkAt: "2026-10-31T06:25:50.939Z", r2: { key: "simplerlife100/backups/data-b2e7f21a/x.tar.gz.enc" } }),
};

describe("slice 164 — when a restore is allowed at all", () => {
  it("needs one when there is no marker yet (a brand-new directory)", () => {
    const d = bootRestoreNeeded(null, new Date("2026-11-01T08:37:26.830Z"));
    expect(d.needed).toBe(true);
    expect(d.reason).toContain("created by this boot");
  });

  it("needs one when the marker was created by this very boot (the live case)", () => {
    const d = bootRestoreNeeded("2026-11-01T08:37:26.937Z", new Date("2026-11-01T08:37:26.830Z"));
    expect(d.needed).toBe(true);
  });

  it("NEVER restores over a directory that predates this process (this dev box)", () => {
    const d = bootRestoreNeeded("2026-10-30T22:00:00.000Z", new Date("2026-11-01T08:37:26.830Z"));
    expect(d.needed).toBe(false);
    expect(d.reason).toContain("must not be overwritten");
  });

  it("refuses to restore when the marker's timestamp cannot be established", () => {
    const d = bootRestoreNeeded("not-a-date", new Date("2026-11-01T08:37:26.830Z"));
    expect(d.needed).toBe(false);
  });
});

describe("slice 164 — restoring a fresh directory", () => {
  it("pulls the newest object of THIS deployment's namespace and writes it byte-identical", async () => {
    const { bytes } = buildArchive(PAYLOAD);
    // a NEWER object in ANOTHER deployment's namespace must be ignored
    const other = buildArchive({ "users.json": '{"someone":"else"}' }, "2026-11-01T10-00-00Z");
    const bucket = fakeBucket([
      { key: `${LIVE_PREFIX}${RUN_ID}.tar.gz.enc`, bytes },
      { key: `simplerlife100/backups/data-b2e7f21a/2026-11-01T10-00-00Z.tar.gz.enc`, bytes: other.bytes },
    ]);
    const dataDir = tmp("sl-restore-target-");
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:37:26.830Z"),
      markerFirstSeenAt: null,
      env: env(),
      fetchImpl: bucket.fetchImpl,
      stageRoot: tmp("sl-stage-"),
    });

    expect(report.attempted).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.key).toBe(`${LIVE_PREFIX}${RUN_ID}.tar.gz.enc`);
    expect(report.runId).toBe(RUN_ID);
    expect(report.files).toBeGreaterThanOrEqual(3);
    // the data really landed
    expect(JSON.parse(readFileSync(join(dataDir, "users.json"), "utf8"))).toEqual({ "owner@example.com": { role: "admin" } });
    expect(readFileSync(join(dataDir, "vault/blobs/aa/doc_1/v1.bin"), "utf8")).toBe("blob-bytes");
    // only this deployment's namespace was listed
    expect(bucket.calls.some((c) => c.includes("data-b2e7f21a"))).toBe(false);
    // and the record is on disk for the page to read
    expect(readBootRestore(dataDir)?.runId).toBe(RUN_ID);
    expect(existsSync(join(dataDir, BOOT_RESTORE_FILE))).toBe(true);
  });

  it("never writes machine identity back from another machine's archive", async () => {
    const { bytes } = buildArchive(PAYLOAD);
    const bucket = fakeBucket([{ key: `${LIVE_PREFIX}${RUN_ID}.tar.gz.enc`, bytes }]);
    const dataDir = tmp("sl-restore-target-");
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:37:26.830Z"),
      markerFirstSeenAt: null,
      env: env(),
      fetchImpl: bucket.fetchImpl,
      stageRoot: tmp("sl-stage-"),
    });
    expect(report.ok).toBe(true);
    for (const name of ["deployment-generation.json", "backup_instance.json", "backup_status.json"]) {
      expect(existsSync(join(dataDir, name))).toBe(false);
      expect(report.excluded).toContain(name);
    }
    // The list itself is the contract: a name added here without a reason fails.
    expect(NEVER_RESTORED).toContain("deployment-generation.json");
    expect(NEVER_RESTORED).toContain("backup_instance.json");
    expect(NEVER_RESTORED).toContain("backup_status.json");
    expect(NEVER_RESTORED).toContain(BOOT_RESTORE_FILE);
  });

  it("does nothing at all on a directory that predates this boot", async () => {
    const { bytes } = buildArchive(PAYLOAD);
    const bucket = fakeBucket([{ key: `${LIVE_PREFIX}${RUN_ID}.tar.gz.enc`, bytes }]);
    const dataDir = tmp("sl-restore-target-");
    writeFileSync(join(dataDir, "users.json"), '{"keep":"me"}');
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:37:26.830Z"),
      markerFirstSeenAt: "2026-10-01T00:00:00.000Z",
      env: env(),
      fetchImpl: bucket.fetchImpl,
      stageRoot: tmp("sl-stage-"),
    });
    expect(report.attempted).toBe(false);
    expect(report.ok).toBeNull();
    expect(report.skippedReason).toContain("must not be overwritten");
    expect(readFileSync(join(dataDir, "users.json"), "utf8")).toBe('{"keep":"me"}');
    // and it did not even talk to the bucket
    expect(bucket.calls).toHaveLength(0);
  });
});

describe("slice 164 — refusals are reported, never thrown, never destructive", () => {
  it("refuses a tampered archive before writing anything", async () => {
    const { bytes } = buildArchive(PAYLOAD);
    const bucket = fakeBucket([{ key: `${LIVE_PREFIX}${RUN_ID}.tar.gz.enc`, bytes }], { tamper: true });
    const dataDir = tmp("sl-restore-target-");
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:37:26.830Z"),
      markerFirstSeenAt: null,
      env: env(),
      fetchImpl: bucket.fetchImpl,
      stageRoot: tmp("sl-stage-"),
    });
    expect(report.attempted).toBe(true);
    expect(report.ok).toBe(false);
    expect(report.error).toBeTruthy();
    expect(existsSync(join(dataDir, "users.json"))).toBe(false);
  });

  it("says plainly when this deployment's namespace holds no archive yet", async () => {
    const bucket = fakeBucket([]);
    const dataDir = tmp("sl-restore-target-");
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:37:26.830Z"),
      markerFirstSeenAt: null,
      env: env(),
      fetchImpl: bucket.fetchImpl,
      stageRoot: tmp("sl-stage-"),
    });
    expect(report.attempted).toBe(false);
    expect(report.skippedReason).toContain("nothing to restore");
  });

  it("skips with a reason when off-box storage is not configured", async () => {
    const dataDir = tmp("sl-restore-target-");
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:37:26.830Z"),
      markerFirstSeenAt: null,
      env: { BACKUP_R2_ALLOW_NONPROD: "1" },
      stageRoot: tmp("sl-stage-"),
    });
    expect(report.attempted).toBe(false);
    expect(report.skippedReason).toContain("not configured");
  });

  it("skips with a reason when the passphrase is missing (no plaintext, no restore)", async () => {
    const dataDir = tmp("sl-restore-target-");
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:37:26.830Z"),
      markerFirstSeenAt: null,
      env: env({ BACKUP_PASSPHRASE: "" }),
      stageRoot: tmp("sl-stage-"),
    });
    expect(report.attempted).toBe(false);
    expect(report.skippedReason).toContain("BACKUP_PASSPHRASE");
  });

  it("does not fetch a production archive during a test runtime", async () => {
    const dataDir = tmp("sl-restore-target-");
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:37:26.830Z"),
      markerFirstSeenAt: null,
      env: env({ BACKUP_R2_ALLOW_NONPROD: "" }),
      stageRoot: tmp("sl-stage-"),
    });
    expect(report.attempted).toBe(false);
    expect(report.skippedReason).toContain("non-production runtime");
  });
});
