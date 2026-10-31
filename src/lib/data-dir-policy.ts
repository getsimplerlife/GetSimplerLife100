import { accessSync, constants, mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * data-dir-policy.ts — SLICE 150. Where runtime data is allowed to live.
 *
 * The connection-persistence fix (2026-08-11, PR #124) moved runtime data out
 * of the publish tree with ONE setting: `DATA_DIR=/var/lib/simplerlife100/.data`
 * written into `.env`. That fix regressed, and the reason is the shape of the
 * fix rather than the value: `.env` sits INSIDE the publish tree, so the only
 * thing keeping runtime data out of a tree that a publish can replace was a file
 * in that same tree — and on this box the key is gone and the directory it
 * pointed at no longer exists, so `resolveDataDir(undefined, <site>)` quietly
 * returned `<site>/.data` again.
 *
 * So the rule lives in code now, not in a config file or an exported variable:
 *
 *   1. An explicit `DATA_DIR` (env, or a caller-supplied override) is honoured.
 *   2. If the result would sit inside a publish tree, it is RELOCATED to the
 *      sibling of that tree (`/…/shared/site/.data` → `/…/shared/.data`), which
 *      no build or swap of `site/` can touch.
 *   3. If that sibling cannot be created or written, the original path is kept
 *      and a loud warning says so — a policy must never take the server down or
 *      silently point it at a directory that cannot be written.
 *
 * Because the rule is recomputed from code on every boot, it needs no shell
 * export, no `.env` key and no platform secret: a restart, a publish and a
 * re-clone all land on the same answer. Anything the owner sets as a secret
 * still wins, because an explicit value is honoured first.
 */

/** True when the path sits inside a platform publish tree. */
export function isInsidePublishTree(dataDir: string): boolean {
  return /\/shared\/site\//.test(dataDir) || /\/site\/\.data$/.test(dataDir);
}

/**
 * The sibling-of-the-tree location an in-tree data dir is relocated to.
 * `/home/team/shared/site/.data` → `/home/team/shared/.data`.
 * Null when the path has no `site` segment to step out of.
 */
export function publishTreeEscapeDir(dataDir: string): string | null {
  const abs = resolve(dataDir);
  const parts = abs.split(sep).filter(Boolean);
  const i = parts.lastIndexOf("site");
  if (i < 1) return null; // no `site` segment, or it is the filesystem root
  const parent = sep + parts.slice(0, i).join(sep);
  const candidate = join(parent, ".data");
  return candidate === abs ? null : candidate;
}

/** Can we actually create and write this directory? */
function usable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/**
 * Return `dir` if it is safe to use, or the sibling-of-the-tree escape when it
 * is not. Never throws, never returns a path it has not checked.
 */
export function relocateOutOfPublishTree(dir: string): string {
  if (!isInsidePublishTree(dir)) return dir;
  const escape = publishTreeEscapeDir(dir);
  if (!escape || !usable(escape)) {
    warnOnce(
      `keep:${dir}`,
      `[data-dir] WARNING: DATA_DIR resolves inside the publish tree (${dir}) and no writable location outside it could be created — keeping it. A publish can wipe runtime data.`,
    );
    return dir;
  }
  warnOnce(
    `move:${dir}:${escape}`,
    `[data-dir] DATA_DIR resolved inside the publish tree (${dir}) — using ${escape} instead, so a publish cannot wipe runtime data. Set DATA_DIR to a path outside the tree to change it.`,
  );
  return escape;
}

/**
 * Resolve the runtime data directory from an env override (or default), never
 * returning a path inside a publish tree unless no alternative is writable.
 */
export function resolveDataDir(envDir: string | undefined, baseDir: string): string {
  let raw: string;
  if (envDir && envDir.trim()) {
    const value = envDir.trim();
    raw = value.startsWith("/") ? value : join(baseDir, value);
  } else {
    raw = join(baseDir, ".data");
  }
  return relocateOutOfPublishTree(raw);
}
