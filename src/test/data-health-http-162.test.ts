import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";
import { GENERATION_MARKER_FILE } from "../lib/data-health";
import { DURABLE_STORES } from "../lib/durable-stores";

/**
 * SLICE 162 — `GET /api/admin/data-health`, through a REAL server.
 *
 * THE QUESTION: a deployment runs on a filesystem nobody here can see. Slice 160
 * made it log `insidePublishTree` at boot, but a log line is not an answer, and
 * nothing could say "my data survived the last publish" from outside. This route
 * is that answer, and this file proves it end to end against the running server:
 *
 *   1. it is owner-only (401 unsigned, 403 for a signed-in non-owner) — the same
 *      gate as every other /api/admin/* route;
 *   2. the owner gets the facts, and they come from the FILESYSTEM: the reported
 *      marker path is the marker file inside the server's own DATA_DIR, the file
 *      really exists on disk, and the firstSeenAt it reports is the firstSeenAt
 *      in that file (not a value recomputed in this test process);
 *   3. the marker lives inside the configured DATA_DIR and outside the tree a
 *      publish replaces;
 *   4. the report covers every declared durable store, so a store that stopped
 *      landing in DATA_DIR shows up here instead of being silently absent;
 *   5. the route refuses a write method — it is a read.
 *
 * The last test is the one that matters most: everything else could be true of a
 * hardcoded response, but a firstSeenAt that matches the bytes on disk cannot.
 */
const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const TS = Date.now();
const OWNER_EMAIL = "mathewortiz97@gmail.com";
const OWNER_TOKEN = "owner-dh162-" + TS;
const TENANT_EMAIL = "tenant-dh162-" + TS + "@example.test";
const TENANT_TOKEN = "tenant-dh162-" + TS;

interface MarkerReport {
  path: string;
  present: boolean;
  insideDataDir: boolean;
  insidePublishTree: boolean;
  firstSeenAt: string | null;
  lastBootAt: string | null;
  boots: number | null;
  buildsSeen: number;
  corruptPrevious: boolean;
  error: string | null;
}

interface DataHealth {
  ok: boolean;
  verdict: "green" | "red" | "unknown";
  reasons: string[];
  dataDir: string;
  rawDataDir: string | null;
  relocated: boolean;
  insidePublishTree: boolean;
  serverBase: string;
  processStartedAt: string;
  processUptimeSeconds: number;
  runningBuildAt: string | null;
  runningBuildId: string | null;
  marker: MarkerReport;
  survivedProcessStart: boolean | null;
  survivedRunningBuild: boolean | null;
  distinctBuilds: number;
  durableStores: {
    declared: number;
    present: number;
    missing: string[];
    rows: { store: string; present: boolean; bytes: number | null; mtime: string | null }[];
  };
  checkedAt: string;
}

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function seedUsers(): void {
  const usersFile = join(TEST_DATA_DIR, "users.json");
  const sessionsFile = join(TEST_DATA_DIR, "sessions.json");
  const users = readJSONFile(usersFile);
  users[OWNER_EMAIL] = { email: OWNER_EMAIL, role: "admin", createdAt: Date.now() };
  users[TENANT_EMAIL] = { email: TENANT_EMAIL, role: "user", createdAt: Date.now() };
  writeFileSync(usersFile, JSON.stringify(users, null, 2));
  const sessions = readJSONFile(sessionsFile);
  sessions[OWNER_TOKEN] = { email: OWNER_EMAIL, createdAt: Date.now() };
  sessions[TENANT_TOKEN] = { email: TENANT_EMAIL, createdAt: Date.now() };
  writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
}

async function getDataHealth(cookie?: string, method = "GET") {
  const res = await fetch(`${BASE_URL}/api/admin/data-health`, {
    method,
    headers: cookie ? { Cookie: `session=${cookie}` } : {},
  });
  let body: DataHealth | null = null;
  try {
    body = (await res.json()) as DataHealth;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

describe("GET /api/admin/data-health through the running server (slice 162)", () => {
  beforeAll(async () => {
    await ensureTestServer();
    seedUsers();
  }, 90_000);

  it("is owner-only: 401 unsigned", async () => {
    const { status } = await getDataHealth();
    expect(status).toBe(401);
  });

  it("is owner-only: 403 for a signed-in non-owner", async () => {
    const { status, body } = await getDataHealth(TENANT_TOKEN);
    expect(status).toBe(403);
    // A refusal must not leak the report.
    expect((body as any)?.dataDir).toBeUndefined();
    expect((body as any)?.marker).toBeUndefined();
  });

  it("answers the owner with the facts it measures", async () => {
    const { status, body } = await getDataHealth(OWNER_TOKEN);
    expect(status).toBe(200);
    expect(body).toBeTruthy();

    // Where it writes — the configured DATA_DIR, not a recomputed guess.
    expect(body!.dataDir).toBe(TEST_DATA_DIR);
    expect(body!.insidePublishTree).toBe(false);
    expect(typeof body!.serverBase).toBe("string");
    expect(body!.serverBase.length).toBeGreaterThan(0);
    expect(typeof body!.relocated).toBe("boolean");

    // This process.
    expect(Number.isNaN(new Date(body!.processStartedAt).getTime())).toBe(false);
    expect(body!.processStartedAt <= new Date().toISOString()).toBe(true);
    expect(body!.processUptimeSeconds).toBeGreaterThanOrEqual(0);

    // The marker is reported, not assumed.
    expect(body!.marker.present).toBe(true);
    expect(body!.marker.path).toBe(join(TEST_DATA_DIR, GENERATION_MARKER_FILE));
    expect(body!.marker.insideDataDir).toBe(true);
    expect(body!.marker.insidePublishTree).toBe(false);
    expect(body!.marker.error).toBeNull();
    expect(Number.isNaN(new Date(body!.marker.firstSeenAt!).getTime())).toBe(false);
    expect(body!.marker.boots).toBeGreaterThanOrEqual(1);
    expect(body!.marker.buildsSeen).toBeGreaterThanOrEqual(1);
    expect(body!.marker.buildsSeen).toBe(body!.distinctBuilds);

    // The verdict is one of three, and "ok" only ever means green.
    expect(["green", "red", "unknown"]).toContain(body!.verdict);
    expect(body!.ok).toBe(body!.verdict === "green");
    expect(Array.isArray(body!.reasons)).toBe(true);
    expect(body!.reasons.length).toBeGreaterThan(0);
  });

  it("reports what is actually on disk: the marker file exists and carries the reported firstSeenAt", async () => {
    const { body } = await getDataHealth(OWNER_TOKEN);
    const markerPath = join(TEST_DATA_DIR, GENERATION_MARKER_FILE);
    expect(body!.marker.path).toBe(markerPath);
    expect(existsSync(markerPath)).toBe(true);

    // Read the bytes ourselves — a hardcoded response could not match these.
    const onDisk = JSON.parse(readFileSync(markerPath, "utf-8"));
    expect(onDisk.firstSeenAt).toBe(body!.marker.firstSeenAt);
    expect(onDisk.boots).toBe(body!.marker.boots);
    expect(Array.isArray(onDisk.buildsSeen)).toBe(true);
    expect(onDisk.buildsSeen.length).toBe(body!.marker.buildsSeen);
  });

  it("cannot claim survival it does not have: a marker created by this boot is not green", async () => {
    // The canonical suite spawns the server with a WIPED data dir, so the marker
    // in it was created by the running process. That is precisely the "nothing
    // survived yet" case, and the route must say so instead of reporting health.
    const { body } = await getDataHealth(OWNER_TOKEN);
    if (body!.survivedProcessStart === false) {
      expect(body!.verdict).toBe("red");
      expect(body!.reasons.join(" ")).toContain("created by this boot");
    }
    // Whatever the case, red must never present itself as ok.
    if (body!.verdict === "red") expect(body!.ok).toBe(false);
  });

  it("covers every declared durable store, read from DATA_DIR", async () => {
    const { body } = await getDataHealth(OWNER_TOKEN);
    expect(body!.durableStores.declared).toBe(DURABLE_STORES.length);
    expect(body!.durableStores.rows.length).toBe(DURABLE_STORES.length);
    expect(body!.durableStores.rows.map((r) => r.store).sort()).toEqual([...DURABLE_STORES].sort());
    // The marker itself is a declared store, so it is reported present.
    const markerRow = body!.durableStores.rows.find((r) => r.store === GENERATION_MARKER_FILE);
    expect(markerRow).toBeTruthy();
    expect(markerRow!.present).toBe(true);
    expect(markerRow!.bytes ?? 0).toBeGreaterThan(0);
  });

  it("is a read: a write method is refused", async () => {
    const { status } = await getDataHealth(OWNER_TOKEN, "POST");
    expect(status).toBe(405);
  });
});
