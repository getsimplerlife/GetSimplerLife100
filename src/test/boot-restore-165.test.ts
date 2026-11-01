/**
 * boot-restore-165.test.ts — SLICE 165, defect 2. A restore that pulls ANOTHER
 * deployment's data is not a recovery, it is contamination.
 *
 * WHAT HAPPENED. `restoreNewestArchiveAtBoot` was called without an `env`, so it
 * read `process.env` and never saw the `R2_INSTANCE` that
 * `resolveDeploymentNamespace` injects for the UPLOADER. A brand-new data
 * directory has no `backup_instance.json`, so `peekUploadPrefix` fell back to the
 * flat base prefix `simplerlife100/backups/`, and `selectRemoteObject` took the
 * newest object across every deployment in the bucket. Result: the live
 * deployment restored this dev box's `host-primary` archive, reported
 * `ok: true`, and its page said "the data survives anyway".
 *
 * Independently reproduced during QA: a run with a brand-new empty DATA_DIR under
 * /tmp restored 36 files of production data from
 * `simplerlife100/backups/host-primary/…`, then refreshed real tenant OAuth
 * tokens and attempted real SendGrid sends.
 *
 * These tests prove the two halves of the fix:
 *   - the restore is handed the SAME derived environment the uploader uses, so
 *     it lists this deployment's own namespace;
 *   - with no resolvable namespace it restores NOTHING and says why. Restoring
 *     nothing is correct; restoring the wrong data is not.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { restoreNewestArchiveAtBoot } from "~/lib/boot-restore";
import { resolveDeploymentNamespace } from "~/lib/backup-namespace";
import { buildManifest, collectVerifiedFiles, type Manifest } from "../../scripts/lib/backup-core";
import { encryptRunDir } from "../../scripts/lib/backup-crypto";
import type { R2Fetch } from "~/lib/r2-upload";

const PASS = "test-passphrase-165";
const RUN_ID = "2026-11-01T08-55-12Z";
const HOST_PREFIX = "simplerlife100/backups/host-primary/";
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

/** A real encrypted archive, built exactly the way a backup run builds one. */
function buildArchive(payload: Record<string, string>, runId = RUN_ID): { bytes: Buffer; manifest: Manifest } {
  const runDir = tmp("sl165-run-");
  const dataDir = join(runDir, "data");
  mkdirSync(dataDir, { recursive: true });
  writeFiles(dataDir, payload);
  const { files, totals } = collectVerifiedFiles(dataDir, { sleepMs: 0 });
  const manifest = buildManifest({
    runId,
    takenAt: "2026-11-01T08:55:12.000Z",
    source: { host: "host-primary", dataDir: "/home/team/shared/.data", gitSha: "5a24249", durableEnabled: false },
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
function fakeBucket(objects: Array<{ key: string; bytes: Buffer }>) {
  const calls: string[] = [];
  const fetchImpl: R2Fetch = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    const u = new URL(url);
    if (init.method === "GET" && u.searchParams.get("list-type") === "2") {
      // honour the prefix, like the real bucket does — otherwise a listing
      // "inside live/" would hand back another deployment's keys
      const prefix = u.searchParams.get("prefix") || "";
      const contents = objects
        .filter((o) => o.key.startsWith(prefix))
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
    const key = decodeURIComponent(u.pathname.replace(/^\/[^/]+\//, ""));
    const found = objects.find((o) => o.key === key);
    if (!found) {
      return {
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: async () => "not found",
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    const bytes = Buffer.from(found.bytes);
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

/** Off-box storage configured, NO namespace named — the exact live shape. */
function envWithoutNamespace(extra: Record<string, string> = {}): Record<string, string | undefined> {
  return {
    VITEST: "1",
    R2_ACCOUNT_ID: "acct-165",
    R2_ACCESS_KEY_ID: "key-165",
    R2_SECRET_ACCESS_KEY: "secret-165",
    R2_BUCKET: "bucket-165",
    BACKUP_PASSPHRASE: PASS,
    BACKUP_R2_ALLOW_NONPROD: "1",
    ...extra,
  };
}

const PRODUCTION_DATA = {
  "users.json": JSON.stringify({ "owner@simplerlife100.com": { role: "admin" } }),
  "tenant_oauth_credentials.json": JSON.stringify({ google: { refreshToken: "REAL-TOKEN" } }),
  "tenant_purchases.json": JSON.stringify({ "customer@example.com": { tier: "Growth" } }),
};

function assertNothingWritten(dataDir: string): void {
  const names = readdirSync(dataDir);
  // the only thing a skipped restore may leave is its own report
  expect(names.filter((n) => n !== "boot_restore.json")).toEqual([]);
  expect(existsSync(join(dataDir, "users.json"))).toBe(false);
  expect(existsSync(join(dataDir, "tenant_oauth_credentials.json"))).toBe(false);
}

describe("slice 165 — a restore may not pull another deployment's archive", () => {
  it("restores NOTHING when this deployment's namespace cannot be resolved", async () => {
    const { bytes } = buildArchive(PRODUCTION_DATA);
    const bucket = fakeBucket([{ key: `${HOST_PREFIX}${RUN_ID}.tar.gz.enc`, bytes }]);
    const dataDir = tmp("sl165-target-");

    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:55:12.000Z"),
      markerFirstSeenAt: null,
      env: envWithoutNamespace(),
      fetchImpl: bucket.fetchImpl,
      stageRoot: tmp("sl165-stage-"),
    });

    expect(report.attempted).toBe(false);
    expect(report.ok).toBeNull();
    expect(report.skippedReason).toContain("cannot determine this deployment's own namespace");
    expect(report.skippedReason).toContain("refusing to restore another deployment's archive");
    // it never even listed the shared base prefix
    expect(bucket.calls).toHaveLength(0);
    assertNothingWritten(dataDir);
  });

  it("THE QA REPRODUCTION: a fresh DATA_DIR under /tmp is not host-primary", async () => {
    // the namespace this deployment actually derives — never the dev box's
    const ns = resolveDeploymentNamespace({ env: { NODE_ENV: "production" }, dataDir: "/tmp/sl165-fresh/.data" });
    expect(ns.instance).toBe("live");
    expect(ns.prefix).toBe(LIVE_PREFIX);
    expect(ns.prefix).not.toContain("host-primary");

    // and a restore handed that derived environment cannot reach host-primary
    const { bytes } = buildArchive(PRODUCTION_DATA);
    const bucket = fakeBucket([{ key: `${HOST_PREFIX}${RUN_ID}.tar.gz.enc`, bytes }]);
    const dataDir = tmp("sl165-target-");
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:55:12.000Z"),
      markerFirstSeenAt: null,
      // the live shape: the real environment (credentials, passphrase) PLUS the
      // instance id the uploader derives — one derivation, both legs.
      env: { ...envWithoutNamespace(), ...ns.env },
      fetchImpl: bucket.fetchImpl,
      stageRoot: tmp("sl165-stage-"),
    });

    expect(report.namespacePrefix).toBe(LIVE_PREFIX);
    // it looked only inside its own namespace, found nothing, and restored nothing
    expect(report.attempted).toBe(false);
    expect(report.ok).toBeNull();
    expect(report.skippedReason).toContain("nothing to restore");
    expect(bucket.calls.some((c) => c.includes("host-primary"))).toBe(false);
    assertNothingWritten(dataDir);
  });

  it("restores its OWN namespace and leaves the other deployment's object alone", async () => {
    const mine = buildArchive({ "users.json": JSON.stringify({ "me@example.com": { role: "admin" } }) });
    const theirs = buildArchive(PRODUCTION_DATA, "2026-11-01T09-30-00Z");
    const bucket = fakeBucket([
      // a NEWER object in another deployment's namespace: the exact trap
      { key: `${HOST_PREFIX}2026-11-01T09-30-00Z.tar.gz.enc`, bytes: theirs.bytes },
      { key: `${LIVE_PREFIX}${RUN_ID}.tar.gz.enc`, bytes: mine.bytes },
    ]);
    const dataDir = tmp("sl165-target-");
    const ns = resolveDeploymentNamespace({ env: { NODE_ENV: "production" }, dataDir });
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:55:12.000Z"),
      markerFirstSeenAt: null,
      // the live shape: the real environment (credentials, passphrase) PLUS the
      // instance id the uploader derives — one derivation, both legs.
      env: { ...envWithoutNamespace(), ...ns.env },
      fetchImpl: bucket.fetchImpl,
      stageRoot: tmp("sl165-stage-"),
    });

    expect(report.ok).toBe(true);
    expect(report.key).toBe(`${LIVE_PREFIX}${RUN_ID}.tar.gz.enc`);
    expect(JSON.parse(readFileSync(join(dataDir, "users.json"), "utf8"))).toEqual({ "me@example.com": { role: "admin" } });
    // the other deployment's data never entered this directory
    expect(existsSync(join(dataDir, "tenant_oauth_credentials.json"))).toBe(false);
    expect(bucket.calls.some((c) => c.includes("host-primary"))).toBe(false);
  });

  it("still obeys an explicit R2_PREFIX — an operator may name a namespace", async () => {
    const { bytes } = buildArchive({ "users.json": JSON.stringify({ "named@example.com": { role: "admin" } }) });
    const bucket = fakeBucket([{ key: `custom/ns/${RUN_ID}.tar.gz.enc`, bytes }]);
    const dataDir = tmp("sl165-target-");
    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-01T08:55:12.000Z"),
      markerFirstSeenAt: null,
      env: envWithoutNamespace({ R2_PREFIX: "custom/ns" }),
      fetchImpl: bucket.fetchImpl,
      stageRoot: tmp("sl165-stage-"),
    });
    expect(report.ok).toBe(true);
    expect(report.namespacePrefix).toBe("custom/ns/");
    expect(existsSync(join(dataDir, "users.json"))).toBe(true);
  });
});
