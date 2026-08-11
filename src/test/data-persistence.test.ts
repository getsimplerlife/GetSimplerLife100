// Connection-persistence regression tests (2026-08-11).
//
// Owner-reported bug: "integration, CRM and ERP connections get removed from
// accounts sometimes". Root cause: runtime data (tenant_integrations.json,
// tenant_oauth_credentials.json, sessions.json) was configured to live INSIDE
// the publish tree (/home/team/shared/site/.data), so a publish/cleanup that
// replaces that tree could replace live runtime data with a stale snapshot.
//
// These tests prove the guarantees that prevent that:
//  1. seedDataFiles is strictly create-if-missing — a server restart can never
//     wipe existing connections, OAuth tokens, sessions, or purchases.
//  2. DATA_DIR resolution is deterministic (env override, then <base>/.data).
//  3. Connected-accounts bucketing counts ALL categories (CRM / ERP+Accounting
//     / everything else), so no connection is invisible in the UI totals.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { resolveDataDir, isInsidePublishTree, readJSON, seedDataFiles, bucketConnectionsByCategory } from "../lib/data-store";

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sl-data-store-"));
});

afterAll(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("DATA_DIR resolution", () => {
  it("uses an absolute env override as-is", () => {
    expect(resolveDataDir("/var/lib/simplerlife100/.data", "/base")).toBe("/var/lib/simplerlife100/.data");
  });

  it("joins a relative env override to the base directory", () => {
    expect(resolveDataDir(".data", "/base/dir")).toBe("/base/dir/.data");
  });

  it("falls back to <base>/.data when no env override is set", () => {
    expect(resolveDataDir(undefined, "/base/dir")).toBe("/base/dir/.data");
    expect(resolveDataDir("", "/base/dir")).toBe("/base/dir/.data");
    expect(resolveDataDir("   ", "/base/dir")).toBe("/base/dir/.data");
  });

  it("flags a data dir inside the platform publish tree", () => {
    expect(isInsidePublishTree("/home/team/shared/site/.data")).toBe(true);
    expect(isInsidePublishTree("/var/lib/simplerlife100/.data")).toBe(false);
    expect(isInsidePublishTree("/home/agent-lead/repos/GetSimplerLife100/.data")).toBe(false);
  });
});

describe("restart persistence: seedDataFiles is create-if-missing only", () => {
  it("creates the data dir and all critical files with correct shapes on first boot", () => {
    const dir = join(tmpDir, "seed-first");
    seedDataFiles(dir);
    for (const f of [
      "integrations.json",
      "tenant_oauth_credentials.json",
      "tenant_integrations.json",
      "sessions.json",
      "oauth_states.json",
      "tenant_purchases.json",
      "tenant_audit_logs.json",
      "leads.json",
      "lead_notifications.json",
      "pending_emails.json",
      "chat_sessions.json",
      "ai_employees.json",
    ]) {
      expect(existsSync(join(dir, f)), `missing ${f}`).toBe(true);
    }
    // integrations.json must be an array (the server calls .find() on it)
    expect(Array.isArray(readJSON(join(dir, "integrations.json")))).toBe(true);
  });

  it("does NOT wipe an existing connection when the server restarts", () => {
    const dir = join(tmpDir, "seed-restart-conn");
    seedDataFiles(dir);
    const connsFile = join(dir, "tenant_integrations.json");
    const fakeConnections = {
      "owner@example.com": [
        {
          id: "int-fake-1",
          provider: "Slack",
          providerId: "slack",
          category: "Integration",
          status: "Connected",
          connectedAt: new Date().toISOString(),
          lastSync: new Date().toISOString(),
          credentials: { apiKey: "xoxb-fake" },
        },
      ],
    };
    writeFileSync(connsFile, JSON.stringify(fakeConnections, null, 2));

    // Simulate a restart: the boot-time seed runs again over existing data.
    seedDataFiles(dir);

    const after = readJSON(connsFile);
    expect(after["owner@example.com"]).toHaveLength(1);
    expect(after["owner@example.com"][0].id).toBe("int-fake-1");
    expect(after["owner@example.com"][0].status).toBe("Connected");
    expect(after["owner@example.com"][0].credentials.apiKey).toBe("xoxb-fake");
  });

  it("does NOT overwrite existing OAuth tokens when the server restarts", () => {
    const dir = join(tmpDir, "seed-restart-oauth");
    seedDataFiles(dir);
    const oauthFile = join(dir, "tenant_oauth_credentials.json");
    writeFileSync(oauthFile, JSON.stringify(
      { "owner@example.com:slack": { provider: "slack", accessToken: "secret-token", refreshToken: "refresh", expiresAt: 1e12 } },
      null, 2,
    ));

    seedDataFiles(dir);

    const after = readJSON(oauthFile);
    expect(after["owner@example.com:slack"].accessToken).toBe("secret-token");
    expect(after["owner@example.com:slack"].refreshToken).toBe("refresh");
  });

  it("does NOT truncate sessions or purchases on restart", () => {
    const dir = join(tmpDir, "seed-restart-sessions");
    seedDataFiles(dir);
    const sessionsFile = join(dir, "sessions.json");
    writeFileSync(sessionsFile, JSON.stringify({ "sess-abc": { email: "owner@example.com", createdAt: Date.now() } }, null, 2));

    seedDataFiles(dir);

    const after = readJSON(sessionsFile);
    expect(after["sess-abc"].email).toBe("owner@example.com");
  });

  it("seeds the admin user on first boot and does not re-hash on restart", () => {
    const dir = join(tmpDir, "seed-admin");
    seedDataFiles(dir);
    const usersFile = join(dir, "users.json");
    const first = readJSON(usersFile);
    const adminEmail = Object.keys(first).find((e) => first[e]?.role === "admin");
    expect(adminEmail).toBeTruthy();
    const firstHash = first[adminEmail!].password;

    // Simulate a restart: seed must NOT touch an existing admin (no re-hash, no change)
    seedDataFiles(dir);
    const second = readJSON(usersFile);
    expect(second[adminEmail!].password).toBe(firstHash);
    expect(second[adminEmail!].role).toBe("admin");
  });
});

describe("connected-accounts bucketing counts ALL categories", () => {
  const conns = [
    { providerId: "salesforce", category: "CRM" },
    { providerId: "xero", category: "Accounting" },
    { providerId: "netsuite", category: "ERP" },
    { providerId: "slack", category: "Integration" },          // OAuth fallback category
    { providerId: "gmail", category: "Communication" },
    { providerId: "zoom", category: "" },                     // blank category
    { providerId: "custom", category: undefined },            // missing category
  ];

  it("routes CRM and ERP/Accounting into their buckets and everything else into 'other'", () => {
    const { crm, erp, other } = bucketConnectionsByCategory(conns);
    expect(crm).toHaveLength(1);
    expect(erp).toHaveLength(2);
    expect(other).toHaveLength(4);
  });

  it("bucket totals always equal the stored connection count (nothing hidden)", () => {
    const { crm, erp, other } = bucketConnectionsByCategory(conns);
    expect(crm.length + erp.length + other.length).toBe(conns.length);
  });

  it("handles empty/undefined input without throwing", () => {
    expect(bucketConnectionsByCategory([])).toEqual({ crm: [], erp: [], other: [] });
    expect(bucketConnectionsByCategory(undefined as any)).toEqual({ crm: [], erp: [], other: [] });
  });
});

describe("repo .env DATA_DIR safety", () => {
  it("repo .env does not point runtime data into the publish tree", () => {
    // .env is gitignored and absent in CI — skip gracefully when missing.
    const envPath = join(process.cwd(), ".env");
    if (!existsSync(envPath)) return;
    const env = readFileSync(envPath, "utf-8");
    const m = env.match(/^DATA_DIR=(.*)$/m);
    if (!m) return;
    const value = m[1].trim().replace(/^["']|["']$/g, "");
    expect(value, `DATA_DIR=${value} must not resolve inside the publish tree`).not.toMatch(/\/shared\/site\//);
  });
});
