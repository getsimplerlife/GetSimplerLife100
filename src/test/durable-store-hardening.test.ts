// Durable store hardening — never lose a write, never boot without data (2026-08-12).
//
// Regression tests for the durability guarantees added on top of PR #126:
//  1. A DB outage mid-flight can never silently drop a write: failed upserts
//     are buffered in a write-ahead pending map (latest-wins) and retried
//     with exponential backoff until the DB recovers.
//  2. If Postgres is unreachable at boot the store reconnects in the
//     background instead of permanently falling back to the (ephemeral on
//     the live host) file store — hydrationState flips "retrying" → "ready".
//  3. The pending queue is bounded: overflow past the cap logs loudly and is
//     surfaced in admin diagnostics (overflowed), never a crash.
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  initDurableStore, durableClose, durableEnabled, durableGet, durableSet,
  durableFlush, durableWaitForReady, durableStoreStatus, durableStopReconnect,
  setDurableOptions, durableResetOptions, MemoryKvDriver, type KvDriver,
} from "../lib/durable-store";

/** Wraps MemoryKvDriver; flips `failWrites` to simulate a DB outage. */
class FlakyKvDriver implements KvDriver {
  failWrites = false;
  constructor(private inner: MemoryKvDriver = new MemoryKvDriver()) {}
  async unsafe<T = any>(sql: string, values?: any[]): Promise<T> {
    const s = sql.trim();
    if (this.failWrites && /^insert|^update|^upsert/i.test(s)) throw new Error("simulated DB outage");
    return this.inner.unsafe(sql, values);
  }
  dump(): Record<string, any> { return this.inner.dump(); }
}

/** Fails EVERYTHING until `fail` is false (simulates Postgres being down at boot). */
class FailingKvDriver implements KvDriver {
  fail = true;
  constructor(private inner: MemoryKvDriver = new MemoryKvDriver()) {}
  async unsafe<T = any>(sql: string, values?: any[]): Promise<T> {
    if (this.fail) throw new Error("simulated DB unreachable at boot");
    return this.inner.unsafe(sql, values);
  }
  dump(): Record<string, any> { return this.inner.dump(); }
}

let tmpDir: string;
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sl-durable-harden-"));
});
afterEach(() => {
  durableResetOptions();
});
afterAll(async () => {
  await durableClose();
  durableResetOptions();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("durable store — write-ahead retry queue", () => {
  beforeEach(async () => { await durableClose(); });

  it("buffers a failed write and persists it once the DB recovers (never drops)", async () => {
    const dir = join(tmpDir, "waq1");
    mkdirSync(dir, { recursive: true });
    const driver = new FlakyKvDriver();
    await initDurableStore(dir, driver);
    driver.failWrites = true;
    durableSet("tenant_audit_logs.json", { "u@x.com": [{ id: "log-1", action: "write" }] });
    await durableFlush(); // fails internally, write must be pending — not dropped
    expect(durableStoreStatus().pendingWriteCount).toBe(1);
    expect(durableStoreStatus().lastWriteError).toContain("simulated DB outage");
    // DB recovers
    driver.failWrites = false;
    await durableFlush();
    expect(durableStoreStatus().pendingWriteCount).toBe(0);
    expect(durableStoreStatus().lastWriteError).toBeNull();
    expect(driver.dump()["tenant_audit_logs.json"]["u@x.com"][0].id).toBe("log-1");
  });

  it("latest-wins when multiple writes land during an outage", async () => {
    const dir = join(tmpDir, "waq2");
    mkdirSync(dir, { recursive: true });
    const driver = new FlakyKvDriver();
    await initDurableStore(dir, driver);
    driver.failWrites = true;
    durableSet("tenant_integrations.json", { "u@x.com": [{ id: "int-1", status: "Connected" }] });
    durableSet("tenant_integrations.json", { "u@x.com": [{ id: "int-2", status: "Connected" }] });
    await durableFlush();
    expect(durableStoreStatus().pendingWriteCount).toBe(1); // one key, latest value
    driver.failWrites = false;
    await durableFlush();
    expect(driver.dump()["tenant_integrations.json"]["u@x.com"][0].id).toBe("int-2");
  });

  it("queue overflow past the cap logs and surfaces overflowed=true — never crashes", async () => {
    const dir = join(tmpDir, "waq3");
    mkdirSync(dir, { recursive: true });
    setDurableOptions({ pendingCap: 2, retryBaseMs: 60_000, retryMaxMs: 60_000 });
    const driver = new FlakyKvDriver();
    await initDurableStore(dir, driver);
    driver.failWrites = true;
    expect(() => {
      for (let i = 0; i < 5; i++) durableSet(`overflow_key_${i}.json`, { i });
    }).not.toThrow();
    await durableFlush(); // let the write-chain handlers run (they buffer + overflow)
    expect(durableStoreStatus().overflowed).toBe(true);
    expect(durableStoreStatus().pendingWriteCount).toBe(2); // bounded at cap
    expect(durableEnabled()).toBe(true); // store still usable
    // After recovery, the buffered (non-dropped) writes drain.
    driver.failWrites = false;
    await durableFlush();
    expect(durableStoreStatus().pendingWriteCount).toBe(0);
  });
});

describe("durable store — boot resilience (reconnection loop)", () => {
  beforeEach(async () => {
    await durableClose();
    durableStopReconnect();
  });

  it("init failure does NOT permanently fall back to files — reconnects and hydrates", async () => {
    const dir = join(tmpDir, "boot1");
    mkdirSync(dir, { recursive: true });
    const driver = new FailingKvDriver(new MemoryKvDriver({
      "tenant_integrations.json": { "owner@example.com": [{ id: "int-live", provider: "slack", status: "Connected" }] },
      "tenant_oauth_credentials.json": { "owner@example.com:slack": { accessToken: "xoxb-live" } },
    }));
    // Boot with Postgres unreachable → fail-soft, hydrationState retrying.
    const r = await initDurableStore(dir, driver, { reconnectIntervalMs: 10, reconnectMaxAttempts: 0 });
    expect(r.enabled).toBe(false);
    expect(durableEnabled()).toBe(false);
    expect(durableStoreStatus().hydrationState).toBe("retrying");
    // Postgres comes back → background reconnection hydrates without manual re-init.
    driver.fail = false;
    const ready = await durableWaitForReady(3000);
    expect(ready).toBe(true);
    expect(durableEnabled()).toBe(true);
    expect(durableStoreStatus().hydrationState).toBe("ready");
    expect(durableGet("tenant_integrations.json")["owner@example.com"][0].id).toBe("int-live");
    expect(durableGet("tenant_oauth_credentials.json")["owner@example.com:slack"].accessToken).toBe("xoxb-live");
  });

  it("reconnect loop stops cleanly and durableClose resets state", async () => {
    const dir = join(tmpDir, "boot2");
    mkdirSync(dir, { recursive: true });
    const driver = new FailingKvDriver();
    const r = await initDurableStore(dir, driver, { reconnectIntervalMs: 5 });
    expect(r.enabled).toBe(false);
    expect(durableStoreStatus().hydrationState).toBe("retrying");
    await durableClose();
    expect(durableEnabled()).toBe(false);
    expect(durableStoreStatus().hydrationState).toBe("ready");
    // A fresh init with a healthy driver works after close.
    driver.fail = false;
    const r2 = await initDurableStore(dir, driver, { reconnectIntervalMs: 5 });
    expect(r2.enabled).toBe(true);
    expect(durableStoreStatus().hydrationState).toBe("ready");
  });
});
