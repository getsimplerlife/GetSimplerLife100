/**
 * tenant-settings.test.ts — per-tenant workspace preference persistence.
 * Covers: default 'auto', set + read, validation (fail closed), tenant
 * scoping (one tenant's preference never leaks to another).
 */
import { describe, expect, it, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { readJSON } from "../lib/data-store";
import { tmpdir } from "os";
import {
  getWorkspacePreference,
  setWorkspacePreference,
  assertValidWorkspacePreference,
  TENANT_SETTINGS_KEY,
} from "../lib/tenant-settings";

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), "tenant-settings-"));
}
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("tenant workspace preference", () => {
  it("defaults to auto when never set", () => {
    const dir = freshDir();
    dirs.push(dir);
    expect(getWorkspacePreference("acme@test.com", dir)).toBe("auto");
  });
  it("persists a set preference and reads it back", () => {
    const dir = freshDir();
    dirs.push(dir);
    setWorkspacePreference("acme@test.com", "microsoft", dir);
    expect(getWorkspacePreference("acme@test.com", dir)).toBe("microsoft");
  });
  it("overwrites an existing preference", () => {
    const dir = freshDir();
    dirs.push(dir);
    setWorkspacePreference("acme@test.com", "google", dir);
    setWorkspacePreference("acme@test.com", "auto", dir);
    expect(getWorkspacePreference("acme@test.com", dir)).toBe("auto");
  });
  it("is tenant-scoped — one tenant's preference never affects another", () => {
    const dir = freshDir();
    dirs.push(dir);
    setWorkspacePreference("a@test.com", "google", dir);
    expect(getWorkspacePreference("b@test.com", dir)).toBe("auto");
  });
  it("rejects invalid values (fail closed)", () => {
    expect(() => assertValidWorkspacePreference("dropbox")).toThrow(/Invalid workspace preference/);
    expect(() => assertValidWorkspacePreference(42)).toThrow();
    expect(() => setWorkspacePreference("a@test.com", "dropbox" as any, freshDir())).toThrow(/Invalid workspace preference/);
    expect(() => setWorkspacePreference("", "google", freshDir())).toThrow(/tenant id/);
  });
  it("writes to the durable-store key file name", () => {
    const dir = freshDir();
    dirs.push(dir);
    setWorkspacePreference("a@test.com", "microsoft", dir);
    const raw = readJSON(join(dir, TENANT_SETTINGS_KEY));
    expect(raw["a@test.com"]?.workspacePreference).toBe("microsoft");
  });
});
