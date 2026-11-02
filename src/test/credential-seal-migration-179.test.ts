/**
 * SLICE 179 — a one-time migration must seal the plaintext secrets that slice
 * 177 left in `tenant_oauth_credentials.json`.
 *
 * THE DEFECT
 * ----------
 * Slice 177 made the store seal on WRITE and upgrade a legacy plaintext value
 * "on the next write". Anything that is never written again keeps its secret in
 * the clear forever — and a Slack `xoxb-` bot token never expires and never
 * refreshes. The store on this box held 13 real connections with 25 plaintext
 * secret fields and ZERO sealed fields.
 *
 * HOW THESE TESTS AVOID BLESSING THE BUG (lead rule, 2026-11-02)
 * --------------------------------------------------------------
 * Nothing here asserts a literal that the migration also supplies. The expected
 * values come from the SYSTEM OF RECORD:
 *   - the ciphertext is decrypted with `integration-crypto` (the module that
 *     defines the format) and compared with the secret the fixture put on disk;
 *   - "the file is unchanged" is a sha256 of the bytes the fixture wrote;
 *   - the row count and field names come from the fixture, not from the report.
 * This file deliberately imports ONLY modules that existed before slice 179, so
 * it RUNS at c6d0ab6 instead of dying at import resolution: there the script it
 * invokes does not exist, so `expect(run.status).toBe(0)` fails with the real
 * "Module not found" text in the captured stderr.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../lib/integration-crypto";

const KEY_ENV = "INTEGRATION_ENCRYPTION_KEY";
/** Test-only value. Never the deployment's key. */
const TEST_KEY = "slice179-test-only-integration-key-0123456789";
const SHORT_KEY = "slice179-too-short";
const CREDS = "tenant_oauth_credentials.json";

const REPO_ROOT = existsSync(join(process.cwd(), "prod-server.ts"))
  ? process.cwd()
  : join(process.cwd(), "..");
const SCRIPT = join(REPO_ROOT, "scripts", "seal-credential-store.ts");

/**
 * Fake tokens. None of these is real; each is shaped like the provider's real
 * token so a report that leaked a prefix would be visible.
 */
const FAKE = {
  slackBot: "xoxb-0000-FAKE-SLACK-BOT-TOKEN-DO-NOT-STORE-IN-CLEAR",
  hubspotAccess: "FAKE-hubspot-access-token-DO-NOT-STORE-IN-CLEAR",
  hubspotRefresh: "FAKE-hubspot-refresh-token-DO-NOT-STORE-IN-CLEAR",
  xeroClientSecret: "FAKE-xero-app-client-secret-DO-NOT-STORE-IN-CLEAR",
  xeroAccess: "FAKE-xero-access-token-DO-NOT-STORE-IN-CLEAR",
  docusignApi: "FAKE-docusign-api-token-DO-NOT-STORE-IN-CLEAR",
} as const;

/** Rows the fixture writes: 4 rows, 5 plaintext secret fields. */
const FIXTURE_ROWS: Record<string, Record<string, any>> = {
  "owner@example.com:slack": {
    provider: "slack",
    accessToken: FAKE.slackBot,
    teamId: "T0FAKE123",
    connectedAt: "2026-10-01T00:00:00.000Z",
  },
  "owner@example.com:hubspot": {
    provider: "hubspot",
    accessToken: FAKE.hubspotAccess,
    refreshToken: FAKE.hubspotRefresh,
    expiresAt: 1793000000000,
    scope: "crm.objects.contacts.read",
  },
  xero: {
    clientId: "xero-app-client-id-not-secret",
    clientSecret: FAKE.xeroClientSecret,
  },
  "owner@example.com:docusign": {
    provider: "docusign",
    apiToken: FAKE.docusignApi,
    accountId: "acct-1234",
  },
};

/** Every (rowKey, field) the fixture expects to be sealed, with its plaintext. */
const EXPECTED_PLAINTEXT: Array<[string, string, string]> = [
  ["owner@example.com:slack", "accessToken", FAKE.slackBot],
  ["owner@example.com:hubspot", "accessToken", FAKE.hubspotAccess],
  ["owner@example.com:hubspot", "refreshToken", FAKE.hubspotRefresh],
  ["xero", "clientSecret", FAKE.xeroClientSecret],
  ["owner@example.com:docusign", "apiToken", FAKE.docusignApi],
];

let dir: string;
let savedKey: string | undefined;

const credsPath = () => join(dir, CREDS);
const rawBytes = () => readFileSync(credsPath());
const rawStore = () => JSON.parse(readFileSync(credsPath(), "utf-8")) as Record<string, any>;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const backups = () =>
  existsSync(dir) ? readdirSync(dir).filter((n) => n.includes(".pre-seal-") && n.endsWith(".bak")) : [];

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Parsed `--json` report when the run produced one. */
  report: any | null;
}

/** Run the real entry point the operator will run, against the fixture dir. */
function runScript(
  opts: { key?: string | null; args?: string[]; json?: boolean; inDir?: string } = {},
): RunResult {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  // Deterministic: no durable store in the child, and the key is exactly what
  // this test says it is (the suite's setup.ts sets one globally).
  delete env.DATABASE_URL;
  if (opts.key === null) delete env[KEY_ENV];
  else env[KEY_ENV] = opts.key ?? TEST_KEY;

  const args = [SCRIPT, "--data-dir", opts.inDir ?? dir, ...(opts.args ?? [])];
  if (opts.json !== false) args.push("--json");
  const run = spawnSync("bun", args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    timeout: 120_000,
    env,
  });
  const stdout = run.stdout ?? "";
  let report: any | null = null;
  if (opts.json !== false) {
    // The script prints exactly one JSON document on stdout in --json mode.
    const start = stdout.indexOf("{");
    if (start >= 0) {
      try {
        report = JSON.parse(stdout.slice(start));
      } catch {
        report = null;
      }
    }
  }
  return { status: run.status, stdout, stderr: run.stderr ?? "", report };
}

/** What a run should say when it did not work, for a readable failure. */
const why = (r: RunResult) => `status=${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`;

beforeEach(() => {
  savedKey = process.env[KEY_ENV];
  // The child is given TEST_KEY, so this process must decrypt with the SAME
  // key — otherwise the round-trip assertion would compare against a key the
  // migration never used.
  process.env[KEY_ENV] = TEST_KEY;
  dir = mkdtempSync(join(tmpdir(), `slice179-creds-${process.pid}-`));
  writeFileSync(credsPath(), JSON.stringify(FIXTURE_ROWS, null, 2));
});

afterEach(() => {
  if (savedKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = savedKey;
});

describe("slice 179 — seal plaintext OAuth credentials on disk", () => {
  it("seals every plaintext secret and leaves no readable token on disk", () => {
    const before = rawBytes();
    const run = runScript();
    expect(run.status, why(run)).toBe(0);
    expect(run.report?.ok, why(run)).toBe(true);

    // Nothing readable may survive anywhere in the file.
    const text = readFileSync(credsPath(), "utf-8");
    for (const [, , plaintext] of EXPECTED_PLAINTEXT) {
      expect(text.includes(plaintext), `a plaintext secret is still in the file: ${plaintext.slice(0, 4)}…`).toBe(false);
    }

    // Every field the fixture wrote as plaintext must now be ciphertext that
    // decrypts back to that EXACT value (system of record = integration-crypto).
    const store = rawStore();
    for (const [rowKey, field, plaintext] of EXPECTED_PLAINTEXT) {
      const stored = store[rowKey]?.[field];
      expect(typeof stored, `${rowKey}.${field} missing`).toBe("string");
      expect(stored).not.toBe(plaintext);
      expect(decryptIntegrationSecret(stored)).toBe(plaintext);
    }

    // Non-secret fields are untouched.
    expect(store["owner@example.com:slack"].teamId).toBe(FIXTURE_ROWS["owner@example.com:slack"].teamId);
    expect(store["owner@example.com:hubspot"].expiresAt).toBe(FIXTURE_ROWS["owner@example.com:hubspot"].expiresAt);
    expect(store["owner@example.com:hubspot"].scope).toBe(FIXTURE_ROWS["owner@example.com:hubspot"].scope);
    expect(store.xero.clientId).toBe(FIXTURE_ROWS.xero.clientId);
    expect(store["owner@example.com:docusign"].accountId).toBe(FIXTURE_ROWS["owner@example.com:docusign"].accountId);

    // The report tells the truth about what it did.
    expect(run.report.plaintextFieldsBefore).toBe(EXPECTED_PLAINTEXT.length);
    expect(run.report.plaintextFieldsAfter).toBe(0);
    expect(run.report.verifiedFields).toBe(EXPECTED_PLAINTEXT.length);
    expect(run.report.changedRows).toBe(Object.keys(FIXTURE_ROWS).length);

    // A timestamped safety copy of the PRE-RUN bytes exists.
    expect(backups()).toHaveLength(1);
    expect(sha(readFileSync(join(dir, backups()[0])))).toBe(sha(before));
    expect(run.report.backupPath).toBe(join(dir, backups()[0]));
  });

  it("reports per row: provider, the field names it sealed, and the result", () => {
    const run = runScript();
    expect(run.status, why(run)).toBe(0);
    const rows: any[] = run.report.rows;
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    expect([...byProvider.keys()].sort()).toEqual(["docusign", "hubspot", "slack", "xero"]);
    expect(byProvider.get("slack")!.sealed).toEqual(["accessToken"]);
    expect(byProvider.get("hubspot")!.sealed.sort()).toEqual(["accessToken", "refreshToken"]);
    expect(byProvider.get("xero")!.sealed).toEqual(["clientSecret"]);
    expect(byProvider.get("docusign")!.sealed).toEqual(["apiToken"]);
    for (const row of rows) expect(row.result).toBe("sealed");
    // The report masks the account part of the row key.
    expect(rows.every((r) => !String(r.rowKeyMasked).startsWith("owner@"))).toBe(true);
  });

  it("never prints a token value or a token prefix", () => {
    const run = runScript({ json: false });
    expect(run.status, why(run)).toBe(0);
    const everything = run.stdout + run.stderr;
    for (const [, , plaintext] of EXPECTED_PLAINTEXT) {
      expect(everything.includes(plaintext), "a full token appeared in the output").toBe(false);
      expect(everything.includes(plaintext.slice(0, 12)), "a token prefix appeared in the output").toBe(false);
    }
    // The field NAMES are safe and useful, and must be there.
    expect(everything).toContain("accessToken");
    expect(everything).toContain("slack");
  });

  it("is idempotent: a second run reports zero changes and writes nothing", () => {
    const first = runScript();
    expect(first.status, why(first)).toBe(0);
    const afterFirst = rawBytes();
    const firstBackups = backups();

    const second = runScript();
    expect(second.status, why(second)).toBe(0);
    expect(second.report.ok).toBe(true);
    expect(second.report.changedRows).toBe(0);
    expect(second.report.plaintextFieldsBefore).toBe(0);
    expect(second.report.verifiedFields).toBe(0);

    // Byte-identical file, and no second safety copy was made.
    expect(sha(rawBytes())).toBe(sha(afterFirst));
    expect(backups()).toEqual(firstBackups);
  });

  it("does not re-encrypt a row that is already sealed", () => {
    // Pre-seal one row exactly as slice 177 would have written it.
    const seeded = { ...FIXTURE_ROWS };
    const sealedXero = encryptIntegrationSecret(FAKE.xeroClientSecret);
    seeded.xero = { ...FIXTURE_ROWS.xero, clientSecret: sealedXero };
    writeFileSync(credsPath(), JSON.stringify(seeded, null, 2));

    const run = runScript();
    expect(run.status, why(run)).toBe(0);

    // The pre-existing ciphertext must be byte-identical — not re-encrypted.
    expect(rawStore().xero.clientSecret).toBe(sealedXero);
    expect(decryptIntegrationSecret(rawStore().xero.clientSecret)).toBe(FAKE.xeroClientSecret);

    // The other rows were still sealed.
    expect(decryptIntegrationSecret(rawStore()["owner@example.com:slack"].accessToken)).toBe(FAKE.slackBot);
    const xeroRow = (run.report.rows as any[]).find((r) => r.provider === "xero");
    expect(xeroRow.alreadySealed).toEqual(["clientSecret"]);
    expect(xeroRow.sealed).toEqual([]);
    expect(xeroRow.result).toBe("unchanged");
  });

  it("refuses with no key and changes nothing at all", () => {
    const before = rawBytes();
    const run = runScript({ key: null });
    expect(run.status, why(run)).toBe(2);
    expect(run.report.refused).toBe(true);
    expect(run.report.refusal).toContain(KEY_ENV);
    // The store is byte-identical and NO safety copy was created: a refusal
    // must not write anything, anywhere.
    expect(sha(rawBytes())).toBe(sha(before));
    expect(backups()).toHaveLength(0);
  });

  it("refuses a key shorter than 32 characters and changes nothing", () => {
    const before = rawBytes();
    const run = runScript({ key: SHORT_KEY });
    expect(run.status, why(run)).toBe(2);
    expect(run.report.refused).toBe(true);
    expect(run.report.refusal).toContain(KEY_ENV);
    expect(sha(rawBytes())).toBe(sha(before));
    expect(backups()).toHaveLength(0);
  });

  it("dry run reports what would change and writes nothing", () => {
    const before = rawBytes();
    const run = runScript({ args: ["--dry-run"] });
    expect(run.status, why(run)).toBe(0);
    expect(run.report.dryRun).toBe(true);
    expect(run.report.changedRows).toBe(Object.keys(FIXTURE_ROWS).length);
    expect(sha(rawBytes())).toBe(sha(before));
    expect(backups()).toHaveLength(0);
  });

  it("fails loudly and touches nothing when the store does not parse", () => {
    const broken = Buffer.from("{ this is not json", "utf-8");
    writeFileSync(credsPath(), broken);
    const run = runScript();
    expect(run.status, why(run)).toBe(1);
    expect(run.report.ok).toBe(false);
    expect(JSON.stringify(run.report.errors)).toContain("does not parse");
    // A store we cannot read must never be overwritten.
    expect(sha(rawBytes())).toBe(sha(broken));
    expect(backups()).toHaveLength(0);
  });

  it("is a no-op when the store does not exist", () => {
    const empty = mkdtempSync(join(tmpdir(), `slice179-empty-${process.pid}-`));
    const run = runScript({ inDir: empty });
    expect(run.status, why(run)).toBe(0);
    expect(run.report.ok).toBe(true);
    expect(run.report.storeExisted).toBe(false);
    expect(run.report.changedRows).toBe(0);
    // Nothing was created in a directory that held no store.
    expect(readdirSync(empty)).toHaveLength(0);
  });
});
