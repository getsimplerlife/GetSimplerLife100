/**
 * backup-hardening-147.test.ts — SLICE 147.
 *
 * Three gaps that slices 143–146 left open, each pinned here so it cannot
 * silently reopen:
 *
 *   1. AUTHENTICATED ENCRYPTION. The archive used AES-256-CBC with no MAC:
 *      confidentiality without integrity, and the manifest digests inside the
 *      archive were no defence because an attacker who rewrites the archive can
 *      rewrite the manifest. Now AES-256-GCM with a versioned container, and a
 *      legacy CBC object in the owner's bucket must still restore.
 *   2. PER-INSTANCE NAMESPACES. Two deployments shared one prefix and pruned each
 *      other's only off-box copy. Retention may now never delete an object it
 *      cannot attribute to its own instance.
 *   3. A STOPPED BACKUP MUST BE LOUD. Staleness computed from the last run that
 *      actually SUCCEEDED; a deployment that never succeeded is never "healthy".
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  BACKUP_STATUS_FILE,
  failedStatus,
  runBackup,
  statusFor,
  writeBackupStatus,
  type Manifest,
} from "../../scripts/lib/backup-core";
import {
  ARCHIVE_MAGIC,
  ArchiveAuthError,
  OPENSSL_ENC_ARGS,
  decryptArchiveToDir,
  decryptBufferGcm,
  detectArchiveFormat,
  encryptBufferGcm,
  makeEncryptHook,
} from "../../scripts/lib/backup-crypto";
import { uploadVerifiedRun } from "../../scripts/lib/r2-backup";
import { materialiseRunDir, selectRemoteObject, verifyExtractedRun } from "../../scripts/lib/r2-restore";
import {
  backupEventLine,
  backupFreshness,
  readBackupFreshness,
  readBackupStatus,
  staleEventLine,
  type BackupStatusSummary,
} from "../lib/backup-status";
import {
  DEFAULT_R2_PREFIX,
  INSTANCE_MARKER,
  ensureInstanceId,
  instanceOfKey,
  planRemoteRetention,
  resolveUploadPrefix,
  runIdFromObjectKey,
  type R2Fetch,
  type R2FetchResponse,
} from "../lib/r2-upload";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

const PASSPHRASE = "slice-147-passphrase";
const OTHER_PASSPHRASE = "not-the-passphrase";
const PLAINTEXT_MARKER = "PLAINTEXT-MARKER-147";
const ENV = {
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "b".repeat(32),
  R2_SECRET_ACCESS_KEY: "c".repeat(64),
  R2_BUCKET: "test-bucket",
};

function mkTmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function makeDataDir(extra: Record<string, string> = {}): string {
  const dir = mkTmp("h147-data-");
  const files: Record<string, string> = {
    "users.json": JSON.stringify({ "owner@example.com": { role: "owner", note: PLAINTEXT_MARKER } }),
    "tenant_approvals.json": JSON.stringify({ a1: { status: "pending" } }),
    ...extra,
  };
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return dir;
}

function makeRun(opts: { at?: string; encrypt?: boolean } = {}) {
  const dataDir = makeDataDir();
  const outDir = mkTmp("h147-out-");
  const run = runBackup({
    dataDir,
    outDir,
    noPrune: true,
    now: new Date(opts.at ?? "2026-10-30T23:10:00Z"),
    encrypt: opts.encrypt === false ? undefined : makeEncryptHook(PASSPHRASE),
  });
  return { dataDir, outDir, run };
}

function response(init: { ok?: boolean; status?: number; body?: string; bytes?: Uint8Array; headers?: Record<string, string> }): R2FetchResponse {
  const headers = init.headers || {};
  const bytes = init.bytes ?? Buffer.from(init.body ?? "", "utf8");
  return {
    ok: init.ok !== false,
    status: init.status ?? 200,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => Buffer.from(bytes).toString("utf8"),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}

/** A fake bucket that remembers what exists, so pruning is observable. */
function fakeBucket(opts: { putFails?: boolean; putErrorBody?: string } = {}) {
  const objects = new Map<string, number>();
  const deletes: string[] = [];
  const lists: string[] = [];
  const puts: Array<{ key: string; body: Uint8Array }> = [];
  const fetchImpl: R2Fetch = async (url, init) => {
    const key = decodeURIComponent(new URL(url).pathname.split("/").slice(2).join("/"));
    if (init.method === "PUT") {
      if (opts.putFails) return response({ ok: false, status: 403, body: opts.putErrorBody ?? "AccessDenied" });
      objects.set(key, init.body?.length ?? 0);
      puts.push({ key, body: init.body as Uint8Array });
      return response({ headers: { etag: '"etag-147"' } });
    }
    if (init.method === "GET") {
      const prefix = new URL(url).searchParams.get("prefix") || "";
      lists.push(prefix);
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>` +
        [...objects.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(
            ([k, size]) =>
              `<Contents><Key>${k}</Key><Size>${size}</Size><ETag>&quot;e-${k.length}&quot;</ETag>` +
              `<LastModified>2026-10-30T00:00:00.000Z</LastModified></Contents>`,
          )
          .join("") +
        `<IsTruncated>false</IsTruncated></ListBucketResult>`;
      return response({ body: xml });
    }
    if (init.method === "DELETE") {
      deletes.push(key);
      objects.delete(key);
      return response({ status: 204 });
    }
    return response({ ok: false, status: 400, body: "unexpected" });
  };
  return { fetchImpl, objects, deletes, lists, puts };
}

// ── 1. Authenticated encryption ─────────────────────────────────────────────

describe("slice 147 — authenticated encryption (AES-256-GCM)", () => {
  it("wraps the archive in a versioned container and round-trips it", () => {
    const plain = Buffer.from("the quick brown fox — ".repeat(200), "utf8");
    const container = encryptBufferGcm(plain, PASSPHRASE);

    // A versioned marker, not a guess: the first 8 bytes are the format.
    expect(container.subarray(0, 8).equals(ARCHIVE_MAGIC)).toBe(true);
    expect(detectArchiveFormat(container)).toBe("gcm");
    // 12-byte IV, 16-byte tag, and the ciphertext is not the plaintext.
    expect(container.readUInt8(14)).toBe(32); // salt length
    expect(container.length).toBeGreaterThan(plain.length);
    expect(container.includes(Buffer.from("quick brown fox"))).toBe(false);

    expect(decryptBufferGcm(container, PASSPHRASE).equals(plain)).toBe(true);
  });

  it("uses a fresh random IV, so the same plaintext never produces the same archive", () => {
    const plain = Buffer.from("same bytes every time", "utf8");
    const a = encryptBufferGcm(plain, PASSPHRASE);
    const b = encryptBufferGcm(plain, PASSPHRASE);
    expect(a.equals(b)).toBe(false);
    // Different IVs AND different salts — both are random per archive.
    const ivA = a.subarray(48, 60);
    const ivB = b.subarray(48, 60);
    expect(ivA.equals(ivB)).toBe(false);
  });

  it("FAILS CLOSED on a wrong passphrase — and extracts nothing", () => {
    const { run } = makeRun();
    const archive = join(run.target, run.manifest.archive!);
    const out = mkTmp("h147-badpass-");
    expect(() => decryptArchiveToDir({ archivePath: archive, outDir: out, passphrase: OTHER_PASSPHRASE })).toThrow(
      ArchiveAuthError,
    );
    // No partial restore: not a single file, not even the tar.
    expect(existsSync(join(out, "data"))).toBe(false);
    expect(existsSync(join(out, "manifest.json"))).toBe(false);
  });

  it("FAILS CLOSED on a tampered ciphertext byte — and extracts nothing", () => {
    const { run } = makeRun();
    const archive = join(run.target, run.manifest.archive!);
    const buf = readFileSync(archive);
    // Flip a byte in the middle of the ciphertext (past the 77-byte header).
    const at = Math.floor(buf.length * 0.75);
    buf[at] = buf[at] ^ 0x01;
    const tampered = join(mkTmp("h147-tamper-"), "tampered.tar.gz.enc");
    writeFileSync(tampered, buf);

    const out = mkTmp("h147-tamper-out-");
    expect(() => decryptArchiveToDir({ archivePath: tampered, outDir: out, passphrase: PASSPHRASE })).toThrow(
      /failed authentication/,
    );
    expect(existsSync(join(out, "data"))).toBe(false);
  });

  it("FAILS CLOSED when the header (IV) is altered — the params are authenticated too", () => {
    const container = encryptBufferGcm(Buffer.from("header-bound payload"), PASSPHRASE);
    const tampered = Buffer.from(container);
    tampered[48] = tampered[48] ^ 0xff; // first IV byte
    expect(() => decryptBufferGcm(tampered, PASSPHRASE)).toThrow(ArchiveAuthError);
  });

  it("refuses an archive it cannot identify instead of guessing a format", () => {
    const junk = Buffer.from("this is not an archive at all, just bytes", "utf8");
    expect(() => detectArchiveFormat(junk)).toThrow(/unrecognised archive container/);
    const file = join(mkTmp("h147-junk-"), "junk.enc");
    writeFileSync(file, junk);
    expect(() => decryptArchiveToDir({ archivePath: file, outDir: mkTmp("h147-junk-out-"), passphrase: PASSPHRASE })).toThrow(
      ArchiveAuthError,
    );
  });

  it("records the real cipher in the manifest and verifies the manifest digests after decryption", () => {
    const { run } = makeRun();
    expect(run.manifest.encryption).toBe("aes-256-gcm");
    const out = mkTmp("h147-roundtrip-");
    decryptArchiveToDir({
      archivePath: join(run.target, run.manifest.archive!),
      outDir: out,
      passphrase: PASSPHRASE,
    });
    // Layer two: the digests inside the archive still describe the data.
    const verified = verifyExtractedRun({ stageDir: out, requestedRunId: run.runId });
    expect(verified.checked).toBe(run.manifest.files.length);
    expect(verified.bytes).toBe(run.manifest.totals.bytes);
    expect(readFileSync(join(out, "data", "users.json"), "utf8")).toContain(PLAINTEXT_MARKER);
  });

  it("STILL RESTORES a legacy openssl CBC archive (the object already in the bucket)", () => {
    // Build exactly what slice 143–145 produced: tar of data/ + manifest.json,
    // then `openssl enc -aes-256-cbc -pbkdf2 -salt`.
    const dataDir = makeDataDir();
    const runId = "2026-10-30T22-00-12Z";
    const stage = mkTmp("h147-cbc-stage-");
    const files = ["users.json", "tenant_approvals.json"].map((rel) => {
      const body = readFileSync(join(dataDir, rel));
      mkdirSync(join(stage, "data"), { recursive: true });
      writeFileSync(join(stage, "data", rel), body);
      return { path: rel, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") };
    });
    const manifest: Manifest = {
      runId,
      takenAt: "2026-10-30T22:00:12.000Z",
      source: { host: "legacy", dataDir, gitSha: "legacy", durableEnabled: false },
      files,
      totals: {
        files: files.length,
        bytes: files.reduce((n, f) => n + f.bytes, 0),
        jsonFiles: files.length,
        vaultBlobs: 0,
        nativeDocs: 0,
        otherFiles: 0,
      },
      excluded: [],
      coverage: [],
      encryption: "openssl-aes-256-cbc",
      archive: `${runId}.tar.gz.enc`,
      tool: "legacy-fixture",
    };
    writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
    const tar = execFileSync("tar", ["-czf", "-", "-C", stage, "data", "manifest.json"], { maxBuffer: 64 * 1024 * 1024 });
    const cbc = execFileSync("openssl", OPENSSL_ENC_ARGS, {
      input: tar,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE },
    });
    // openssl's own marker is what the detector keys on.
    expect(cbc.subarray(0, 8).toString("ascii")).toBe("Salted__");
    expect(detectArchiveFormat(cbc)).toBe("cbc-legacy");

    const legacyDir = mkTmp("h147-cbc-");
    const archivePath = join(legacyDir, `${runId}.tar.gz.enc`);
    writeFileSync(archivePath, cbc);

    const out = mkTmp("h147-cbc-out-");
    decryptArchiveToDir({ archivePath, outDir: out, passphrase: PASSPHRASE });
    const verified = verifyExtractedRun({ stageDir: out, requestedRunId: runId });
    expect(verified.checked).toBe(files.length);
    expect(readFileSync(join(out, "data", "users.json"), "utf8")).toContain(PLAINTEXT_MARKER);

    // …and a wrong passphrase on the legacy format still refuses.
    expect(() => decryptArchiveToDir({ archivePath, outDir: mkTmp("h147-cbc-bad-"), passphrase: OTHER_PASSPHRASE })).toThrow(
      /failed to decrypt/,
    );
  });
});

// ── 2. Per-instance namespaces ──────────────────────────────────────────────

describe("slice 147 — one namespace per instance", () => {
  it("derives a stable instance id from the data dir and prefixes every key with it", () => {
    const dataDir = makeDataDir();
    const first = resolveUploadPrefix({ env: ENV, dataDir, create: true });
    expect(first.instance).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}$/);
    expect(first.instanceSource).toBe("created");
    expect(first.prefix).toBe(`${DEFAULT_R2_PREFIX}${first.instance}/`);
    expect(existsSync(join(dataDir, INSTANCE_MARKER))).toBe(true);

    // Stable across calls and restarts: the id is written down, not derived.
    const second = resolveUploadPrefix({ env: ENV, dataDir, create: true });
    expect(second.instance).toBe(first.instance);
    expect(second.instanceSource).toBe("file");
  });

  it("gives two deployments two different namespaces", () => {
    const a = ensureInstanceId(makeDataDir()).id;
    const b = ensureInstanceId(makeDataDir()).id;
    expect(a).not.toBe(b);
  });

  it("lets R2_INSTANCE and R2_PREFIX win, verbatim", () => {
    const dataDir = makeDataDir();
    expect(resolveUploadPrefix({ env: { ...ENV, R2_INSTANCE: "My-Laptop" }, dataDir }).prefix).toBe(
      `${DEFAULT_R2_PREFIX}my-laptop/`,
    );
    expect(resolveUploadPrefix({ env: { ...ENV, R2_PREFIX: "custom/path" }, dataDir }).prefix).toBe("custom/path/");
  });

  it("a dev/test runtime does not upload at all unless the operator says so", () => {
    const dataDir = makeDataDir();
    const dev = resolveUploadPrefix({ env: { ...ENV, NODE_ENV: "development" }, dataDir });
    expect(dev.uploadAllowed).toBe(false);
    expect(dev.skipReason).toContain("non-production runtime");
    expect(resolveUploadPrefix({ env: { ...ENV, VITEST: "1" }, dataDir }).uploadAllowed).toBe(false);
    // An explicit override is intent, and wins.
    expect(resolveUploadPrefix({ env: { ...ENV, NODE_ENV: "development", R2_INSTANCE: "dev-box" }, dataDir }).uploadAllowed).toBe(
      true,
    );
    // NODE_ENV unset is NOT treated as dev: production runs unset here, and
    // guessing would silently stop the live off-box copy.
    expect(resolveUploadPrefix({ env: ENV, dataDir }).uploadAllowed).toBe(true);
  });

  it("NEVER prunes an object it cannot attribute to its own instance", () => {
    const base = "simplerlife100/backups/";
    const mine = `${base}data-aaaa1111/`;
    const plan = planRemoteRetention(
      [
        `${mine}2026-10-30T20-00-00Z.tar.gz.enc`,
        `${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`, // another instance
        `${base}2026-10-30T21-42-55Z.tar.gz.enc`, // pre-147 flat object
      ],
      { prefix: mine },
    );
    expect(plan.keep).toContain(`${mine}2026-10-30T20-00-00Z.tar.gz.enc`);
    // Neither of the other instance's objects is even considered for deletion.
    expect(plan.prune).toEqual([]);
    expect(plan.foreign).toContain(`${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`);
    expect(plan.foreign).toContain(`${base}2026-10-30T21-42-55Z.tar.gz.enc`);
  });

  it("still prunes garbage inside its OWN namespace (slice 145 behaviour kept)", () => {
    const mine = "simplerlife100/backups/data-aaaa1111/";
    const plan = planRemoteRetention([`${mine}notes.txt`, `${mine}2026-10-30T20-00-00Z.tar.gz.enc`], { prefix: mine });
    expect(plan.prune).toContain(`${mine}notes.txt`);
    expect(plan.keep).toContain(`${mine}2026-10-30T20-00-00Z.tar.gz.enc`);
  });

  it("uploads under its own prefix and leaves the other instance's object alone", async () => {
    const bucket = fakeBucket();
    const base = DEFAULT_R2_PREFIX;
    // The live deployment's archive, and the pre-147 flat one, already in the bucket.
    bucket.objects.set(`${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`, 35152);
    bucket.objects.set(`${base}2026-10-30T21-42-55Z.tar.gz.enc`, 35152);

    const { dataDir, run } = makeRun({ at: "2026-10-30T23:20:00Z" });
    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ENV,
      passphrase: PASSPHRASE,
      fetchImpl: bucket.fetchImpl,
    });

    expect(record.uploaded).toBe(true);
    expect(record.instance).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}$/);
    expect(record.key).toBe(`${base}${record.instance}/${run.runId}.tar.gz.enc`);
    // It only ever LISTED its own namespace…
    expect(bucket.lists).toEqual([`${base}${record.instance}/`]);
    // …and deleted nothing outside it.
    expect(bucket.deletes).toEqual([]);
    expect(bucket.objects.has(`${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`)).toBe(true);
    expect(bucket.objects.has(`${base}2026-10-30T21-42-55Z.tar.gz.enc`)).toBe(true);
    // The bytes on the wire are the GCM container, not plaintext.
    const put = bucket.puts[0];
    expect(detectArchiveFormat(Buffer.from(put.body))).toBe("gcm");
    expect(Buffer.from(put.body).toString("utf8")).not.toContain(PLAINTEXT_MARKER);
  });

  it("prunes only its own stale runs, across days, and reports the foreign ones", async () => {
    const bucket = fakeBucket();
    const base = DEFAULT_R2_PREFIX;
    const { dataDir, run } = makeRun({ at: "2026-10-30T23:30:00Z" });
    const resolved = resolveUploadPrefix({ env: ENV, dataDir, create: true });
    const mine = resolved.prefix;
    // Ten of our own daily runs, plus another instance's object.
    for (const day of ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"]) {
      bucket.objects.set(`${mine}2026-10-${day}T10-00-00Z.tar.gz.enc`, 100);
    }
    bucket.objects.set(`${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`, 35152);

    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ENV,
      passphrase: PASSPHRASE,
      fetchImpl: bucket.fetchImpl,
      keepDaily: 7,
      keepWeekly: 0,
    });

    expect(record.uploaded).toBe(true);
    expect(record.pruned.length).toBeGreaterThan(0);
    for (const key of record.pruned) expect(key.startsWith(mine)).toBe(true);
    // The other instance's object is not even listed (we only list our own
    // namespace), so it cannot be pruned — and it survived.
    expect(bucket.lists).toEqual([mine]);
    expect(bucket.objects.has(`${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`)).toBe(true);
    expect(record.foreign ?? []).toEqual([]);
    // Our newest run is always kept.
    expect(bucket.objects.has(record.key!)).toBe(true);
  });

  it("the restore path still finds the pre-147 flat object AND namespaced ones", () => {
    const base = DEFAULT_R2_PREFIX;
    const objects = [
      { key: `${base}2026-10-30T21-42-55Z.tar.gz.enc`, size: 35152, etag: null },
      { key: `${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`, size: 35152, etag: null },
    ];
    // Newest overall, at any depth.
    expect(selectRemoteObject(objects, { prefix: base }).key).toBe(`${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`);
    // The flat object by run id — not orphaned by the namespacing change.
    expect(selectRemoteObject(objects, { prefix: base, run: "2026-10-30T21-42-55Z" }).key).toBe(
      `${base}2026-10-30T21-42-55Z.tar.gz.enc`,
    );
    expect(runIdFromObjectKey(`${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`)).toBe("2026-10-30T22-00-12Z");
    expect(instanceOfKey(`${base}data-bbbb2222/2026-10-30T22-00-12Z.tar.gz.enc`, base)).toBe("data-bbbb2222");
    expect(instanceOfKey(`${base}2026-10-30T21-42-55Z.tar.gz.enc`, base)).toBe("");
  });

  it("a namespaced object restores end to end (materialise → verify)", () => {
    const { run } = makeRun({ at: "2026-10-30T23:40:00Z" });
    const out = mkTmp("h147-ns-restore-");
    decryptArchiveToDir({ archivePath: join(run.target, run.manifest.archive!), outDir: out, passphrase: PASSPHRASE });
    const handoff = mkTmp("h147-ns-handoff-");
    materialiseRunDir({
      rootDir: handoff,
      runId: run.runId,
      manifest: run.manifest,
      archivePath: join(run.target, run.manifest.archive!),
      archiveName: run.manifest.archive!,
    });
    expect(existsSync(join(handoff, run.runId, "manifest.json"))).toBe(true);
    expect(verifyExtractedRun({ stageDir: out, requestedRunId: run.runId }).checked).toBe(run.manifest.files.length);
  });
});

// ── 3. A stopped backup must be loud ────────────────────────────────────────

describe("slice 147 — staleness, honestly", () => {
  const HOUR = 60 * 60 * 1000;

  function summary(patch: Partial<BackupStatusSummary> = {}): BackupStatusSummary {
    return {
      lastBackupAt: null,
      lastBackupOk: null,
      lastBackupBytes: null,
      lastBackupTarget: null,
      lastBackupError: null,
      lastBackupRunId: null,
      lastBackupFiles: null,
      lastBackupEncryption: null,
      lastBackupOkAt: null,
      consecutiveFailures: null,
      consecutiveUploadFailures: null,
      lastBackupR2: null,
      ...patch,
    };
  }

  it("NEVER reports healthy without a real successful run", () => {
    const never = backupFreshness(summary(), { now: new Date("2026-10-30T23:00:00Z") });
    expect(never.stale).toBe(true);
    expect(never.healthy).toBe(false);
    expect(never.reason).toBe("never-ran");
    expect(never.ageMs).toBeNull();

    // A status file that only ever recorded failures is also "never".
    const onlyFailures = backupFreshness(
      summary({ lastBackupAt: "2026-10-30T22:59:00Z", lastBackupOk: false, lastBackupError: "boom" }),
      { now: new Date("2026-10-30T23:00:00Z") },
    );
    expect(onlyFailures.healthy).toBe(false);
    expect(onlyFailures.stale).toBe(true);
    expect(onlyFailures.reason).toBe("never-ran");
  });

  it("flips to stale once the last success is older than a small multiple of the interval", () => {
    const opts = { intervalMs: HOUR, staleFactor: 2.5, now: new Date("2026-10-30T23:00:00Z") };
    const fresh = backupFreshness(summary({ lastBackupAt: "2026-10-30T22:30:00Z", lastBackupOk: true, lastBackupOkAt: "2026-10-30T22:30:00Z" }), opts);
    expect(fresh).toMatchObject({ stale: false, healthy: true, reason: "ok", ageMs: 30 * 60 * 1000, thresholdMs: 2.5 * HOUR });

    // Exactly at the threshold is still fine; one ms past it is not.
    const atEdge = backupFreshness(summary({ lastBackupOk: true, lastBackupOkAt: "2026-10-30T20:30:00Z" }), opts);
    expect(atEdge.stale).toBe(false);
    const past = backupFreshness(summary({ lastBackupOk: true, lastBackupOkAt: "2026-10-30T20:29:59Z" }), opts);
    expect(past.stale).toBe(true);
    expect(past.reason).toBe("overdue");
  });

  it("distinguishes 'overdue' from 'the last run failed'", () => {
    const opts = { intervalMs: HOUR, now: new Date("2026-10-30T23:00:00Z") };
    const failing = backupFreshness(
      summary({
        lastBackupAt: "2026-10-30T22:59:00Z",
        lastBackupOk: false,
        lastBackupOkAt: "2026-10-30T18:00:00Z",
        lastBackupError: "disk full",
        consecutiveFailures: 5,
      }),
      opts,
    );
    expect(failing).toMatchObject({ stale: true, healthy: false, reason: "last-run-failed", consecutiveFailures: 5 });
    expect(failing.ageSeconds).toBe(5 * 3600);
    expect(failing.lastError).toBe("disk full");
  });

  it("reads a REAL status file: a successful run is fresh, a missing one is never-ran", () => {
    const { dataDir, run } = makeRun({ at: "2026-10-30T22:00:00Z" });
    const at = new Date("2026-10-30T22:10:00Z");
    const fresh = readBackupFreshness(dataDir, { now: at, intervalMs: HOUR });
    expect(fresh.healthy).toBe(true);
    expect(fresh.lastSuccessAt).toBe(run.manifest.takenAt);
    expect(fresh.consecutiveFailures).toBe(0);

    const empty = mkTmp("h147-nostatus-");
    const none = readBackupFreshness(empty, { now: at, intervalMs: HOUR });
    expect(none.stale).toBe(true);
    expect(none.reason).toBe("never-ran");
  });

  it("a failure increments the counter and keeps the last SUCCESS timestamp", () => {
    const dataDir = makeDataDir();
    const { run } = makeRun({ at: "2026-10-30T22:00:00Z" });
    writeBackupStatus(dataDir, statusFor(run.manifest, run.target));
    expect(readBackupStatus(dataDir).consecutiveFailures).toBe(0);

    writeBackupStatus(dataDir, failedStatus("2026-10-30T23:00:00Z", run.target, "boom 1"));
    writeBackupStatus(dataDir, failedStatus("2026-10-31T00:00:00Z", run.target, "boom 2"));
    const after = readBackupStatus(dataDir);
    expect(after.consecutiveFailures).toBe(2);
    expect(after.lastBackupOk).toBe(false);
    // The last time we actually had a good copy is not erased by failures.
    expect(after.lastBackupOkAt).toBe(run.manifest.takenAt);

    writeBackupStatus(dataDir, statusFor(run.manifest, run.target));
    expect(readBackupStatus(dataDir).consecutiveFailures).toBe(0);
  });

  it("an older status file (no lastBackupOkAt) is judged on its last good run", () => {
    const dataDir = makeDataDir();
    // Exactly what slice 143–145 wrote.
    writeFileSync(
      join(dataDir, BACKUP_STATUS_FILE),
      JSON.stringify({ lastBackupAt: "2026-10-30T22:00:00Z", lastBackupOk: true, lastBackupBytes: 1 }),
    );
    const fresh = readBackupFreshness(dataDir, { now: new Date("2026-10-30T23:00:00Z"), intervalMs: HOUR });
    expect(fresh).toMatchObject({ healthy: true, lastSuccessAt: "2026-10-30T22:00:00Z" });
  });

  it("emits one greppable structured line per event, and none when healthy", () => {
    const line = backupEventLine("upload-failed", { error: "HTTP 403", consecutiveFailures: 2 });
    expect(line.startsWith("[backup][upload-failed] ")).toBe(true);
    expect(JSON.parse(line.slice("[backup][upload-failed] ".length))).toEqual({ error: "HTTP 403", consecutiveFailures: 2 });

    const healthy = backupFreshness(
      summary({ lastBackupOk: true, lastBackupOkAt: "2026-10-30T22:55:00Z" }),
      { now: new Date("2026-10-30T23:00:00Z"), intervalMs: HOUR },
    );
    expect(staleEventLine(healthy)).toBeNull();

    const stale = backupFreshness(summary({ lastBackupOk: true, lastBackupOkAt: "2026-10-30T10:00:00Z" }), {
      now: new Date("2026-10-30T23:00:00Z"),
      intervalMs: HOUR,
    });
    const staleLine = staleEventLine(stale)!;
    expect(staleLine.startsWith("[backup][overdue] ")).toBe(true);
    expect(JSON.parse(staleLine.split(" ").slice(1).join(" ")).reason).toBe("overdue");
  });

  it("a failed upload produces a structured line with the durable failure count", async () => {
    const { dataDir, run } = makeRun({ at: "2026-10-30T23:50:00Z" });
    // A previous failure, so the counter is non-zero before this one.
    writeBackupStatus(dataDir, failedStatus("2026-10-30T22:50:00Z", run.target, "previous"));
    const lines: string[] = [];
    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ENV,
      passphrase: PASSPHRASE,
      fetchImpl: fakeBucket({ putFails: true }).fetchImpl,
      log: (m) => lines.push(m),
    });
    expect(record.uploaded).toBe(false);
    const eventLine = lines.find((l) => l.startsWith("[backup][upload-failed] "));
    expect(eventLine).toBeTruthy();
    const payload = JSON.parse(eventLine!.slice("[backup][upload-failed] ".length));
    expect(payload.error).toContain("403");
    expect(payload.consecutiveUploadFailures).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(payload)).not.toContain(ENV.R2_SECRET_ACCESS_KEY);
  });
});
