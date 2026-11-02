/**
 * SLICE 177 — `tenant_oauth_credentials.json` must not hold a readable secret.
 *
 * THE DEFECT (Sweep C5, MEDIUM, confirmed at source at b0b096e):
 *   - `prod-server.ts` PUT `/api/admin/credentials/<provider>` persisted the
 *     OAuth **client secret** entered on Admin → OAuth Settings verbatim
 *     (`mergeDurableCredential(..., { clientId, clientSecret })`), and
 *     `getOAuthCredentials()` read it straight back.
 *   - The OAuth callback (`prod-server.ts`) and the token refresher persisted
 *     per-tenant `accessToken` / `refreshToken` verbatim under `${email}:${provider}`.
 *   `prod-server.ts` contained ZERO calls to `encryptIntegrationSecret`.
 *
 * HOW THESE TESTS AVOID BLESSING THE BUG (lead rule, 2026-11-02)
 * --------------------------------------------------------------
 * Every expected value is derived from the SYSTEM OF RECORD — the ciphertext is
 * decrypted with `integration-crypto` (the module that defines the format) and
 * compared with the secret that was handed in. Nothing here asserts a literal
 * that the component also supplies. That is what lets these tests fail at
 * b0b096e: there the file holds the secret as typed, so "the bytes on disk do
 * not contain the secret" is false and "decrypting the stored value yields the
 * secret" throws.
 *
 * This file deliberately does NOT import `src/lib/oauth-credential-store.ts`, so
 * it compiles and RUNS against b0b096e instead of dying at import resolution —
 * the pre-fix failure has to be a real assertion failure.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJSON, writeJSON, mergeDurableCredential } from "../lib/data-store";
import { decryptIntegrationSecret } from "../lib/integration-crypto";
import { initDurableStore, durableClose, durableFlush, MemoryKvDriver } from "../lib/durable-store";

const KEY_ENV = "INTEGRATION_ENCRYPTION_KEY";
const CREDS_BASENAME = "tenant_oauth_credentials.json";
const TENANT_KEY = "owner@example.com:xero";
const APP_KEY = "xero";
const CLIENT_SECRET = "xero-app-client-secret-DO-NOT-STORE-IN-CLEAR";
const ACCESS_TOKEN = "xero-access-token-DO-NOT-STORE-IN-CLEAR";
const REFRESH_TOKEN = "xero-refresh-token-DO-NOT-STORE-IN-CLEAR";

let savedKey: string | undefined;
let dir: string;
const credsFile = () => join(dir, CREDS_BASENAME);
const rawStore = () => JSON.parse(readFileSync(credsFile(), "utf8")) as Record<string, any>;

beforeEach(() => {
  savedKey = process.env[KEY_ENV];
  // A real deployment must configure this; the suite's setup.ts already sets a
  // test-only value. Pin it here so the tests do not depend on suite ordering.
  process.env[KEY_ENV] = "slice177-test-only-integration-key-0123456789";
  dir = mkdtempSync(join(tmpdir(), `slice177-creds-${process.pid}-`));
});

afterEach(async () => {
  if (savedKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = savedKey;
  await durableClose();
});

/** The store an admin save + an OAuth connect would leave behind. */
function sampleStore() {
  return {
    [APP_KEY]: { clientId: "xero-client-id", clientSecret: CLIENT_SECRET },
    [TENANT_KEY]: {
      provider: "xero",
      email: "owner@example.com",
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      expiresAt: Math.floor(Date.now() / 1000) + 1800,
      scope: "accounting.transactions offline_access",
    },
  };
}

describe("SLICE 177 — the admin OAuth client secret is sealed at rest", () => {
  it("stores the client secret as ciphertext, not the string that was typed", async () => {
    // The exact call the PUT /api/admin/credentials/<provider> route makes.
    await mergeDurableCredential(credsFile(), [
      { type: "set", key: APP_KEY, value: { clientId: "xero-client-id", clientSecret: CLIENT_SECRET } },
    ]);

    const onDisk = readFileSync(credsFile(), "utf8");
    // 1. The typed secret is not in the file. (At b0b096e it is.)
    expect(onDisk).not.toContain(CLIENT_SECRET);
    // 2. What IS stored decrypts back to the typed secret under the system of
    //    record for this format — `integration-crypto`.
    const stored = rawStore()[APP_KEY].clientSecret as string;
    expect(stored).not.toBe(CLIENT_SECRET);
    expect(decryptIntegrationSecret(stored)).toBe(CLIENT_SECRET);
    // 3. The non-secret half of the row stays readable (diagnosable without the key).
    expect(rawStore()[APP_KEY].clientId).toBe("xero-client-id");
  });

  it("still hands the plaintext secret back to the code that drives the OAuth exchange", async () => {
    await mergeDurableCredential(credsFile(), [
      { type: "set", key: APP_KEY, value: { clientId: "xero-client-id", clientSecret: CLIENT_SECRET } },
    ]);
    // `getOAuthCredentials()` reads the store through readJSON; a sealed-at-rest
    // store that cannot be read back would break every connect flow.
    const readBack = readJSON(credsFile())[APP_KEY];
    expect(readBack.clientSecret).toBe(CLIENT_SECRET);
    expect(readBack.clientId).toBe("xero-client-id");
  });
});

describe("SLICE 177 — the per-tenant token rows are sealed at rest", () => {
  it("seals accessToken and refreshToken and reads them back unchanged", async () => {
    await mergeDurableCredential(credsFile(), [{ type: "set", key: TENANT_KEY, value: sampleStore()[TENANT_KEY] }]);

    const onDisk = readFileSync(credsFile(), "utf8");
    expect(onDisk).not.toContain(ACCESS_TOKEN);
    expect(onDisk).not.toContain(REFRESH_TOKEN);

    const storedRow = rawStore()[TENANT_KEY];
    expect(decryptIntegrationSecret(storedRow.accessToken)).toBe(ACCESS_TOKEN);
    expect(decryptIntegrationSecret(storedRow.refreshToken)).toBe(REFRESH_TOKEN);
    // Non-secret metadata is untouched, so connection health stays diagnosable.
    expect(storedRow.provider).toBe("xero");
    expect(storedRow.expiresAt).toBe(sampleStore()[TENANT_KEY].expiresAt);

    const readBack = readJSON(credsFile())[TENANT_KEY];
    expect(readBack.accessToken).toBe(ACCESS_TOKEN);
    expect(readBack.refreshToken).toBe(REFRESH_TOKEN);
  });

  it("mirrors the SEALED document into the durable store (the copy that survives a publish)", async () => {
    const driver = new MemoryKvDriver({});
    await initDurableStore(dir, driver);
    writeJSON(credsFile(), sampleStore());
    // durableSet queues; the mirror is only readable after a flush.
    await durableFlush();

    const mirrored = driver.dump()[CREDS_BASENAME] as Record<string, any>;
    expect(mirrored, "the durable mirror must contain the credential store").toBeTruthy();
    expect(JSON.stringify(mirrored)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(mirrored)).not.toContain(REFRESH_TOKEN);
    expect(JSON.stringify(mirrored)).not.toContain(CLIENT_SECRET);
    expect(decryptIntegrationSecret(mirrored[TENANT_KEY].refreshToken)).toBe(REFRESH_TOKEN);
  });
});

describe("SLICE 177 — no data loss for secrets stored before this slice", () => {
  it("reads a pre-existing PLAINTEXT value exactly as it was written", () => {
    // Exactly what b0b096e left on disk.
    writeFileSync(
      credsFile(),
      JSON.stringify(
        {
          [APP_KEY]: { clientId: "legacy-client-id", clientSecret: "legacy-plaintext-secret" },
          [TENANT_KEY]: { provider: "xero", accessToken: "legacy-access", refreshToken: "legacy-refresh" },
        },
        null,
        2,
      ),
    );

    const store = readJSON(credsFile());
    expect(store[APP_KEY].clientSecret).toBe("legacy-plaintext-secret");
    expect(store[TENANT_KEY].accessToken).toBe("legacy-access");
    expect(store[TENANT_KEY].refreshToken).toBe("legacy-refresh");
  });

  it("upgrades a legacy plaintext row to ciphertext on the next write, without losing it", async () => {
    writeFileSync(
      credsFile(),
      JSON.stringify({ [APP_KEY]: { clientId: "legacy-client-id", clientSecret: "legacy-plaintext-secret" } }, null, 2),
    );

    // A reconnect writes a token row — the legacy client secret must survive it.
    await mergeDurableCredential(credsFile(), [
      { type: "set", key: TENANT_KEY, value: { provider: "xero", accessToken: ACCESS_TOKEN } },
    ]);

    const onDisk = readFileSync(credsFile(), "utf8");
    expect(onDisk).not.toContain("legacy-plaintext-secret");
    expect(decryptIntegrationSecret(rawStore()[APP_KEY].clientSecret)).toBe("legacy-plaintext-secret");
    expect(readJSON(credsFile())[APP_KEY].clientSecret).toBe("legacy-plaintext-secret");
  });

  it("never double-encrypts a value that is already sealed", () => {
    writeJSON(credsFile(), sampleStore());
    const first = rawStore();
    // A writer that persists an already-sealed document (e.g. a merge that read
    // the raw durable row) must not encrypt the ciphertext again.
    writeJSON(credsFile(), JSON.parse(JSON.stringify(first)));
    const second = rawStore();
    expect(second[TENANT_KEY].accessToken).toBe(first[TENANT_KEY].accessToken);
    expect(decryptIntegrationSecret(second[TENANT_KEY].accessToken)).toBe(ACCESS_TOKEN);
  });
});

describe("SLICE 177 — fail closed: never write a plaintext secret", () => {
  it("refuses the admin save when INTEGRATION_ENCRYPTION_KEY is unset, naming the variable", async () => {
    delete process.env[KEY_ENV];
    await expect(
      mergeDurableCredential(credsFile(), [
        { type: "set", key: APP_KEY, value: { clientId: "xero-client-id", clientSecret: CLIENT_SECRET } },
      ]),
    ).rejects.toThrow(/INTEGRATION_ENCRYPTION_KEY/);
    // Nothing was stored: no file, no plaintext secret on disk.
    let contents = "";
    try {
      contents = readFileSync(credsFile(), "utf8");
    } catch {
      contents = "";
    }
    expect(contents).not.toContain(CLIENT_SECRET);
  });

  it("refuses a token write when the key is shorter than 32 characters", async () => {
    process.env[KEY_ENV] = "too-short-key";
    await expect(
      mergeDurableCredential(credsFile(), [{ type: "set", key: TENANT_KEY, value: { accessToken: ACCESS_TOKEN } }]),
    ).rejects.toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it("leaves an existing store byte-identical when a write is refused", async () => {
    writeJSON(credsFile(), sampleStore());
    const before = readFileSync(credsFile(), "utf8");
    delete process.env[KEY_ENV];
    await expect(
      mergeDurableCredential(credsFile(), [{ type: "set", key: "other@example.com:xero", value: { accessToken: "new" } }]),
    ).rejects.toThrow(/INTEGRATION_ENCRYPTION_KEY/);
    expect(readFileSync(credsFile(), "utf8")).toBe(before);
  });

  it("still writes a store that holds no secret, so a missing key blocks nothing else", () => {
    delete process.env[KEY_ENV];
    expect(() => writeJSON(credsFile(), {})).not.toThrow();
    expect(readFileSync(credsFile(), "utf8").trim()).toBe("{}");
  });
});
