/**
 * backup-crypto.ts — SLICE 143 (encryption), SLICE 147 (AUTHENTICATED encryption).
 *
 * WHY THE FORMAT CHANGED (slice 147): the first version encrypted with
 * `openssl enc -aes-256-cbc`. CBC gives confidentiality and NOTHING ELSE. A
 * flipped ciphertext byte decrypts to different plaintext with no error, and the
 * per-file sha256 manifest that lives INSIDE the archive is no defence at all —
 * an attacker who rewrites the archive can rewrite the manifest with it. The
 * upload was therefore tamper-EVIDENT only by accident (gzip/tar checksums),
 * never tamper-PROOF.
 *
 * THE FORMAT NOW: AES-256-GCM (node:crypto, no new dependency), a random 12-byte
 * IV per archive, a 16-byte auth tag, and a self-describing versioned header.
 * Decryption verifies the tag BEFORE any plaintext is written anywhere: a wrong
 * passphrase and a tampered archive fail the same way — loudly, with nothing
 * extracted.
 *
 * ── CONTAINER (all integers big-endian) ─────────────────────────────────────
 *   off  len  field
 *     0    8  magic "SLBKP001"            ← format marker, never guessed
 *     8    1  container format  (2 = aes-256-gcm)
 *     9    1  kdf id            (1 = pbkdf2-hmac-sha256)
 *    10    4  kdf iterations    (uint32)
 *    14    1  salt length
 *    15    n  salt
 *  15+n    1  iv length
 *  16+n    m  iv
 *  16+n+m  1  tag length
 *  17+n+m  k  tag
 *  …      -   ciphertext
 * The authenticated data (AAD) is the header through the tag-length byte, so the
 * KDF parameters, the salt and the IV are all bound to the ciphertext: changing
 * any of them breaks the tag rather than silently changing the key.
 *
 * ── BACKWARD COMPATIBILITY (mandatory) ─────────────────────────────────────
 * The owner's R2 prefix already holds an `openssl enc` CBC object
 * (`simplerlife100/backups/2026-10-30T22-00-12Z.tar.gz.enc`, 35,152 bytes) and
 * that object is, at the time of writing, the only off-box copy of live data.
 * `detectArchiveFormat()` therefore branches on a MARKER, never on a guess:
 *   - the 8-byte GCM magic   → "gcm"
 *   - openssl's "Salted__"   → "cbc-legacy"
 *   - anything else          → REFUSED (we do not try to decrypt what we cannot
 *                              identify; a guess here is how a restore silently
 *                              produces garbage).
 *
 * The manifest digest verification inside the archive is KEPT and still runs
 * after decryption: the tag proves the bytes are the bytes we wrote, the digests
 * prove the archive describes the data it claims to. Two layers, not one.
 */
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteSync } from "../../src/lib/atomic-write";
import { verifyManifestFiles, type Manifest } from "./backup-core";

/** The exact openssl invocation used for LEGACY archives. Passphrase by env, never argv. */
export const OPENSSL_ENC_ARGS = ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-pass", "env:BACKUP_PASSPHRASE"];
export const OPENSSL_DEC_ARGS = ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-pass", "env:BACKUP_PASSPHRASE"];

// ── The container ───────────────────────────────────────────────────────────

export const ARCHIVE_MAGIC = Buffer.from("SLBKP001", "ascii");
export const CONTAINER_FORMAT_GCM = 2;
export const KDF_PBKDF2_SHA256 = 1;
export const SALT_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
/**
 * PBKDF2-HMAC-SHA256 rounds for NEW archives. openssl's `-pbkdf2` default (what
 * the legacy CBC format uses) is 10,000; this is strictly stronger, and the
 * count is written into the header so a future increase stays readable.
 */
export const KDF_ITERATIONS = 210_000;
/** Refuse absurd objects before allocating: an archive bigger than this is a bug, not a backup. */
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

/** openssl's own marker on every `enc` output — the legacy format's signature. */
const OPENSSL_SALTED_MAGIC = Buffer.from("Salted__", "ascii");

export type ArchiveFormat = "gcm" | "cbc-legacy";

/**
 * A failed decryption we can explain: wrong passphrase, tampered ciphertext, or
 * an object we cannot identify. Distinct from a programming error so callers can
 * report "this object is not restorable" instead of crashing.
 */
export class ArchiveAuthError extends Error {
  constructor(
    message: string,
    public readonly format: ArchiveFormat | "unknown",
  ) {
    super(message);
    this.name = "ArchiveAuthError";
  }
}

export interface ArchiveHeader {
  format: typeof CONTAINER_FORMAT_GCM;
  kdf: number;
  iterations: number;
  salt: Buffer;
  iv: Buffer;
  tag: Buffer;
  /** First byte of the ciphertext. */
  ciphertextOffset: number;
  /** Bytes covered by the GCM auth tag (magic … tag-length byte). */
  aad: Buffer;
}

/** Identify an archive from its marker bytes. Never guesses. */
export function detectArchiveFormat(buf: Buffer): ArchiveFormat {
  if (buf.length >= ARCHIVE_MAGIC.length && buf.subarray(0, ARCHIVE_MAGIC.length).equals(ARCHIVE_MAGIC)) {
    return "gcm";
  }
  if (buf.length >= OPENSSL_SALTED_MAGIC.length && buf.subarray(0, OPENSSL_SALTED_MAGIC.length).equals(OPENSSL_SALTED_MAGIC)) {
    return "cbc-legacy";
  }
  const head = buf.subarray(0, 8).toString("hex");
  throw new ArchiveAuthError(
    `unrecognised archive container (first bytes ${head || "<empty>"}) — refusing to guess a format and decrypt it`,
    "unknown",
  );
}

/** Parse and validate a GCM container header. Throws on anything malformed. */
export function parseArchiveHeader(buf: Buffer): ArchiveHeader {
  if (buf.length < 61) throw new ArchiveAuthError(`archive is only ${buf.length} bytes — too short to hold a header`, "gcm");
  const format = buf.readUInt8(8);
  if (format !== CONTAINER_FORMAT_GCM) {
    throw new ArchiveAuthError(`unsupported container format ${format} — this build only reads format ${CONTAINER_FORMAT_GCM}`, "gcm");
  }
  const kdf = buf.readUInt8(9);
  if (kdf !== KDF_PBKDF2_SHA256) throw new ArchiveAuthError(`unsupported key derivation ${kdf}`, "gcm");
  const iterations = buf.readUInt32BE(10);
  if (iterations < 1000) throw new ArchiveAuthError(`refusing an implausibly weak kdf iteration count (${iterations})`, "gcm");
  let at = 14;
  const saltLen = buf.readUInt8(at);
  at += 1;
  if (saltLen < 16 || buf.length < at + saltLen) throw new ArchiveAuthError("archive salt is missing or too short", "gcm");
  const salt = buf.subarray(at, at + saltLen);
  at += saltLen;
  const ivLen = buf.readUInt8(at);
  at += 1;
  if (ivLen !== IV_BYTES || buf.length < at + ivLen) throw new ArchiveAuthError(`archive IV must be ${IV_BYTES} bytes`, "gcm");
  const iv = buf.subarray(at, at + ivLen);
  at += ivLen;
  const tagLen = buf.readUInt8(at);
  at += 1;
  const aad = buf.subarray(0, at); // through the tag-length byte
  if (tagLen !== TAG_BYTES || buf.length < at + tagLen) throw new ArchiveAuthError(`archive auth tag must be ${TAG_BYTES} bytes`, "gcm");
  const tag = buf.subarray(at, at + tagLen);
  at += tagLen;
  if (at >= buf.length) throw new ArchiveAuthError("archive has a header but no ciphertext", "gcm");
  return { format: CONTAINER_FORMAT_GCM, kdf, iterations, salt, iv, tag, ciphertextOffset: at, aad };
}

/** PBKDF2-HMAC-SHA256 — the same derivation family the CBC format uses. */
export function deriveKey(passphrase: string, salt: Buffer, iterations: number = KDF_ITERATIONS): Buffer {
  if (!passphrase) throw new Error("refusing to derive a key from an empty passphrase");
  return pbkdf2Sync(Buffer.from(passphrase, "utf8"), salt, iterations, 32, "sha256");
}

/** Wrap `plaintext` in the versioned GCM container. */
export function encryptBufferGcm(
  plaintext: Buffer,
  passphrase: string,
  opts: { iterations?: number; iv?: Buffer; salt?: Buffer } = {},
): Buffer {
  if (!passphrase) throw new Error("refusing to encrypt without a passphrase");
  const iterations = opts.iterations ?? KDF_ITERATIONS;
  const salt = opts.salt ?? randomBytes(SALT_BYTES);
  const iv = opts.iv ?? randomBytes(IV_BYTES);
  if (salt.length !== SALT_BYTES) throw new Error(`salt must be ${SALT_BYTES} bytes`);
  if (iv.length !== IV_BYTES) throw new Error(`iv must be ${IV_BYTES} bytes`);
  const header = Buffer.alloc(14 + 1 + SALT_BYTES + 1 + IV_BYTES + 1);
  ARCHIVE_MAGIC.copy(header, 0);
  header.writeUInt8(CONTAINER_FORMAT_GCM, 8);
  header.writeUInt8(KDF_PBKDF2_SHA256, 9);
  header.writeUInt32BE(iterations, 10);
  header.writeUInt8(SALT_BYTES, 14);
  salt.copy(header, 15);
  header.writeUInt8(IV_BYTES, 15 + SALT_BYTES);
  iv.copy(header, 16 + SALT_BYTES);
  header.writeUInt8(TAG_BYTES, 16 + SALT_BYTES + IV_BYTES);
  const key = deriveKey(passphrase, salt, iterations);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([header, tag, body]);
}

/**
 * Open a GCM container. Throws ArchiveAuthError when the tag does not verify —
 * which is what a wrong passphrase and a tampered archive BOTH look like, and
 * which is exactly why nothing is returned for either.
 */
export function decryptBufferGcm(container: Buffer, passphrase: string): Buffer {
  if (!passphrase) throw new ArchiveAuthError("no passphrase — cannot open an encrypted archive", "gcm");
  const header = parseArchiveHeader(container);
  const key = deriveKey(passphrase, header.salt, header.iterations);
  const ciphertext = container.subarray(header.ciphertextOffset);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, header.iv);
    decipher.setAAD(header.aad);
    decipher.setAuthTag(header.tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain;
  } catch {
    // Never surface the underlying error text: it is not a fact we can verify
    // (a tag failure cannot distinguish a wrong key from a modified byte).
    throw new ArchiveAuthError(
      "archive failed authentication — wrong passphrase or tampered ciphertext; nothing was extracted",
      "gcm",
    );
  }
}

// ── The pipeline hooks (unchanged shape: runBackup's `encrypt` option) ──────

function opensslEnv(passphrase: string): NodeJS.ProcessEnv {
  return { ...process.env, BACKUP_PASSPHRASE: passphrase };
}

/**
 * Encrypt the staged run dir into `<runId>.tar.gz.enc` (GCM container), then
 * decrypt it, extract it and re-verify every digest before the plaintext staging
 * tree is removed. Throws (so the run fails) if the round-trip does not verify.
 */
export function encryptRunDir(runDir: string, manifest: Manifest, passphrase: string, log: (m: string) => void = () => {}): string {
  if (!passphrase) throw new Error("refusing to encrypt without a passphrase");
  const archiveName = manifest.archive || `${manifest.runId}.tar.gz.enc`;
  const archivePath = join(runDir, archiveName);
  const stage = join(runDir, "data");
  const tar = execFileSync("tar", ["-czf", "-", "-C", runDir, "data", "manifest.json"], {
    maxBuffer: MAX_ARCHIVE_BYTES,
  });
  const enc = encryptBufferGcm(tar, passphrase);
  atomicWriteSync(archivePath, enc);
  chmodSync(archivePath, 0o600);
  const tmp = join(runDir, ".verify");
  mkdirSync(tmp, { recursive: true, mode: 0o700 });
  try {
    const plain = decryptBufferGcm(enc, passphrase);
    const tarPath = join(tmp, "payload.tar.gz");
    writeFileSync(tarPath, plain);
    execFileSync("tar", ["-xzf", tarPath, "-C", tmp]);
    const v = verifyManifestFiles(join(tmp, "data"), manifest);
    if (!v.ok) {
      throw new Error(
        `encrypted round-trip verification failed: ${JSON.stringify([...v.mismatches, ...v.missing]).slice(0, 400)}`,
      );
    }
    log(`encrypted round-trip verified (aes-256-gcm, ${KDF_ITERATIONS} kdf rounds): ${v.checked} files, ${v.bytes} bytes`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(stage, { recursive: true, force: true });
  }
  log(`archive ${archiveName} (${enc.length} bytes, aes-256-gcm)`);
  return archiveName;
}

/** `runBackup({ encrypt })` hook, or undefined when there is no passphrase. */
export function makeEncryptHook(
  passphrase: string | undefined | null,
  log?: (m: string) => void,
): ((runDir: string, manifest: Manifest) => void) | undefined {
  const pass = (passphrase || "").trim();
  if (!pass) return undefined;
  return (runDir, manifest) => {
    encryptRunDir(runDir, manifest, pass, log);
  };
}

/**
 * Decrypt one archive file and extract it into `outDir`. Returns the directory
 * holding `data/` and `manifest.json` (which is `outDir` itself, matching the
 * tar layout).
 *
 * Format is detected from the container marker, never guessed: a GCM archive is
 * verified by its auth tag and only then written; a legacy CBC archive goes
 * through openssl exactly as before. Either way a wrong passphrase or a corrupt
 * object throws — the caller must treat that as "this object is not restorable".
 */
export function decryptArchiveToDir(opts: {
  archivePath: string;
  outDir: string;
  passphrase: string;
  log?: (m: string) => void;
}): string {
  const log = opts.log ?? (() => {});
  if (!opts.passphrase) throw new ArchiveAuthError("no passphrase — cannot decrypt an encrypted archive", "unknown");
  mkdirSync(opts.outDir, { recursive: true, mode: 0o700 });
  const container = readArchiveBytes(opts.archivePath);
  const format = detectArchiveFormat(container);
  log(`archive container: ${format} (${container.length} bytes)`);

  let plain: Buffer;
  if (format === "gcm") {
    // Verified before a single byte reaches the filesystem.
    plain = decryptBufferGcm(container, opts.passphrase);
  } else {
    plain = decryptLegacyCbc(container, opts.passphrase);
  }

  const tarPath = join(opts.outDir, "payload.tar.gz");
  writeFileSync(tarPath, plain);
  try {
    execFileSync("tar", ["-xzf", tarPath, "-C", opts.outDir], { maxBuffer: MAX_ARCHIVE_BYTES });
  } finally {
    rmSync(tarPath, { force: true });
  }
  log(`decrypted ${opts.archivePath} (${plain.length} bytes after decryption, ${format})`);
  return opts.outDir;
}

/** Read the object we were handed, refusing anything implausibly large. */
function readArchiveBytes(archivePath: string): Buffer {
  const buf = readFileSync(archivePath);
  if (buf.length > MAX_ARCHIVE_BYTES) {
    throw new ArchiveAuthError(`archive is ${buf.length} bytes, above the ${MAX_ARCHIVE_BYTES} byte limit — refusing`, "unknown");
  }
  return buf;
}

/**
 * The LEGACY path, kept exactly as it was (same openssl invocation, same
 * arguments) so the CBC object already in the bucket stays restorable. A failure
 * is reported as an auth failure, because that is what it is.
 */
function decryptLegacyCbc(container: Buffer, passphrase: string): Buffer {
  try {
    const dec = execFileSync("openssl", OPENSSL_DEC_ARGS, {
      input: container,
      maxBuffer: MAX_ARCHIVE_BYTES,
      env: opensslEnv(passphrase),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return dec;
  } catch {
    throw new ArchiveAuthError(
      "legacy CBC archive failed to decrypt — wrong passphrase or corrupt object; nothing was extracted",
      "cbc-legacy",
    );
  }
}

/** Constant-time compare, for callers that need to check a digest without leaking. */
export function bytesEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
