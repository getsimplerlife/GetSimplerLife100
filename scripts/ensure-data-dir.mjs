#!/usr/bin/env bun
/**
 * ensure-data-dir.mjs — SLICE 150. Run the boot half of DATA_DIR setup in any
 * runtime, not only in `prod-server.ts`.
 *
 * Why: `prod-server.ts` resolves DATA_DIR, migrates a pre-fix publish-tree store
 * into it once, and seeds the missing-shape files on every boot. This box is
 * served by `vite dev`, which never runs prod-server, so on this machine those
 * two steps had no caller — a DATA_DIR that moved would have started life empty
 * and looked like "the data disappeared".
 *
 * What it does, in order and nothing else:
 *   1. resolves DATA_DIR with the same rule the server uses
 *      (`src/lib/data-dir-policy.ts`), which never returns a path inside a
 *      publish tree when a sibling of the tree is writable;
 *   2. copies a legacy publish-tree store in ONCE, create-if-missing only
 *      (`migrateLegacyData` — the same function prod-server calls);
 *   3. seeds the empty-shape files that must exist (`seedDataFiles` — also the
 *      same function, also create-if-missing; a populated file is never
 *      overwritten).
 *
 * Idempotent: a second run copies nothing and overwrites nothing. It never
 * deletes, moves or rewrites the legacy directory — deciding when that is
 * removable is the owner's call, not a script's.
 *
 *   bun scripts/ensure-data-dir.mjs           # resolve + migrate + seed
 *   bun scripts/ensure-data-dir.mjs --print   # resolve and report only, writes nothing
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isInsidePublishTree, resolveDataDir } from "../src/lib/data-dir-policy.ts";
import { findLegacyDataDir, legacyDataDirCandidates, migrateLegacyData, seedDataFiles } from "../src/lib/data-store.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PRINT_ONLY = process.argv.includes("--print");
const DATA_DIR = resolveDataDir(process.env.DATA_DIR, REPO_ROOT);
const legacyCandidates = legacyDataDirCandidates();
const legacyDir = findLegacyDataDir();

const report = {
  dataDir: DATA_DIR,
  source: process.env.DATA_DIR?.trim() ? "env" : "default+policy",
  insidePublishTree: isInsidePublishTree(DATA_DIR),
  legacyCandidates,
  legacyDir,
  printOnly: PRINT_ONLY,
};

if (PRINT_ONLY) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const before = existsSync(DATA_DIR) ? readdirSync(DATA_DIR).length : 0;
const migration = migrateLegacyData(DATA_DIR);
seedDataFiles(DATA_DIR);
const after = existsSync(DATA_DIR) ? readdirSync(DATA_DIR).length : 0;

console.log(
  JSON.stringify(
    {
      ...report,
      entriesBefore: before,
      entriesAfter: after,
      migrated: migration.migrated,
      migratedFrom: migration.legacyDir,
      legacyUntouched: !!legacyDir,
    },
    null,
    2,
  ),
);
// A resolved path inside the publish tree is the failure this script exists to
// prevent; say so with a non-zero exit so a caller cannot mistake it for success.
if (isInsidePublishTree(DATA_DIR)) process.exit(2);
