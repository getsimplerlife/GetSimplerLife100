/**
 * SLICE 163 — the deployment's namespace, and the catch-up rule that lets a
 * sleeping deployment still back up.
 *
 * WHAT THIS PINS (each is a way the live site's data silently stops leaving the
 * machine):
 *   1. an explicit operator override still wins, verbatim (slice 147 unchanged);
 *   2. the shared dev box writes under `host-primary` — the SAME id its
 *      supervised loop uses, so the two can never disagree;
 *   3. a deployment on its own filesystem writes under `live`, and that prefix
 *      is not the bare base prefix and never equals the host's;
 *   4. a test/development runtime is REPORTED as `live` but given no instance
 *      id, so slice 147's gate still refuses to upload — a suite must never
 *      place an object where it could be mistaken for the live site's copy;
 *   5. `resolveUploadPrefix` actually resolves to that prefix, which is the
 *      only thing that proves the wiring changes where uploads go;
 *   6. the first run after boot is a CATCH-UP when the deployment has never
 *      backed up or is overdue, and the ordinary delay when it is fresh.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  HOST_INSTANCE,
  LIVE_INSTANCE,
  SHARED_TEAM_ROOT,
  resolveDeploymentNamespace,
} from "../lib/backup-namespace";
import { DEFAULT_R2_PREFIX, resolveUploadPrefix } from "../lib/r2-upload";
import {
  DEFAULT_CATCH_UP_DELAY_MS,
  resolveFirstBackupDelay,
  startBackupScheduler,
} from "../lib/backup-scheduler";

const R2_ENV = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
};

/** A data dir on this box, inside the shared team root. */
const HOST_DATA = join(SHARED_TEAM_ROOT, ".data");
/** A data dir on a deployment's own filesystem. */
const DEPLOY_DATA = "/home/engine/.data";

describe("resolveDeploymentNamespace — which namespace this deployment owns", () => {
  it("lets an explicit R2_PREFIX win, verbatim", () => {
    const ns = resolveDeploymentNamespace({
      env: { ...R2_ENV, R2_PREFIX: "some/where/else" },
      dataDir: DEPLOY_DATA,
    });
    expect(ns.role).toBe("explicit");
    expect(ns.source).toBe("env-prefix");
    expect(ns.prefix).toBe("some/where/else/");
    expect(ns.uploadAllowed).toBe(true);
  });

  it("lets an explicit R2_INSTANCE win over the derived role", () => {
    const ns = resolveDeploymentNamespace({
      env: { ...R2_ENV, R2_INSTANCE: "My-Laptop" },
      dataDir: DEPLOY_DATA,
    });
    expect(ns.role).toBe("explicit");
    expect(ns.instance).toBe("my-laptop");
    expect(ns.prefix).toBe(`${DEFAULT_R2_PREFIX}my-laptop/`);
  });

  it("gives the shared dev box host-primary — the same id its supervised loop uses", () => {
    const ns = resolveDeploymentNamespace({ env: R2_ENV, dataDir: HOST_DATA });
    expect(ns.role).toBe("host");
    expect(ns.source).toBe("shared-root");
    expect(ns.instance).toBe(HOST_INSTANCE);
    expect(ns.prefix).toBe(`${DEFAULT_R2_PREFIX}${HOST_INSTANCE}/`);
    // The environment handed to the uploader carries the id, so the upload path
    // resolves the same namespace and does not mint a random one.
    expect(ns.env.R2_INSTANCE).toBe(HOST_INSTANCE);
  });

  it("gives a deployment on its own filesystem the live namespace", () => {
    const ns = resolveDeploymentNamespace({ env: R2_ENV, dataDir: DEPLOY_DATA });
    expect(ns.role).toBe("live");
    expect(ns.instance).toBe(LIVE_INSTANCE);
    expect(ns.prefix).toBe(`${DEFAULT_R2_PREFIX}${LIVE_INSTANCE}/`);
    expect(ns.env.R2_INSTANCE).toBe(LIVE_INSTANCE);
    expect(ns.uploadAllowed).toBe(true);
  });

  it("never confuses live with host-primary, and never falls back to the bare base prefix", () => {
    const live = resolveDeploymentNamespace({ env: R2_ENV, dataDir: DEPLOY_DATA });
    const host = resolveDeploymentNamespace({ env: R2_ENV, dataDir: HOST_DATA });
    expect(live.prefix).not.toBe(host.prefix);
    expect(live.prefix).not.toBe(DEFAULT_R2_PREFIX);
    expect(host.prefix).not.toBe(DEFAULT_R2_PREFIX);
    expect(live.prefix.startsWith(DEFAULT_R2_PREFIX)).toBe(true);
    expect(host.prefix.startsWith(DEFAULT_R2_PREFIX)).toBe(true);
  });

  it("does not put a test runtime's uploads into the live namespace", () => {
    for (const env of [
      { ...R2_ENV, NODE_ENV: "test" },
      { ...R2_ENV, NODE_ENV: "development" },
      { ...R2_ENV, VITEST: "true" },
    ]) {
      const ns = resolveDeploymentNamespace({ env, dataDir: DEPLOY_DATA });
      // Reported, so the owner can see where a deployment WOULD write...
      expect(ns.role).toBe("live");
      expect(ns.prefix).toBe(`${DEFAULT_R2_PREFIX}${LIVE_INSTANCE}/`);
      // ...but refused, and given no instance id to bypass slice 147's gate.
      expect(ns.uploadAllowed).toBe(false);
      expect(ns.skipReason).toContain("non-production");
      expect(ns.env.R2_INSTANCE).toBeUndefined();
      const resolved = resolveUploadPrefix({ env: ns.env, dataDir: DEPLOY_DATA, create: false });
      expect(resolved.uploadAllowed).toBe(false);
      expect(resolved.prefix).not.toBe(ns.prefix);
    }
  });

  it("actually changes where the uploader resolves to (the wiring, not just the label)", () => {
    const ns = resolveDeploymentNamespace({ env: R2_ENV, dataDir: DEPLOY_DATA });
    const resolved = resolveUploadPrefix({ env: ns.env, dataDir: DEPLOY_DATA, create: false });
    expect(resolved.uploadAllowed).toBe(true);
    expect(resolved.prefix).toBe(`${DEFAULT_R2_PREFIX}${LIVE_INSTANCE}/`);
    expect(resolved.instance).toBe(LIVE_INSTANCE);

    const host = resolveDeploymentNamespace({ env: R2_ENV, dataDir: HOST_DATA });
    const hostResolved = resolveUploadPrefix({ env: host.env, dataDir: HOST_DATA, create: false });
    expect(hostResolved.prefix).toBe(`${DEFAULT_R2_PREFIX}${HOST_INSTANCE}/`);
  });

  it("resolves nothing outside a real data dir: a tmp dir is a deployment, not the host", () => {
    const ns = resolveDeploymentNamespace({ env: R2_ENV, dataDir: join(tmpdir(), "wt163-ns") });
    expect(ns.role).toBe("live");
  });
});

describe("resolveFirstBackupDelay — catch up on wake, never silently skip", () => {
  const HOUR = 3_600_000;
  const now = Date.UTC(2026, 10, 1, 12, 0, 0);

  it("runs soon after boot when this deployment has never backed up", () => {
    const d = resolveFirstBackupDelay({ now, lastOkAt: null, intervalMs: HOUR });
    expect(d.reason).toBe("never-ran");
    expect(d.delayMs).toBe(DEFAULT_CATCH_UP_DELAY_MS);
  });

  it("runs soon after boot when the last success is older than the interval", () => {
    const d = resolveFirstBackupDelay({
      now,
      lastOkAt: new Date(now - HOUR - 60_000).toISOString(),
      intervalMs: HOUR,
    });
    expect(d.reason).toBe("overdue");
    expect(d.delayMs).toBe(DEFAULT_CATCH_UP_DELAY_MS);
    expect(d.overdueByMs).toBe(60_000);
  });

  it("keeps the ordinary first delay when the last success is inside the interval", () => {
    const d = resolveFirstBackupDelay({
      now,
      lastOkAt: new Date(now - 5 * 60_000).toISOString(),
      intervalMs: HOUR,
      firstDelayMs: 60_000,
    });
    expect(d.reason).toBe("scheduled");
    expect(d.delayMs).toBe(60_000);
  });

  it("treats an unparseable stamp as never-ran rather than as fresh", () => {
    const d = resolveFirstBackupDelay({ now, lastOkAt: "not-a-date", intervalMs: HOUR });
    expect(d.reason).toBe("invalid-last-ok");
    expect(d.delayMs).toBe(DEFAULT_CATCH_UP_DELAY_MS);
  });

  it("makes the scheduler actually schedule the catch-up, and say why", () => {
    const scheduled: number[] = [];
    const handle = startBackupScheduler({
      run: async () => ({ ok: true }),
      intervalMs: HOUR,
      firstDelayMs: 60_000,
      lastOkAt: () => null,
      catchUpDelayMs: 1_234,
      log: () => {},
      timers: {
        setTimeout: (fn, ms) => {
          scheduled.push(ms);
          return 1;
        },
        clearTimeout: () => {},
      },
      now: () => now,
    });
    expect(scheduled).toEqual([1_234]);
    expect(handle.status().firstDelayMs).toBe(1_234);
    expect(handle.status().firstDelayReason).toBe("never-ran");
    handle.stop();
  });

  it("keeps slice 144's fixed first delay when no durable reader is supplied", () => {
    const scheduled: number[] = [];
    const handle = startBackupScheduler({
      run: async () => ({ ok: true }),
      intervalMs: HOUR,
      firstDelayMs: 60_000,
      log: () => {},
      timers: {
        setTimeout: (fn, ms) => {
          scheduled.push(ms);
          return 1;
        },
        clearTimeout: () => {},
      },
      now: () => now,
    });
    expect(scheduled).toEqual([60_000]);
    expect(handle.status().firstDelayReason).toBeNull();
    handle.stop();
  });
});
