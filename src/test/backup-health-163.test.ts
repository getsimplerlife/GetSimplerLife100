/**
 * SLICE 163 — does the off-box copy actually exist, and is it current?
 *
 * WHAT THIS PINS. Every one of these is a way a deployment says "backed up" when
 * it is not:
 *   1. no status file at all            → verdict "never" (never "green");
 *   2. attempts that never succeeded    → verdict "never", with the error quoted;
 *   3. a last success older than 2.5×   → "red", with the age;
 *   4. an upload that never succeeded   → "red" — the archive is still on this
 *      disk, which is the exact thing the plan promises clients it is not;
 *   5. a manifest that predates a declared store → "red";
 *   6. the age of the OFF-BOX copy is measured against a real upload success,
 *      not against the last attempt (a day of failed uploads must not look
 *      fresh);
 *   7. `/api/admin/data-health` cannot be green while the off-box half is red.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBackupHealthReport } from "../lib/backup-health";
import { resolveDeploymentNamespace } from "../lib/backup-namespace";
import { DURABLE_STORES } from "../lib/durable-stores";
import { buildDataHealthReport } from "../lib/data-health";
import { writeBackupStatus, type BackupStatus } from "../../scripts/lib/backup-core";

const HOUR = 3_600_000;
const R2_ENV = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function sandbox(): { dataDir: string; outDir: string } {
  const root = mkdtempSync(join(tmpdir(), "sl163-"));
  dirs.push(root);
  const dataDir = join(root, "data");
  const outDir = join(root, "backups");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  return { dataDir, outDir };
}

function writeStatus(dataDir: string, status: BackupStatus): void {
  writeFileSync(join(dataDir, "backup_status.json"), JSON.stringify(status, null, 2));
}

/** A run directory with a manifest whose coverage table lists `stores`. */
function writeRun(
  outDir: string,
  runId: string,
  opts: { stores?: string[]; takenAt?: string; omit?: string[] } = {},
): void {
  // `stores` = the rows the manifest knows about (an older manifest knows fewer);
  // `omit` = a store that is present on disk with bytes but not in the archive.
  const rows = opts.stores ?? [...DURABLE_STORES];
  const omit = new Set(opts.omit ?? []);
  const dir = join(outDir, runId);
  mkdirSync(dir, { recursive: true });
  const coverage = rows.map((store) => ({
    store,
    presentOnDisk: true,
    includedInArchive: !omit.has(store),
    bytes: 12,
  }));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      runId,
      takenAt: opts.takenAt ?? new Date().toISOString(),
      files: [],
      totals: { files: 0, bytes: 0 },
      excluded: [],
      coverage,
      encryption: "aes-256-gcm",
      archive: `${runId}.tar.gz.enc`,
      tool: "scripts/backup.mjs",
    }),
  );
}

const uploaded = (uploadedAt: string) => ({
  configured: true,
  uploaded: true,
  key: "simplerlife100/backups/live/2026-11-01T07-55-12Z.tar.gz.enc",
  bytes: 1234,
  etag: "etag",
  uploadedAt,
  error: null,
  uploadSkipped: null,
  pruned: [],
  pruneError: null,
});

function report(dataDir: string, outDir: string, now = new Date()) {
  return buildBackupHealthReport({
    dataDir,
    outDir,
    namespace: resolveDeploymentNamespace({ env: { ...R2_ENV }, dataDir }),
    env: { ...R2_ENV },
    intervalMs: HOUR,
    now,
  });
}

describe("buildBackupHealthReport — the off-box truth", () => {
  it("reads NEVER, not fine, when no backup has ever run", () => {
    const { dataDir, outDir } = sandbox();
    const r = report(dataDir, outDir);
    expect(r.verdict).toBe("never");
    expect(r.ok).toBe(false);
    expect(r.status.present).toBe(false);
    expect(r.status.staleReason).toBe("never-ran");
    expect(r.reasons.join(" ")).toContain("never completed a backup run");
    expect(r.reasons.join(" ")).toContain(dataDir);
  });

  it("reads NEVER when attempts exist but none ever succeeded, and quotes the error", () => {
    const { dataDir, outDir } = sandbox();
    writeStatus(dataDir, {
      lastBackupAt: new Date().toISOString(),
      lastBackupOk: false,
      lastBackupBytes: null,
      lastBackupTarget: outDir,
      lastBackupError: "refusing to write a backup inside the publish tree",
      lastBackupOkAt: null,
      consecutiveFailures: 4,
    } as BackupStatus);
    const r = report(dataDir, outDir);
    expect(r.verdict).toBe("never");
    expect(r.ok).toBe(false);
    expect(r.status.consecutiveFailures).toBe(4);
    expect(r.reasons.join(" ")).toContain("refusing to write a backup inside the publish tree");
  });

  it("reads RED when the last success is older than 2.5× the interval", () => {
    const { dataDir, outDir } = sandbox();
    const now = new Date("2026-11-01T12:00:00Z");
    const old = new Date(now.getTime() - 3 * HOUR).toISOString();
    writeStatus(dataDir, {
      lastBackupAt: old,
      lastBackupOk: true,
      lastBackupOkAt: old,
      lastBackupBytes: 10,
      lastBackupTarget: join(outDir, "2026-11-01T09-00-00Z"),
      lastBackupError: null,
      r2: uploaded(old),
      lastUploadOkAt: old,
    } as BackupStatus);
    writeRun(outDir, "2026-11-01T09-00-00Z", { takenAt: old });
    const r = report(dataDir, outDir, now);
    expect(r.verdict).toBe("red");
    expect(r.status.stale).toBe(true);
    expect(r.status.staleReason).toBe("overdue");
    expect(r.status.staleAfterMs).toBe(Math.round(HOUR * 2.5));
    expect(r.reasons.join(" ")).toContain("older than the 9000s");
  });

  it("reads RED when the last upload did not succeed — the archive is still on this disk", () => {
    const { dataDir, outDir } = sandbox();
    const now = new Date("2026-11-01T12:00:00Z");
    const ok = new Date(now.getTime() - 5 * 60_000).toISOString();
    writeStatus(dataDir, {
      lastBackupAt: ok,
      lastBackupOk: true,
      lastBackupOkAt: ok,
      lastBackupBytes: 10,
      lastBackupTarget: join(outDir, "run-a"),
      lastBackupError: null,
      lastUploadOkAt: ok,
      r2: {
        configured: true,
        uploaded: false,
        key: null,
        bytes: null,
        etag: null,
        uploadedAt: null,
        error: "R2 PUT failed: HTTP 403",
        uploadSkipped: null,
        pruned: [],
        pruneError: null,
      },
    } as BackupStatus);
    writeRun(outDir, "run-a");
    const r = report(dataDir, outDir, now);
    expect(r.verdict).toBe("red");
    expect(r.upload.uploaded).toBe(false);
    expect(r.reasons.join(" ")).toContain("still on this disk");
    expect(r.reasons.join(" ")).toContain("HTTP 403");
  });

  it("reads RED when the newest archive left out a declared store", () => {
    const { dataDir, outDir } = sandbox();
    const now = new Date("2026-11-01T12:00:00Z");
    const ok = new Date(now.getTime() - 60_000).toISOString();
    writeStatus(dataDir, {
      lastBackupAt: ok,
      lastBackupOk: true,
      lastBackupOkAt: ok,
      lastBackupBytes: 10,
      lastBackupTarget: join(outDir, "run-b"),
      lastBackupError: null,
      lastUploadOkAt: ok,
      r2: uploaded(ok),
    } as BackupStatus);
    // A store that holds bytes but is NOT in the archive: silent data loss
    // dressed up as coverage.
    writeRun(outDir, "run-b", { omit: ["page_views.json"] });
    const r = report(dataDir, outDir, now);
    expect(r.coverage.verdict).toBe("red");
    expect(r.coverage.uncovered).toContain("page_views.json");
    expect(r.verdict).toBe("red");
  });

  it("reads RED when the newest archive predates declared stores", () => {
    const { dataDir, outDir } = sandbox();
    const now = new Date("2026-11-01T12:00:00Z");
    const ok = new Date(now.getTime() - 60_000).toISOString();
    writeStatus(dataDir, {
      lastBackupAt: ok,
      lastBackupOk: true,
      lastBackupOkAt: ok,
      lastBackupBytes: 10,
      lastBackupTarget: join(outDir, "run-c"),
      lastBackupError: null,
      lastUploadOkAt: ok,
      r2: uploaded(ok),
    } as BackupStatus);
    writeRun(outDir, "run-c", { stores: DURABLE_STORES.slice(0, DURABLE_STORES.length - 3) });
    const r = report(dataDir, outDir, now);
    expect(r.coverage.declaredSinceManifest).toBe(3);
    expect(r.coverage.verdict).toBe("red");
    expect(r.verdict).toBe("red");
  });

  it("is GREEN only when the run is fresh, uploaded and covered", () => {
    const { dataDir, outDir } = sandbox();
    const now = new Date("2026-11-01T12:00:00Z");
    const ok = new Date(now.getTime() - 60_000).toISOString();
    writeStatus(dataDir, {
      lastBackupAt: ok,
      lastBackupOk: true,
      lastBackupOkAt: ok,
      lastBackupBytes: 10,
      lastBackupTarget: join(outDir, "run-d"),
      lastBackupError: null,
      lastUploadOkAt: ok,
      r2: uploaded(ok),
    } as BackupStatus);
    writeRun(outDir, "run-d", { takenAt: ok });
    const r = report(dataDir, outDir, now);
    expect(r.verdict).toBe("green");
    expect(r.ok).toBe(true);
    expect(r.coverage.verdict).toBe("green");
    expect(r.namespace.prefix).toContain("/live/");
    expect(r.upload.key).toContain("/live/");
  });

  it("measures the age of the OFF-BOX copy against a real upload, not the last attempt", () => {
    const { dataDir, outDir } = sandbox();
    const now = new Date("2026-11-01T12:00:00Z");
    const recentAttempt = new Date(now.getTime() - 60_000).toISOString();
    const oldUpload = new Date(now.getTime() - 6 * HOUR).toISOString();
    writeStatus(dataDir, {
      lastBackupAt: recentAttempt,
      lastBackupOk: true,
      lastBackupOkAt: recentAttempt,
      lastBackupBytes: 10,
      lastBackupTarget: join(outDir, "run-e"),
      lastBackupError: null,
      lastUploadOkAt: oldUpload,
      r2: uploaded(recentAttempt),
    } as BackupStatus);
    writeRun(outDir, "run-e", { takenAt: recentAttempt });
    const r = report(dataDir, outDir, now);
    expect(r.upload.ageSeconds).toBe(6 * 3600);
    expect(r.verdict).toBe("red");
    expect(r.reasons.join(" ")).toContain("last successful off-box upload");
  });

  it("says the destination is not configured instead of pretending an upload happened", () => {
    const { dataDir, outDir } = sandbox();
    const now = new Date("2026-11-01T12:00:00Z");
    const ok = new Date(now.getTime() - 60_000).toISOString();
    writeStatus(dataDir, {
      lastBackupAt: ok,
      lastBackupOk: true,
      lastBackupOkAt: ok,
      lastBackupBytes: 10,
      lastBackupTarget: join(outDir, "run-f"),
      lastBackupError: null,
      r2: uploaded(ok),
    } as BackupStatus);
    writeRun(outDir, "run-f", { takenAt: ok });
    const r = buildBackupHealthReport({
      dataDir,
      outDir,
      namespace: resolveDeploymentNamespace({ env: { NODE_ENV: "test" }, dataDir }),
      env: { NODE_ENV: "test" },
      intervalMs: HOUR,
      now,
    });
    expect(r.namespace.configured).toBe(false);
    expect(r.namespace.missing).toContain("R2_ACCOUNT_ID");
    expect(r.verdict).toBe("red");
    expect(r.reasons.join(" ")).toContain("not configured");
  });
});

describe("the off-box half cannot be hidden behind a green publish verdict", () => {
  it("makes /api/admin/data-health red when the backup has never run", () => {
    const { dataDir, outDir } = sandbox();
    const backup = report(dataDir, outDir);
    const health = buildDataHealthReport({
      dataDir,
      serverBase: "/somewhere/else",
      processStartedAt: new Date(),
      backup,
    });
    expect(health.backup).toBeTruthy();
    expect(health.backup!.verdict).toBe("never");
    expect(health.verdict).toBe("red");
    expect(health.ok).toBe(false);
    expect(health.reasons.join(" ")).toContain("no off-box copy yet");
  });

  it("reports the off-box block even when the caller supplies nothing", () => {
    const { dataDir } = sandbox();
    const health = buildDataHealthReport({
      dataDir,
      serverBase: "/somewhere/else",
      processStartedAt: new Date(),
    });
    expect(health.backup).toBeNull();
  });
});

describe("writeBackupStatus keeps the age of the off-box copy honest", () => {
  it("carries the last successful upload forward across a failed one", () => {
    const { dataDir } = sandbox();
    const first = new Date("2026-11-01T06:00:00Z").toISOString();
    writeBackupStatus(dataDir, {
      lastBackupAt: first,
      lastBackupOk: true,
      lastBackupBytes: 1,
      lastBackupTarget: "/x",
      lastBackupError: null,
      r2: uploaded(first),
    } as BackupStatus);
    const afterFirst = JSON.parse(
      readFileSync(join(dataDir, "backup_status.json"), "utf-8"),
    );
    expect(afterFirst.lastUploadOkAt).toBe(first);

    writeBackupStatus(dataDir, {
      lastBackupAt: new Date("2026-11-01T07:00:00Z").toISOString(),
      lastBackupOk: true,
      lastBackupBytes: 1,
      lastBackupTarget: "/x",
      lastBackupError: null,
      r2: {
        configured: true,
        uploaded: false,
        key: null,
        bytes: null,
        etag: null,
        uploadedAt: null,
        error: "R2 PUT failed: HTTP 500",
        uploadSkipped: null,
        pruned: [],
        pruneError: null,
      },
    } as BackupStatus);
    const afterSecond = JSON.parse(
      readFileSync(join(dataDir, "backup_status.json"), "utf-8"),
    );
    // The successful upload is still the last one that WORKED.
    expect(afterSecond.lastUploadOkAt).toBe(first);
    expect(afterSecond.consecutiveUploadFailures).toBe(1);
  });
});
