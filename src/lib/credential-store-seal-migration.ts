/**
 * credential-store-seal-migration.ts — SLICE 179: seal the secrets that were
 * already sitting in `tenant_oauth_credentials.json` BEFORE slice 177 taught
 * the store to encrypt on write.
 *
 * WHY THIS EXISTS
 * ---------------
 * Slice 177 moved encryption to the data-store boundary, so every WRITE now
 * seals and a legacy plaintext value is upgraded "on the next write". That is
 * true for anything that is written again — but not everything is. A Slack
 * `xoxb-` bot token does not expire and is never refreshed, so that row can
 * keep its plaintext token on disk indefinitely. The store on this box held 13
 * real, working connections (Slack, HubSpot, DocuSign, OneDrive, the Google and
 * Microsoft document apps, Xero) with 25 plaintext secret fields and not one
 * sealed field. Waiting for a refresh was never going to fix it.
 *
 * WHAT IT DOES
 * ------------
 *   1. Refuses and changes nothing when `INTEGRATION_ENCRYPTION_KEY` is absent
 *      or shorter than 32 characters — the slice-177 fail-closed rule, naming
 *      the variable. Nothing is written, not even a backup.
 *   2. Reads the store file as it exists ON DISK (never through `readJSON`,
 *      which decrypts in memory and would hide plaintext from us).
 *   3. Copies the current bytes to a timestamped sibling file BEFORE touching
 *      anything (owner standing instruction: "I don't want any data loss").
 *   4. Writes the sealed document through `writeJSON` — the ONE existing
 *      boundary that seals (slice 177) and writes atomically (slice 144), and
 *      which also refreshes the durable-store mirror from the same sealed
 *      document. No new crypto path is introduced here.
 *   5. Re-reads the file from disk, opens it with the store, and proves every
 *      field it sealed decrypts back to the exact original plaintext string. If
 *      any row fails, the timestamped copy is restored byte-for-byte and the
 *      run fails loudly rather than leaving a half-migrated store.
 *
 * IDEMPOTENT
 * ----------
 * An already-sealed value is left byte-identical (never re-encrypted). A second
 * run therefore reports zero changed rows and zero sealed fields, and does not
 * write the store at all.
 *
 * NO SECRETS IN THE REPORT
 * ------------------------
 * The report carries provider names, field NAMES and counts. It never carries a
 * token value or a token prefix, so it is safe to paste into a chat or a log.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteSync } from "./atomic-write";
import {
  CREDENTIAL_SECRET_FIELDS,
  CREDENTIAL_STORE_BASENAME,
  credentialKeyProblem,
  isSealedSecret,
  openCredentialStore,
} from "./oauth-credential-store";
import { INTEGRATION_KEY_ENV } from "./integration-crypto";
import { writeJSON } from "./data-store";
import {
  durableEnabled,
  durableFlush,
  durableGetLive,
  durableKeyFor,
} from "./durable-store";

/** One row of the migration report. Contains NO secret material. */
export interface SealMigrationRow {
  /** `email:provider` with the local part masked, or the bare app-row key. */
  rowKeyMasked: string;
  provider: string;
  /** Secret field NAMES found plaintext on disk in this row. */
  fields: string[];
  /** Field NAMES this run sealed. */
  sealed: string[];
  /** Field NAMES that were already ciphertext (left untouched). */
  alreadySealed: string[];
  result: "sealed" | "unchanged" | "failed";
  error?: string;
}

export interface SealMigrationMirror {
  /** True when the durable store (Postgres) is enabled in this process. */
  enabled: boolean;
  /** Row keys present in the mirror but not in the file, carried forward. */
  rowsCarriedFromMirror: number;
  /** Plaintext secret fields still in the mirror AFTER the write; null = unknown. */
  plaintextSecretsAfter: number | null;
  /** Sealed fields in the mirror that decrypt back to the file's plaintext. */
  roundTripped: number;
  error?: string;
}

export interface SealMigrationReport {
  ok: boolean;
  dryRun: boolean;
  /** True when the run refused before touching anything. */
  refused: boolean;
  refusal?: string;
  storePath: string;
  storeExisted: boolean;
  backupPath: string | null;
  rows: SealMigrationRow[];
  plaintextFieldsBefore: number;
  alreadySealedFieldsBefore: number;
  plaintextFieldsAfter: number | null;
  sealedFieldsAfter: number | null;
  changedRows: number;
  /** Fields proven to decrypt back to their exact original plaintext. */
  verifiedFields: number;
  /** Ciphertext that predates this run and cannot be opened with this key. */
  unreadableSealedFields: number;
  mirror: SealMigrationMirror;
  errors: string[];
}

export interface SealMigrationOptions {
  /** Data directory holding `tenant_oauth_credentials.json`. */
  dataDir: string;
  /** Report what would change without writing anything. */
  dryRun?: boolean;
  /** Test seam: the clock used for the backup filename. */
  now?: () => Date;
}

type PlainObject = Record<string, any>;

const isPlainObject = (v: unknown): v is PlainObject =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Provider label for a row — `row.provider`, else the key after `email:`. */
export function providerOfRow(rowKey: string, row: PlainObject): string {
  const declared = row.provider;
  if (typeof declared === "string" && declared.length > 0) return declared;
  const idx = rowKey.indexOf(":");
  return idx >= 0 ? rowKey.slice(idx + 1) : rowKey;
}

/** `owner@example.com:slack` → `o***@example.com:slack`. Never a secret. */
export function maskRowKey(rowKey: string): string {
  const idx = rowKey.indexOf(":");
  if (idx <= 0) return rowKey;
  const account = rowKey.slice(0, idx);
  const at = account.indexOf("@");
  if (at <= 0) return account.slice(0, 1) + "***" + rowKey.slice(idx);
  return account.slice(0, 1) + "***" + account.slice(at) + rowKey.slice(idx);
}

/** Timestamp safe for a filename on every filesystem. */
function stampOf(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

interface Slot {
  rowKey: string;
  field: string;
  value: string;
}

/** Every secret field in `store`, with the row key that holds it. */
function secretSlots(store: unknown): Slot[] {
  const slots: Slot[] = [];
  if (!isPlainObject(store)) return slots;
  for (const [rowKey, row] of Object.entries(store)) {
    if (!isPlainObject(row)) continue;
    for (const field of CREDENTIAL_SECRET_FIELDS) {
      const value = row[field];
      if (typeof value === "string" && value.length > 0) {
        slots.push({ rowKey, field, value });
      }
    }
  }
  return slots;
}

const countPlaintext = (store: unknown): number =>
  secretSlots(store).filter((s) => !isSealedSecret(s.value)).length;

const countSealed = (store: unknown): number =>
  secretSlots(store).filter((s) => isSealedSecret(s.value)).length;

/** Read the store file EXACTLY as it is on disk (no decryption). */
function readStoreFile(storePath: string): { doc: PlainObject | null; error?: string } {
  if (!existsSync(storePath)) return { doc: null };
  const text = readFileSync(storePath, "utf-8");
  if (text.trim().length === 0) {
    // An empty file is not an empty store: readJSON would answer `{}` and we
    // would then overwrite whatever the operator expected to be there.
    return { doc: null, error: `${storePath} is empty — refusing to treat it as an empty store` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e: any) {
    return {
      doc: null,
      error: `${storePath} does not parse as JSON (${e?.message || String(e)}) — refusing to overwrite a store we cannot read`,
    };
  }
  if (!isPlainObject(parsed)) {
    return { doc: null, error: `${storePath} is not a JSON object — refusing to overwrite it` };
  }
  return { doc: parsed as PlainObject };
}

/** Build the per-row report from the on-disk document. */
function buildRows(doc: PlainObject): SealMigrationRow[] {
  const rows: SealMigrationRow[] = [];
  for (const [rowKey, row] of Object.entries(doc)) {
    if (!isPlainObject(row)) continue;
    const fields: string[] = [];
    const alreadySealed: string[] = [];
    for (const field of CREDENTIAL_SECRET_FIELDS) {
      const value = row[field];
      if (typeof value !== "string" || value.length === 0) continue;
      (isSealedSecret(value) ? alreadySealed : fields).push(field);
    }
    if (fields.length === 0 && alreadySealed.length === 0) continue;
    rows.push({
      rowKeyMasked: maskRowKey(rowKey),
      provider: providerOfRow(rowKey, row),
      fields,
      sealed: [],
      alreadySealed,
      result: fields.length > 0 ? "sealed" : "unchanged",
    });
  }
  return rows;
}

/**
 * Seal every plaintext secret in `<dataDir>/tenant_oauth_credentials.json`.
 *
 * Throws only on a programming error; every operational problem (no key,
 * unreadable store, failed verification) is reported in the returned report
 * with `ok:false` (or `refused:true`) and, where a write already happened, the
 * pre-run bytes are restored first.
 */
export async function sealPlaintextCredentials(
  opts: SealMigrationOptions,
): Promise<SealMigrationReport> {
  const dataDir = opts.dataDir;
  const storePath = join(dataDir, CREDENTIAL_STORE_BASENAME);
  const dryRun = opts.dryRun === true;
  const now = opts.now ?? (() => new Date());

  const report: SealMigrationReport = {
    ok: false,
    dryRun,
    refused: false,
    storePath,
    storeExisted: existsSync(storePath),
    backupPath: null,
    rows: [],
    plaintextFieldsBefore: 0,
    alreadySealedFieldsBefore: 0,
    plaintextFieldsAfter: null,
    sealedFieldsAfter: null,
    changedRows: 0,
    verifiedFields: 0,
    unreadableSealedFields: 0,
    mirror: { enabled: false, rowsCarriedFromMirror: 0, plaintextSecretsAfter: null, roundTripped: 0 },
    errors: [],
  };

  // ── 1. FAIL CLOSED on the key, before anything on disk is touched. ────────
  const keyProblem = credentialKeyProblem();
  if (keyProblem) {
    report.refused = true;
    report.refusal =
      `Refusing to seal ${CREDENTIAL_STORE_BASENAME}: ${keyProblem}. ` +
      `Set ${INTEGRATION_KEY_ENV} to a random value of at least 32 characters in the ` +
      `deployment secret store, then run this again. Nothing was changed.`;
    report.errors.push(report.refusal);
    return report;
  }

  // ── 2. Read the store exactly as it is on disk. ───────────────────────────
  if (!report.storeExisted) {
    report.ok = true; // nothing to migrate; nothing to lose
    return report;
  }
  const read = readStoreFile(storePath);
  if (!read.doc) {
    report.errors.push(read.error ?? `${storePath} could not be read`);
    return report;
  }
  const diskDoc = read.doc;
  report.rows = buildRows(diskDoc);
  report.plaintextFieldsBefore = countPlaintext(diskDoc);
  report.alreadySealedFieldsBefore = countSealed(diskDoc);

  // ── 3. The durable mirror is a second copy of the same document. ──────────
  // It is written by `writeJSON` from the same sealed bytes (so the migration
  // fixes it too), but a mirror that still holds plaintext is itself a reason
  // to write even when the file is already clean.
  report.mirror.enabled = durableEnabled();
  let mirrorDoc: PlainObject | null = null;
  if (report.mirror.enabled) {
    const live = await durableGetLive(durableKeyFor(storePath));
    if (isPlainObject(live)) mirrorDoc = live as PlainObject;
  }
  const mirrorPlaintextBefore = mirrorDoc ? countPlaintext(mirrorDoc) : 0;

  const needsWrite = report.plaintextFieldsBefore > 0 || mirrorPlaintextBefore > 0;
  if (!needsWrite) {
    // Idempotent no-op: no backup, no write, byte-identical file.
    report.ok = true;
    report.plaintextFieldsAfter = 0;
    report.sealedFieldsAfter = report.alreadySealedFieldsBefore;
    report.mirror.plaintextSecretsAfter = mirrorDoc ? 0 : null;
    return report;
  }

  if (dryRun) {
    for (const row of report.rows) if (row.fields.length > 0) row.result = "sealed";
    report.ok = true;
    report.changedRows = report.rows.filter((r) => r.fields.length > 0).length;
    report.mirror.plaintextSecretsAfter = mirrorDoc ? mirrorPlaintextBefore : null;
    return report;
  }

  // ── 4. Timestamped copy of the current bytes, BEFORE anything changes. ────
  const originalBytes = readFileSync(storePath);
  const backupPath = `${storePath}.pre-seal-${stampOf(now())}.bak`;
  try {
    atomicWriteSync(backupPath, originalBytes);
    const copied = readFileSync(backupPath);
    if (!copied.equals(originalBytes)) {
      report.errors.push(`backup at ${backupPath} does not match the original bytes — aborting before any change`);
      return report;
    }
    report.backupPath = backupPath;
  } catch (e: any) {
    report.errors.push(`could not write the safety copy at ${backupPath} (${e?.message || String(e)}) — aborting before any change`);
    return report;
  }

  const restore = (): boolean => {
    try {
      atomicWriteSync(storePath, originalBytes);
      return readFileSync(storePath).equals(originalBytes);
    } catch {
      return false;
    }
  };

  // ── 5. Write the sealed document through the ONE existing boundary. ───────
  // Rows that exist only in the durable mirror are carried forward, never
  // dropped: this run may not delete a row it merely did not know about.
  let rowsCarried = 0;
  const docToWrite: PlainObject = { ...diskDoc };
  if (mirrorDoc) {
    for (const [rowKey, row] of Object.entries(mirrorDoc)) {
      if (rowKey in docToWrite) continue;
      docToWrite[rowKey] = row;
      rowsCarried += 1;
    }
  }
  report.mirror.rowsCarriedFromMirror = rowsCarried;

  try {
    // writeJSON seals (slice 177) → mirrors to the durable store → atomic write.
    writeJSON(storePath, docToWrite);
  } catch (e: any) {
    const restored = restore();
    report.errors.push(
      `writing the sealed store failed (${e?.message || String(e)}); ` +
        (restored ? "the pre-run bytes were restored" : `RESTORE FAILED — the pre-run copy is at ${backupPath}`),
    );
    return report;
  }

  // ── 6. VERIFY from disk, not from memory. ─────────────────────────────────
  const after = readStoreFile(storePath);
  if (!after.doc) {
    const restored = restore();
    report.errors.push(
      `the sealed store could not be re-read (${after.error}); ` +
        (restored ? "the pre-run bytes were restored" : `RESTORE FAILED — the pre-run copy is at ${backupPath}`),
    );
    return report;
  }
  const sealedDoc = after.doc;
  report.plaintextFieldsAfter = countPlaintext(sealedDoc);
  report.sealedFieldsAfter = countSealed(sealedDoc);

  const failures: string[] = [];

  // (a) nothing may remain in the clear
  if (report.plaintextFieldsAfter !== 0) {
    failures.push(`${report.plaintextFieldsAfter} secret field(s) are still plaintext after the write`);
  }

  // (b) every field we sealed must decrypt back to its EXACT original value,
  //     and an already-sealed field must be byte-identical to what was there.
  let verified = 0;
  const opened = openCredentialStore(sealedDoc);
  for (const [rowKey, row] of Object.entries(diskDoc)) {
    if (!isPlainObject(row)) continue;
    const openedRow = isPlainObject((opened as PlainObject)[rowKey])
      ? ((opened as PlainObject)[rowKey] as PlainObject)
      : {};
    for (const field of CREDENTIAL_SECRET_FIELDS) {
      const original = row[field];
      if (typeof original !== "string" || original.length === 0) continue;
      const onDisk = isPlainObject(sealedDoc[rowKey]) ? sealedDoc[rowKey][field] : undefined;
      if (isSealedSecret(original)) {
        // Already ciphertext before this run: it must not have been re-encrypted.
        if (onDisk !== original) {
          failures.push(`${maskRowKey(rowKey)}.${field} was re-encrypted (an already-sealed value must be left alone)`);
        }
        continue;
      }
      if (typeof onDisk !== "string" || !isSealedSecret(onDisk)) {
        failures.push(`${maskRowKey(rowKey)}.${field} is not ciphertext after the write`);
        continue;
      }
      if (openedRow[field] !== original) {
        failures.push(`${maskRowKey(rowKey)}.${field} does not decrypt back to its original value`);
        continue;
      }
      verified += 1;
    }
    // (c) every NON-secret field must be untouched.
    for (const [field, value] of Object.entries(row)) {
      if ((CREDENTIAL_SECRET_FIELDS as readonly string[]).includes(field)) continue;
      const afterValue = isPlainObject(sealedDoc[rowKey]) ? sealedDoc[rowKey][field] : undefined;
      if (JSON.stringify(afterValue) !== JSON.stringify(value)) {
        failures.push(`${maskRowKey(rowKey)}.${field} changed during the migration`);
      }
    }
  }
  report.verifiedFields = verified;

  // Pre-existing ciphertext this key cannot open is a separate, pre-existing
  // condition — reported, never counted as a success of this run.
  const sealedBefore = secretSlots(diskDoc).filter((s) => isSealedSecret(s.value)).length;
  if (sealedBefore > 0) {
    try {
      openCredentialStore(sealedDoc, { strict: true });
    } catch {
      report.unreadableSealedFields = sealedBefore;
    }
  }

  if (failures.length > 0) {
    const restored = restore();
    report.errors.push(...failures);
    report.errors.push(
      restored
        ? "verification failed — the pre-run bytes were restored"
        : `verification failed AND the restore failed — the pre-run copy is at ${backupPath}`,
    );
    for (const row of report.rows) if (row.fields.length > 0) row.result = "failed";
    return report;
  }

  for (const row of report.rows) {
    if (row.fields.length === 0) continue;
    row.sealed = [...row.fields];
    report.changedRows += 1;
  }

  // ── 7. The mirror must be sealed too. ────────────────────────────────────
  if (report.mirror.enabled) {
    try {
      await durableFlush();
      const mirrorAfter = await durableGetLive(durableKeyFor(storePath));
      if (!isPlainObject(mirrorAfter)) {
        report.mirror.error = "the durable mirror returned no document after the write";
      } else {
        report.mirror.plaintextSecretsAfter = countPlaintext(mirrorAfter);
        const mirrorOpened = openCredentialStore(mirrorAfter) as PlainObject;
        let roundTripped = 0;
        for (const [rowKey, row] of Object.entries(diskDoc)) {
          if (!isPlainObject(row)) continue;
          const openedRow = isPlainObject(mirrorOpened[rowKey]) ? (mirrorOpened[rowKey] as PlainObject) : {};
          for (const field of CREDENTIAL_SECRET_FIELDS) {
            const original = row[field];
            if (typeof original !== "string" || original.length === 0) continue;
            if (isSealedSecret(original)) continue;
            if (openedRow[field] === original) roundTripped += 1;
          }
        }
        report.mirror.roundTripped = roundTripped;
        if (report.mirror.plaintextSecretsAfter !== 0) {
          report.mirror.error = `${report.mirror.plaintextSecretsAfter} plaintext secret field(s) remain in the durable mirror`;
        }
      }
    } catch (e: any) {
      report.mirror.error = `mirror verification failed: ${e?.message || String(e)}`;
    }
    // The mirror is a copy, not the source of truth: a mirror problem is
    // reported loudly but never triggers a restore of a correctly sealed file.
    if (report.mirror.error) report.errors.push(report.mirror.error);
  } else {
    // Durable store disabled (no DATABASE_URL): the file is the only copy.
    report.mirror.plaintextSecretsAfter = null;
    report.mirror.error = "durable store disabled in this process — the file is the only copy that exists here";
  }

  report.ok = failures.length === 0;
  return report;
}
