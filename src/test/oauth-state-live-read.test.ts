/**
 * oauth-state-live-read.test.ts — #232 regression tests.
 *
 * Live incident: the owner reconnected Xero, the authorize step wrote the
 * CSRF state to Neon (kv_store), but the callback could not find it and the
 * reconnect never completed. Root cause: durable reads hit a per-process
 * boot-hydrated in-memory cache (`durableGet`), never the live DB. When the
 * public site is served by more than one instance, instance A writes the
 * state (authorize) and instance B (callback) misses it in its own cache AND
 * its own local file — even though Neon has it.
 *
 * Fix under test:
 *  1. `durableGetLive(key)` — direct DB read bypassing the cache.
 *  2. `readJSONLive(path)` — live durable read with cache/file fallback.
 *  3. `applyHealthToConnections` — stale "Connected" rows are overridden by
 *     live connection-health status so the owner UI never lies.
 */
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  initDurableStore, durableClose, durableSet, durableFlush, durableGet,
  durableGetLive, MemoryKvDriver,
} from "../lib/durable-store";
import { readJSON, readJSONLive, writeJSON } from "../lib/data-store";
import { applyHealthToConnections } from "../lib/connection-health";

let tmpDir: string;
try { tmpDir = mkdtempSync(join(tmpdir(), "sl-oauth-live-")); } catch { tmpDir = "/tmp/sl-oauth-live"; }
mkdirSync(tmpDir, { recursive: true });

afterAll(async () => {
  await durableClose();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("#232 live durable read (cross-instance OAuth state)", () => {
  it("durableGetLive sees a value another instance wrote to the shared DB (stale cache misses it)", async () => {
    await durableClose();
    // ONE shared driver = the shared Neon database. This process = instance B
    // whose cache was boot-hydrated BEFORE instance A's authorize write.
    const sharedDb = new MemoryKvDriver({});
    await initDurableStore(tmpDir, sharedDb);
    expect(durableGet("oauth_states.json")).toBeUndefined(); // B's cache: no state

    // Instance A writes the state to the shared DB (bypassing B's cache —
    // exactly how a separate process's write lands in Neon).
    await sharedDb.unsafe(
      `INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["oauth_states.json", JSON.stringify({ "state-zzz": { provider: "xero", email: "owner@x.com", createdAt: Date.now() } })],
    );

    // B's cache is STILL stale — plain readJSON (old callback path) misses it.
    expect(durableGet("oauth_states.json")).toBeUndefined();
    expect(readJSON(join(tmpDir, "oauth_states.json"))).toEqual({});

    // The LIVE read (new callback path) finds the other instance's write.
    const live = await durableGetLive("oauth_states.json");
    expect(live).toHaveProperty("state-zzz");
  });

  it("readJSONLive prefers the live durable store over the stale local mirror", async () => {
    await durableClose();
    const sharedDb = new MemoryKvDriver({});
    await initDurableStore(tmpDir, sharedDb);
    const statesFile = join(tmpDir, "oauth_states.json");

    // Local file has an OLD mirror (pre-reconnect), durable DB has the NEW state
    // (authorize on another instance) — the exact live stale-mirror scenario.
    writeFileSync(statesFile, JSON.stringify({ "old-state": { provider: "xero", createdAt: 1 } }));
    await sharedDb.unsafe(
      `INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["oauth_states.json", JSON.stringify({ "new-state": { provider: "xero", email: "owner@x.com", createdAt: Date.now() } })],
    );
    expect(readJSON(statesFile)).toHaveProperty("old-state");
    expect(readJSON(statesFile)).not.toHaveProperty("new-state");
    const liveStates = await readJSONLive(statesFile);
    expect(liveStates).toHaveProperty("new-state");
  });

  it("readJSONLive falls back to the file when the durable store is disabled", async () => {
    await durableClose();
    const file = join(tmpDir, "oauth_states.json");
    writeFileSync(file, JSON.stringify({ "file-state": { provider: "xero", createdAt: Date.now() } }));
    const states = await readJSONLive(file);
    expect(states).toHaveProperty("file-state");
  });
});

describe("#232 authorize → callback visibility (same shared DB, live reads)", () => {
  it("writeJSON + durableFlush makes the state visible to readJSONLive on a shared DB", async () => {
    await durableClose();
    const sharedDb = new MemoryKvDriver({});
    await initDurableStore(tmpDir, sharedDb);
    const statesFile = join(tmpDir, "oauth_states.json");
    // Authorize: write + flush (the fix — state is durable before redirect).
    writeJSON(statesFile, { "state-w1": { provider: "xero", email: "owner@x.com", createdAt: Date.now() } });
    await durableFlush();
    // Callback (this process): live read finds it immediately.
    const live = await readJSONLive(statesFile);
    expect(live).toHaveProperty("state-w1");
  });
});

describe("#232 applyHealthToConnections — stale \"Connected\" never shown", () => {
  it("overrides a stale Connected row with reconnect_required", () => {
    const conns = [{ id: "int-1", providerId: "xero", status: "Connected" }];
    const health = [{ provider: "xero", email: "owner@x.com", status: "reconnect_required", lastError: "consumed grant", consecutiveFailures: 3 }];
    const out = applyHealthToConnections(conns, health, "owner@x.com");
    expect(out[0].status).toBe("Reconnect Required");
    expect(out[0].healthStatus).toBe("reconnect_required");
  });

  it("overrides a stale Connected row with degraded", () => {
    const conns = [{ id: "int-1", providerId: "hubspot", status: "Connected" }];
    const health = [{ provider: "hubspot", email: "owner@x.com", status: "degraded", lastError: "401", consecutiveFailures: 1 }];
    const out = applyHealthToConnections(conns, health, "owner@x.com");
    expect(out[0].status).toBe("Degraded");
  });

  it("keeps Connected when health says ok", () => {
    const conns = [{ id: "int-1", providerId: "slack", status: "Connected" }];
    const health = [{ provider: "slack", email: "owner@x.com", status: "ok", consecutiveFailures: 0 }];
    const out = applyHealthToConnections(conns, health, "owner@x.com");
    expect(out[0].status).toBe("Connected");
  });

  it("passes through rows with no health record (non-refresh providers)", () => {
    const conns = [{ id: "int-1", providerId: "trello", status: "Connected" }];
    const out = applyHealthToConnections(conns, [], "owner@x.com");
    expect(out[0].status).toBe("Connected");
  });

  it("never mutates the stored rows", () => {
    const conns = [{ id: "int-1", providerId: "xero", status: "Connected" }];
    const health = [{ provider: "xero", email: "owner@x.com", status: "reconnect_required", lastError: "x", consecutiveFailures: 2 }];
    applyHealthToConnections(conns, health, "owner@x.com");
    expect(conns[0].status).toBe("Connected"); // original untouched
  });
});
