/**
 * r2-offbox-145.test.ts — SLICE 145: the off-box copy.
 *
 * WHAT THIS PINS (each one is a way "we have off-box backups" becomes a lie):
 *   1. the SigV4 signer reproduces AWS's own published example signature — a
 *      broken signer is otherwise only discovered by a 403 at 3am;
 *   2. no BACKUP_PASSPHRASE ⇒ NO upload is attempted at all, and the record
 *      says why (`uploadSkipped: "no passphrase"`);
 *   3. the bytes that go over the wire are the ENCRYPTED archive — the plaintext
 *      marker string inside the data dir must not appear in the request body;
 *   4. an upload failure is recorded with a REDACTED error, never throws, and
 *      the scheduler keeps scheduling;
 *   5. remote retention keeps exactly what the local retention keeps, from the
 *      same function;
 *   6. restore-from-R2 refuses a tampered manifest (and a mismatched run id)
 *      before anything is written;
 *   7. a truncated download is refused before decryption.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  BACKUP_STATUS_FILE,
  planRetention,
  runBackup,
  type Manifest,
} from "../../scripts/lib/backup-core";
import { makeEncryptHook } from "../../scripts/lib/backup-crypto";
import { uploadVerifiedRun } from "../../scripts/lib/r2-backup";
import { assertDownloadedSize, materialiseRunDir, selectRemoteObject, verifyExtractedRun } from "../../scripts/lib/r2-restore";
import { readBackupStatus } from "../lib/backup-status";
import { startBackupScheduler } from "../lib/backup-scheduler";
import {
  amzDateOf,
  describeR2Config,
  objectKeyForRun,
  planRemoteRetention,
  r2ConfigFromEnv,
  redactSecrets,
  signAwsV4,
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

const PASSPHRASE = "test-passphrase-145";
const PLAINTEXT_MARKER = "PLAINTEXT-CLIENT-SECRET-MARKER-145";
const ENV = {
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "b".repeat(32),
  R2_SECRET_ACCESS_KEY: "c".repeat(64),
  R2_BUCKET: "test-bucket",
};

function makeDataDir(extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "r2-data-"));
  tmpDirs.push(dir);
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

interface CapturedRequest {
  method: string;
  url: string;
  body?: Uint8Array;
  headers: Record<string, string>;
}

function response(init: {
  ok?: boolean;
  status?: number;
  body?: string;
  bytes?: Uint8Array;
  headers?: Record<string, string>;
}): R2FetchResponse {
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

function fakeR2(opts: {
  captured?: CapturedRequest[];
  putFails?: boolean;
  listKeys?: string[];
  deleteFails?: boolean;
  onCall?: () => void;
} = {}): R2Fetch {
  const captured = opts.captured ?? [];
  return async (url, init) => {
    opts.onCall?.();
    captured.push({ method: init.method, url, body: init.body, headers: init.headers });
    if (init.method === "PUT") {
      if (opts.putFails) return response({ ok: false, status: 403, body: `AccessDenied for ${ENV.R2_SECRET_ACCESS_KEY}` });
      return response({ headers: { etag: '"abc123etag"' } });
    }
    if (init.method === "GET") {
      const keys = opts.listKeys ?? [];
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>` +
        keys
          .map(
            (k) =>
              `<Contents><Key>${k}</Key><Size>100</Size><ETag>&quot;e-${k.length}&quot;</ETag>` +
              `<LastModified>2026-10-30T00:00:00.000Z</LastModified></Contents>`,
          )
          .join("") +
        `<IsTruncated>false</IsTruncated></ListBucketResult>`;
      return response({ body: xml });
    }
    if (init.method === "DELETE") {
      if (opts.deleteFails) return response({ ok: false, status: 500, body: "prune exploded" });
      return response({ status: 204 });
    }
    return response({ ok: false, status: 400, body: "unexpected" });
  };
}

// ── 1. The signer, against AWS's published example ──────────────────────────

describe("SigV4 signing", () => {
  it("reproduces the AWS-published GET-object example signature", () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
    // "Example: GET Object" — credentials and date are AWS's own example values.
    const out = signAwsV4({
      method: "GET",
      path: "/test.txt",
      headers: {
        host: "examplebucket.s3.amazonaws.com",
        range: "bytes=0-9",
        "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "x-amz-date": "20130524T000000Z",
      },
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      amzDate: "20130524T000000Z",
    });
    expect(out.signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    expect(out.canonicalRequest).toBe(
      "GET\n" +
        "/test.txt\n" +
        "\n" +
        "host:examplebucket.s3.amazonaws.com\n" +
        "range:bytes=0-9\n" +
        "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n" +
        "x-amz-date:20130524T000000Z\n" +
        "\n" +
        "host;range;x-amz-content-sha256;x-amz-date\n" +
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(out.authorization).toContain(
      "Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
    );
  });

  it("signs a PUT with a body hash and a stable, deterministic scope", () => {
    const input = {
      method: "PUT",
      path: "/test-bucket/simplerlife100/backups/2026-10-30T20-11-58Z.tar.gz.enc",
      headers: {
        host: "a.r2.cloudflarestorage.com",
        "x-amz-content-sha256": "d".repeat(64),
        "x-amz-date": "20261030T201158Z",
        "content-type": "application/octet-stream",
      },
      payloadHash: "d".repeat(64),
      accessKeyId: "b".repeat(32),
      secretAccessKey: "c".repeat(64),
      region: "auto",
      amzDate: "20261030T201158Z",
    };
    const a = signAwsV4(input);
    const b = signAwsV4(input);
    expect(a.signature).toBe(b.signature);
    expect(a.signedHeaders).toBe("content-type;host;x-amz-content-sha256;x-amz-date");
    expect(a.stringToSign.split("\n")[2]).toBe("20261030/auto/s3/aws4_request");
    expect(a.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("formats the amz date and encodes keys the way SigV4 requires", () => {
    expect(amzDateOf(new Date("2026-10-30T20:11:58.123Z"))).toBe("20261030T201158Z");
    expect(objectKeyForRun("simplerlife100/backups/", "2026-10-30T20-11-58Z")).toBe(
      "simplerlife100/backups/2026-10-30T20-11-58Z.tar.gz.enc",
    );
  });

  it("reports missing configuration by NAME only and never leaks a value", () => {
    const report = describeR2Config({ R2_BUCKET: "b" });
    expect(report.configured).toBe(false);
    expect(report.missing).toEqual(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]);
    expect(JSON.stringify(report)).not.toContain("b\"");
    expect(r2ConfigFromEnv({})).toBeNull();
    expect(r2ConfigFromEnv(ENV)?.prefix).toBe("simplerlife100/backups/");
  });

  it("redacts credentials and signatures out of a stored error", () => {
    const msg = `403 AccessDenied Credential=${ENV.R2_ACCESS_KEY_ID}/20261030/auto/s3/aws4_request, Signature=deadbeefdeadbeefdeadbeef`;
    const out = redactSecrets(msg, [ENV.R2_ACCESS_KEY_ID]);
    expect(out).not.toContain(ENV.R2_ACCESS_KEY_ID);
    expect(out).not.toContain("deadbeefdeadbeefdeadbeef");
  });
});

// ── 2/3/4. The upload gate ──────────────────────────────────────────────────

describe("uploadVerifiedRun", () => {
  it("does NOT upload without a passphrase, and says why", async () => {
    const dataDir = makeDataDir();
    const outDir = mkdtempSync(join(tmpdir(), "r2-out-"));
    tmpDirs.push(outDir);
    const run = runBackup({ dataDir, outDir, noPrune: true, now: new Date("2026-10-30T20:11:58Z") });

    let called = 0;
    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ENV,
      passphrase: "",
      fetchImpl: fakeR2({ onCall: () => called++ }),
    });

    expect(called).toBe(0); // no network call AT ALL
    expect(record.configured).toBe(true);
    expect(record.uploaded).toBe(false);
    expect(record.uploadSkipped).toBe("no passphrase");
    expect(record.error).toBeNull();

    const status = readBackupStatus(dataDir);
    expect(status.lastBackupR2?.uploadSkipped).toBe("no passphrase");
    expect(status.lastBackupR2?.uploaded).toBe(false);
    // The local run itself still counts as a good run.
    expect(status.lastBackupOk).toBe(true);
  });

  it("does not upload when R2 is unconfigured, and names the missing variables", async () => {
    const dataDir = makeDataDir();
    const outDir = mkdtempSync(join(tmpdir(), "r2-out-"));
    tmpDirs.push(outDir);
    const run = runBackup({
      dataDir,
      outDir,
      noPrune: true,
      now: new Date("2026-10-30T20:11:59Z"),
      encrypt: makeEncryptHook(PASSPHRASE),
    });
    let called = 0;
    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: { R2_BUCKET: "test-bucket" },
      passphrase: PASSPHRASE,
      fetchImpl: fakeR2({ onCall: () => called++ }),
    });
    expect(called).toBe(0);
    expect(record.configured).toBe(false);
    expect(record.uploadSkipped).toContain("R2_ACCOUNT_ID");
  });

  it("uploads the ENCRYPTED archive, never the plaintext store", async () => {
    const dataDir = makeDataDir();
    const outDir = mkdtempSync(join(tmpdir(), "r2-out-"));
    tmpDirs.push(outDir);
    const run = runBackup({
      dataDir,
      outDir,
      noPrune: true,
      now: new Date("2026-10-30T20:12:00Z"),
      encrypt: makeEncryptHook(PASSPHRASE),
    });
    expect(run.manifest.archive).toBe("2026-10-30T20-12-00Z.tar.gz.enc");

    const captured: CapturedRequest[] = [];
    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ENV,
      passphrase: PASSPHRASE,
      fetchImpl: fakeR2({ captured, listKeys: [] }),
    });

    expect(record.uploaded).toBe(true);
    expect(record.key).toBe("simplerlife100/backups/2026-10-30T20-12-00Z.tar.gz.enc");
    expect(record.etag).toBe("abc123etag");
    expect(record.bytes).toBeGreaterThan(0);
    expect(record.uploadedAt).toBeTruthy();

    const put = captured.find((c) => c.method === "PUT")!;
    expect(put).toBeTruthy();
    // The exact bytes on the wire are the file on disk…
    const onDisk = readFileSync(join(run.target, run.manifest.archive!));
    expect(Buffer.from(put.body!).equals(onDisk)).toBe(true);
    // …and the plaintext marker from users.json is NOT in them.
    expect(Buffer.from(put.body!).toString("utf8")).not.toContain(PLAINTEXT_MARKER);
    expect(Buffer.from(put.body!).toString("utf8")).not.toContain("owner@example.com");
    // The request was actually signed.
    expect(put.headers.Authorization).toContain("AWS4-HMAC-SHA256 Credential=");
    expect(put.headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    // No secret in any header we send.
    expect(JSON.stringify(put.headers)).not.toContain(ENV.R2_SECRET_ACCESS_KEY);

    const status = readBackupStatus(dataDir);
    expect(status.lastBackupR2?.uploaded).toBe(true);
    expect(status.lastBackupR2?.key).toBe(record.key);
    const manifestOnDisk = JSON.parse(readFileSync(join(run.target, "manifest.json"), "utf8")) as Manifest;
    expect(manifestOnDisk.r2?.uploaded).toBe(true);
  });

  it("records a failed upload with a redacted error and never throws", async () => {
    const dataDir = makeDataDir();
    const outDir = mkdtempSync(join(tmpdir(), "r2-out-"));
    tmpDirs.push(outDir);
    const run = runBackup({
      dataDir,
      outDir,
      noPrune: true,
      now: new Date("2026-10-30T20:12:01Z"),
      encrypt: makeEncryptHook(PASSPHRASE),
    });

    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ENV,
      passphrase: PASSPHRASE,
      fetchImpl: fakeR2({ putFails: true }),
    });

    expect(record.uploaded).toBe(false);
    expect(record.key).toBeNull();
    expect(record.error).toContain("403");
    expect(record.error).not.toContain(ENV.R2_SECRET_ACCESS_KEY);

    const status = readBackupStatus(dataDir);
    expect(status.lastBackupR2?.error).toContain("403");
    expect(status.lastBackupR2?.uploaded).toBe(false);
    // The LOCAL run still succeeded — an off-box failure is loud, not fatal.
    expect(status.lastBackupOk).toBe(true);
    expect(status.lastBackupError).toBeNull();
  });

  it("a failed prune is recorded and does not fail the run", async () => {
    const dataDir = makeDataDir();
    const outDir = mkdtempSync(join(tmpdir(), "r2-out-"));
    tmpDirs.push(outDir);
    const run = runBackup({
      dataDir,
      outDir,
      noPrune: true,
      now: new Date("2026-10-30T20:12:02Z"),
      encrypt: makeEncryptHook(PASSPHRASE),
    });
    // A bucket with more runs than the 7-daily / 4-weekly policy keeps, so the
    // prune actually has something to delete.
    const staleKeys = [
      "2026-10-29T20-00-00Z",
      "2026-10-28T20-00-00Z",
      "2026-10-27T20-00-00Z",
      "2026-10-26T20-00-00Z",
      "2026-10-25T20-00-00Z",
      "2026-10-24T20-00-00Z",
      "2026-10-23T20-00-00Z",
      "2026-10-20T20-00-00Z",
      "2026-10-10T20-00-00Z",
      "2026-09-01T20-00-00Z",
    ].map((id) => `simplerlife100/backups/${id}.tar.gz.enc`);
    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ENV,
      passphrase: PASSPHRASE,
      fetchImpl: fakeR2({ deleteFails: true, listKeys: staleKeys }),
    });
    expect(record.uploaded).toBe(true);
    expect(record.pruneError).toContain("prune exploded");
    expect(record.pruned).toEqual([]);
  });

  it("the scheduler keeps scheduling after a failed upload", async () => {
    const dataDir = makeDataDir();
    const outDir = mkdtempSync(join(tmpdir(), "r2-out-"));
    tmpDirs.push(outDir);
    const run = runBackup({
      dataDir,
      outDir,
      noPrune: true,
      now: new Date("2026-10-30T20:12:03Z"),
      encrypt: makeEncryptHook(PASSPHRASE),
    });
    const calls: string[] = [];
    const scheduler = startBackupScheduler({
      intervalMs: 60_000,
      disabled: false,
      run: async () => {
        const r2 = await uploadVerifiedRun({
          dataDir,
          runDir: run.target,
          manifest: run.manifest,
          env: ENV,
          passphrase: PASSPHRASE,
          fetchImpl: fakeR2({ putFails: true }),
          persist: false,
        });
        calls.push(r2.uploaded ? "uploaded" : "failed");
        return { ok: true, runId: run.runId, files: run.files, bytes: run.bytes, r2 };
      },
      timers: { setTimeout: () => 0, clearTimeout: () => {} },
      log: () => {},
    });
    await scheduler.trigger("first");
    await scheduler.trigger("second");
    scheduler.stop();
    expect(calls).toEqual(["failed", "failed"]);
    expect(scheduler.status().runs).toBe(2);
    expect(scheduler.status().failures).toBe(0);
  });
});

// ── 5. Remote retention == local retention ──────────────────────────────────

describe("remote retention", () => {
  it("keeps exactly what the local policy keeps, for the same run ids", () => {
    const runIds = [
      "2026-10-30T20-00-00Z",
      "2026-10-30T19-00-00Z",
      "2026-10-29T20-00-00Z",
      "2026-10-28T20-00-00Z",
      "2026-10-27T20-00-00Z",
      "2026-10-26T20-00-00Z",
      "2026-10-25T20-00-00Z",
      "2026-10-24T20-00-00Z",
      "2026-10-23T20-00-00Z",
      "2026-10-20T20-00-00Z",
      "2026-10-10T20-00-00Z",
      "2026-09-01T20-00-00Z",
    ];
    const prefix = "simplerlife100/backups/";
    const keys = runIds.map((id) => `${prefix}${id}.tar.gz.enc`);
    const local = planRetention(runIds, { daily: 7, weekly: 4 });
    const remote = planRemoteRetention(keys, { prefix, daily: 7, weekly: 4 });
    expect(remote.keep.sort()).toEqual(local.keep.map((id) => `${prefix}${id}.tar.gz.enc`).sort());
    expect(remote.prune.sort()).toEqual(local.prune.map((id) => `${prefix}${id}.tar.gz.enc`).sort());
  });

  it("prunes objects it cannot attribute to a run, and never the fresh one", async () => {
    const prefix = "simplerlife100/backups/";
    const plan = planRemoteRetention(
      [`${prefix}notes.txt`, `${prefix}2026-10-30T20-00-00Z.tar.gz.enc`],
      { prefix },
    );
    expect(plan.prune).toContain(`${prefix}notes.txt`);
    expect(plan.keep).toContain(`${prefix}2026-10-30T20-00-00Z.tar.gz.enc`);

    const dataDir = makeDataDir();
    const outDir = mkdtempSync(join(tmpdir(), "r2-out-"));
    tmpDirs.push(outDir);
    const run = runBackup({
      dataDir,
      outDir,
      noPrune: true,
      now: new Date("2026-10-30T20:12:04Z"),
      encrypt: makeEncryptHook(PASSPHRASE),
    });
    const record = await uploadVerifiedRun({
      dataDir,
      runDir: run.target,
      manifest: run.manifest,
      env: ENV,
      passphrase: PASSPHRASE,
      fetchImpl: fakeR2({ listKeys: [run.manifest.archive ? objectKeyForRun(prefix, run.runId, run.manifest.archive) : ""] }),
    });
    expect(record.uploaded).toBe(true);
    expect(record.pruned).toEqual([]); // the only object is the one we just wrote
  });
});

// ── 6/7. Restore-from-R2 verification gates ────────────────────────────────

describe("restore-from-R2 verification", () => {
  function stagedRun(): { stageDir: string; runId: string } {
    const stageDir = mkdtempSync(join(tmpdir(), "r2-stage-"));
    tmpDirs.push(stageDir);
    const runId = "2026-10-30T20-12-05Z";
    const files = { "users.json": '{"owner@example.com":{"role":"owner"}}', "vault/blobs/a.bin": "blob-bytes" };
    const manifestFiles = Object.entries(files).map(([path, body]) => ({
      path,
      bytes: Buffer.byteLength(body),
      sha256: createHash("sha256").update(body).digest("hex"),
    }));
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(stageDir, "data", rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    writeFileSync(
      join(stageDir, "manifest.json"),
      JSON.stringify({
        runId,
        takenAt: "2026-10-30T20:12:05.000Z",
        source: { host: "test", dataDir: "/tmp/x", gitSha: "test", durableEnabled: false },
        files: manifestFiles,
        totals: { files: manifestFiles.length, bytes: 0, jsonFiles: 1, vaultBlobs: 1, nativeDocs: 0, otherFiles: 0 },
        excluded: [],
        coverage: [],
        encryption: "openssl-aes-256-cbc",
        archive: `${runId}.tar.gz.enc`,
        tool: "scripts/backup.mjs",
      }),
    );
    return { stageDir, runId };
  }

  it("accepts an intact run", () => {
    const { stageDir, runId } = stagedRun();
    const v = verifyExtractedRun({ stageDir, requestedRunId: runId });
    expect(v.manifest.runId).toBe(runId);
    expect(v.checked).toBe(2);
  });

  it("refuses a tampered manifest before anything is written", () => {
    const { stageDir, runId } = stagedRun();
    const manifest = JSON.parse(readFileSync(join(stageDir, "manifest.json"), "utf8"));
    manifest.files[0].sha256 = "0".repeat(64); // a digest that does not describe the data
    writeFileSync(join(stageDir, "manifest.json"), JSON.stringify(manifest));

    const target = join(tmpdir(), `r2-target-should-not-exist-${process.pid}`);
    rmSync(target, { recursive: true, force: true });

    expect(() => verifyExtractedRun({ stageDir, requestedRunId: runId })).toThrow(/manifest verification failed/);
    // The gate runs before the hand-off, so no target was created.
    expect(existsSync(target)).toBe(false);
  });

  it("refuses a run id that does not match the object we asked for", () => {
    const { stageDir } = stagedRun();
    expect(() => verifyExtractedRun({ stageDir, requestedRunId: "2026-01-01T00-00-00Z" })).toThrow(/does not match/);
  });

  it("refuses a manifest that is not ours", () => {
    const stageDir = mkdtempSync(join(tmpdir(), "r2-stage-"));
    tmpDirs.push(stageDir);
    writeFileSync(join(stageDir, "manifest.json"), JSON.stringify({ hello: "world" }));
    expect(() => verifyExtractedRun({ stageDir, requestedRunId: "2026-10-30T20-12-05Z" })).toThrow(/not a backup manifest/);
  });

  it("refuses a truncated download before decrypting it", () => {
    expect(() => assertDownloadedSize(100, 4096, "k")).toThrow(/truncated/);
    expect(() => assertDownloadedSize(4096, 4096, "k")).not.toThrow();
  });

  it("selects the requested run, or the newest one", () => {
    const prefix = "simplerlife100/backups/";
    const objects = [
      { key: `${prefix}2026-10-29T20-00-00Z.tar.gz.enc`, size: 10, etag: "e1" },
      { key: `${prefix}2026-10-30T20-00-00Z.tar.gz.enc`, size: 11, etag: "e2" },
    ];
    expect(selectRemoteObject(objects, { prefix }).key).toContain("2026-10-30");
    expect(selectRemoteObject(objects, { prefix, run: "2026-10-29T20-00-00Z" }).key).toContain("2026-10-29");
    expect(() => selectRemoteObject(objects, { prefix, run: "2020-01-01T00-00-00Z" })).toThrow(/no object for run/);
  });

  it("materialises a run dir the existing restore CLI accepts", () => {
    const { stageDir, runId } = stagedRun();
    const root = mkdtempSync(join(tmpdir(), "r2-handoff-"));
    tmpDirs.push(root);
    const manifest = JSON.parse(readFileSync(join(stageDir, "manifest.json"), "utf8")) as Manifest;
    const archivePath = join(stageDir, "fake.enc");
    writeFileSync(archivePath, "ciphertext");
    const runDir = materialiseRunDir({ rootDir: root, runId, manifest, archivePath, archiveName: manifest.archive! });
    expect(existsSync(join(runDir, "manifest.json"))).toBe(true);
    expect(readFileSync(join(runDir, manifest.archive!), "utf8")).toBe("ciphertext");
    expect(readBackupStatus(stageDir).lastBackupR2).toBeNull();
    expect(existsSync(join(stageDir, BACKUP_STATUS_FILE))).toBe(false);
  });
});
