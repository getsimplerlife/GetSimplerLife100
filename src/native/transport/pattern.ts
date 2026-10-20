/**
 * native/transport/pattern.ts — SAFE name/extension PATTERN MATCHING for the
 * Phase 4.1 secure-transport slice.
 *
 * Matches a filename against a bounded glob: `*` (any run of chars, including
 * none) and `?` (exactly one char). Patterns are validated BEFORE compiling
 * (fail-closed): path separators, `..`, control chars and backslashes are
 * REJECTED at validation time, so a compiled regex can never escape the name
 * scope. Pattern length is capped (MAX_PATTERN_CHARS).
 *
 * Pure + deterministic — unit-tested directly (no I/O).
 */
import { MAX_PATTERN_CHARS } from "./types";

/** Reject characters that would let a pattern escape the file-NAME scope. */
export function validatePattern(pattern: string): void {
  if (typeof pattern !== "string" || pattern.trim().length === 0) {
    throw new Error("pattern is required");
  }
  const p = pattern.trim();
  if (p.length > MAX_PATTERN_CHARS) throw new Error(`pattern must be ≤${MAX_PATTERN_CHARS} characters`);
  // Slashes, backslashes, control chars and parent-directory escapes never
  // belong in a FILE-NAME pattern (they would target directories / escape).
  if (/[\/\\\x00-\x1f]/.test(p)) throw new Error("pattern may not contain path separators or control characters");
  if (p.includes("..")) throw new Error("pattern may not contain '..'");
  if (p.startsWith(".") && p.replaceAll("*", "").replaceAll("?", "").length <= 1) {
    // allow ".pdf" style extension-only patterns but reject pure "." / ".."
    if (p === "." || p === "..") throw new Error("invalid pattern");
  }
}

/** Compile a bounded glob into an anchored RegExp (escaped, case-insensitive). */
export function compilePattern(pattern: string): RegExp {
  validatePattern(pattern);
  const p = pattern.trim();
  // Escape regex metachars, then translate the glob tokens.
  const escaped = p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i");
}

/** Match a single filename against a pattern (deterministic, pure). */
export function matchesPattern(pattern: string, filename: string): boolean {
  if (typeof filename !== "string" || filename.length === 0) return false;
  if (filename.includes("/") || filename.includes("\\") || /[\x00-\x1f]/.test(filename)) return false;
  validatePattern(pattern);
  return compilePattern(pattern).test(filename);
}

/** Match a list of filenames (bounded by the caller's caps). */
export function matchFiles(
  pattern: string,
  filenames: string[],
): { matched: string[]; unmatched: string[] } {
  validatePattern(pattern);
  if (!Array.isArray(filenames)) throw new Error("filenames must be an array");
  if (filenames.length > 200) throw new Error("too many filenames (max 200 per run)");
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const f of filenames) {
    if (typeof f !== "string" || f.length === 0 || f.length > 255) {
      unmatched.push(f);
      continue;
    }
    (matchesPattern(pattern, f) ? matched : unmatched).push(f);
  }
  return { matched, unmatched };
}