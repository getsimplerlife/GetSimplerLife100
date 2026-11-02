/**
 * seal-credential-store.ts — SLICE 179 one-time migration entry point.
 *
 * Seals every PLAINTEXT secret already sitting in
 * `<DATA_DIR>/tenant_oauth_credentials.json` (13 real connections, 25 plaintext
 * secret fields when this was written) using the slice-177 store boundary —
 * no new crypto path.
 *
 * Run it explicitly, once:
 *
 *     bun run scripts/seal-credential-store.ts --dry-run   # report only
 *     bun run scripts/seal-credential-store.ts             # seal
 *
 * WHY A SCRIPT AND NOT A BOOT MIGRATION
 * -------------------------------------
 * A migration that runs itself on boot is harder to reason about: it fires in
 * the middle of a deploy, on a machine whose filesystem may be about to be
 * replaced, possibly while another instance holds the same store — and it is
 * invisible in the logs of the run that mattered. An explicitly invoked script
 * is one command, one report, one exit code, watched by the person who owns the
 * credentials. The cost is that somebody has to run it — which is why this
 * prints exactly what it will do under `--dry-run` first.
 *
 * It is safe to run twice: already-sealed values are never re-encrypted, and a
 * second run reports zero changes and does not write the store.
 *
 * Exit codes: 0 = ok (including "nothing to do"), 1 = failed (and, if a write
 * had already happened, the pre-run bytes were restored), 2 = refused before
 * touching anything (missing/short INTEGRATION_ENCRYPTION_KEY).
 *
 * The output contains provider names, field names and counts only. It never
 * prints a token value or a token prefix.
 */
import { dirname, resolve } from "node:path";
import { resolveDataDir } from "../src/lib/data-dir-policy";
import { CREDENTIAL_STORE_BASENAME } from "../src/lib/oauth-credential-store";
import { INTEGRATION_KEY_ENV, integrationKeyProblem } from "../src/lib/integration-crypto";
import {
  sealPlaintextCredentials,
  type SealMigrationReport,
} from "../src/lib/credential-store-seal-migration";
import { durableClose, initDurableStore } from "../src/lib/durable-store";

const SERVER_BASE = dirname(import.meta.dir);

interface Args {
  dataDir?: string;
  dryRun: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--data-dir") args.dataDir = argv[++i];
    else if (a.startsWith("--data-dir=")) args.dataDir = a.slice("--data-dir=".length);
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function printHuman(report: SealMigrationReport): void {
  const out: string[] = [];
  out.push("SLICE 179 — seal plaintext OAuth credentials at rest");
  out.push(`store:  ${report.storePath}`);
  out.push(`mode:   ${report.dryRun ? "DRY RUN — nothing was written" : "WRITE"}`);

  if (report.refused) {
    out.push("");
    out.push(`REFUSED: ${report.refusal}`);
    console.log(out.join("\n"));
    return;
  }
  if (!report.storeExisted) {
    out.push("");
    out.push(`nothing to do: ${CREDENTIAL_STORE_BASENAME} does not exist in that directory.`);
    console.log(out.join("\n"));
    return;
  }

  out.push(
    `before: ${report.plaintextFieldsBefore} plaintext secret field(s), ` +
      `${report.alreadySealedFieldsBefore} already sealed`,
  );
  if (report.backupPath) out.push(`safety copy: ${report.backupPath} (delete it once you are satisfied)`);

  out.push("");
  if (report.rows.length === 0) {
    out.push("no rows hold a secret field.");
  } else {
    const width = Math.max(...report.rows.map((r) => r.provider.length), 8);
    for (const row of report.rows) {
      const fields = row.sealed.length > 0 ? row.sealed.join(", ") : row.alreadySealed.join(", ") || "—";
      const note =
        row.result === "sealed"
          ? report.dryRun
            ? "would seal"
            : "sealed"
          : row.result === "failed"
            ? "FAILED"
            : "already sealed — untouched";
      out.push(`  ${row.provider.padEnd(width)}  ${fields.padEnd(34)}  ${note}`);
    }
  }

  out.push("");
  if (report.plaintextFieldsAfter !== null) {
    out.push(`after:  ${report.plaintextFieldsAfter} plaintext secret field(s), ${report.sealedFieldsAfter ?? 0} sealed`);
  }
  out.push(`verified: ${report.verifiedFields} sealed field(s) decrypt back to their exact original value`);
  if (report.unreadableSealedFields > 0) {
    out.push(
      `WARNING: ${report.unreadableSealedFields} value(s) were already ciphertext before this run and cannot be ` +
        `opened with the current ${INTEGRATION_KEY_ENV}; they were left exactly as they are.`,
    );
  }
  if (report.mirror.enabled) {
    out.push(
      `mirror:  durable store enabled — ${report.mirror.rowsCarriedFromMirror} row(s) carried from the mirror, ` +
        `${report.mirror.plaintextSecretsAfter ?? "?"} plaintext field(s) left there, ` +
        `${report.mirror.roundTripped} sealed field(s) round-tripped in the mirror`,
    );
  } else {
    out.push("mirror:  durable store disabled in this process (no DATABASE_URL) — the file is the only copy here");
  }

  if (report.errors.length > 0) {
    out.push("");
    for (const err of report.errors) out.push(`ERROR: ${err}`);
  }
  out.push("");
  if (report.ok) {
    out.push(
      report.dryRun
        ? `DRY RUN OK — ${report.changedRows} row(s) would be sealed. Nothing was changed.`
        : report.changedRows === 0
          ? "OK — nothing to do: every secret in this store is already sealed. No write was made."
          : `OK — ${report.changedRows} row(s) sealed and verified.`,
    );
  } else {
    out.push("FAILED — see the errors above.");
  }
  console.log(out.join("\n"));
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: bun run scripts/seal-credential-store.ts [--dry-run] [--json] [--data-dir <path>]\n" +
        `  Seals every plaintext secret in <dataDir>/${CREDENTIAL_STORE_BASENAME}.\n` +
        `  Requires ${INTEGRATION_KEY_ENV} (>= 32 characters); refuses and changes nothing without it.`,
    );
    return 0;
  }

  // Same resolution the server uses, so the script seals the store the server
  // actually reads: DATA_DIR (absolute or relative to the repo) → <repo>/.data,
  // then the publish-tree escape rule.
  const dataDir = args.dataDir
    ? resolve(args.dataDir)
    : resolveDataDir(process.env.DATA_DIR, SERVER_BASE, SERVER_BASE);

  // Refuse BEFORE opening the durable store: a refusal must not write anything
  // anywhere, and initDurableStore can migrate local files into the DB.
  const keyProblem = integrationKeyProblem();
  if (keyProblem) {
    const report = await sealPlaintextCredentials({ dataDir, dryRun: args.dryRun });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    return 2;
  }

  await initDurableStore(dataDir);
  try {
    const report = await sealPlaintextCredentials({ dataDir, dryRun: args.dryRun });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (report.refused) return 2;
    if (!report.ok) return 1;
    return 0;
  } finally {
    // Also stops the durable reconnect timer, so the process can exit.
    await durableClose().catch(() => undefined);
  }
}

main()
  .then((code) => {
    // A pending durable reconnect timer must not hold the process open.
    process.exit(code);
  })
  .catch((e) => {
    console.error(`FAILED: ${e?.message || String(e)}`);
    process.exit(1);
  });
