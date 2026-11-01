/**
 * SLICE 163 — the off-box half of `/api/admin/data-health`, through a REAL server.
 *
 * WHAT THIS PINS:
 *   1. the report now carries an `backup` block, and it comes from the running
 *      server's own filesystem (its namespace, its status file, its runs);
 *   2. a deployment with no backup status reads "never" and can never be ok —
 *      the same rule slice 162 applied to publish survival;
 *   3. the owner-only "run it now" endpoint is owner-only (401 unsigned, 403 for
 *      a signed-in non-owner) and refuses a GET;
 *   4. nothing here runs a backup: the point is the surface, and a test must not
 *      write archives or upload anything.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const TS = Date.now();
const OWNER_EMAIL = "mathewortiz97@gmail.com";
const OWNER_TOKEN = "owner-bh163-" + TS;
const TENANT_EMAIL = "tenant-bh163-" + TS + "@example.test";
const TENANT_TOKEN = "tenant-bh163-" + TS;

function readJSONFile(path: string): any {
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

async function call(path: string, opts: { cookie?: string; method?: string } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: opts.cookie ? { Cookie: `session=${opts.cookie}` } : {},
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

describe("the off-box half of GET /api/admin/data-health (slice 163)", () => {
  beforeAll(async () => {
    await ensureTestServer();
    seedUsers();
  }, 90_000);

  it("still answers 401 unsigned and 403 for a non-owner", async () => {
    expect((await call("/api/admin/data-health")).status).toBe(401);
    expect((await call("/api/admin/data-health", { cookie: TENANT_TOKEN })).status).toBe(403);
  });

  it("gives the owner an off-box block read from this server's own filesystem", async () => {
    const { status, body } = await call("/api/admin/data-health", { cookie: OWNER_TOKEN });
    expect(status).toBe(200);
    const backup = body?.backup;
    expect(backup).toBeTruthy();
    // The namespace is a real prefix this deployment resolved, not a placeholder.
    expect(typeof backup.namespace.prefix).toBe("string");
    expect(backup.namespace.prefix.startsWith("simplerlife100/backups/")).toBe(true);
    expect(backup.namespace.prefix.endsWith("/")).toBe(true);
    expect(typeof backup.namespace.reason).toBe("string");
    expect(backup.namespace.reason.length).toBeGreaterThan(0);
    // The destination is the server's own archive directory.
    expect(typeof backup.destination.outDir).toBe("string");
    expect(backup.destination.outDir.length).toBeGreaterThan(0);
    // The status is read from DATA_DIR, and it says where it looked.
    expect(backup.status.path).toBe(join(TEST_DATA_DIR, "backup_status.json"));
    expect(["green", "red", "never", "unknown"]).toContain(backup.verdict);
    expect(Array.isArray(backup.reasons)).toBe(true);
    expect(backup.reasons.length).toBeGreaterThan(0);
    // Coverage is declared-vs-archived, never a bare claim.
    expect(backup.coverage.declared).toBeGreaterThan(0);
    expect(["green", "red", "unknown"]).toContain(backup.coverage.verdict);
  });

  it("cannot read ok when there is no off-box copy: never-ran means red, not fine", async () => {
    const { body } = await call("/api/admin/data-health", { cookie: OWNER_TOKEN });
    const backup = body?.backup;
    if (backup?.status.present === false) {
      expect(backup.verdict).toBe("never");
      expect(backup.ok).toBe(false);
      expect(body.verdict).toBe("red");
      expect(body.ok).toBe(false);
      expect((body.reasons as string[]).join(" ")).toContain("no off-box copy yet");
    }
    // Whatever the state, a non-green off-box verdict may never present as ok.
    if (backup && backup.verdict !== "green") expect(body.ok).toBe(false);
  });

  it("makes the owner-only 'run it now' endpoint owner-only and POST-only", async () => {
    expect((await call("/api/admin/data-health/backup", { method: "POST" })).status).toBe(401);
    expect(
      (await call("/api/admin/data-health/backup", { method: "POST", cookie: TENANT_TOKEN })).status,
    ).toBe(403);
    // A GET must not be able to trigger a run.
    const get = await call("/api/admin/data-health/backup", { cookie: OWNER_TOKEN });
    expect(get.status).toBe(405);
  });

  it("does not run a backup just because the report was read", async () => {
    // The canonical suite disables the scheduler; reading the report must not
    // start a run either. If a status file exists it was written by something
    // else, so this asserts the absence of a NEW one, not the absence of any.
    const before = readJSONFile(join(TEST_DATA_DIR, "backup_status.json"));
    await call("/api/admin/data-health", { cookie: OWNER_TOKEN });
    const after = readJSONFile(join(TEST_DATA_DIR, "backup_status.json"));
    expect(after.lastBackupAt ?? null).toBe(before.lastBackupAt ?? null);
  });
});
