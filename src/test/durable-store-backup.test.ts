// Backup snapshots — owner mandate 2026-08-12: "never lose anything from
// clients connections". Even a catastrophic kv_store failure must be
// restorable, so every snapshot of kv_store lives in its own table
// (kv_store_backup) with N-day retention.
//
// Regression tests for src/lib/durable-store.ts:
//  1. durableSnapshotBackup() copies every kv_store row into
//     kv_store_backup with a timestamped snapshot id.
//  2. Retention prunes snapshots older than the window (backupRetentionDays)
//     and keeps fresh ones.
//  3. Status fields (lastSnapshotAt, snapshotCount, lastSnapshotError) are
//     surfaced via durableStoreStatus() for admin diagnostics.
//  4. Snapshot with the store disabled fails soft (ok:false) — never crashes.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  initDurableStore, durableClose, durableSet, durableFlush,
  durableSnapshotBackup, durableSnapshotCount, durableStoreStatus,
  durableResetOptions, setDurableOptions, MemoryKvDriver,
} from "../lib/durable-store";

const DAY = 86_400_000;
let tmpDir: string;
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sl-backup-"));
});
afterEach(() => {
  durableResetOptions();
});
afterAll(async () => {
  await durableClose();
  durableResetOptions();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

async function freshStore(): Promise<MemoryKvDriver> {
  await durableClose();
  const dir = join(tmpDir, `b-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const driver = new MemoryKvDriver({
    "tenant_integrations.json": { "owner@example.com": [{ id: "int-1", provider: "slack", status: "Connected" }] },
    "tenant_oauth_credentials.json": { "owner@example.com:xero": { accessToken: "xoxb-live", refreshToken: "rt" } },
  });
  await initDurableStore(dir, driver);
  return driver;
}

describe("durable store — backup snapshots", () => {
  it("snapshots every kv_store row into kv_store_backup and updates status", async () => {
    const driver = await freshStore();
    durableSet("chat_sessions.json", { "u@x.com": [{ role: "user", content: "hi" }] });
    await durableFlush();
    const r = await durableSnapshotBackup();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(3); // 2 seeded + 1 chat_sessions
    const backups = driver.dumpTable("kv_store_backup");
    const ids = Object.keys(backups);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^snap_/);
    const data = backups[ids[0]];
    expect(data.takenAt).toBeGreaterThan(0);
    expect(data.keys["tenant_integrations.json"]["owner@example.com"][0].id).toBe("int-1");
    expect(data.keys["tenant_oauth_credentials.json"]["owner@example.com:xero"].refreshToken).toBe("rt");
    expect(data.keys["chat_sessions.json"]["u@x.com"][0].content).toBe("hi");
    // Status surfaced for admin.
    const status = durableStoreStatus();
    expect(status.lastSnapshotAt).toBeGreaterThan(0);
    expect(status.snapshotCount).toBe(1);
    expect(status.lastSnapshotError).toBeNull();
    // Count from the table too.
    expect(await durableSnapshotCount()).toBe(1);
  });

  it("retention prunes old snapshots and keeps fresh ones", async () => {
    setDurableOptions({ backupRetentionDays: 7 });
    const driver = await freshStore();
    await durableSnapshotBackup(); // fresh snapshot (now)
    // Inject an old snapshot directly (simulating one taken 10 days ago).
    const oldId = "snap_old-10d";
    await driver.unsafe(
      `INSERT INTO kv_store_backup (snapshot_id, data, taken_at) VALUES ($1, $2::jsonb, now())`,
      [oldId, JSON.stringify({ takenAt: Date.now() - 10 * DAY, keys: { stale: true } })],
    );
    expect(await durableSnapshotCount()).toBe(2);
    // Next snapshot triggers retention pruning.
    await durableSnapshotBackup();
    const backups = driver.dumpTable("kv_store_backup");
    expect(Object.keys(backups)).not.toContain(oldId);
    expect(await durableSnapshotCount()).toBe(2); // fresh + newest, old pruned
  });

  it("snapshot with the store disabled fails soft (ok:false, no crash)", async () => {
    await durableClose();
    const r = await durableSnapshotBackup();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(0);
    expect(durableStoreStatus().lastSnapshotError).toContain("not enabled");
  });

  it("failed snapshot records lastSnapshotError and keeps serving", async () => {
    const driver = await freshStore();
    // Break the driver so the backup INSERT fails.
    const original = driver.unsafe.bind(driver);
    driver.unsafe = (async (sql: string, values?: any[]) => {
      if (/into kv_store_backup/i.test(sql)) throw new Error("simulated backup table failure");
      return original(sql, values);
    }) as any;
    const r = await durableSnapshotBackup();
    expect(r.ok).toBe(false);
    expect(durableStoreStatus().lastSnapshotError).toContain("simulated backup table failure");
    // Store still usable for normal writes.
    durableSet("sessions.json", { tok: { email: "u@x.com" } });
    await durableFlush();
    expect(driver.dump()["sessions.json"].tok.email).toBe("u@x.com");
    // Restore the driver so afterAll cleanup is clean.
    driver.unsafe = original as any;
  });
});
