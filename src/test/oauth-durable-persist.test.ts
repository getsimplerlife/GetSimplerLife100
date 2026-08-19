import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { persistOAuthTokenDurable } from "../api/integrationRoutes";
import { loadStoredCredential } from "../verification/credential-source";

/**
 * OAuth callback durable-persist regression suite (P1, 2026-08-19).
 *
 * Guards the #230 "never silently lost" reliability pillar against the
 * reconnect-dropped-token defect: before this fix, the OAuth connect callback
 * wrote the exchanged token ONLY to the legacy LibSQL `integrations` table
 * (keyed on TEAM_DB_URL, which is unset in repo and live env). None of the
 * readers that actually power the product — Connected Accounts, health, and
 * the verification CLI (credential-source.ts) — read that table, so every
 * reconnect reported "Connected!" while its token vanished from the
 * authoritative `tenant_oauth_credentials.json` store (the owner's three Xero
 * reconnects on 08-19 all dropped theirs).
 *
 * The fix: `persistOAuthTokenDurable()` is called by handleOAuthCallback BEFORE
 * "Connected!" is returned, and writes into tenant_oauth_credentials.json keyed
 * `${email}:${provider}` (via the durable store writer + durableFlush()). These
 * tests drive that helper and prove the durable row is readable back through
 * credential-source.ts (the app's real reader), not the libsql table.
 */
const EMAIL = "durable-test@example.com";
const PROVIDER = "durable-test-provider";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "oauth-durable-persist-"));
  process.env.DATA_DIR = dataDir;
});

afterEach(() => {
  delete process.env.DATA_DIR;
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe("OAuth callback durable-persist (P1 reconnect no longer silently loses tokens)", () => {
  it("persists the exchanged token into tenant_oauth_credentials.json keyed email:provider", async () => {
    const { key } = await persistOAuthTokenDurable(EMAIL, PROVIDER, {
      accessToken: "at_123",
      refreshToken: "rt_456",
      expiresAt: 9_999_999_999,
      scope: "accounting.transactions",
      tokenType: "Bearer",
    });
    expect(key).toBe(`${EMAIL}:${PROVIDER}`);

    const file = join(dataDir, "tenant_oauth_credentials.json");
    expect(existsSync(file)).toBe(true);
    const stored = JSON.parse(readFileSync(file, "utf8"));
    expect(stored[key]).toBeDefined();
    expect(stored[key].accessToken).toBe("at_123");
    expect(stored[key].refreshToken).toBe("rt_456");
    expect(stored[key].provider).toBe(PROVIDER);
    expect(stored[key].email).toBe(EMAIL);
    expect(stored[key].scope).toBe("accounting.transactions");
    expect(stored[key].tokenType).toBe("Bearer");
    expect(typeof stored[key].updatedAt).toBe("string");
    expect(typeof stored[key].connectedAt).toBe("string");
  });

  it("durable row is readable back through credential-source.ts (the app's real reader), not libsql", async () => {
    await persistOAuthTokenDurable(EMAIL, PROVIDER, {
      accessToken: "at_readback",
      refreshToken: "rt_z",
      expiresAt: 9_999_999_999,
      scope: "openid",
    });

    const hit = loadStoredCredential(PROVIDER, { tenant: EMAIL, dataDir });
    expect(hit.credential).toBeDefined();
    expect(hit.credential!.accessToken).toBe("at_readback");
    expect(hit.source).toContain("tenant_oauth_credentials.json");
  });

  it("preserves existing scope/refreshToken when the new exchange omits them", async () => {
    await persistOAuthTokenDurable(EMAIL, PROVIDER, {
      accessToken: "at_1",
      refreshToken: "rt_keep",
      scope: "keep.scope",
    });
    await persistOAuthTokenDurable(EMAIL, PROVIDER, { accessToken: "at_2" });

    const hit = loadStoredCredential(PROVIDER, { tenant: EMAIL, dataDir });
    expect(hit.credential!.accessToken).toBe("at_2");
    expect(hit.credential!.refreshToken).toBe("rt_keep");
    expect(hit.credential!.scope).toBe("keep.scope");
  });

  it("fails closed when the exchange yields no access token", async () => {
    await expect(
      persistOAuthTokenDurable(EMAIL, PROVIDER, { refreshToken: "rt" }),
    ).rejects.toThrow(/no access token/);
    expect(existsSync(join(dataDir, "tenant_oauth_credentials.json"))).toBe(false);
  });
});
