import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";
import { buildConnectedAccountsFromCredentials } from "../lib/connected-accounts";
import { loadStoredCredential } from "../verification/credential-source";

/**
 * OAuth disconnect durable-removal regression (P0-live, 2026-08-19).
 *
 * #178 regression: POST /api/integrations/disconnect removed the connection only
 * from the legacy tenant_integrations.json. Since #178 the Connected Accounts
 * page reads the AUTHORITATIVE tenant_oauth_credentials.json (keyed
 * `${email}:${provider}`, filtered by accessToken presence), so "Disconnect"
 * returned success while the credential row (and the card) stayed — the owner
 * could not clear Xero to reconnect.
 *
 * This suite proves: disconnect removes the durable credential row (read back
 * through the real readers buildConnectedAccountsFromCredentials /
 * loadStoredCredential), also removes the legacy row, and FAILS CLOSED when a
 * connectionId for a DIFFERENT user's email is supplied (no cross-tenant
 * removal). Non-destructive: nothing outside the targeted rows is touched.
 */
const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const EMAIL = "disconnect-durable@example.test";
const OTHER_EMAIL = "other-tenant@example.test";
const TOKEN = `tok-disconnect-durable-${Date.now()}`;
const PROVIDER = "xero";
const KEY = () => `${EMAIL}:${PROVIDER}`;

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}
function writeJSONFile(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}
const credsFile = () => join(TEST_DATA_DIR, "tenant_oauth_credentials.json");
const legacyFile = () => join(TEST_DATA_DIR, "tenant_integrations.json");

function credRowExists(): boolean {
  const creds = readJSONFile(credsFile());
  return Boolean(creds[KEY()]);
}
function legacyRowExists(): boolean {
  const legacy = readJSONFile(legacyFile());
  const rows = legacy[EMAIL] || [];
  return rows.some((c: any) => c.id === KEY() || c.providerId === PROVIDER);
}

function seedFully(): void {
  const creds = readJSONFile(credsFile());
  creds[KEY()] = {
    email: EMAIL,
    provider: PROVIDER,
    accessToken: "at_disconnect_test",
    refreshToken: "rt_disconnect_test",
    expiresAt: 9_999_999_999,
    tokenType: "Bearer",
    scope: "accounting.transactions",
    updatedAt: "2026-08-19T00:00:00.000Z",
    connectedAt: "2026-08-19T00:00:00.000Z",
  };
  writeJSONFile(credsFile(), creds);

  const legacy = readJSONFile(legacyFile());
  legacy[EMAIL] = [
    {
      id: KEY(),
      providerId: PROVIDER,
      provider: "Xero",
      category: "Accounting",
      status: "Connected",
      connectedAt: "2026-08-19T00:00:00.000Z",
    },
  ];
  writeJSONFile(legacyFile(), legacy);
}

/** Seed a session for EMAIL and return the auth cookie value. */
function seedSession(): string {
  const usersFile = join(TEST_DATA_DIR, "users.json");
  const sessionsFile = join(TEST_DATA_DIR, "sessions.json");
  const users = readJSONFile(usersFile);
  users[EMAIL] = { email: EMAIL, role: "user", createdAt: Date.now() };
  writeJSONFile(usersFile, users);
  const sessions = readJSONFile(sessionsFile);
  sessions[TOKEN] = { email: EMAIL, createdAt: Date.now() };
  writeJSONFile(sessionsFile, sessions);
  return TOKEN;
}

async function authedDisconnect(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}/api/integrations/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session=${TOKEN}` },
    body: JSON.stringify(body),
  });
  let json: any;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** Remove only this run's traces (session/user/credential/legacy rows). */
function removeTestRecords(): void {
  for (const file of ["users.json", "sessions.json"]) {
    const path = join(TEST_DATA_DIR, file);
    const data = readJSONFile(path);
    let changed = false;
    for (const [k, v] of Object.entries(data)) {
      const email = typeof v === "string" ? v : (v as any)?.email;
      if (email === EMAIL || k === TOKEN) {
        delete data[k];
        changed = true;
      }
    }
    if (changed) writeJSONFile(path, data);
  }
  const creds = readJSONFile(credsFile());
  if (creds[KEY()]) {
    delete creds[KEY()];
    writeJSONFile(credsFile(), creds);
  }
  const legacy = readJSONFile(legacyFile());
  if (legacy[EMAIL]) {
    delete legacy[EMAIL];
    writeJSONFile(legacyFile(), legacy);
  }
}

describe("persistent-connect RETIRED (a2) — the disconnect surface is gone", () => {
  beforeAll(async () => {
    await ensureTestServer();
    if (!existsSync(TEST_DATA_DIR)) mkdirSync(TEST_DATA_DIR, { recursive: true });
    expect(seedSession()).toBeTruthy();
  });
  afterAll(() => {
    removeTestRecords();
  });

  it("POST /api/integrations/disconnect is fail-closed 404 for EVERY body — nothing is removed", async () => {
    seedFully();
    expect(credRowExists()).toBe(true);

    const res = await authedDisconnect({ providerId: PROVIDER });
    expect(res.status).toBe(404);

    // The retired endpoint can never mutate the durable store: real readers
    // still see the row exactly as seeded, and the legacy-era flat copy is
    // untouched as well.
    expect(credRowExists()).toBe(true);
    expect(legacyRowExists()).toBe(true);
    const accounts = await buildConnectedAccountsFromCredentials(EMAIL, TEST_DATA_DIR);
    expect(accounts.some((a: any) => a.provider === PROVIDER)).toBe(true);
    const hit = loadStoredCredential(PROVIDER, { tenant: EMAIL, dataDir: TEST_DATA_DIR });
    expect(hit.credential?.accessToken).toBe("at_disconnect_test");
  });

  it("cross-tenant attempts hit the SAME 404 — no path can remove another tenant's rows", async () => {
    seedFully();
    const res = await authedDisconnect({ connectionId: `${OTHER_EMAIL}:${PROVIDER}` });
    expect(res.status).toBe(404);
    expect(credRowExists()).toBe(true);
  });
});