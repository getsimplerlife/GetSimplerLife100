/**
 * SLICE 168 — D-19 (audit sweep A, MEDIUM/latent security).
 *
 * THE DEFECT THIS PINS. `GET /api/audit-logs` authenticated the caller and then
 * read `tenant_audit_logs.json` with
 *
 *     let logs = Array.isArray(data) ? data : (data[user.email] || []);
 *
 * In the normal per-email-map shape that is correctly scoped. But if the store
 * ever holds a FLAT ARRAY — the legacy/corrupt shape the reader tolerates, and
 * the shape `durable-store` repairs this file to — the fallback handed EVERY
 * signed-in user EVERY account's entries. The auditor proved it with a seeded
 * marker: a non-owner read the owner's entry, `total: 1`, marker in the body.
 *
 * Nothing writes a populated flat array today, so this was latent, not live.
 * These tests seed that exact shape and assert the leak cannot happen: a
 * non-owner sees only entries that name them, and never another account's
 * marker, whatever the file's shape is.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const AUDIT_FILE = join(TEST_DATA_DIR, "tenant_audit_logs.json");
const PASSWORD = "d19-audit-isolation-pass";
const TS = Date.now();
const OWNER_EMAIL = "d19-owner-" + TS + "@example.test";
const NON_OWNER_EMAIL = "d19-nonowner-" + TS + "@example.test";
const OWNER_MARKER = "OWNER_SECRET_MARKER_d19_" + TS;
const SELF_MARKER = "SELF_MARKER_d19_" + TS;

let nonOwnerCookie = "";

async function registerAndGetCookie(email: string): Promise<string> {
  const reg = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: "manual",
  });
  let setCookie = reg.headers.get("set-cookie") || "";
  if (!setCookie && reg.status === 409) {
    const login = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    setCookie = login.headers.get("set-cookie") || "";
  }
  const m = setCookie.match(/session=([^;]+)/);
  if (!m) throw new Error(`no session cookie for ${email} (status ${reg.status})`);
  return m[1]!;
}

function seedAuditFile(value: unknown): void {
  writeFileSync(AUDIT_FILE, JSON.stringify(value, null, 2));
}

async function getAuditLogs(cookie: string) {
  const res = await fetch(`${BASE_URL}/api/audit-logs?limit=10000`, {
    headers: { Cookie: `session=${cookie}` },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { status: res.status, text, json };
}

let originalAuditFile: string | null = null;

beforeAll(async () => {
  await ensureTestServer();
  originalAuditFile = existsSync(AUDIT_FILE) ? readFileSync(AUDIT_FILE, "utf-8") : null;
  nonOwnerCookie = await registerAndGetCookie(NON_OWNER_EMAIL);
});

afterAll(() => {
  // Leave the shared test data dir as we found it.
  if (originalAuditFile === null) {
    try { writeFileSync(AUDIT_FILE, "{}"); } catch { /* best effort */ }
  } else {
    try { writeFileSync(AUDIT_FILE, originalAuditFile); } catch { /* best effort */ }
  }
});

describe("D-19 — a flat-array audit store never leaks another account's entries", () => {
  it("a non-owner gets total 0 and no owner marker from a flat-array store", async () => {
    seedAuditFile([
      {
        id: "log-owner-1",
        timestamp: "2026-11-01T20:00:00.000Z",
        user: OWNER_EMAIL,
        action: "portal.approvals.settings",
        resource: "approvalMode",
        detail: OWNER_MARKER,
        ip: "127.0.0.1",
      },
    ]);

    const { status, text, json } = await getAuditLogs(nonOwnerCookie);

    expect(status).toBe(200);
    expect(json?.total).toBe(0);
    expect(Array.isArray(json?.data)).toBe(true);
    expect(json?.data).toHaveLength(0);
    // The marker must not reach a non-owner in any position of the payload.
    expect(text).not.toContain(OWNER_MARKER);
    expect(text).not.toContain(OWNER_EMAIL);
  });

  it("a non-owner sees only their OWN entries in a mixed flat-array store", async () => {
    seedAuditFile([
      {
        id: "log-owner-2",
        timestamp: "2026-11-01T20:00:00.000Z",
        user: OWNER_EMAIL,
        action: "portal.approvals.settings",
        resource: "approvalMode",
        detail: OWNER_MARKER,
        ip: "127.0.0.1",
      },
      {
        id: "log-self-1",
        timestamp: "2026-11-01T20:01:00.000Z",
        user: NON_OWNER_EMAIL,
        action: "portal.task.create",
        resource: "task",
        detail: SELF_MARKER,
        ip: "127.0.0.1",
      },
    ]);

    const { status, text, json } = await getAuditLogs(nonOwnerCookie);

    expect(status).toBe(200);
    // Filtered, not blanket-refused: the caller still reads their own trail.
    expect(json?.total).toBe(1);
    expect(json?.data).toHaveLength(1);
    expect(json?.data[0]?.detail).toBe(SELF_MARKER);
    expect(text).not.toContain(OWNER_MARKER);
    expect(text).not.toContain(OWNER_EMAIL);
  });

  it("the normal per-email map is still scoped to the caller", async () => {
    seedAuditFile({
      [OWNER_EMAIL]: [
        {
          id: "log-owner-3",
          timestamp: "2026-11-01T20:02:00.000Z",
          user: OWNER_EMAIL,
          action: "portal.approvals.settings",
          resource: "approvalMode",
          detail: OWNER_MARKER,
          ip: "127.0.0.1",
        },
      ],
      [NON_OWNER_EMAIL]: [
        {
          id: "log-self-2",
          timestamp: "2026-11-01T20:03:00.000Z",
          user: NON_OWNER_EMAIL,
          action: "portal.task.create",
          resource: "task",
          detail: SELF_MARKER,
          ip: "127.0.0.1",
        },
      ],
    });

    const { status, text, json } = await getAuditLogs(nonOwnerCookie);

    expect(status).toBe(200);
    expect(json?.total).toBe(1);
    expect(json?.data[0]?.detail).toBe(SELF_MARKER);
    expect(text).not.toContain(OWNER_MARKER);
  });

  it("a malformed (non-map, non-array) store yields nothing rather than a crash", async () => {
    seedAuditFile("not-an-audit-store");

    const { status, json } = await getAuditLogs(nonOwnerCookie);

    expect(status).toBe(200);
    expect(json?.total).toBe(0);
    expect(json?.data).toEqual([]);
  });

  it("still 401 for an unauthenticated caller (unchanged)", async () => {
    seedAuditFile([]);
    const res = await fetch(`${BASE_URL}/api/audit-logs`);
    expect(res.status).toBe(401);
  });
});
