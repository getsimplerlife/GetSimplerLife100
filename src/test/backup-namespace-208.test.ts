/**
 * SLICE 208 — A SCRATCH INSTANCE MAY NOT WRITE THE PRODUCTION BACKUP NAMESPACE.
 *
 * THE INCIDENT THIS PINS (measured 2026-11-07, not inferred). A throwaway
 * instance started from the shared tree —
 *   PORT=4199 DATA_DIR=/tmp/h1data bun run prod-server.ts
 * — resolved the deployment's namespace by DEFAULT (rule 4 of
 * `resolveDeploymentNamespace`: "DATA_DIR is outside the shared root, therefore
 * this is a deployment"), and then:
 *
 *   1. it uploaded `simplerlife100/backups/live/2026-11-07T15-00-59Z.tar.gz.enc`
 *      — 39 files, `source.dataDir = /tmp/h1data` — and its retention pruned the
 *      other 2026-11-07 object in that prefix;
 *   2. at boot it RESTORED a `live/` archive and reported it as its own
 *      recovery. That archive carried `admin-initial-password.txt`: a plaintext
 *      admin credential belonging to another scratch instance, which has never
 *      existed in this box's real data directory.
 *
 * WHAT THESE TESTS PROVE (each is a way the fix can be "in place" and useless):
 *   1. a scratch instance on this box is REFUSED the live namespace, whatever
 *      its DATA_DIR is spelled like and whichever checkout it was started from;
 *   2. the deployment itself still gets it — the fix must not be "nobody can
 *      back up";
 *   3. an explicit `R2_INSTANCE`/`R2_PREFIX` is still an operator's decision;
 *   4. a refusal reaches the UPLOADER: no PUT, no freshly-minted instance id,
 *      and the reason is written into `backup_status.json` (not silently
 *      re-routed into some other namespace, which would look like a healthy
 *      backup on every page that reads that file);
 *   5. a refusal reaches the BOOT RESTORE: no listing, no download, and the
 *      reason is written into `boot_restore.json`;
 *   6. the supervised loop does not adopt this box's namespace for a data
 *      directory that is not this box's data.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIVE_INSTANCE,
  HOST_INSTANCE,
  SHARED_TEAM_ROOT,
  deploymentProof,
  resolveDeploymentNamespace,
} from "../lib/backup-namespace";
import {
  DEFAULT_R2_PREFIX,
  R2_REFUSED_ENV,
  type R2Fetch,
  type R2FetchResponse,
  resolveUploadPrefix,
} from "../lib/r2-upload";
import { uploadVerifiedRun } from "../../scripts/lib/r2-backup";
import { runBackup } from "../../scripts/lib/backup-core";
import { readBackupStatus } from "../lib/backup-status";
import { makeEncryptHook } from "../../scripts/lib/backup-crypto";
import { BOOT_RESTORE_FILE, readBootRestore, restoreNewestArchiveAtBoot } from "../lib/boot-restore";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIVE_PREFIX = `${DEFAULT_R2_PREFIX}${LIVE_INSTANCE}/`;
const PASSPHRASE = "slice-208-passphrase";

const R2_ENV: Record<string, string | undefined> = {
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "b".repeat(32),
  R2_SECRET_ACCESS_KEY: "c".repeat(64),
  R2_BUCKET: "test-bucket",
};

/** The dev box: the shared root is on this filesystem. */
const DEV_BOX = { repoRoot: SHARED_TEAM_ROOT + "/site", teamRootPresent: true };
/** The published deployment: its own filesystem, no shared root, own checkout. */
const DEPLOYMENT = { repoRoot: "/home/engine", teamRootPresent: false };

const tmpDirs: string[] = [];
function tmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function response(init: { ok?: boolean; status?: number; body?: string; bytes?: Uint8Array }): R2FetchResponse {
  const bytes = init.bytes ?? Buffer.from(init.body ?? "", "utf8");
  return {
    ok: init.ok !== false,
    status: init.status ?? 200,
    headers: { get: () => null },
    text: async () => Buffer.from(bytes).toString("utf8"),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}

/** A bucket that records every request and never touches the network. */
function fakeR2(captured: Array<{ method: string; url: string }> = []): R2Fetch & { captured: typeof captured } {
  const impl = (async (url: string, init: { method: string }) => {
    captured.push({ method: init.method, url });
    if (init.method === "GET") {
      return response({ body: `<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>` });
    }
    return response({ ok: true });
  }) as R2Fetch & { captured: typeof captured };
  impl.captured = captured;
  return impl;
}

function makeDataDir(extra: Record<string, string> = {}): string {
  const dir = tmpDir("s208-data-");
  const files: Record<string, string> = {
    "users.json": JSON.stringify({ "owner@example.com": { role: "owner" } }),
    "tenant_approvals.json": JSON.stringify({ a1: { status: "pending" } }),
    ...extra,
  };
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return dir;
}

// ── 1/2/3. Which runtime may claim the live namespace ───────────────────────

describe("resolveDeploymentNamespace — the live namespace is opt-in (slice 208)", () => {
  it("REFUSES a scratch instance started from this box, whatever its DATA_DIR is", () => {
    // The exact shape of the 2026-11-07 incident: a temp data dir, no override,
    // no NODE_ENV, started from the shared tree.
    const ns = resolveDeploymentNamespace({ env: { ...R2_ENV }, dataDir: "/tmp/h1data", host: DEV_BOX });

    // The namespace is still REPORTED — the owner should see where it would go.
    expect(ns.role).toBe("live");
    expect(ns.prefix).toBe(LIVE_PREFIX);
    // ...and it is refused, in plain words, naming the escape hatch.
    expect(ns.uploadAllowed).toBe(false);
    expect(ns.skipReason).toContain(LIVE_PREFIX);
    expect(ns.skipReason).toContain("opt-in");
    // No instance id: nothing can carry this runtime into the live namespace.
    expect(ns.env.R2_INSTANCE).toBeUndefined();
    // The refusal travels in the environment the uploader and restore receive.
    expect(ns.env[R2_REFUSED_ENV]).toBe(ns.skipReason);
  });

  it("REFUSES a scratch instance started from a worktree outside the shared root", () => {
    // A /tmp worktree is outside the shared root, so the repo-root half of the
    // proof is not what saves us here — the presence of the shared root on this
    // machine is. Both halves are tested separately.
    const ns = resolveDeploymentNamespace({
      env: { ...R2_ENV },
      dataDir: "/tmp/wt208/.data",
      host: { repoRoot: "/tmp/wt208", teamRootPresent: true },
    });
    expect(ns.uploadAllowed).toBe(false);
    expect(ns.skipReason).toContain("shared root");
  });

  it("REFUSES a runtime that supplies no host facts at all (fail closed)", () => {
    const ns = resolveDeploymentNamespace({ env: { ...R2_ENV }, dataDir: "/tmp/h1data" });
    expect(ns.uploadAllowed).toBe(false);
    expect(ns.skipReason).toContain("cannot prove");
  });

  it("ALLOWS the deployment on its own filesystem, with no environment change", () => {
    const ns = resolveDeploymentNamespace({ env: { ...R2_ENV }, dataDir: "/home/engine/.data", host: DEPLOYMENT });
    expect(ns.role).toBe("live");
    expect(ns.uploadAllowed).toBe(true);
    expect(ns.skipReason).toBeNull();
    expect(ns.env.R2_INSTANCE).toBe(LIVE_INSTANCE);
    expect(ns.env[R2_REFUSED_ENV]).toBeUndefined();
  });

  it("still lets an operator name the namespace explicitly, even on this box", () => {
    const byInstance = resolveDeploymentNamespace({
      env: { ...R2_ENV, R2_INSTANCE: "live" },
      dataDir: "/tmp/h1data",
      host: DEV_BOX,
    });
    expect(byInstance.role).toBe("explicit");
    expect(byInstance.uploadAllowed).toBe(true);

    const byPrefix = resolveDeploymentNamespace({
      env: { ...R2_ENV, R2_PREFIX: LIVE_PREFIX },
      dataDir: "/tmp/h1data",
      host: DEV_BOX,
    });
    expect(byPrefix.role).toBe("explicit");
    expect(byPrefix.prefix).toBe(LIVE_PREFIX);
    expect(byPrefix.uploadAllowed).toBe(true);
  });

  it("keeps this box's own data on host-primary, allowed", () => {
    const ns = resolveDeploymentNamespace({ env: { ...R2_ENV }, dataDir: join(SHARED_TEAM_ROOT, "site", ".data"), host: DEV_BOX });
    expect(ns.role).toBe("host");
    expect(ns.instance).toBe(HOST_INSTANCE);
    expect(ns.uploadAllowed).toBe(true);
  });

  it("states the proof in words, so the data-health page can quote it", () => {
    expect(deploymentProof(DEPLOYMENT).proven).toBe(true);
    expect(deploymentProof(DEV_BOX).proven).toBe(false);
    expect(deploymentProof(undefined).proven).toBe(false);
    expect(deploymentProof(DEV_BOX).why).toContain(SHARED_TEAM_ROOT);
  });
});

// ── 4. The refusal reaches the UPLOADER ────────────────────────────────────

describe("the uploader honours the refusal", () => {
  it("resolves to NO upload and mints no instance id", () => {
    const dataDir = tmpDir("s208-noid-");
    const ns = resolveDeploymentNamespace({ env: { ...R2_ENV }, dataDir, host: DEV_BOX });

    // create:true is the upload path — it is the call that used to mint a random
    // instance id and quietly upload under it.
    const resolved = resolveUploadPrefix({ env: ns.env, dataDir, create: true });
    expect(resolved.uploadAllowed).toBe(false);
    expect(resolved.skipReason).toBe(ns.skipReason);
    expect(resolved.prefix).not.toBe(LIVE_PREFIX);
    expect(existsSync(join(dataDir, "backup_instance.json"))).toBe(false);
  });

  it("makes no network call and records the reason in backup_status.json", async () => {
    const dataDir = makeDataDir({ "admin-initial-password.txt": "admin password: hunter2\n" });
    const outDir = tmpDir("s208-out-");
    const run = runBackup({
      dataDir,
      outDir,
      noPrune: true,
      now: new Date("2026-11-07T15:00:59Z"),
      encrypt: makeEncryptHook(PASSPHRASE),
    });
    const ns = resolveDeploymentNamespace({ env: { ...R2_ENV }, dataDir, host: DEV_BOX });
    const fetch = fakeR2();

    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ns.env,
      passphrase: PASSPHRASE,
      fetchImpl: fetch,
    });

    expect(fetch.captured).toEqual([]); // not one request — no PUT, no prune
    expect(record.uploaded).toBe(false);
    expect(record.key).toBeNull();
    expect(record.uploadSkipped).toContain("cannot prove");
    expect(record.uploadSkipped).toContain(LIVE_PREFIX);

    // The record is the point: a refusal nobody wrote down looks exactly like a
    // deployment that never tried.
    const status = readBackupStatus(dataDir);
    expect(status.lastBackupR2?.uploaded).toBe(false);
    expect(status.lastBackupR2?.uploadSkipped).toContain("cannot prove");
  });

  it("still uploads for the deployment — the fix is not 'nobody can back up'", async () => {
    const dataDir = makeDataDir();
    const outDir = tmpDir("s208-out2-");
    const run = runBackup({
      dataDir,
      outDir,
      noPrune: true,
      now: new Date("2026-11-07T15:00:59Z"),
      encrypt: makeEncryptHook(PASSPHRASE),
    });
    const ns = resolveDeploymentNamespace({ env: { ...R2_ENV }, dataDir, host: DEPLOYMENT });
    const fetch = fakeR2();

    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ns.env,
      passphrase: PASSPHRASE,
      fetchImpl: fetch,
    });

    expect(record.uploaded).toBe(true);
    expect(record.key?.startsWith(LIVE_PREFIX)).toBe(true);
    expect(fetch.captured.some((r) => r.method === "PUT")).toBe(true);
  });
});

// ── 5. The refusal reaches the BOOT RESTORE ────────────────────────────────

describe("the boot restore honours the refusal", () => {
  it("lists nothing, downloads nothing, and records the reason", async () => {
    const dataDir = tmpDir("s208-restore-");
    const ns = resolveDeploymentNamespace({ env: { ...R2_ENV }, dataDir, host: DEV_BOX });
    const fetch = fakeR2();

    const report = await restoreNewestArchiveAtBoot({
      dataDir,
      processStartedAt: new Date("2026-11-07T15:00:00Z"),
      markerFirstSeenAt: null, // a brand-new directory: a restore WOULD be allowed
      env: ns.env,
      passphrase: PASSPHRASE,
      fetchImpl: fetch,
      // What prod-server passes: the namespace the resolver decided, so the
      // record still says where this runtime WOULD have restored from.
      namespaceHint: { prefix: ns.prefix, instance: ns.instance },
    });

    expect(fetch.captured).toEqual([]);
    expect(report.attempted).toBe(false);
    expect(report.ok).toBeNull();
    expect(report.key).toBeNull();
    expect(report.skippedReason).toContain("cannot prove");
    // Reported where it WOULD have gone, refused where it mattered.
    expect(report.namespacePrefix).toBe(LIVE_PREFIX);

    const persisted = readBootRestore(dataDir);
    expect(persisted?.skippedReason).toContain("cannot prove");
    expect(existsSync(join(dataDir, BOOT_RESTORE_FILE))).toBe(true);
  });
});

// ── 6. The supervised loop does not adopt this box's namespace ─────────────

describe("backup-daemon — a loop only adopts host-primary for this box's data", () => {
  it("refuses the upload for a DATA_DIR outside the shared root and says so in its heartbeat", async () => {
    const dataDir = makeDataDir();
    const outDir = tmpDir("s208-daemon-");
    const env: Record<string, string | undefined> = {
      ...process.env,
      DATA_DIR: dataDir,
      BACKUP_ROOT: outDir,
      // No R2_INSTANCE on purpose — this is the case that used to be stamped
      // host-primary regardless of what it was supervising.
      BACKUP_FIRST_DELAY_MS: "600000",
      BACKUP_INTERVAL_MS: "3600000",
    };
    delete env.R2_INSTANCE;
    delete env.R2_PREFIX;
    delete env.NODE_ENV;
    delete env.VITEST;

    // `bun`, not `process.execPath`: vitest runs under node, and node cannot
    // import the .ts modules the loop is built from.
    const child = spawn("bun", [join(REPO_ROOT, "scripts", "backup-daemon.mjs")], {
      cwd: REPO_ROOT,
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (out += String(d)));

    try {
      const heartbeat = join(outDir, ".backup-daemon.json");
      const deadline = Date.now() + 20_000;
      let raw: any = null;
      while (Date.now() < deadline) {
        if (existsSync(heartbeat)) {
          try {
            raw = JSON.parse(readFileSync(heartbeat, "utf8"));
            break;
          } catch {
            /* still being written */
          }
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(raw, `no heartbeat was written; daemon output:\n${out}`).not.toBeNull();
      expect(raw.env.uploadAllowed).toBe(false);
      expect(String(raw.env.uploadSkipReason)).toContain("outside the team's shared root");
      expect(out).toContain("OFF-BOX UPLOAD REFUSED");
    } finally {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }, 30_000);
});
