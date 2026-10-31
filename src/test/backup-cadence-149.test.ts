/**
 * Slice 149 — the clock. Tests for the supervised backup loop's decisions:
 * one run at a time across processes, one loop per archive root, a heartbeat that
 * tells the truth about liveness, and an off-box identity that is set explicitly
 * instead of inherited from whatever runtime happened to start the loop.
 *
 * Nothing here touches the real DATA_DIR or the real archive root: every case
 * uses a temp dir, and the two end-to-end cases run the real CLIs against it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DAEMON_INSTANCE,
  EXIT_REFUSED,
  acquireLock,
  daemonLockPath,
  daemonStatus,
  heartbeatPath,
  isProcessAlive,
  nextRunDelayMs,
  readDaemonHeartbeat,
  readLockHolder,
  releaseLock,
  runLockPath,
  writeDaemonHeartbeat,
  type DaemonHeartbeat,
} from "../../scripts/lib/backup-daemon";
import { publishTreeRoot } from "../../scripts/lib/backup-core";
import { resolveUploadPrefix } from "../../src/lib/r2-upload";

// Same resolution the other backup tests use: cwd when we are at the repo root,
// one level up when the runner started inside a subdirectory.
const REPO_ROOT = existsSync(join(process.cwd(), "prod-server.ts")) ? process.cwd() : join(process.cwd(), "..");
const temps: string[] = [];

function tmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/** A pid that certainly names no live process: spawn something and wait for it. */
function deadPid(): number {
  const r = spawnSync("/bin/sh", ["-c", "echo $$"], { encoding: "utf8" });
  return Number(String(r.stdout).trim());
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("slice 149 — cross-process run lock", () => {
  it("recognises a live pid and a dead one", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(Number.NaN)).toBe(false);
    expect(isProcessAlive(deadPid())).toBe(false);
  });

  it("lets exactly one holder in, and refuses the second", () => {
    const out = tmpDir("lock-");
    const path = runLockPath(out);

    const first = acquireLock({ path, reason: "test-first" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(readLockHolder(path)).toMatchObject({ pid: process.pid, reason: "test-first" });

    const second = acquireLock({ path, reason: "test-second" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.holder?.pid).toBe(process.pid);
    expect(second.reason).toContain("held by pid");

    first.release();
    expect(existsSync(path)).toBe(false);

    const third = acquireLock({ path, reason: "test-third" });
    expect(third.ok).toBe(true);
    if (third.ok) third.release();
  });

  it("takes over a lock whose holder is dead, and says so", () => {
    const out = tmpDir("lock-stale-");
    const path = runLockPath(out);
    mkdirSync(out, { recursive: true });
    writeFileSync(path, JSON.stringify({ pid: deadPid(), at: "2026-10-31T00:00:00.000Z", reason: "crashed" }));

    const got = acquireLock({ path, reason: "test-takeover" });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.tookOver?.reason).toBe("crashed");
    got.release();
  });

  it("treats an unreadable lock file as stale rather than blocking forever", () => {
    const out = tmpDir("lock-garbage-");
    const path = runLockPath(out);
    mkdirSync(out, { recursive: true });
    writeFileSync(path, "not json at all");

    const got = acquireLock({ path, reason: "test-garbage" });
    expect(got.ok).toBe(true);
    if (got.ok) got.release();
  });

  it("never deletes a lock it does not own", () => {
    const out = tmpDir("lock-owner-");
    const path = runLockPath(out);
    const got = acquireLock({ path, reason: "test-owner" });
    expect(got.ok).toBe(true);

    // A different pid trying to release must be a no-op.
    releaseLock(path, process.pid + 1);
    expect(existsSync(path)).toBe(true);
    expect(readLockHolder(path)?.pid).toBe(process.pid);
    if (got.ok) got.release();
  });
});

describe("slice 149 — the daemon loop's heartbeat", () => {
  function heartbeat(over: Partial<DaemonHeartbeat> = {}): DaemonHeartbeat {
    return {
      pid: process.pid,
      state: "running",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      intervalMs: 60 * 60 * 1000,
      firstDelayMs: 60_000,
      ticks: 1,
      lastRunStartedAt: new Date().toISOString(),
      lastRunEndedAt: new Date().toISOString(),
      lastExitCode: 0,
      nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
      env: null,
      ...over,
    };
  }

  it("reports not alive when no loop was ever started", () => {
    const out = tmpDir("hb-none-");
    const s = daemonStatus({ outDir: out });
    expect(s.alive).toBe(false);
    expect(s.reason).toBe("no daemon lock");
  });

  it("reports alive only with a live pid AND a fresh heartbeat", () => {
    const out = tmpDir("hb-live-");
    const lock = acquireLock({ path: daemonLockPath(out), reason: "daemon" });
    expect(lock.ok).toBe(true);
    writeDaemonHeartbeat(out, heartbeat());

    const s = daemonStatus({ outDir: out });
    expect(s.alive).toBe(true);
    expect(s.pid).toBe(process.pid);
    if (lock.ok) lock.release();
  });

  it("goes not-alive when the heartbeat stops being refreshed", () => {
    const out = tmpDir("hb-stale-");
    const lock = acquireLock({ path: daemonLockPath(out), reason: "daemon" });
    // 30 minutes of silence on a 1-minute schedule: the heartbeat is long dead,
    // even though the pid in the lock still exists (a wedged loop, not a crashed one).
    writeDaemonHeartbeat(out, heartbeat({ intervalMs: 60_000, updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() }));

    const s = daemonStatus({ outDir: out, intervalMs: 60_000 });
    expect(s.alive).toBe(false);
    expect(s.reason).toContain("heartbeat is stale");
    if (lock.ok) lock.release();
  });

  it("goes not-alive when the pid in the lock is gone", () => {
    const out = tmpDir("hb-deadpid-");
    mkdirSync(out, { recursive: true });
    writeFileSync(daemonLockPath(out), JSON.stringify({ pid: deadPid(), at: "", reason: "daemon", host: "x" }));
    writeDaemonHeartbeat(out, heartbeat({ pid: deadPid() }));

    const s = daemonStatus({ outDir: out });
    expect(s.alive).toBe(false);
    expect(s.reason).toContain("is not running");
  });

  it("round-trips the heartbeat without inventing fields", () => {
    const out = tmpDir("hb-roundtrip-");
    writeDaemonHeartbeat(out, heartbeat({ ticks: 7, lastExitCode: EXIT_REFUSED }));
    const read = readDaemonHeartbeat(out);
    expect(read?.ticks).toBe(7);
    expect(read?.lastExitCode).toBe(EXIT_REFUSED);
    expect(existsSync(heartbeatPath(out))).toBe(true);
  });
});

describe("slice 149 — cadence arithmetic", () => {
  it("waits firstDelayMs before the first run", () => {
    expect(nextRunDelayMs({ nowMs: 1_000_000, ticks: 0, lastRunStartedAtMs: null, intervalMs: 3_600_000, firstDelayMs: 60_000 })).toBe(60_000);
  });

  it("is fixed-rate from the previous run's start, not a sleep after it", () => {
    const now = 10_000_000;
    // Started 10s ago on an hourly schedule: 59m50s to go, regardless of duration.
    expect(nextRunDelayMs({ nowMs: now, ticks: 1, lastRunStartedAtMs: now - 10_000, intervalMs: 3_600_000, firstDelayMs: 60_000 })).toBe(3_590_000);
  });

  it("starts immediately when a run overran its interval (the lock still serialises)", () => {
    const now = 10_000_000;
    expect(nextRunDelayMs({ nowMs: now, ticks: 2, lastRunStartedAtMs: now - 7_200_000, intervalMs: 3_600_000, firstDelayMs: 60_000 })).toBe(0);
  });
});

describe("slice 149 — the off-box identity is explicit, not inferred", () => {
  const r2env = {
    R2_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "bucket",
  };

  it("still refuses to upload from a dev runtime that names no namespace (slice 147 guard intact)", () => {
    const out = tmpDir("identity-dev-");
    const resolved = resolveUploadPrefix({ env: { ...r2env, NODE_ENV: "development" }, dataDir: out, create: false });
    expect(resolved.uploadAllowed).toBe(false);
    expect(resolved.skipReason).toContain("non-production runtime");
  });

  it("allows the upload when the loop names the instance explicitly", () => {
    const out = tmpDir("identity-explicit-");
    const resolved = resolveUploadPrefix({
      env: { ...r2env, NODE_ENV: "development", R2_INSTANCE: DEFAULT_DAEMON_INSTANCE },
      dataDir: out,
      create: false,
    });
    expect(resolved.uploadAllowed).toBe(true);
    expect(resolved.skipReason).toBeNull();
    expect(resolved.instance).toBe(DEFAULT_DAEMON_INSTANCE);
    expect(resolved.instanceSource).toBe("env");
    expect(resolved.prefix).toBe(`simplerlife100/backups/${DEFAULT_DAEMON_INSTANCE}/`);
  });

  it("does not mutate DATA_DIR while resolving it", () => {
    const out = tmpDir("identity-nomutate-");
    resolveUploadPrefix({ env: { ...r2env, R2_INSTANCE: DEFAULT_DAEMON_INSTANCE }, dataDir: out, create: false });
    expect(existsSync(join(out, "backup_instance.json"))).toBe(false);
  });
});

describe("slice 149 — the CLIs behave", () => {
  it("refuses a concurrent run with exit 3 and writes no status", () => {
    const out = tmpDir("cli-out-");
    const data = tmpDir("cli-data-");
    // A live pid (this test process) holds the run lock the CLI must respect.
    const lock = acquireLock({ path: runLockPath(out), reason: "test-holds-the-lock" });
    expect(lock.ok).toBe(true);

    const run = spawnSync("bun", [join(REPO_ROOT, "scripts/backup.mjs"), "--data-dir", data, "--out", out], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 60_000,
    });

    expect(run.status).toBe(EXIT_REFUSED);
    expect(run.stdout).toContain("concurrent-run");
    expect(run.stdout).toContain('"skipped": true');
    // A refusal is not a failure: the status file must not be touched.
    expect(existsSync(join(data, "backup_status.json"))).toBe(false);
    if (lock.ok) lock.release();
  }, 90_000);

  it("refuses an out dir inside the publish tree BEFORE creating anything", () => {
    // SLICE 149b: slice 149 put `mkdirSync(OUT_DIR)` + the run lock above the
    // publish-tree guard, so a REFUSED run still created the directory it was
    // refusing to write into. The full suite caught it in backup-restore.test.ts
    // (`backups-should-not-exist` existed afterwards). Pinned here on the exit
    // code and on the filesystem: a refusal leaves no trace at all.
    const root = publishTreeRoot();
    expect(root).toBeTruthy();
    const inside = join(root!, "backups-should-not-exist-149b");
    expect(existsSync(inside)).toBe(false);
    const data = tmpDir("cli-refuse-data-");
    writeFileSync(join(data, "users.json"), "{}");
    const run = spawnSync("bun", [join(REPO_ROOT, "scripts/backup.mjs"), "--data-dir", data, "--out", inside], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 60_000,
    });
    // exit 3 = refusal-to-run, and the GUARD's message — never a lock message
    expect(run.status).toBe(EXIT_REFUSED);
    expect(run.stderr).toMatch(/refusing to write a backup inside the publish tree/);
    expect(run.stdout).toContain('"refused": true');
    expect(existsSync(inside)).toBe(false);
    // nothing was attempted, so nothing is recorded as a failed run either
    expect(existsSync(join(data, "backup_status.json"))).toBe(false);
  }, 90_000);

  it("is not blocked by a run lock held for a DIFFERENT archive root", () => {
    // The lock lives inside the archive root, so a temp-out run (a test, a drill)
    // must never be refused by the live daemon's tick on the real root. Asserted
    // against a REAL run rather than by reading the path construction.
    const otherRoot = tmpDir("cli-lock-other-");
    const myRoot = tmpDir("cli-lock-mine-");
    const data = tmpDir("cli-lock-data-");
    writeFileSync(join(data, "users.json"), '{"owner@example.com":{"role":"admin"}}');
    const held = acquireLock({ path: runLockPath(otherRoot), reason: "a-tick-on-another-root" });
    expect(held.ok).toBe(true);
    try {
      const run = spawnSync(
        "bun",
        [join(REPO_ROOT, "scripts/backup.mjs"), "--data-dir", data, "--out", myRoot, "--no-upload"],
        { cwd: REPO_ROOT, encoding: "utf8", timeout: 120_000 },
      );
      expect(run.stdout + run.stderr).not.toMatch(/concurrent-run/);
      expect(run.status).toBe(0);
      // a real run directory appeared under OUR root
      expect(readdirSync(myRoot).some((n) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/.test(n))).toBe(true);
      // and the other root's lock was never touched
      expect(existsSync(runLockPath(otherRoot))).toBe(true);
    } finally {
      if (held.ok) held.release();
    }
  }, 150_000);
  it("does not start a loop when disabled for the runtime", () => {
    const out = tmpDir("ensure-disabled-");
    const run = execFileSync("bun", [join(REPO_ROOT, "scripts/ensure-backup-daemon.mjs")], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, VITEST: "1", BACKUP_ROOT: out },
    });
    expect(run).toContain("skipped");
    expect(existsSync(daemonLockPath(out))).toBe(false);
    expect(existsSync(join(out, "backup-daemon.json"))).toBe(false);
  }, 90_000);
});

describe("slice 149 — the daemon reports what it can see, and nothing secret", () => {
  it("keeps the heartbeat free of credential values", () => {
    const out = tmpDir("hb-secret-");
    writeDaemonHeartbeat(out, {
      pid: process.pid,
      state: "running",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      intervalMs: 60_000,
      firstDelayMs: 1_000,
      ticks: 0,
      lastRunStartedAt: null,
      lastRunEndedAt: null,
      lastExitCode: null,
      nextRunAt: null,
      env: {
        r2Configured: true,
        missing: [],
        passphraseSet: true,
        instance: DEFAULT_DAEMON_INSTANCE,
        instanceSource: "env",
        prefix: `simplerlife100/backups/${DEFAULT_DAEMON_INSTANCE}/`,
        uploadAllowed: true,
        uploadSkipReason: null,
      },
    });
    const raw = readFileSync(heartbeatPath(out), "utf8");
    const parsed = JSON.parse(raw);
    // Only booleans, names and the prefix — never a credential value.
    expect(Object.keys(parsed.env).sort()).toEqual(
      ["instance", "instanceSource", "missing", "passphraseSet", "prefix", "r2Configured", "uploadAllowed", "uploadSkipReason"].sort(),
    );
    expect(parsed.env.passphraseSet).toBe(true);
    expect(raw).toContain(DEFAULT_DAEMON_INSTANCE);
  });
});
