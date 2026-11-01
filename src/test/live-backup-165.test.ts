/**
 * live-backup-165.test.ts — SLICE 165, defect 1 and defect 3.
 *
 * THE BUG THIS FILE PINS. The published deployment's backups had never run. The
 * owner's data-health page said, in its own words:
 *
 *   `timer error (this boot): another backup run holds
 *    /home/team/shared/backups/.backup-run.lock - could not acquire after
 *    clearing a stale lock`
 *   `local destination: /home/team/shared/backups`
 *
 * Both lines are this dev box. `/home/team/shared/backups` does not exist on the
 * live container and never could, the lock file lives INSIDE that directory, and
 * `runBackup` — the only code that ever created the directory — was never
 * reached because the run had already been refused. The refusal was then
 * reported as CONTENTION, and because a refusal is "skipped", nothing at all was
 * written down: no status file, no reason, nothing to read after a reload.
 *
 * So this file proves, in order:
 *   1. the archive root is DERIVED from DATA_DIR (never this box's literal path),
 *   2. the root is created before the lock, so the run can start on a container
 *      whose disk was just replaced,
 *   3. a missing root says "archive root does not exist", an unwritable one says
 *      "not writable", and only a real EEXIST says "another run holds it",
 *   4. a refusal is persisted and survives a reload, without being counted as a
 *      failure,
 *   5. our own public hostnames are accepted as same-origin, and look-alikes,
 *      wrong ports and `Origin: null` are still refused.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveArchiveBackupDir } from "~/lib/backup-dir";
import { acquireLock, describeLockError, ensureArchiveRoot, runLockPath } from "../../scripts/lib/backup-daemon";
import { backupRefusalRecorder, startBackupScheduler } from "~/lib/backup-scheduler";
import { readBackupRefusal } from "~/lib/backup-status";
import { buildBackupHealthReport } from "~/lib/backup-health";
import type { DeploymentNamespace } from "~/lib/backup-namespace";
import { DEFAULT_ALLOWED_HOSTS, checkSameOrigin } from "~/lib/same-origin";

const tmpDirs: string[] = [];
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    try {
      chmodSync(d, 0o700);
    } catch {
      /* best effort: a 0o500 dir from the unwritable-root test */
    }
    rmSync(d, { recursive: true, force: true });
  }
});

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

describe("slice 165 — where a deployment's archive root actually is", () => {
  it("derives a sibling of DATA_DIR instead of this dev box's literal path", () => {
    const r = resolveArchiveBackupDir({ env: {}, dataDir: "/home/team/shared/.data" });
    // identical to the old hardcoded value on THIS box, which is why nothing here changes
    expect(r.dir).toBe("/home/team/shared/backups");
    expect(r.source).toBe("derived");
  });

  it("gives the live deployment its OWN root, not this box's", () => {
    const r = resolveArchiveBackupDir({ env: {}, dataDir: "/home/engine/.data" });
    expect(r.dir).toBe("/home/engine/backups");
    // the exact path the owner read on the live page must never be the default again
    expect(r.dir).not.toBe("/home/team/shared/backups");
  });

  it("never returns a path inside the data directory it archives", () => {
    for (const dataDir of ["/home/engine/.data", "/tmp/x/.data", "/srv/app/data"]) {
      const r = resolveArchiveBackupDir({ env: {}, dataDir });
      expect(r.dir === dataDir).toBe(false);
      expect(r.dir.startsWith(dataDir + "/")).toBe(false);
    }
  });

  it("obeys an explicit BACKUP_DIR, relative or absolute", () => {
    expect(resolveArchiveBackupDir({ env: { BACKUP_DIR: "/mnt/archives" }, dataDir: "/home/engine/.data" }).dir).toBe(
      "/mnt/archives",
    );
    const rel = resolveArchiveBackupDir({ env: { BACKUP_DIR: "archives" }, dataDir: "/home/engine/.data" });
    expect(rel.source).toBe("env");
    expect(rel.dir.endsWith("/archives")).toBe(true);
  });
});

describe("slice 165 — the run can start on a disk that was just replaced", () => {
  it("creates the archive root (owner-only) that a fresh container does not have", () => {
    const base = tmp("sl-165-root-");
    const dataDir = join(base, ".data");
    mkdirSync(dataDir);
    const { dir } = resolveArchiveBackupDir({ env: {}, dataDir });
    expect(existsSync(dir)).toBe(false);
    const created = ensureArchiveRoot(dir);
    expect(created.ok).toBe(true);
    expect(existsSync(dir)).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    // idempotent: a second boot must not fail on an existing root
    expect(ensureArchiveRoot(dir).ok).toBe(true);
  });

  it("THE ACTUAL LIVE FAILURE: a missing root is named as a missing root, not as contention", () => {
    const base = tmp("sl-165-missing-");
    const dataDir = join(base, ".data");
    mkdirSync(dataDir);
    const { dir } = resolveArchiveBackupDir({ env: {}, dataDir });
    const refused = acquireLock({ path: runLockPath(dir), reason: "test" });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.code).toBe("ENOENT");
    expect(refused.reason).toBe(`archive root does not exist: ${dir}`);
    expect(refused.reason).not.toContain("another backup run holds");
    expect(refused.reason).not.toContain("stale lock");
  });

  it("after creating the root, the very same lock is acquired — the run starts", () => {
    const base = tmp("sl-165-start-");
    const dataDir = join(base, ".data");
    mkdirSync(dataDir);
    const { dir } = resolveArchiveBackupDir({ env: {}, dataDir });
    expect(ensureArchiveRoot(dir).ok).toBe(true);
    const lock = acquireLock({ path: runLockPath(dir), reason: "test" });
    expect(lock.ok).toBe(true);
    if (lock.ok) lock.release();
    expect(existsSync(runLockPath(dir))).toBe(false);
  });

  it.skipIf(isRoot)("an unwritable root says so, instead of blaming a process", () => {
    const base = tmp("sl-165-nowrite-");
    const dataDir = join(base, ".data");
    mkdirSync(dataDir);
    const { dir } = resolveArchiveBackupDir({ env: {}, dataDir });
    mkdirSync(dir);
    chmodSync(dir, 0o500);
    try {
      const refused = acquireLock({ path: runLockPath(dir), reason: "test" });
      expect(refused.ok).toBe(false);
      if (refused.ok) throw new Error("unreachable");
      expect(["EACCES", "EPERM", "EROFS"]).toContain(refused.code);
      expect(refused.reason).toBe(`archive root is not writable: ${dir}`);
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  it("still reports REAL contention as contention", () => {
    const base = tmp("sl-165-contend-");
    const dataDir = join(base, ".data");
    mkdirSync(dataDir);
    const { dir } = resolveArchiveBackupDir({ env: {}, dataDir });
    ensureArchiveRoot(dir);
    const held = acquireLock({ path: runLockPath(dir), reason: "held-by-test" });
    expect(held.ok).toBe(true);
    const second = acquireLock({ path: runLockPath(dir), reason: "second" });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.code ?? null).toBeNull();
    expect(second.reason).toContain(`held by pid ${process.pid}`);
    if (held.ok) held.release();
  });
});

const NAMESPACE: DeploymentNamespace = {
  role: "live",
  instance: "live",
  source: "deployment",
  prefix: "simplerlife100/backups/live/",
  reason: "test namespace",
  uploadAllowed: true,
  skipReason: null,
  env: { R2_INSTANCE: "live" },
};

const NO_TIMERS = {
  setTimeout: () => 0 as unknown,
  clearTimeout: () => {},
};

describe("slice 165 — a refused run leaves evidence the page can read after a reload", () => {
  it("persists the refusal reason and does not count it as a failure", async () => {
    const dataDir = tmp("sl-165-refusal-");
    const reason = "archive root does not exist: /home/engine/backups";
    const scheduler = startBackupScheduler({
      run: async () => ({ ok: false, skipped: true, error: reason }),
      intervalMs: 3_600_000,
      disabled: true,
      timers: NO_TIMERS,
      recordSkip: backupRefusalRecorder(dataDir, "/home/engine/backups"),
      log: () => {},
    });
    const outcome = await scheduler.trigger("scheduled");
    expect(outcome.skipped).toBe(true);
    scheduler.stop();

    // durable: a NEW read (as a page reload would do) sees it
    const refusal = readBackupRefusal(dataDir);
    expect(refusal?.reason).toBe(reason);
    expect(refusal?.target).toBe("/home/engine/backups");

    // and it is NOT a failure: no failure counter, no aged last-success
    const raw = JSON.parse(readFileSync(join(dataDir, "backup_status.json"), "utf8"));
    expect(raw.consecutiveFailures ?? 0).toBe(0);
    expect(raw.lastBackupOkAt ?? null).toBeNull();
    expect(raw.lastBackupError ?? null).toBeNull();

    // and the report the page renders carries it
    const report = buildBackupHealthReport({
      dataDir,
      outDir: "/home/engine/backups",
      namespace: NAMESPACE,
      intervalMs: 3_600_000,
      env: {},
    });
    expect(report.refusal?.reason).toBe(reason);
  });

  it("a refusal with no recorder writes nothing rather than a lie", async () => {
    const dataDir = tmp("sl-165-norecorder-");
    const scheduler = startBackupScheduler({
      run: async () => ({ ok: false, skipped: true, error: "whatever" }),
      intervalMs: 3_600_000,
      disabled: true,
      timers: NO_TIMERS,
      log: () => {},
    });
    await scheduler.trigger("scheduled");
    scheduler.stop();
    expect(readBackupRefusal(dataDir)).toBeNull();
  });

  it("a later real run clears the stale refusal", async () => {
    const dataDir = tmp("sl-165-clear-");
    writeFileSync(
      join(dataDir, "backup_status.json"),
      JSON.stringify({ lastRefusalAt: "2026-11-01T09:06:00.000Z", lastRefusalReason: "old reason", lastRefusalTarget: "/x" }),
    );
    expect(readBackupRefusal(dataDir)?.reason).toBe("old reason");
    // a real (non-skipped) failure rewrites the status from a fresh object
    const scheduler = startBackupScheduler({
      run: async () => ({ ok: false, error: "a real failure" }),
      intervalMs: 3_600_000,
      disabled: true,
      timers: NO_TIMERS,
      recordFailure: (m) => {
        writeFileSync(join(dataDir, "backup_status.json"), JSON.stringify({ lastBackupOk: false, lastBackupError: m }));
      },
      log: () => {},
    });
    await scheduler.trigger("scheduled");
    scheduler.stop();
    expect(readBackupRefusal(dataDir)).toBeNull();
  });
});

describe("slice 165 — our own page is not a cross-origin request", () => {
  // The EXACT header set the live deployment reported on 2026-11-01.
  const LIVE = {
    origin: "https://simplerlife100.ctonew.app",
    host: "5ace135fcf2e81341c199d376a2bd8d8.preview.bl.run",
    urlHost: "ip-10-110-111-6.us-west-2.prod.aws.beamlit.net",
  };

  it("accepts the live header set that was refused with 403", () => {
    const result = checkSameOrigin({ ...LIVE, forwardedHost: null });
    expect(result.ok).toBe(true);
    expect(result.originHost).toBe("simplerlife100.ctonew.app");
    expect(result.reason).toContain("matches");
  });

  it("accepts every one of our own public hostnames", () => {
    for (const host of DEFAULT_ALLOWED_HOSTS) {
      const result = checkSameOrigin({ origin: `https://${host}`, host: "preview.internal", urlHost: "127.0.0.1:3000" });
      expect(result.ok, host).toBe(true);
    }
    expect(DEFAULT_ALLOWED_HOSTS).toContain("simplerlife100.cto.site");
    expect(DEFAULT_ALLOWED_HOSTS).toContain("simplerlife100.ctonew.app");
    expect(DEFAULT_ALLOWED_HOSTS).toContain("simplerlife100-dev.cto.site");
  });

  it("still refuses a look-alike subdomain, a wrong port, Origin: null and an unknown host", () => {
    const refuse = (origin: string | null) =>
      checkSameOrigin({ origin, host: "preview.internal", urlHost: "127.0.0.1:3000" }).ok;
    expect(refuse("https://simplerlife100.cto.site.evil.example")).toBe(false);
    expect(refuse("https://evil-simplerlife100.cto.site")).toBe(false);
    expect(refuse("https://simplerlife100.cto.site:8443")).toBe(false);
    expect(refuse("https://simplerlife100.ctonew.app:3000")).toBe(false);
    expect(refuse("null")).toBe(false);
    expect(refuse("https://evil.example")).toBe(false);
    expect(refuse("https://simplerlife100.com.evil.example")).toBe(false);
  });

  it("EXTRA_ALLOWED_ORIGINS still extends the allowlist", () => {
    const result = checkSameOrigin({
      origin: "https://portal.example.com",
      host: "preview.internal",
      extraAllowed: "https://portal.example.com",
    });
    expect(result.ok).toBe(true);
  });

  it("a host that is ours but on another port is NOT ours", () => {
    const result = checkSameOrigin({ origin: "https://simplerlife100.ctonew.app:8443", host: "preview.internal" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("refused");
  });
});

describe("slice 165 — every errno names its own cause", () => {
  // The suite runs as root here, so a chmod-based EACCES test cannot fail the way
  // it would for an ordinary user. The mapping itself is pure and is pinned here.
  it("maps each errno to the operator's words, and never to contention", () => {
    expect(describeLockError("ENOENT", "/home/engine/backups/.backup-run.lock")).toBe(
      "archive root does not exist: /home/engine/backups",
    );
    expect(describeLockError("EACCES", "/x/backups/.backup-run.lock")).toBe("archive root is not writable: /x/backups");
    expect(describeLockError("EPERM", "/x/backups/.backup-run.lock")).toBe("archive root is not writable: /x/backups");
    expect(describeLockError("EROFS", "/x/backups/.backup-run.lock")).toBe("archive root is not writable: /x/backups");
    expect(describeLockError("ENOTDIR", "/x/backups/.backup-run.lock")).toBe("archive root is not a directory: /x/backups");
    for (const code of ["ENOENT", "EACCES", "EROFS", "ENOTDIR", "ENOSPC"]) {
      expect(describeLockError(code, "/x/backups/lock")).not.toContain("another backup run holds");
      expect(describeLockError(code, "/x/backups/lock")).not.toContain("stale lock");
    }
  });
});
