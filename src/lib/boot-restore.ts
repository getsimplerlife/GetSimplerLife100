/**
 * boot-restore.ts — SLICE 164. Data that survives a publish it cannot survive.
 *
 * THE FACT THIS FILE EXISTS FOR. On 2026-11-01 the owner read the live
 * deployment's own data-health page: `/home/engine/.data` is outside the publish
 * tree (good), but its generation marker's `firstSeenAt` was the same second as
 * the process start and NEWER than the running build. Nothing in that directory
 * had survived the previous publish. Its `backup_status.json` — a file that has
 * only ever existed on this dev box — reported this box's archive and this box's
 * destination path, which means the live data directory was re-seeded from a
 * `.data` directory that travelled with the publish.
 *
 * So on that deployment the disk is not storage. It is scratch space that every
 * deploy replaces. No amount of "write outside the publish tree" fixes that,
 * because the whole filesystem is new.
 *
 * THE ONLY HONEST ARCHITECTURE. If the disk cannot be kept, the data must be
 * RECOVERED: at boot, before the server answers anything, pull this
 * deployment's newest encrypted archive down from the bucket, verify it, and
 * unpack it into the (empty) data directory. The archive is the durable copy;
 * the disk is a cache of it. That is what this file implements, and it is why
 * `data-health` can now say what actually protects the data instead of implying
 * the disk does.
 *
 * RULES, EACH ONE A WAY A RESTORE DESTROYS DATA:
 *   - RESTORE ONLY INTO A DIRECTORY THIS BOOT CREATED. `bootRestoreNeeded` reads
 *     the generation marker: a directory that predates the process (this dev box,
 *     any host that keeps its disk) is NEVER touched. Restoring over live data is
 *     how a "recovery" turns into a loss.
 *   - RESTORE ONLY THIS DEPLOYMENT'S OWN NAMESPACE. Listing at the shared base
 *     prefix and taking the newest object would pull ANOTHER deployment's data
 *     into this one (this dev box's archives sit beside the live site's). The
 *     namespace comes from the same resolver the uploader uses.
 *   - NEVER RESTORE IDENTITY OR STATUS. `deployment-generation.json` is this
 *     directory's own survival proof — restoring another machine's marker would
 *     forge it. `backup_instance.json` is this deployment's namespace id —
 *     restoring it would point this deployment at someone else's objects and let
 *     its retention prune them. `backup_status.json` is the previous machine's
 *     backup state, and it is exactly what made the live page claim a success it
 *     never had. Locks are runtime artifacts; restoring one blocks boot.
 *   - VERIFY BEFORE WRITING. Size against the bucket listing, decrypt (auth tag
 *     first), then every file digest against the manifest — the same three gates
 *     the restore CLI uses, via the same functions. Nothing is unpacked over the
 *     data directory until all three pass.
 *   - NEVER THROW, NEVER HANG THE BOOT. Every failure is recorded in
 *     `<DATA_DIR>/boot_restore.json` and reported on the data-health page, and
 *     the boot continues. A server that will not start because a restore failed
 *     is worse than a server that starts and says the restore failed.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteJSONSync } from "./atomic-write";
import { describeR2Config, isNonProductionRuntime, peekUploadPrefix, r2ConfigFromEnv, R2_REFUSED_ENV } from "./r2-upload";
import type { R2Fetch } from "./r2-upload";
import { createR2Client } from "./r2-upload";
import { decryptArchiveToDir } from "../../scripts/lib/backup-crypto";
import { assertDownloadedSize, selectRemoteObject, verifyExtractedRun } from "../../scripts/lib/r2-restore";

/** The boot-restore record, relative to DATA_DIR. A durable store. */
export const BOOT_RESTORE_FILE = "boot_restore.json";
export const BOOT_RESTORE_VERSION = 1;

/**
 * Files that describe a MACHINE, never data, and must never be restored from
 * another machine's archive. See the header for why each one is on the list.
 */
export const NEVER_RESTORED: readonly string[] = [
  "deployment-generation.json",
  "backup_instance.json",
  "backup_status.json",
  BOOT_RESTORE_FILE,
  "prod-server.lock",
  "liveness-watchdog.lock",
];

export interface BootRestoreReport {
  version: number;
  /** When this decision was made. */
  at: string;
  /** True when a restore was actually attempted (i.e. not skipped). */
  attempted: boolean;
  /** null = skipped, never attempted. */
  ok: boolean | null;
  skippedReason: string | null;
  error: string | null;
  /** The namespace this deployment restores from (its own). */
  namespacePrefix: string;
  instance: string | null;
  /** The object that was restored, when one was. */
  key: string | null;
  runId: string | null;
  files: number | null;
  bytes: number | null;
  /** Archive entries deliberately not written into the data directory. */
  excluded: string[];
  durationMs: number | null;
}

/** Where the record lives. */
export function bootRestorePath(dataDir: string): string {
  return join(dataDir, BOOT_RESTORE_FILE);
}

/**
 * Should this boot restore at all?
 *
 * `markerFirstSeenAt` is the generation marker's firstSeenAt as read BEFORE this
 * boot records itself (null when there is no marker). A directory with no marker,
 * or one created at/after this process started, holds nothing that outlived the
 * publish — that is the only case a restore is allowed to write into.
 */
export function bootRestoreNeeded(
  markerFirstSeenAt: string | null | undefined,
  processStartedAt: Date,
): { needed: boolean; reason: string } {
  if (!markerFirstSeenAt) {
    return {
      needed: true,
      reason: "there is no generation marker yet — this data directory was created by this boot, so it holds nothing that outlived the previous publish",
    };
  }
  const first = new Date(markerFirstSeenAt).getTime();
  if (!Number.isFinite(first)) {
    return { needed: false, reason: `the generation marker's firstSeenAt (${markerFirstSeenAt}) is not a timestamp — refusing to restore over a directory whose age cannot be established` };
  }
  if (first >= processStartedAt.getTime()) {
    return {
      needed: true,
      reason: `the generation marker's firstSeenAt (${markerFirstSeenAt}) is not older than this process (${processStartedAt.toISOString()}) — this data directory was created by this boot`,
    };
  }
  return {
    needed: false,
    reason: `the data directory predates this process (firstSeenAt ${markerFirstSeenAt}, process started ${processStartedAt.toISOString()}), so its data outlived the publish and must not be overwritten`,
  };
}

/** Read the last boot-restore record. Never throws; null when absent/unreadable. */
export function readBootRestore(dataDir: string): BootRestoreReport | null {
  const path = bootRestorePath(dataDir);
  try {
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (!raw || typeof raw !== "object") return null;
    return {
      version: typeof raw.version === "number" ? raw.version : 0,
      at: typeof raw.at === "string" ? raw.at : "",
      attempted: raw.attempted === true,
      ok: typeof raw.ok === "boolean" ? raw.ok : null,
      skippedReason: typeof raw.skippedReason === "string" ? raw.skippedReason : null,
      error: typeof raw.error === "string" ? raw.error : null,
      namespacePrefix: typeof raw.namespacePrefix === "string" ? raw.namespacePrefix : "",
      instance: typeof raw.instance === "string" ? raw.instance : null,
      key: typeof raw.key === "string" ? raw.key : null,
      runId: typeof raw.runId === "string" ? raw.runId : null,
      files: typeof raw.files === "number" && Number.isFinite(raw.files) ? raw.files : null,
      bytes: typeof raw.bytes === "number" && Number.isFinite(raw.bytes) ? raw.bytes : null,
      excluded: Array.isArray(raw.excluded) ? raw.excluded.filter((n: any) => typeof n === "string") : [],
      durationMs: typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs) ? raw.durationMs : null,
    };
  } catch {
    return null;
  }
}

/** Persist the record. Never throws — a failed write must not fail a boot. */
export function writeBootRestore(dataDir: string, report: BootRestoreReport): void {
  try {
    mkdirSync(dataDir, { recursive: true });
    atomicWriteJSONSync(bootRestorePath(dataDir), report);
  } catch {
    /* the page will show the previous record rather than a fabricated one */
  }
}

/** Every regular file under `dir`, relative, excluding the names in `skip`. */
function walk(dir: string, prefix = "", skip: readonly string[] = []): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (skip.includes(name)) continue;
    const abs = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    try {
      if (statSync(abs).isDirectory()) out.push(...walk(abs, rel, skip));
      else out.push(rel);
    } catch {
      /* unreadable entry: skip, and the count reflects what we really copied */
    }
  }
  return out;
}

export interface BootRestoreOptions {
  dataDir: string;
  processStartedAt: Date;
  /** The marker's firstSeenAt, read BEFORE this boot recorded itself. */
  markerFirstSeenAt?: string | null;
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Tests inject a fake; production uses global fetch. */
  fetchImpl?: R2Fetch;
  passphrase?: string | null;
  now?: () => Date;
  log?: (msg: string) => void;
  /** Where the download is staged. Defaults to a fresh dir under os.tmpdir(). */
  stageRoot?: string;
  /** Persist the record. Tests pass false. */
  persist?: boolean;
  /** `BOOT_RESTORE_DISABLED=1` (or a test runtime) opts out entirely. */
  disabled?: boolean;
  /**
   * SLICE 208 — the namespace the caller already resolved (`ARCHIVE_BACKUP_NAMESPACE`
   * in prod-server). Used ONLY for the record when this runtime is REFUSED: the
   * uploader/restore environment no longer carries the live prefix (it carries the
   * refusal instead), so without this hint `boot_restore.json` would say "the base
   * prefix", which is not where this runtime would have gone.
   */
  namespaceHint?: { prefix: string; instance: string | null };
}

const EMPTY_REPORT = (nowIso: string): BootRestoreReport => ({
  version: BOOT_RESTORE_VERSION,
  at: nowIso,
  attempted: false,
  ok: null,
  skippedReason: null,
  error: null,
  namespacePrefix: "",
  instance: null,
  key: null,
  runId: null,
  files: null,
  bytes: null,
  excluded: [],
  durationMs: null,
});

/**
 * Restore this deployment's newest archive into an empty data directory.
 * Returns a report; never throws.
 */
export async function restoreNewestArchiveAtBoot(opts: BootRestoreOptions): Promise<BootRestoreReport> {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const env = opts.env ?? process.env;
  const startedMs = now().getTime();
  const report = EMPTY_REPORT(new Date(startedMs).toISOString());
  const finish = (patch: Partial<BootRestoreReport>): BootRestoreReport => {
    const final: BootRestoreReport = {
      ...report,
      ...patch,
      durationMs: Math.max(0, now().getTime() - startedMs),
    };
    if (opts.persist !== false) writeBootRestore(opts.dataDir, final);
    return final;
  };

  try {
    const decision = bootRestoreNeeded(opts.markerFirstSeenAt ?? null, opts.processStartedAt);
    if (!decision.needed) {
      log(`[boot-restore] skipped: ${decision.reason}`);
      return finish({ skippedReason: decision.reason });
    }
    if (opts.disabled || env.BOOT_RESTORE_DISABLED === "1") {
      const reason = "BOOT_RESTORE_DISABLED=1 — this deployment will not recover its data at boot";
      log(`[boot-restore] skipped: ${reason}`);
      return finish({ skippedReason: reason });
    }
    if (isNonProductionRuntime(env) && !(env.BACKUP_R2_ALLOW_NONPROD || "").trim()) {
      const reason = `non-production runtime (NODE_ENV=${env.NODE_ENV ?? "<unset>"}) — refusing to fetch a production archive during a test run`;
      log(`[boot-restore] skipped: ${reason}`);
      return finish({ skippedReason: reason });
    }
    // SLICE 208 — NO PROOF, NO RESTORE. `resolveDeploymentNamespace` refused this
    // runtime the deployment's namespace (a scratch instance on the dev box, or
    // one that supplied no host facts), and it said so in the environment. A
    // restore is the same claim as an upload: "this archive is MY data". On
    // 2026-11-07 a scratch instance resolved `live/`, pulled down another scratch
    // instance's archive and reported it as its own recovery — the archive held a
    // plaintext admin password file that had never existed in this box's data.
    // The refusal is recorded in boot_restore.json and shown on data-health.
    const namespaceRefusal = (env[R2_REFUSED_ENV] || "").trim();
    if (namespaceRefusal) {
      const would = opts.namespaceHint ?? peekUploadPrefix(env, opts.dataDir);
      report.namespacePrefix = would.prefix;
      report.instance = would.instance;
      const reason = `this runtime may not use the deployment's namespace, so it will not restore from it either — ${namespaceRefusal}`;
      log(`[boot-restore] skipped: ${reason}`);
      return finish({ attempted: false, skippedReason: reason });
    }

    const cfg = r2ConfigFromEnv(env, { dataDir: opts.dataDir });
    if (!cfg) {
      const missing = describeR2Config(env, { dataDir: opts.dataDir }).missing;
      const reason = `off-box storage is not configured (missing ${missing.join(", ")}) — there is no archive to restore`;
      log(`[boot-restore] skipped: ${reason}`);
      return finish({ skippedReason: reason });
    }
    const passphrase = (opts.passphrase ?? env.BACKUP_PASSPHRASE ?? "").trim();
    if (!passphrase) {
      const reason = "BACKUP_PASSPHRASE is not set — the archive is encrypted and cannot be restored";
      log(`[boot-restore] skipped: ${reason}`);
      return finish({ skippedReason: reason });
    }

    // THIS deployment's namespace only. The shared base prefix holds other
    // deployments' objects, and restoring one of those into this one would be
    // cross-deployment contamination dressed up as recovery.
    const resolved = peekUploadPrefix(env, opts.dataDir);
    const prefix = resolved.prefix;
    report.namespacePrefix = prefix;
    report.instance = resolved.instance;
    // SLICE 165 — NO NAMESPACE MEANS NO RESTORE.
    //
    // `resolveUploadPrefix` falls back to the flat base prefix
    // (`simplerlife100/backups/`) when it can find neither an explicit override
    // nor an instance file. Listing there returns EVERY deployment's archives,
    // and `selectRemoteObject` takes the newest — so the live deployment, whose
    // data directory is new on every publish and therefore has no instance file,
    // restored this dev box's `host-primary` archive, reported `ok: true` and
    // announced "the data survives anyway". It was another machine's production
    // data. A QA run with a brand-new DATA_DIR reproduced it: 36 files of
    // production data, then real tenant OAuth tokens refreshed and real sends
    // attempted.
    //
    // Restoring nothing is correct here; restoring the wrong data is not. The
    // caller passes the SAME derived environment the uploader uses (see
    // prod-server.ts), so in practice the namespace resolves and this is a
    // belt-and-braces refusal for the case where it does not.
    if (!resolved.instance && !resolved.explicitOverride) {
      const reason =
        "cannot determine this deployment's own namespace — refusing to restore another deployment's archive " +
        `(the listing would fall back to the shared base prefix ${resolved.basePrefix}, which holds every deployment's objects)`;
      log(`[boot-restore] skipped: ${reason}`);
      return finish({ attempted: false, skippedReason: reason });
    }
    report.attempted = true;

    const client = createR2Client({ config: cfg, fetchImpl: opts.fetchImpl, now, log });
    let objects;
    try {
      objects = await client.listObjects(prefix);
    } catch (e: any) {
      const message = `could not list ${prefix}: ${e?.message || String(e)}`;
      log(`[boot-restore] FAILED: ${message}`);
      return finish({ ok: false, error: message });
    }
    if (!objects.length) {
      const reason = `no archive exists under this deployment's own namespace (${prefix}) yet — nothing to restore; the first successful backup creates it`;
      log(`[boot-restore] skipped: ${reason}`);
      return finish({ attempted: false, skippedReason: reason });
    }
    let chosen;
    try {
      chosen = selectRemoteObject(objects, { prefix });
    } catch (e: any) {
      const message = e?.message || String(e);
      log(`[boot-restore] FAILED: ${message}`);
      return finish({ ok: false, error: message });
    }
    const runId = (chosen.key.split("/").pop() || "").replace(/\.tar\.gz\.enc$/, "");
    report.key = chosen.key;
    report.runId = runId;

    const stageRoot = opts.stageRoot ?? mkdtempSync(join(tmpdir(), "sl-boot-restore-"));
    const cleanup = !opts.stageRoot;
    try {
      const archivePath = join(stageRoot, "download.tar.gz.enc");
      const got = await client.getObject(chosen.key);
      assertDownloadedSize(got.bytes.length, chosen.size, chosen.key);
      writeFileSync(archivePath, got.bytes);
      const extractDir = join(stageRoot, "extract");
      decryptArchiveToDir({ archivePath, outDir: extractDir, passphrase, log });
      const verified = verifyExtractedRun({ stageDir: extractDir, requestedRunId: runId });
      const dataRoot = join(extractDir, "data");
      if (!existsSync(dataRoot)) throw new Error("the archive has no data/ tree");

      // Copy the verified payload over the fresh directory, minus the machine
      // identity/status files (see NEVER_RESTORED).
      const excluded: string[] = [];
      let files = 0;
      let bytes = 0;
      for (const name of readdirSync(dataRoot)) {
        if (NEVER_RESTORED.includes(name)) {
          excluded.push(name);
          continue;
        }
        const src = join(dataRoot, name);
        const dst = join(opts.dataDir, name);
        cpSync(src, dst, { recursive: true, force: true });
        if (statSync(src).isDirectory()) {
          for (const rel of walk(src)) {
            files++;
            try {
              bytes += statSync(join(src, rel)).size;
            } catch {
              /* size is informational */
            }
          }
        } else {
          files++;
          try {
            bytes += statSync(src).size;
          } catch {
            /* size is informational */
          }
        }
      }
      // An archive from before these files existed carries none of them, but be
      // explicit: they are listed so the page can say what was left out.
      for (const name of NEVER_RESTORED) if (!excluded.includes(name) && existsSync(join(dataRoot, name))) excluded.push(name);

      log(
        `[boot-restore] restored ${files} file(s) from ${chosen.key} (run ${runId}, ${verified.checked} digest(s) verified) into ${opts.dataDir}`,
      );
      return finish({ ok: true, files, bytes, excluded });
    } finally {
      if (cleanup) {
        try {
          rmSync(stageRoot, { recursive: true, force: true });
        } catch {
          /* a leftover temp dir is not a boot failure */
        }
      }
    }
  } catch (e: any) {
    const message = e?.message || String(e);
    log(`[boot-restore] FAILED: ${message}`);
    return finish({ ok: false, error: message });
  }
}

/**
 * The plain-words answer to "what protects this data?", for the owner's page.
 *
 * Three states, and no fourth: the disk holds it, the archive restores it, or
 * nothing does. There is no optimistic default — a deployment whose directory
 * was created by this boot and that restored nothing is reported as unprotected,
 * because that is what it is.
 */
export interface DurabilityStatement {
  mode: "disk" | "archive-restore" | "none";
  plainWords: string;
}

export function describeDurability(opts: {
  survivedProcessStart: boolean | null;
  survivedRunningBuild: boolean | null;
  restore: BootRestoreReport | null;
  dataDir: string;
}): DurabilityStatement {
  const fresh = opts.survivedProcessStart === false || opts.survivedRunningBuild === false;
  if (!fresh) {
    return {
      mode: "disk",
      plainWords:
        `The directory ${opts.dataDir} predates both this process and the running build, so its contents outlived the last publish. ` +
        "The disk is the durable copy here, and the hourly encrypted archive is the second one.",
    };
  }
  if (opts.restore?.ok) {
    return {
      mode: "archive-restore",
      plainWords:
        `This deployment does not keep its disk: ${opts.dataDir} was created by this boot, which means the last publish replaced everything in it. ` +
        `The data survives anyway because the newest encrypted archive of this deployment's own namespace (${opts.restore.key}) is restored into that directory at boot, ` +
        `and a fresh archive is uploaded on a schedule. The bucket is the durable copy; the disk is a cache of it.`,
    };
  }
  const why = opts.restore
    ? opts.restore.attempted
      ? `the restore was attempted and failed: ${opts.restore.error ?? "unknown error"}`
      : `no restore was possible: ${opts.restore.skippedReason ?? "unknown reason"}`
    : "no restore has been attempted by this build";
  return {
    mode: "none",
    plainWords:
      `This deployment does not keep its disk: ${opts.dataDir} was created by this boot, so the last publish replaced everything in it — ` +
      `and ${why}. The data in it right now will NOT survive the next publish until one backup of this deployment's own namespace has been uploaded and restored.`,
  };
}
