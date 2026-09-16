import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initDurableStore, durableClose, MemoryKvDriver } from "../lib/durable-store";
import { mergeDurableCredential } from "../lib/data-store";
import { refreshOneCredential } from "../lib/token-refresher";

/**
 * P0 #235 merge-on-write — regression suite (2026-08-19).
 *
 * The credential store (tenant_oauth_credentials.json) is a single JSON object
 * keyed `${email}:${provider}`, and whole-object writes of a caller's in-memory
 * snapshot are DESTRUCTIVE: a writer whose snapshot predates another instance's
 * fresh row silently erases that row. That wipe is exactly what kept removing
 * the owner's freshly-reconnected Xero token from Neon after it verified healthy
 * (reconnect at 18:46Z, row gone from the durable store by ~19:56).
 *
 * Every writer must now go through mergeDurableCredential (read live → mutate
 * exactly the intended key(s) → write → flush). These tests simulate the
 * dangerous interleaving: durable store holds {A,B}, but the writer's snapshot
 * only contains A — the writer refreshes A and the store must STILL contain B.
 */
const KEY_A = "owner@example.com:xero";
const KEY_B = "tenant2@example.com:xero";
const KEY_C = "tenant3@example.com:slack";

let tmpBase: string;
let now: number;
const originalFetch = globalThis.fetch;

beforeAll(() => {
  tmpBase = mkdtempSync(join(tmpdir(), "sl-merge-ow-"));
  now = Date.now();
});
afterAll(async () => {
  await durableClose();
  globalThis.fetch = originalFetch;
  try { rmSync(tmpBase, { recursive: true, force: true }); } catch { /* best effort */ }
});
afterEach(async () => {
  globalThis.fetch = originalFetch;
  await durableClose();
});

function tokenEntry(email: string, provider: string, over: Record<string, any> = {}): Record<string, any> {
  return {
    email,
    provider,
    accessToken: `at-${provider}-${Math.random().toString(36).slice(2, 6)}`,
    refreshToken: `rt-${provider}`,
    expiresAt: over.expiresAt ?? Math.floor((now - 30_000) / 1000), // expired → refresh due
    scope: "offline_access",
    tokenType: "Bearer",
    updatedAt: new Date(now - 60_000).toISOString(),
    ...over,
  };
}

/** Boot a durable store whose kv_store ALREADY contains {A,B} (+ app creds). */
async function bootWithAB(dir: string): Promise<MemoryKvDriver> {
  await durableClose();
  mkdirSync(dir, { recursive: true });
  const driver = new MemoryKvDriver({
    "tenant_oauth_credentials.json": {
      [KEY_A]: tokenEntry("owner@example.com", "xero"),
      [KEY_B]: tokenEntry("tenant2@example.com", "xero"),
      xero: { clientId: "client-id", clientSecret: "client-secret" }, // OAuth app creds
    },
  });
  const r = await initDurableStore(dir, driver);
  expect(r.enabled).toBe(true);
  return driver;
}

function credsDb(driver: MemoryKvDriver): Record<string, any> {
  return driver.dump()["tenant_oauth_credentials.json"];
}

describe("#235 merge-on-write — sibling rows survive a stale writer", () => {
  it("(a) refresher with a stale {A}-only snapshot refreshes A but KEEPS B", async () => {
    const dir = join(tmpBase, `a-${Math.random().toString(36).slice(2, 8)}`);
    const driver = await bootWithAB(dir);
    const beforeB = JSON.stringify(credsDb(driver)[KEY_B]);

    // Danger scenario reproduced exactly: the writer's snapshot was taken
    // BEFORE tenant2's row existed — it only knows A (+ app creds), missing B.
    const staleSnapshot: Record<string, any> = {
      [KEY_A]: credsDb(driver)[KEY_A],
      xero: { clientId: "client-id", clientSecret: "client-secret" },
    };
    expect(staleSnapshot[KEY_B]).toBeUndefined(); // the whole point

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ access_token: "fresh-access-A", refresh_token: "fresh-refresh-A", expires_in: 3600, scope: "offline_access" }),
    }) as unknown as Response) as unknown as typeof fetch;

    const out = await refreshOneCredential(dir, staleSnapshot, {}, KEY_A, { now });

    expect(out.refreshed).toBe(true);
    const after = credsDb(driver);
    // A updated...
    expect(after[KEY_A].accessToken).toBe("fresh-access-A");
    // ...and B was NOT wiped (the pre-fix full-snapshot write would have).
    expect(after[KEY_B]).toBeDefined();
    expect(JSON.stringify(after[KEY_B])).toBe(beforeB);
    // App creds also survive.
    expect(after.xero.clientId).toBe("client-id");
    // The refreshed value is also in the LOCAL file (writeJSON mirror).
    const file = JSON.parse(readFileSync(join(dir, "tenant_oauth_credentials.json"), "utf8"));
    expect(file[KEY_B]).toBeDefined();
    expect(file[KEY_A].accessToken).toBe("fresh-access-A");
  });

  it("(b) helper delete removes only B — A stays", async () => {
    const dir = join(tmpBase, `b-${Math.random().toString(36).slice(2, 8)}`);
    const driver = await bootWithAB(dir);
    const file = join(dir, "tenant_oauth_credentials.json");

    await mergeDurableCredential(file, [{ type: "delete", key: KEY_B }]);

    const after = credsDb(driver);
    expect(after[KEY_B]).toBeUndefined();
    expect(after[KEY_A]).toBeDefined();
    expect(after.xero).toBeDefined();
  });

  it("(c) helper set adds C — A and B remain", async () => {
    const dir = join(tmpBase, `c-${Math.random().toString(36).slice(2, 8)}`);
    const driver = await bootWithAB(dir);
    const file = join(dir, "tenant_oauth_credentials.json");

    await mergeDurableCredential(file, [{ type: "set", key: KEY_C, value: tokenEntry("tenant3@example.com", "slack") }]);

    const after = credsDb(driver);
    expect(after[KEY_C]).toBeDefined();
    expect(after[KEY_A]).toBeDefined();
    expect(after[KEY_B]).toBeDefined();
  });

  it("(d) a stale writer cannot delete a NEWER key when persisting its own change", async () => {
    const dir = join(tmpBase, `d-${Math.random().toString(36).slice(2, 8)}`);
    const driver = await bootWithAB(dir);
    // A NEWER row (C) lands in the store AFTER this writer's snapshot was read.
    await mergeDurableCredential(join(dir, "tenant_oauth_credentials.json"), [
      { type: "set", key: KEY_C, value: tokenEntry("tenant3@example.com", "slack") },
    ]);
    const beforeC = JSON.stringify(credsDb(driver)[KEY_C]);

    // The stale writer refreshes A with a snapshot that knows {A} only.
    const staleSnapshot: Record<string, any> = {
      [KEY_A]: credsDb(driver)[KEY_A],
      xero: { clientId: "client-id", clientSecret: "client-secret" },
    };
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ access_token: "fresh-access-A2", refresh_token: "fresh-refresh-A2", expires_in: 3600, scope: "offline_access" }),
    }) as unknown as Response) as unknown as typeof fetch;

    const out = await refreshOneCredential(dir, staleSnapshot, {}, KEY_A, { now });

    expect(out.refreshed).toBe(true);
    const after = credsDb(driver);
    // C (added after this writer's snapshot) is untouched — never deleted.
    expect(after[KEY_C]).toBeDefined();
    expect(JSON.stringify(after[KEY_C])).toBe(beforeC);
    expect(after[KEY_A].accessToken).toBe("fresh-access-A2");
    expect(after[KEY_B]).toBeDefined();
  });

  it("fail-closed: refuses to overwrite when the store is not a plain object", async () => {
    const dir = join(tmpBase, `fc-${Math.random().toString(36).slice(2, 8)}`);
    await durableClose();
    mkdirSync(dir, { recursive: true });
    const driver = new MemoryKvDriver({ "tenant_oauth_credentials.json": {} });
    await initDurableStore(dir, driver);
    const file = join(dir, "tenant_oauth_credentials.json");
    // Inject a corrupt (array) value directly into the kv_store AFTER boot —
    // the boot repair normalizes primitive-shaped rows, so simulate a value
    // that became corrupt at runtime.
    await driver.unsafe(
      "UPDATE kv_store SET value = $2 WHERE key = $1",
      ["tenant_oauth_credentials.json", JSON.stringify(["corrupt", "array", "payload"])],
    );

    await expect(
      mergeDurableCredential(file, [{ type: "set", key: KEY_A, value: tokenEntry("owner@example.com", "xero") }]),
    ).rejects.toThrow(/not a plain object/);

    // Store untouched: the corrupt array is still there, no partial write.
    const after = driver.dump()["tenant_oauth_credentials.json"];
    expect(Array.isArray(after)).toBe(true);
  });
});

/**
 * Compatibility guard for local file writes used by the existing suites:
 * fresh dir + durable disabled → writeJSON-equivalent behavior (file path).
 */
describe("#235 helper with durable disabled (plain file)", () => {
  it("set + delete behave on the local file when no durable store is enabled", async () => {
    const dir = join(tmpBase, `plain-${Math.random().toString(36).slice(2, 8)}`);
    await durableClose();
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "tenant_oauth_credentials.json");
    writeFileSync(file, JSON.stringify({ [KEY_A]: tokenEntry("owner@example.com", "xero") }));

    await mergeDurableCredential(file, [{ type: "set", key: KEY_C, value: tokenEntry("tenant3@example.com", "slack") }]);
    let data = JSON.parse(readFileSync(file, "utf8"));
    expect(data[KEY_C]).toBeDefined();
    expect(data[KEY_A]).toBeDefined();

    await mergeDurableCredential(file, [{ type: "delete", key: KEY_A }]);
    data = JSON.parse(readFileSync(file, "utf8"));
    expect(data[KEY_A]).toBeUndefined();
    expect(data[KEY_C]).toBeDefined();
  });
});