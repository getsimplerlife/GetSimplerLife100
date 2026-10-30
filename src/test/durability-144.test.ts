/**
 * durability-144.test.ts — SLICE 144. The owner's words: "I don't want any data
 * loss. All clients need their data secured."
 *
 * WHAT THIS PINS (each one is a way the business loses a customer's data):
 *   1. ATOMIC WRITES — a write that fails mid-flight leaves the ORIGINAL file
 *      byte-identical, rejects, and leaves no `.tmp-*` behind. A successful
 *      write replaces the whole document and keeps the file's mode (never
 *      widens it). Before this slice `writeJSON` was a bare `writeFileSync`, so
 *      a crash mid-write truncated the store and `readJSON` answered `{}`.
 *   2. CORRUPT-FILE VISIBILITY — a MISSING file still reads as `{}` (unchanged
 *      tolerance), but a file that EXISTS and does not parse is a structured,
 *      attributable error: one log line naming the file, a counter and a last
 *      error that `/api/admin/datadir` reports. The server keeps serving.
 *   3. THE SCHEDULER — disabled under test, fires on the timer, refuses a
 *      concurrent run, and swallows + records a failing run without dying.
 *   4. COVERAGE — a declared store that holds data but is missing from the
 *      archive FAILS the run (silent under-coverage is worse than no backup),
 *      a fully covered set passes, and the single declared list covers every
 *      store the source tree declares.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { atomicWriteSync } from "../lib/atomic-write";
import { readJSON, resetStoreReadErrorStats, storeReadErrorStats, writeJSON } from "../lib/data-store";
import { DURABLE_BINARY_STORES, DURABLE_STORES } from "../lib/durable-stores";
import {
  backupFailureRecorder,
  backupSchedulerDisabled,
  resolveBackupInterval,
  startBackupScheduler,
  type BackupSchedulerTimers,
} from "../lib/backup-scheduler";
import {
  BACKUP_STATUS_FILE,
  checkCoverage,
  coverageRowFor,
  deriveDeclaredStores,
  runBackup,
  type Manifest,
} from "../../scripts/lib/backup-core";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const REPO = existsSync(join(process.cwd(), "prod-server.ts")) ? process.cwd() : join(process.cwd(), "..");
const tmpDirs: string[] = [];

function tmp(prefix = "dur-144-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function makeDataDir(files: Record<string, string | Buffer>): string {
  const dir = tmp("dur-data-");
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function tmpLeftovers(dir: string): string[] {
  return readdirSync(dir).filter((n) => n.includes(".tmp-"));
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
  resetStoreReadErrorStats();
});

// ── 1. atomic writes ────────────────────────────────────────────────────────
describe("slice 144 — atomic writes are all-or-nothing", () => {
  it("replaces the whole document and preserves the existing mode", () => {
    const dir = tmp();
    const file = join(dir, "users.json");
    writeFileSync(file, JSON.stringify({ old: true }));
    chmodSync(file, 0o640);

    atomicWriteSync(file, JSON.stringify({ fresh: true }));

    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ fresh: true });
    expect(statSync(file).mode & 0o777).toBe(0o640); // preserved, never widened
    expect(tmpLeftovers(dir)).toEqual([]);
  });

  it("never widens permissions on a brand-new file", () => {
    const dir = tmp();
    const file = join(dir, "tenant_approvals.json");
    atomicWriteSync(file, "{}");
    const mode = statSync(file).mode & 0o777;
    expect(mode & 0o077).toBe(0); // owner-only: no group/other bits
    expect(tmpLeftovers(dir)).toEqual([]);
  });

  it("a write that fails mid-flight leaves the original intact and rejects", () => {
    const dir = tmp();
    const file = join(dir, "tenant_invoices.json");
    const original = JSON.stringify({ invoice: "INV-1", total: 1500 });
    writeFileSync(file, original);

    expect(() =>
      atomicWriteSync(file, JSON.stringify({ invoice: "INV-2" }), {
        // Half the bytes land, then the disk "fills up".
        write: (fd: number, data: string | Uint8Array) => {
          const buf = typeof data === "string" ? Buffer.from(data) : data;
          writeSync(fd, buf.subarray(0, Math.max(1, Math.floor(buf.length / 2))));
          throw new Error("ENOSPC: no space left on device (simulated)");
        },
      }),
    ).toThrow(/ENOSPC/);

    // The store the customer relies on is exactly as it was.
    expect(readFileSync(file, "utf-8")).toBe(original);
    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ invoice: "INV-1", total: 1500 });
    expect(tmpLeftovers(dir)).toEqual([]);
  });

  it("a failing rename leaves the original intact and cleans the temp file", () => {
    const dir = tmp();
    const file = join(dir, "tenant_audit_logs.json");
    writeFileSync(file, '{"entries":[1]}');

    expect(() =>
      atomicWriteSync(file, '{"entries":[1,2]}', {
        rename: () => {
          throw new Error("EACCES: rename refused (simulated)");
        },
      }),
    ).toThrow(/EACCES/);

    expect(readFileSync(file, "utf-8")).toBe('{"entries":[1]}');
    expect(tmpLeftovers(dir)).toEqual([]);
  });

  it("writeJSON (the app's own store writer) is atomic and leaves no temp file", () => {
    const dir = tmp();
    const file = join(dir, "tenant_tasks.json");
    writeJSON(file, { "a@example.com": [{ id: "1" }] });
    writeJSON(file, { "a@example.com": [{ id: "1" }, { id: "2" }] });
    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ "a@example.com": [{ id: "1" }, { id: "2" }] });
    expect(tmpLeftovers(dir)).toEqual([]);
  });
});

// ── 2. corrupt-file visibility ──────────────────────────────────────────────
describe("slice 144 — an unparseable store is never silent again", () => {
  it("a MISSING file still reads as {} and is not counted as an error", () => {
    resetStoreReadErrorStats();
    const dir = tmp();
    expect(readJSON(join(dir, "does-not-exist.json"))).toEqual({});
    expect(storeReadErrorStats()).toEqual({ count: 0, last: null });
  });

  it("a file that EXISTS but does not parse logs a structured error and is counted", () => {
    resetStoreReadErrorStats();
    const dir = tmp();
    const file = join(dir, "tenant_purchases.json");
    writeFileSync(file, '{"torn":'); // exactly what a torn writeFileSync leaves
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Behaviour does not regress: the reader still gets the {} fallback…
    expect(readJSON(file)).toEqual({});

    // …but it can never be silent again.
    const stats = storeReadErrorStats();
    expect(stats.count).toBe(1);
    expect(stats.last?.file).toBe(file);
    expect(stats.last?.error).toMatch(/JSON/i);
    expect(stats.last?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const logged = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
    const parsed = logged
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l));
    const record = parsed.find((p) => p.event === "store_parse_error");
    expect(record).toBeTruthy();
    expect(record.file).toBe(file);
    expect(record.severity).toBe("error");
    expect(typeof record.error).toBe("string");
  });

  it("the owner admin surface reports the parse failure and the server keeps serving", async () => {
    await ensureTestServer();
    const base = testBaseUrl();
    const dataDir = testDataDir();

    // Seed an owner session exactly like the admin-access suite does: the
    // server reads sessions.json fresh on every request.
    const usersFile = join(dataDir, "users.json");
    const sessionsFile = join(dataDir, "sessions.json");
    const readIfAny = (p: string): any => {
      try {
        return JSON.parse(readFileSync(p, "utf-8"));
      } catch {
        return {};
      }
    };
    const users = readIfAny(usersFile);
    users["mathewortiz97@gmail.com"] = users["mathewortiz97@gmail.com"] || { email: "mathewortiz97@gmail.com", role: "admin", createdAt: Date.now() };
    writeFileSync(usersFile, JSON.stringify(users, null, 2));
    const sessions = readIfAny(sessionsFile);
    const token = "dur144-owner-" + Date.now();
    sessions[token] = { email: "mathewortiz97@gmail.com", createdAt: Date.now() };
    writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));

    // A counted store that nothing else in the suite writes: corrupt it, then
    // put it back exactly as we found it.
    const victim = join(dataDir, "vault_folders.json");
    const before = existsSync(victim) ? readFileSync(victim) : null;
    writeFileSync(victim, "{not json");
    try {
      const res = await fetch(`${base}/api/admin/datadir`, { headers: { Cookie: `session=${token}` } });
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.storeReadErrors).toBeTruthy();
      expect(body.storeReadErrors.count).toBeGreaterThanOrEqual(1);
      expect(String(body.storeReadErrors.last?.file)).toContain("vault_folders.json");

      // …and the server is still serving.
      const alive = await fetch(`${base}/api/health`).catch(() => null);
      if (alive) expect([200, 404]).toContain(alive.status);
    } finally {
      if (before) writeFileSync(victim, before);
      else rmSync(victim, { force: true });
    }
  });
});

// ── 3. the scheduler ────────────────────────────────────────────────────────
interface FakeTimers extends BackupSchedulerTimers {
  scheduled: Array<{ fn: () => void; ms: number }>;
  fire: (index: number) => Promise<void>;
}

function fakeTimers(): FakeTimers {
  const scheduled: Array<{ fn: () => void; ms: number }> = [];
  return {
    scheduled,
    setTimeout: (fn: () => void, ms: number) => {
      scheduled.push({ fn, ms });
      return scheduled.length - 1;
    },
    clearTimeout: () => {},
    fire: async (index: number) => {
      scheduled[index].fn();
      // let the trigger() promise chain settle
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

describe("slice 144 — the backup scheduler runs without a human", () => {
  it("is DISABLED under test and by explicit opt-out", () => {
    expect(backupSchedulerDisabled({ NODE_ENV: "test" })).toMatchObject({ disabled: true });
    expect(backupSchedulerDisabled({ VITEST: "true" })).toMatchObject({ disabled: true });
    expect(backupSchedulerDisabled({ BACKUP_DISABLED: "1" })).toMatchObject({ disabled: true });
    expect(backupSchedulerDisabled({}).disabled).toBe(false);
    // cadence: invalid values fall back to hourly, never to a hot loop
    expect(resolveBackupInterval({})).toBe(3_600_000);
    expect(resolveBackupInterval({ BACKUP_INTERVAL_MS: "0" })).toBe(3_600_000);
    expect(resolveBackupInterval({ BACKUP_INTERVAL_MS: "-5" })).toBe(3_600_000);
    expect(resolveBackupInterval({ BACKUP_INTERVAL_MS: "1000" })).toBe(1000);
  });

  it("a disabled scheduler schedules nothing at all", () => {
    const timers = fakeTimers();
    const run = vi.fn(async () => ({ ok: true }));
    const handle = startBackupScheduler({
      run,
      intervalMs: 1000,
      disabled: true,
      disabledReason: "test runtime",
      timers,
      log: () => {},
    });
    expect(timers.scheduled).toHaveLength(0);
    expect(handle.status()).toMatchObject({ disabled: true, disabledReason: "test runtime", started: false });
    expect(run).not.toHaveBeenCalled();
    handle.stop();
  });

  it("fires after the first delay and then on every interval", async () => {
    const timers = fakeTimers();
    const run = vi.fn(async () => ({ ok: true, runId: "2026-10-30T20-00-00Z", files: 3, bytes: 10 }));
    const handle = startBackupScheduler({ run, intervalMs: 5000, firstDelayMs: 100, timers, log: () => {} });

    expect(timers.scheduled).toHaveLength(1);
    expect(timers.scheduled[0].ms).toBe(100); // first run shortly after boot

    await timers.fire(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(timers.scheduled).toHaveLength(2);
    expect(timers.scheduled[1].ms).toBe(5000); // then hourly-ish

    await timers.fire(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(handle.status()).toMatchObject({ runs: 2, failures: 0, running: false });
    handle.stop();
  });

  it("swallows a failing run, records it, and keeps scheduling", async () => {
    const timers = fakeTimers();
    const recorded: string[] = [];
    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("EACCES: backup dir is not writable");
      return { ok: true };
    });
    const handle = startBackupScheduler({
      run,
      intervalMs: 5000,
      firstDelayMs: 10,
      timers,
      log: () => {},
      recordFailure: (m) => recorded.push(m),
    });

    // A thrown error must not escape into the timer / crash the server.
    await expect(timers.fire(0)).resolves.toBeUndefined();
    expect(recorded).toEqual(["EACCES: backup dir is not writable"]);
    expect(handle.status()).toMatchObject({ failures: 1, lastError: "EACCES: backup dir is not writable" });

    // The loop survives: the next scheduled run still happens and succeeds.
    await timers.fire(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(handle.status()).toMatchObject({ runs: 1, failures: 1 });
    handle.stop();
  });

  it("refuses a concurrent invocation instead of running two at once", async () => {
    let release: (v: any) => void = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
      await gate;
      return { ok: true };
    });
    const handle = startBackupScheduler({ run, intervalMs: 5000, disabled: true, log: () => {} });

    const first = handle.trigger("manual");
    const second = await handle.trigger("manual");
    expect(second).toMatchObject({ ok: false, skipped: true });
    expect(String(second.error)).toMatch(/already running/);
    expect(calls).toBe(1);
    expect(handle.status().refused).toBe(1);

    release({ ok: true });
    await first;
    expect(handle.status()).toMatchObject({ runs: 1, refused: 1, running: false });
    handle.stop();
  });

  it("a failure recorder writes lastBackupError into backup_status.json", () => {
    const dataDir = tmp();
    backupFailureRecorder(dataDir, "/tmp/backups")("disk on fire");
    const status = JSON.parse(readFileSync(join(dataDir, BACKUP_STATUS_FILE), "utf-8"));
    expect(status.lastBackupOk).toBe(false);
    expect(status.lastBackupError).toBe("disk on fire");
    expect(statSync(join(dataDir, BACKUP_STATUS_FILE)).mode & 0o077).toBe(0);
  });
});

// ── 4. coverage ─────────────────────────────────────────────────────────────
describe("slice 144 — coverage: a run that misses a store fails", () => {
  it("fails the RUN when a declared store holds data but is not in the archive", () => {
    const dataDir = makeDataDir({
      "users.json": JSON.stringify({ "a@example.com": { role: "admin" } }),
      "prod-server.lock": JSON.stringify({ pid: 1 }), // present, holds bytes, excluded
    });
    const out = tmp("dur-out-");

    expect(() =>
      runBackup({
        dataDir,
        outDir: out,
        declaredStores: ["users.json", "prod-server.lock"],
        now: new Date(Date.UTC(2026, 9, 30, 20, 0, 0)),
      }),
    ).toThrow(/coverage assertion failed: 1 declared store\(s\) hold data but are not in the archive: prod-server\.lock/);

    // A failed run leaves no half-archive and records the failure.
    expect(existsSync(join(out, "2026-10-30T20-00-00Z"))).toBe(false);
    const status = JSON.parse(readFileSync(join(dataDir, BACKUP_STATUS_FILE), "utf-8"));
    expect(status.lastBackupOk).toBe(false);
    expect(status.lastBackupError).toMatch(/coverage assertion failed/);
  });

  it("passes a fully covered set and reports the coverage table in the manifest", () => {
    const dataDir = makeDataDir({
      "users.json": JSON.stringify({ "a@example.com": { role: "admin" } }),
      "tenant_approvals.json": JSON.stringify({ "a@example.com": [{ id: "1" }] }),
      "vault/blobs/aa/doc1/v1.bin": Buffer.from([1, 2, 3, 4]),
    });
    const out = tmp("dur-out-");

    const result = runBackup({
      dataDir,
      outDir: out,
      declaredStores: ["users.json", "tenant_approvals.json", "vault/blobs"],
      now: new Date(Date.UTC(2026, 9, 30, 21, 0, 0)),
    });

    expect(result.files).toBe(3);
    expect(result.coverage).toEqual([
      { store: "users.json", presentOnDisk: true, includedInArchive: true, bytes: expect.any(Number) },
      { store: "tenant_approvals.json", presentOnDisk: true, includedInArchive: true, bytes: expect.any(Number) },
      { store: "vault/blobs", presentOnDisk: true, includedInArchive: true, bytes: 4 },
    ]);

    const manifest: Manifest = JSON.parse(readFileSync(join(out, "2026-10-30T21-00-00Z", "manifest.json"), "utf-8"));
    expect(manifest.coverage).toHaveLength(3);
    expect(manifest.coverage.every((r) => r.includedInArchive)).toBe(true);

    const status = JSON.parse(readFileSync(join(dataDir, BACKUP_STATUS_FILE), "utf-8"));
    expect(status.lastBackupOk).toBe(true);
  });

  it("does not fail on a declared store that is absent or empty", () => {
    const dataDir = makeDataDir({ "empty.json": "", "users.json": "{}" });
    const report = checkCoverage(dataDir, ["users.json", "empty.json"], ["empty.json", "never-existed.json"]);
    expect(report.ok).toBe(true);
    expect(report.uncovered).toEqual([]);
    expect(report.rows.find((r) => r.store === "never-existed.json")).toMatchObject({
      presentOnDisk: false,
      includedInArchive: false,
      bytes: 0,
    });
  });

  it("a directory store counts the bytes underneath it", () => {
    const dataDir = makeDataDir({
      "native_docs/ab/doc1.pdf": Buffer.alloc(7),
      "native_docs/cd/doc2.pdf": Buffer.alloc(5),
    });
    const row = coverageRowFor(dataDir, "native_docs", ["native_docs/ab/doc1.pdf", "native_docs/cd/doc2.pdf"]);
    expect(row).toMatchObject({ presentOnDisk: true, includedInArchive: true, bytes: 12 });
  });

  it("the ONE declared list covers every store the source tree declares", () => {
    const derived = deriveDeclaredStores(REPO);
    expect(derived.length).toBeGreaterThan(100);
    const declared = new Set(DURABLE_STORES);
    const missing = derived.filter((s) => !declared.has(s));
    expect(missing).toEqual([]);
    // the binary trees are declared too, so coverage can see them
    for (const tree of DURABLE_BINARY_STORES) expect(declared.has(tree)).toBe(true);
    // status + locks are deliberately NOT durable stores
    expect(declared.has(BACKUP_STATUS_FILE)).toBe(false);
    expect(declared.has("prod-server.lock")).toBe(false);
  });
});
