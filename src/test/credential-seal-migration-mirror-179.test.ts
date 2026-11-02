/**
 * SLICE 179 — the durable mirror must be sealed too.
 *
 * `tenant_oauth_credentials.json` is not only a file: `writeJSON` mirrors the
 * same document into the durable store (Postgres `kv_store`), and the hourly
 * backup copies the file off-box. The goal is that NO copy we keep still holds
 * a plaintext token, so the one-time migration has to reach the mirror as well.
 *
 * It does, by construction: the migration writes through `writeJSON`, which
 * seals (slice 177) and only then mirrors and writes the file — one document,
 * one set of sealed bytes. These tests prove it against a real in-memory
 * durable store rather than trusting the ordering.
 *
 * Expected values come from the system of record: ciphertext is decrypted with
 * `integration-crypto` and compared with the plaintext the fixture wrote.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptIntegrationSecret } from "../lib/integration-crypto";
import {
  durableClose,
  durableFlush,
  durableGet,
  initDurableStore,
  MemoryKvDriver,
} from "../lib/durable-store";
import { sealPlaintextCredentials } from "../lib/credential-store-seal-migration";

const KEY_ENV = "INTEGRATION_ENCRYPTION_KEY";
const TEST_KEY = "slice179-mirror-test-only-key-0123456789";
const CREDS = "tenant_oauth_credentials.json";

const FAKE = {
  slack: "xoxb-0000-FAKE-MIRROR-SLACK-TOKEN-DO-NOT-STORE-IN-CLEAR",
  hubspotAccess: "FAKE-MIRROR-hubspot-access-DO-NOT-STORE-IN-CLEAR",
  hubspotRefresh: "FAKE-MIRROR-hubspot-refresh-DO-NOT-STORE-IN-CLEAR",
  oneDrive: "FAKE-MIRROR-onedrive-access-DO-NOT-STORE-IN-CLEAR",
} as const;

/** Two rows on disk. */
const FILE_ROWS: Record<string, any> = {
  "owner@example.com:slack": { provider: "slack", accessToken: FAKE.slack, teamId: "T0FAKE" },
  "owner@example.com:hubspot": {
    provider: "hubspot",
    accessToken: FAKE.hubspotAccess,
    refreshToken: FAKE.hubspotRefresh,
    expiresAt: 1793000000000,
  },
};

/** The mirror holds a third row the local file has never seen. */
const MIRROR_ROWS: Record<string, any> = {
  ...FILE_ROWS,
  "owner@example.com:onedrive": { provider: "onedrive", accessToken: FAKE.oneDrive, driveId: "drive-1" },
};

let dir: string;
let savedKey: string | undefined;

const credsPath = () => join(dir, CREDS);
const diskStore = () => JSON.parse(readFileSync(credsPath(), "utf-8")) as Record<string, any>;

beforeEach(() => {
  savedKey = process.env[KEY_ENV];
  process.env[KEY_ENV] = TEST_KEY;
  dir = mkdtempSync(join(tmpdir(), `slice179-mirror-${process.pid}-`));
  writeFileSync(credsPath(), JSON.stringify(FILE_ROWS, null, 2));
});

afterEach(async () => {
  if (savedKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = savedKey;
  await durableClose();
});

describe("slice 179 — the durable mirror is sealed too", () => {
  it("seals the mirror document, not just the file", async () => {
    const driver = new MemoryKvDriver({ [CREDS]: JSON.stringify(MIRROR_ROWS) });
    await initDurableStore(dir, driver);

    const report = await sealPlaintextCredentials({ dataDir: dir });
    expect(report.ok, report.errors.join("; ")).toBe(true);
    expect(report.mirror.enabled).toBe(true);
    expect(report.mirror.plaintextSecretsAfter).toBe(0);
    // Every plaintext secret in the file rows round-trips in the mirror
    // (slack.accessToken, hubspot.accessToken, hubspot.refreshToken).
    expect(report.mirror.roundTripped).toBe(3);
    // The row only the mirror knew about was carried forward, never dropped.
    expect(report.mirror.rowsCarriedFromMirror).toBe(1);

    await durableFlush();
    const mirror = durableGet(CREDS) as Record<string, any>;
    expect(mirror).toBeTruthy();
    for (const [rowKey, field, plaintext] of [
      ["owner@example.com:slack", "accessToken", FAKE.slack],
      ["owner@example.com:hubspot", "accessToken", FAKE.hubspotAccess],
      ["owner@example.com:hubspot", "refreshToken", FAKE.hubspotRefresh],
      ["owner@example.com:onedrive", "accessToken", FAKE.oneDrive],
    ] as const) {
      const stored = mirror[rowKey]?.[field];
      expect(typeof stored, `${rowKey}.${field} missing from the mirror`).toBe("string");
      expect(stored).not.toBe(plaintext);
      expect(decryptIntegrationSecret(stored)).toBe(plaintext);
    }
    // No plaintext token text survives anywhere in the mirror document.
    const mirrorText = JSON.stringify(mirror);
    for (const value of Object.values(FAKE)) expect(mirrorText.includes(value)).toBe(false);

    // The carried row reached the file as well, sealed.
    expect(decryptIntegrationSecret(diskStore()["owner@example.com:onedrive"].accessToken)).toBe(FAKE.oneDrive);
  });

  it("still writes when only the mirror holds plaintext", async () => {
    // File already fully sealed (as if slice 177 had rewritten it); the mirror
    // is a stale plaintext copy. The migration must fix the mirror anyway.
    const sealedFile = {
      "owner@example.com:slack": {
        provider: "slack",
        accessToken: (await import("../lib/integration-crypto")).encryptIntegrationSecret(FAKE.slack),
        teamId: "T0FAKE",
      },
    };
    writeFileSync(credsPath(), JSON.stringify(sealedFile, null, 2));
    const driver = new MemoryKvDriver({ [CREDS]: JSON.stringify(MIRROR_ROWS) });
    await initDurableStore(dir, driver);

    const report = await sealPlaintextCredentials({ dataDir: dir });
    expect(report.ok, report.errors.join("; ")).toBe(true);
    expect(report.plaintextFieldsBefore).toBe(0); // nothing to do in the FILE
    expect(report.mirror.plaintextSecretsAfter).toBe(0); // but the mirror was fixed

    await durableFlush();
    const mirrorText = JSON.stringify(durableGet(CREDS));
    for (const value of Object.values(FAKE)) expect(mirrorText.includes(value)).toBe(false);
  });
});
