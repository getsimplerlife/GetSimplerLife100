// Durable Postgres (Neon) store — regression tests (2026-08-11).
//
// Connection-loss bug, real fix: the live host does not preserve ANY file path
// across publishes — file-based storage (inside OR outside the publish tree) is
// ephemeral per deploy. Connections, OAuth tokens, sessions, users, purchases,
// chat, and audit logs must live in a durable external database (Neon
// serverless Postgres via DATABASE_URL) so they survive every publish.
//
// These tests prove the guarantees:
//  1. initDurableStore hydrates the in-memory cache from the DB — a fresh
//     publish (empty filesystem) still reads the previous deploy's data.
//  2. Files present on disk but missing in the DB are migrated at boot
//     (create-if-missing, idempotent).
//  3. readJSON/writeJSON route through the durable store when enabled, and the
//     file store only when disabled (no DATABASE_URL).
//  4. seedDataFiles never replaces durable data with empty seeds.
//  5. Writes are flushed to the DB (durableFlush awaits the write queue).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  initDurableStore, durableClose, durableEnabled, durableKeyCount,
  durableGet, durableSet, durableHas, durableFlush, durableKeyFor,
  MemoryKvDriver,
} from "../lib/durable-store";
import { readJSON, writeJSON, seedDataFiles } from "../lib/data-store";

let tmpDir: string;
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sl-durable-"));
  mkdirSync(tmpDir, { recursive: true });
});
afterAll(async () => {
  await durableClose();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("durable store — driver + hydration", () => {
  it("is disabled when no DATABASE_URL and no driver are provided", async () => {
    await durableClose();
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const r = await initDurableStore(tmpDir);
      expect(r.enabled).toBe(false);
      expect(durableEnabled()).toBe(false);
      expect(durableKeyCount()).toBe(0);
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });

  it("hydrates the cache from the driver — data survives a wiped filesystem", async () => {
    await durableClose();
    const driver = new MemoryKvDriver({
      "tenant_integrations.json": { "owner@example.com": [{ id: "int-1", provider: "slack", status: "Connected" }] },
      "tenant_oauth_credentials.json": { "owner@example.com:slack": { accessToken: "xoxb-test" } },
    });
    const r = await initDurableStore(tmpDir, driver);
    expect(r.enabled).toBe(true);
    expect(r.loaded).toBe(2);
    expect(durableEnabled()).toBe(true);
    expect(durableKeyCount()).toBe(2);
    // Filesystem is empty (simulating a fresh publish) — reads still return data.
    const conns = durableGet("tenant_integrations.json");
    expect(conns["owner@example.com"][0].provider).toBe("slack");
    expect(durableGet("tenant_oauth_credentials.json")["owner@example.com:slack"].accessToken).toBe("xoxb-test");
  });

  it("migrates on-disk files missing from the DB (create-if-missing, idempotent)", async () => {
    await durableClose();
    const dir = join(tmpDir, "mig");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "tenant_purchases.json"), JSON.stringify({ "u@x.com": [{ type: "starter", status: "active" }] }));
    writeFileSync(join(dir, "sessions.json"), JSON.stringify({ tok: { email: "u@x.com" } }));
    const driver = new MemoryKvDriver();
    const r1 = await initDurableStore(dir, driver);
    expect(r1.enabled).toBe(true);
    expect(r1.migrated).toBe(2);
    expect(driver.dump()["tenant_purchases.json"]["u@x.com"][0].status).toBe("active");
    // Second boot: same files, DB already has them → migrate nothing, load 2.
    const r2 = await initDurableStore(dir, driver);
    expect(r2.enabled).toBe(true);
    expect(r2.migrated).toBe(0);
    expect(r2.loaded).toBe(2);
  });

  it("never overwrites an existing DB row with a stale on-disk file", async () => {
    await durableClose();
    const dir = join(tmpDir, "noover");
    mkdirSync(dir, { recursive: true });
    // Stale file on disk (old publish snapshot), fresher data in DB.
    writeFileSync(join(dir, "tenant_integrations.json"), JSON.stringify({ stale: true }));
    const driver = new MemoryKvDriver({
      "tenant_integrations.json": { "owner@example.com": [{ id: "int-live", provider: "slack", status: "Connected" }] },
    });
    const r = await initDurableStore(dir, driver);
    expect(r.enabled).toBe(true);
    expect(r.migrated).toBe(0); // key exists in DB → file NOT migrated
    expect(durableGet("tenant_integrations.json").stale).toBeUndefined();
    expect(durableGet("tenant_integrations.json")["owner@example.com"][0].id).toBe("int-live");
  });
});

describe("durable store — read/write routing", () => {
  it("writeJSON persists through the durable store and durableFlush drains it", async () => {
    await durableClose();
    const dir = join(tmpDir, "rw");
    mkdirSync(dir, { recursive: true });
    const driver = new MemoryKvDriver();
    await initDurableStore(dir, driver);
    const f = join(dir, "tenant_audit_logs.json");
    writeJSON(f, { "owner@example.com": [{ id: "log-1" }] });
    expect(durableHas("tenant_audit_logs.json")).toBe(true);
    await durableFlush();
    expect(driver.dump()["tenant_audit_logs.json"]["owner@example.com"][0].id).toBe("log-1");
    // readJSON returns durable value even if the file is removed (publish).
    rmSync(f, { force: true });
    expect(readJSON(f)["owner@example.com"][0].id).toBe("log-1");
  });

  it("readJSON falls back to the file store when durable is disabled", async () => {
    await durableClose();
    const dir = join(tmpDir, "fallback");
    mkdirSync(dir, { recursive: true });
    const f = join(dir, "sessions.json");
    writeJSON(f, { tok: { email: "u@x.com" } }); // durable disabled → file write only
    expect(durableEnabled()).toBe(false);
    expect(readJSON(f).tok.email).toBe("u@x.com");
  });

  it("seedDataFiles never clobbers durable data with empty seeds", async () => {
    await durableClose();
    const dir = join(tmpDir, "seed");
    mkdirSync(dir, { recursive: true });
    const driver = new MemoryKvDriver({
      "tenant_integrations.json": { "owner@example.com": [{ id: "int-live", provider: "slack", status: "Connected" }] },
    });
    await initDurableStore(dir, driver);
    seedDataFiles(dir); // filesystem is empty → would seed {} if not durable-aware
    await durableFlush();
    const conns = durableGet("tenant_integrations.json");
    expect(conns["owner@example.com"]).toHaveLength(1);
    expect(conns["owner@example.com"][0].provider).toBe("slack");
    // The empty seed must NOT have replaced the durable row in the driver.
    expect(driver.dump()["tenant_integrations.json"]["owner@example.com"][0].id).toBe("int-live");
    // But genuinely-missing files still get seeded (sessions, purchases, etc.).
    expect(durableHas("sessions.json")).toBe(true);
    expect(durableHas("tenant_purchases.json")).toBe(true);
  });

  it("durableKeyFor maps file paths to stable basename keys", () => {
    expect(durableKeyFor("/var/lib/simplerlife100/.data/tenant_integrations.json")).toBe("tenant_integrations.json");
    expect(durableKeyFor("tenant_integrations.json")).toBe("tenant_integrations.json");
  });
});

describe("durable store — durability contract", () => {
  it("durableSet updates the cache synchronously and the DB after flush", async () => {
    await durableClose();
    const dir = join(tmpDir, "set");
    mkdirSync(dir, { recursive: true });
    const driver = new MemoryKvDriver();
    await initDurableStore(dir, driver);
    durableSet("chat_sessions.json", { "owner@example.com": [{ role: "user", content: "hi" }] });
    expect(durableGet("chat_sessions.json")["owner@example.com"][0].content).toBe("hi");
    await durableFlush();
    expect(driver.dump()["chat_sessions.json"]["owner@example.com"][0].content).toBe("hi");
  });

  it("durableClose resets the store (clean slate for the next init)", async () => {
    await durableClose();
    expect(durableEnabled()).toBe(false);
    expect(durableKeyCount()).toBe(0);
    const dir = join(tmpDir, "close");
    mkdirSync(dir, { recursive: true });
    const r = await initDurableStore(dir, new MemoryKvDriver({ "sessions.json": {} }));
    expect(r.enabled).toBe(true);
    expect(durableGet("sessions.json")).toEqual({});
  });
});

describe("durable store — fresh DB seeding", () => {
  it("seeds the admin user and defaults into a fresh DB", async () => {
    await durableClose();
    const dir = join(tmpDir, "freshseed");
    mkdirSync(dir, { recursive: true });
    const driver = new MemoryKvDriver(); // empty DB — simulating first Neon boot
    await initDurableStore(dir, driver);
    seedDataFiles(dir); // should write defaults into BOTH file and durable store
    await durableFlush();
    // Admin user landed in the durable store (fresh DB gets admin).
    expect(durableHas("users.json")).toBe(true);
    const users = durableGet("users.json");
    const admin = Object.values(users).find((u: any) => u && u.role === "admin");
    expect(admin).toBeDefined();
    expect(admin.email).toBe("mathewortiz97@gmail.com");
    // And mirrored into the driver (the DB).
    const dbUsers = driver.dump()["users.json"];
    expect(Object.values(dbUsers).some((u: any) => u && u.role === "admin")).toBe(true);
    // Defaults for the critical files exist in the durable store too.
    expect(durableHas("tenant_integrations.json")).toBe(true);
    expect(durableHas("tenant_purchases.json")).toBe(true);
    expect(durableHas("sessions.json")).toBe(true);
    expect(durableHas("tenant_oauth_credentials.json")).toBe(true);
  });
});
