/**
 * atomic-write.ts — SLICE 144. Every durable write is all-or-nothing.
 *
 * WHY (owner directive 2026-10-30: "I don't want any data loss. All clients need
 * their data secured."): `writeFileSync` truncates the target and then streams
 * the new bytes into it. A crash, a SIGKILL, a full disk or an ENOSPC part-way
 * through leaves a TRUNCATED document on disk. `readJSON` in data-store.ts
 * answers a truncated document with `{}`, so the failure mode is not a crash —
 * it is a silently empty store: a customer's invoices, approvals and audit trail
 * read back as if they never existed. That is the exact loss the owner forbade.
 *
 * THE FIX: write the new bytes to a sibling temp file, fsync it, rename it over
 * the target, then fsync the directory so the rename itself is durable. rename()
 * is atomic within a filesystem, so a reader sees either the whole old document
 * or the whole new one — never a half-written one, and never nothing.
 *
 * RULES THIS FILE KEEPS:
 *   - the temp file lives in the SAME directory as the target (a rename across
 *     filesystems is a copy, which is not atomic);
 *   - the existing file's mode is preserved and permissions are never widened;
 *   - on ANY error the temp file is removed and the error is rethrown — a failed
 *     write leaves the original byte-identical and never reports success;
 *   - the directory fsync is best-effort: filesystems that cannot fsync a
 *     directory must not fail a write that already succeeded.
 *
 * This module has no imports beyond node builtins on purpose: scripts/, the
 * native stores and the server all use the same primitive.
 */
import { closeSync, fsyncSync, openSync, renameSync, statSync, unlinkSync, writeSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";

/** New files are created owner-only. Never wider than the file they replace. */
export const DEFAULT_FILE_MODE = 0o600;

/**
 * Test seams. Production callers pass nothing. A test can make the write or the
 * rename throw mid-flight to prove the original survives a failed write.
 */
export interface AtomicWriteHooks {
  write?: (fd: number, data: string | Uint8Array) => void;
  fsync?: (fd: number) => void;
  rename?: (from: string, to: string) => void;
}

/** Mode of an existing file (never widened); undefined when it does not exist. */
function existingMode(path: string): number | undefined {
  try {
    const st = statSync(path);
    if (!st.isFile()) return undefined;
    return st.mode & 0o777;
  } catch {
    return undefined;
  }
}

/** Best-effort fsync of a directory so the rename itself survives a crash. */
function fsyncDir(dir: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(dir, "r");
    fsyncSync(fd);
  } catch {
    /* unsupported (some filesystems refuse O_RDONLY dir fds / fsync on dirs) —
       the data file is already fsynced and renamed; never fail the write here */
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Temp file name for a target: `<target>.tmp-<pid>-<random>` (same dir). */
export function tempPathFor(path: string): string {
  return join(dirname(path), `${basename(path)}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`);
}

/**
 * Write `data` to `path` atomically: temp file → fsync → rename → dir fsync.
 * Throws on any failure AFTER removing the temp file, leaving `path` untouched.
 */
export function atomicWriteSync(
  path: string,
  data: string | Uint8Array,
  hooks: AtomicWriteHooks = {},
): void {
  const dir = dirname(path);
  const mode = existingMode(path) ?? DEFAULT_FILE_MODE;
  const tmp = tempPathFor(path);
  const write =
    hooks.write ??
    ((fd: number, d: string | Uint8Array) => {
      if (typeof d === "string") writeSync(fd, d);
      else writeSync(fd, d);
    });
  const fsync = hooks.fsync ?? ((fd: number) => { fsyncSync(fd); });
  const rename = hooks.rename ?? ((from: string, to: string) => { renameSync(from, to); });

  let fd: number | undefined;
  try {
    // "wx" — fail rather than clobber a temp file another writer owns.
    fd = openSync(tmp, "wx", mode);
    write(fd, data);
    fsync(fd);
    closeSync(fd);
    fd = undefined;
    // openSync mode is filtered through the process umask; set it explicitly so
    // the replacement carries exactly the mode the original had.
    try {
      chmodSync(tmp, mode);
    } catch {
      /* best effort — a mode we could not tighten is not a write failure */
    }
    rename(tmp, path);
  } catch (e) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(tmp);
    } catch {
      /* nothing to clean up */
    }
    throw e;
  }
  fsyncDir(dir);
}

/** Convenience for JSON documents: pretty-printed, exactly like writeJSON. */
export function atomicWriteJSONSync(path: string, data: unknown, hooks: AtomicWriteHooks = {}): void {
  atomicWriteSync(path, JSON.stringify(data, null, 2), hooks);
}
