/**
 * backup-namespace.ts — SLICE 163. WHICH off-box namespace this deployment owns.
 *
 * THE PROBLEM THIS FILE SOLVES. Slice 145/147 gave every deployment its own
 * namespace so two of them can never prune each other's only off-box copy. What
 * it did NOT give was a NAME anyone could recognise: a deployment with no
 * explicit override derives a random id from its data directory
 * (`data-584d83bf`), and the published site — the one deployment whose data
 * belongs to real customers — was therefore indistinguishable in the bucket from
 * a throwaway test run. On 2026-10-31 the bucket held:
 *
 *   simplerlife100/backups/2026-10-30T22-19-54Z…        (no namespace at all)
 *   simplerlife100/backups/data-584d83bf/…             ← the published site
 *   simplerlife100/backups/data-b2e7f21a/…             ← this dev box, in-tree
 *   simplerlife100/backups/host-primary/…              ← this dev box, today
 *   simplerlife100/backups/proof147-a|b/…              ← slice-147 proof objects
 *
 * Nothing in that list says which one is the live site, and the live one is the
 * only one that matters. So the role is now decided by CODE, from facts this
 * process already has, and it is reported in `/api/admin/data-health`:
 *
 *   1. `R2_PREFIX` set            → verbatim, an operator said what they wanted.
 *   2. `R2_INSTANCE` set          → `<base><instance>/` (unchanged, slice 147).
 *   3. data dir under the team's shared root (`/home/team/shared`) → `host-primary`.
 *      That is THIS dev box, and it is the same id the supervised loop beside
 *      the server already uploads under (`scripts/lib/backup-daemon.ts`), so the
 *      in-process scheduler and the loop can no longer disagree about where this
 *      box's archives live.
 *   4. anything else              → `live`, but ONLY IF the runtime PROVES it is
 *      the deployment (see SLICE 208 below). Otherwise the namespace is still
 *      reported and the runtime is REFUSED, loudly, with a reason that is
 *      written to `backup_status.json`.
 *
 * WHAT THIS IS NOT. It does not decide whether an upload is ALLOWED — that gate
 * is slice 147's, in `resolveUploadPrefix`. This file only names the namespace,
 * and it never creates a file, a directory or a network call. But since slice
 * 208 it also does not hand a refused runtime an environment that would let it
 * upload anyway: the refusal travels to the uploader and the boot restore as
 * `BACKUP_R2_REFUSED`, and `resolveUploadPrefix` honours it first.
 *
 * SLICE 208 — WHY RULE 4 IS NO LONGER A DEFAULT. Measured on 2026-11-07:
 * `PORT=4199 DATA_DIR=/tmp/h1data bun run prod-server.ts` — a throwaway
 * instance, started from the team's shared tree to measure a rendering defect —
 * resolved rule 4, was told it was the deployment, and did two things to
 * production:
 *
 *   1. it UPLOADED `simplerlife100/backups/live/2026-11-07T15-00-59Z.tar.gz.enc`
 *      (39 files, `source.dataDir = /tmp/h1data`), whose retention then pruned
 *      the other 2026-11-07 object in that prefix;
 *   2. it RESTORED a `live/` archive at boot and reported it as this
 *      deployment's recovery — the archive was another scratch instance's, and
 *      it carried `admin-initial-password.txt`, a plaintext admin credential
 *      that has never existed in this box's real data directory.
 *
 * The old comment here called that residual risk "smaller" than having no
 * recognisable namespace. It was not: any `prod-server` started by hand on this
 * box became the live site for backup purposes. So the live namespace is now
 * OPT-IN, and a runtime must satisfy ONE of these to write it:
 *
 *   a. `R2_PREFIX` / `R2_INSTANCE` set (rules 1-2) — an operator said so;
 *   b. it proves it is the deployment: the team's shared root does NOT exist on
 *      this machine's filesystem AND its own checkout is not inside that root.
 *      The published site runs on its own filesystem; every scratch instance on
 *      the dev box fails both halves.
 *
 * A runtime that satisfies neither keeps the REPORTED namespace (`live`) and is
 * refused: `uploadAllowed: false`, a plain-words `skipReason`, and
 * `BACKUP_R2_REFUSED` in the environment it hands to the uploader and the boot
 * restore, so the refusal is recorded rather than silently re-routed into some
 * other namespace.
 */
import { resolve, sep } from "node:path";
import {
  DEFAULT_R2_PREFIX,
  R2_INSTANCE_ENV,
  R2_PREFIX_ENV,
  R2_REFUSED_ENV,
  isNonProductionRuntime,
  sanitizeInstanceId,
} from "./r2-upload";

/** The published deployment's namespace id. */
export const LIVE_INSTANCE = "live";
/** This dev box's namespace id — must match `DEFAULT_DAEMON_INSTANCE`. */
export const HOST_INSTANCE = "host-primary";
/** The directory that makes a runtime "this box" rather than "a deployment". */
export const SHARED_TEAM_ROOT = "/home/team/shared";

export type NamespaceRole = "live" | "host" | "explicit";
export type NamespaceSource = "env-prefix" | "env-instance" | "shared-root" | "deployment";

/**
 * SLICE 208 — the facts a runtime has to supply to CLAIM the live namespace.
 *
 * They are supplied by the caller, not read here, because this resolver is pure
 * (no I/O, no clock) and because "does the team's shared root exist on this
 * machine?" is a question about the machine, not about the namespace. Both are
 * facts only the caller can establish:
 *
 *   - `repoRoot`         the checkout this process runs from;
 *   - `teamRootPresent`  `existsSync(SHARED_TEAM_ROOT)` on this filesystem.
 *
 * Omitted host facts are treated as NOT proven: a caller that forgets to pass
 * them gets a refusal, never a silent promotion to `live`.
 */
export interface HostFacts {
  repoRoot: string;
  teamRootPresent: boolean;
}

export interface DeploymentNamespace {
  role: NamespaceRole;
  /** The instance id uploads are attributed to, or null when a prefix was given. */
  instance: string | null;
  source: NamespaceSource;
  /** The exact key prefix this deployment uploads under and prunes within. */
  prefix: string;
  /** Plain words: why this namespace and not another. Shown to the owner. */
  reason: string;
  /**
   * False when this runtime must not upload at all (a test/development runtime).
   * The namespace is still REPORTED — the owner should be able to see where the
   * deployment would write — but no instance id is injected, so slice 147's
   * non-production gate still refuses the upload.
   */
  uploadAllowed: boolean;
  /** Why uploads are refused, when they are. Null otherwise. */
  skipReason: string | null;
  /**
   * The environment to hand to the uploader. An explicit override is passed
   * through untouched; otherwise it carries the derived `R2_INSTANCE`, which is
   * also what stops `ensureInstanceId` from writing a random-id marker file.
   */
  env: Record<string, string | undefined>;
}

/** True when `dir` sits at or under `root`. */
export function isUnderSharedTeamRoot(dir: string, root: string = SHARED_TEAM_ROOT): boolean {
  const d = resolve(dir);
  const r = resolve(root);
  if (r === sep || r.length === 0) return false;
  return d === r || d.startsWith(r.endsWith(sep) ? r : r + sep);
}

function normalizePrefix(raw: string): string {
  return raw.endsWith("/") ? raw : raw + "/";
}

/**
 * Decide this deployment's namespace. Pure: no I/O, no clock, no mutation of the
 * environment object it is given.
 */
export function resolveDeploymentNamespace(opts: {
  env: Record<string, string | undefined>;
  dataDir: string;
  sharedRoot?: string;
  /** SLICE 208 — the facts needed to CLAIM the live namespace. Omitted ⇒ not proven. */
  host?: HostFacts;
}): DeploymentNamespace {
  const env = opts.env;
  const nonProd = isNonProductionRuntime(env);
  const explicitPrefix = (env[R2_PREFIX_ENV] || "").trim();
  if (explicitPrefix) {
    const prefix = normalizePrefix(explicitPrefix);
    const instance = sanitizeInstanceId(env[R2_INSTANCE_ENV] || "") || null;
    return {
      role: "explicit",
      instance,
      source: "env-prefix",
      prefix,
      reason: `${R2_PREFIX_ENV} is set, so this deployment uploads exactly where it was told (${prefix}).`,
      uploadAllowed: true,
      skipReason: null,
      env,
    };
  }

  const explicitInstance = sanitizeInstanceId(env[R2_INSTANCE_ENV] || "");
  if (explicitInstance) {
    return {
      role: "explicit",
      instance: explicitInstance,
      source: "env-instance",
      prefix: `${DEFAULT_R2_PREFIX}${explicitInstance}/`,
      reason: `${R2_INSTANCE_ENV}=${explicitInstance} is set, so this deployment uploads under its own named namespace.`,
      uploadAllowed: true,
      skipReason: null,
      env,
    };
  }

  const sharedRoot = opts.sharedRoot ?? SHARED_TEAM_ROOT;
  if (isUnderSharedTeamRoot(opts.dataDir, sharedRoot)) {
    return {
      role: "host",
      instance: HOST_INSTANCE,
      source: "shared-root",
      prefix: `${DEFAULT_R2_PREFIX}${HOST_INSTANCE}/`,
      reason: `DATA_DIR (${resolve(opts.dataDir)}) is inside the team's shared root (${resolve(sharedRoot)}), so this is the shared dev box and it uploads under ${HOST_INSTANCE} — the same namespace its supervised backup loop uses.`,
      uploadAllowed: true,
      skipReason: null,
      env: { ...env, [R2_INSTANCE_ENV]: HOST_INSTANCE },
    };
  }

  // A test/development runtime keeps the namespace for REPORTING but is given no
  // instance id, so slice 147's non-production gate still refuses to upload. A
  // suite that spawns real servers must never place an object where it could be
  // mistaken for the live site's copy — that is the whole reason that gate exists.
  //
  // SLICE 208: and a runtime that is NOT a test but also cannot prove it is the
  // deployment is refused the same way, for the same reason. Reporting keeps the
  // namespace; the environment loses it and gains the refusal, which the uploader
  // and the boot restore both honour — so a refused instance records WHY instead
  // of quietly uploading under some other namespace it minted for itself.
  const livePrefix = `${DEFAULT_R2_PREFIX}${LIVE_INSTANCE}/`;
  const proof = deploymentProof(opts.host, sharedRoot);
  const skipReason = nonProd
    ? `non-production runtime (NODE_ENV=${env.NODE_ENV ?? "<unset>"}) — the deployment namespace is reported but not written to`
    : proof.proven
      ? null
      : `refusing to write the production namespace ${livePrefix}: this runtime cannot prove it is the published deployment (${proof.why}). ` +
        `The live namespace is opt-in — set ${R2_INSTANCE_ENV}=${LIVE_INSTANCE} (or ${R2_PREFIX_ENV}=${livePrefix}) on the real deployment.`;
  return {
    role: "live",
    instance: LIVE_INSTANCE,
    source: "deployment",
    prefix: livePrefix,
    reason: nonProd
      ? `DATA_DIR (${resolve(opts.dataDir)}) is outside the team's shared root, so this would be the deployment namespace (${livePrefix}) — but this runtime identifies as ${env.NODE_ENV || "test"}, so uploads are refused.`
      : proof.proven
        ? `DATA_DIR (${resolve(opts.dataDir)}) is outside the team's shared root, no ${R2_PREFIX_ENV}/${R2_INSTANCE_ENV} override is set, and this runtime proves it is the deployment (${proof.why}) — so it uploads under ${LIVE_INSTANCE}.`
        : `DATA_DIR (${resolve(opts.dataDir)}) is outside the team's shared root and no ${R2_PREFIX_ENV}/${R2_INSTANCE_ENV} override is set, but this runtime cannot prove it is the deployment (${proof.why}). The namespace it WOULD use (${livePrefix}) is reported, and NOTHING is written there.`,
    uploadAllowed: !skipReason,
    skipReason,
    env: skipReason ? { ...env, [R2_REFUSED_ENV]: skipReason } : { ...env, [R2_INSTANCE_ENV]: LIVE_INSTANCE },
  };
}

/**
 * SLICE 208 — can this runtime prove it is the published deployment?
 *
 * The proof is a fact about the machine, not about the data directory: the
 * published site runs on its own filesystem, which does not carry the team's
 * shared root. Every scratch instance on the dev box — however its DATA_DIR is
 * spelled, and whichever checkout it was started from — fails.
 *
 * Pure: the caller supplies both facts (see `HostFacts`).
 */
export function deploymentProof(
  host: HostFacts | undefined,
  sharedRoot: string = SHARED_TEAM_ROOT,
): { proven: boolean; why: string } {
  if (!host) {
    return {
      proven: false,
      why: "no host facts were supplied, so nothing distinguishes this runtime from a scratch instance on the dev box",
    };
  }
  if (host.teamRootPresent) {
    return {
      proven: false,
      why: `the team's shared root (${resolve(sharedRoot)}) exists on this filesystem, so this machine is the shared dev box and not the deployment`,
    };
  }
  if (isUnderSharedTeamRoot(host.repoRoot, sharedRoot)) {
    return {
      proven: false,
      why: `it runs from ${resolve(host.repoRoot)}, which is inside the team's shared root`,
    };
  }
  return {
    proven: true,
    why: `the team's shared root does not exist on this machine and this checkout (${resolve(host.repoRoot)}) is outside it`,
  };
}

/**
 * The namespace this deployment WOULD use, for reporting. Identical to
 * `resolveDeploymentNamespace` — kept as a separate name so a reader can see
 * that reporting never creates anything (this function is pure, and so is the
 * other one; neither touches the filesystem or the network).
 */
export function peekDeploymentNamespace(opts: {
  env: Record<string, string | undefined>;
  dataDir: string;
  sharedRoot?: string;
  host?: HostFacts;
}): DeploymentNamespace {
  return resolveDeploymentNamespace(opts);
}
