/**
 * backup-crypto.ts — SLICE 145. ONE implementation of "encrypt the archive and
 * prove it can be opened", shared by the CLI and the server.
 *
 * Before this slice the encryption lived inside `scripts/backup.mjs`, so the
 * in-server scheduler (prod-server.ts → runBackup) wrote PLAINTEXT archives
 * containing OAuth tokens and customer documents. An off-box upload of that
 * would put client data on a third party's disk in the clear. Moving the hook
 * here is what lets both entry points produce the same encrypted object.
 *
 * WHAT IT GUARANTEES: after `encryptRunDir()` returns, the run directory holds
 * exactly one archive file, it is `openssl enc -aes-256-cbc -pbkdf2` ciphertext,
 * and it has been decrypted, extracted and digest-verified once already. An
 * archive nobody has opened is not a backup.
 *
 * WHAT IT DOES NOT GUARANTEE: `openssl enc` without `-md sha256`/an HMAC is not
 * authenticated encryption. A tampered ciphertext is detected by the tar/gzip
 * layer and by the manifest digests, not by a MAC. That is why the uploaded
 * object is only ever produced by this function and never accepted from
 * elsewhere.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteSync } from "../../src/lib/atomic-write";
import { verifyManifestFiles, type Manifest } from "./backup-core";

/** The exact openssl invocation. Passphrase is passed by env, never argv. */
export const OPENSSL_ENC_ARGS = ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-pass", "env:BACKUP_PASSPHRASE"];
export const OPENSSL_DEC_ARGS = ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-pass", "env:BACKUP_PASSPHRASE"];

function opensslEnv(passphrase: string): NodeJS.ProcessEnv {
  return { ...process.env, BACKUP_PASSPHRASE: passphrase };
}

/**
 * Encrypt the staged run dir into `<runId>.tar.gz.enc`, then decrypt it, extract
 * it and re-verify every digest before the plaintext staging tree is removed.
 * Throws (so the run fails) if the round-trip does not verify.
 */
export function encryptRunDir(runDir: string, manifest: Manifest, passphrase: string, log: (m: string) => void = () => {}): string {
  if (!passphrase) throw new Error("refusing to encrypt without a passphrase");
  const archiveName = manifest.archive || `${manifest.runId}.tar.gz.enc`;
  const archivePath = join(runDir, archiveName);
  const stage = join(runDir, "data");
  const tar = execFileSync("tar", ["-czf", "-", "-C", runDir, "data", "manifest.json"], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  const enc = execFileSync("openssl", OPENSSL_ENC_ARGS, {
    input: tar,
    maxBuffer: 1024 * 1024 * 1024,
    env: opensslEnv(passphrase),
  });
  atomicWriteSync(archivePath, enc);
  chmodSync(archivePath, 0o600);
  const tmp = join(runDir, ".verify");
  mkdirSync(tmp, { recursive: true, mode: 0o700 });
  try {
    const dec = execFileSync("openssl", [...OPENSSL_DEC_ARGS, "-in", archivePath], {
      maxBuffer: 1024 * 1024 * 1024,
      env: opensslEnv(passphrase),
    });
    const tarPath = join(tmp, "payload.tar.gz");
    writeFileSync(tarPath, dec);
    execFileSync("tar", ["-xzf", tarPath, "-C", tmp]);
    const v = verifyManifestFiles(join(tmp, "data"), manifest);
    if (!v.ok) {
      throw new Error(
        `encrypted round-trip verification failed: ${JSON.stringify([...v.mismatches, ...v.missing]).slice(0, 400)}`,
      );
    }
    log(`encrypted round-trip verified: ${v.checked} files, ${v.bytes} bytes`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(stage, { recursive: true, force: true });
  }
  log(`archive ${archiveName}`);
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
 * tar layout). Throws on a wrong passphrase or a corrupt object — the caller
 * must treat that as "this object is not restorable".
 */
export function decryptArchiveToDir(opts: {
  archivePath: string;
  outDir: string;
  passphrase: string;
  log?: (m: string) => void;
}): string {
  const log = opts.log ?? (() => {});
  if (!opts.passphrase) throw new Error("no passphrase — cannot decrypt an encrypted archive");
  mkdirSync(opts.outDir, { recursive: true, mode: 0o700 });
  const dec = execFileSync("openssl", [...OPENSSL_DEC_ARGS, "-in", opts.archivePath], {
    maxBuffer: 1024 * 1024 * 1024,
    env: opensslEnv(opts.passphrase),
  });
  const tarPath = join(opts.outDir, "payload.tar.gz");
  writeFileSync(tarPath, dec);
  execFileSync("tar", ["-xzf", tarPath, "-C", opts.outDir]);
  rmSync(tarPath, { force: true });
  log(`decrypted ${opts.archivePath} (${dec.length} bytes after decryption)`);
  return opts.outDir;
}
